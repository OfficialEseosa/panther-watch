package edu.gsu.pantherwatch.pantherwatch.service;

import edu.gsu.pantherwatch.pantherwatch.api.GradeAggregate;
import edu.gsu.pantherwatch.pantherwatch.api.GradeDistributionResponse;
import edu.gsu.pantherwatch.pantherwatch.model.SectionGrade;
import jakarta.annotation.PostConstruct;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.function.Predicate;
import java.util.stream.Stream;

/**
 * Downloads, holds (in memory) and aggregates GSU course-section grade
 * distributions.
 *
 * The dataset is small, static and cheaply re-downloaded, so there is no DB: a
 * refresh pulls one CSV per term (all subjects) from the APEX report's built-in
 * export, parses the summary table (course, professor, A-F buckets, GPA, W) and
 * the detailed table (fine +/- grades) and merges them by CRN into an in-memory
 * index keyed by "SUBJECT|NUMBER". Aggregation groups those sections per
 * professor (and overall) across the loaded terms.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class GradeDistributionService {

    /** Ordered grade keys for the response map (and the frontend's coarse bar). */
    static final List<String> GRADE_KEYS = List.of(
            "A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F", "WF");

    private final GradeApexClient apexClient;

    /** Folder where per-term CSV exports are cached on disk. */
    @Value("${pantherwatch.grades.dir:grade-data}")
    private String gradeDir;

    /** How many recent terms to download and aggregate. ~8 ≈ the last ~3 years. */
    @Value("${pantherwatch.grades.terms-window:8}")
    private int termsWindow;

    // In-memory dataset, swapped atomically after each (re)load.
    private volatile Map<String, List<SectionGrade>> index = Map.of();
    private volatile List<String> loadedTerms = List.of();
    private volatile Instant lastUpdated = null;

    // --------------------------------------------------------------- refreshing

    /** Load whatever CSVs are already cached on disk at startup (no network). */
    @PostConstruct
    void init() {
        try {
            loadFromDisk();
            log.info("Loaded grade data for {} terms from {}", loadedTerms.size(), gradeDir);
        } catch (Exception e) {
            log.warn("Could not load cached grade CSVs from {}: {}", gradeDir, e.toString());
        }
    }

    public boolean isEmpty() {
        return index.isEmpty();
    }

    /**
     * Downloads any of the most recent {@code termsWindow} terms that aren't
     * already cached and that have posted grades, saving each as a pair of CSVs in
     * {@link #gradeDir}, then rebuilds the in-memory index from disk.
     *
     * Posted grades are historical/immutable, so a term already on disk is never
     * re-downloaded; the monthly run simply picks up terms whose grades have since
     * posted. {@code synchronized} so overlapping triggers can't double-download.
     */
    public synchronized void refresh() {
        Path dir = Path.of(gradeDir);
        try {
            Files.createDirectories(dir);
        } catch (IOException e) {
            throw new RuntimeException("Could not create grade data dir " + gradeDir, e);
        }

        GradeApexClient.Session session = apexClient.newSession();
        List<String> terms = parseTermOptions(session.landingHtml()).stream()
                .limit(termsWindow)
                .toList();

        String[] regionIds = null;
        int downloaded = 0;
        for (String term : terms) {
            Path sumPath = dir.resolve(term + "__summary.csv");
            Path detPath = dir.resolve(term + "__detailed.csv");
            if (Files.exists(sumPath) && Files.exists(detPath)) {
                continue; // immutable history already cached
            }
            try {
                String html = apexClient.setTerm(session, term);
                if (regionIds == null) {
                    regionIds = extractRegionIds(html);
                }
                String summaryCsv = apexClient.downloadCsv(session, regionIds[0]);
                String detailedCsv = apexClient.downloadCsv(session, regionIds[1]);
                if (!hasPostedGrades(summaryCsv)) {
                    log.info("Term {} has no posted grades yet; will re-check next run", term);
                    continue;
                }
                Files.writeString(sumPath, summaryCsv);
                Files.writeString(detPath, detailedCsv);
                downloaded++;
                log.info("Cached grade CSVs for term {}", term);
            } catch (Exception e) {
                log.warn("Failed downloading grade term {}: {}", term, e.toString());
            }
        }
        log.info("Grade refresh: {} new term(s) downloaded", downloaded);
        loadFromDisk();
    }

    /** Rebuilds the in-memory index from the CSV files currently on disk. */
    private void loadFromDisk() {
        Path dir = Path.of(gradeDir);
        if (!Files.isDirectory(dir)) {
            return;
        }
        Map<String, List<SectionGrade>> newIndex = new LinkedHashMap<>();
        List<String> loaded = new ArrayList<>();
        int total = 0;
        try (Stream<Path> files = Files.list(dir)) {
            List<String> terms = files.map(p -> p.getFileName().toString())
                    .filter(n -> n.endsWith("__summary.csv"))
                    .map(n -> n.substring(0, n.indexOf("__")))
                    .sorted(Comparator.reverseOrder())
                    .limit(termsWindow)
                    .toList();
            for (String term : terms) {
                Path sumPath = dir.resolve(term + "__summary.csv");
                Path detPath = dir.resolve(term + "__detailed.csv");
                if (!Files.exists(detPath)) {
                    continue;
                }
                List<SectionGrade> sections =
                        parseTerm(Files.readString(sumPath), Files.readString(detPath), term);
                for (SectionGrade s : sections) {
                    newIndex.computeIfAbsent(key(s.getSubject(), s.getCourseNumber()), k -> new ArrayList<>()).add(s);
                }
                if (!sections.isEmpty()) {
                    loaded.add(term);
                    total += sections.size();
                }
            }
        } catch (IOException e) {
            throw new RuntimeException("Could not read grade CSVs from " + gradeDir, e);
        }

        this.index = newIndex;
        this.loadedTerms = loaded;
        this.lastUpdated = Instant.now();
        log.info("Grade index rebuilt: {} sections across {} terms", total, loaded.size());
    }

    /** A term has posted grades once any section reports a course GPA (CRS AVG). */
    private boolean hasPostedGrades(String summaryCsv) {
        List<List<String>> rows = parseCsv(summaryCsv);
        if (rows.size() < 2) {
            return false;
        }
        List<String> h = normalizeHeaders(rows.get(0));
        int iGpa = col(h, x -> x.equalsIgnoreCase("CRS AVG"));
        for (int r = 1; r < rows.size(); r++) {
            if (toDouble(at(rows.get(r), iGpa)) != null) {
                return true;
            }
        }
        return false;
    }

    /** Discovers the summary + detailed report region ids from a rendered page. */
    private String[] extractRegionIds(String html) {
        Document doc = Jsoup.parse(html);
        String summary = null;
        String detailed = null;
        for (Element region : doc.select("[data-region-id]")) {
            List<String> headers = region.select("th").stream()
                    .map(th -> normalizeWs(th.text())).toList();
            String rid = region.attr("data-region-id");
            if (headers.stream().anyMatch(h -> h.equalsIgnoreCase("Professor"))) {
                summary = rid;
            } else if (headers.stream().anyMatch(h -> h.equals("A+"))) {
                detailed = rid;
            }
        }
        if (summary == null || detailed == null) {
            throw new IllegalStateException("Could not find grade report regions (summary=" + summary
                    + ", detailed=" + detailed + ")");
        }
        return new String[]{summary, detailed};
    }

    /** Numeric term codes from the landing page dropdown, newest first. */
    public List<String> parseTermOptions(String landingHtml) {
        List<String> values = new ArrayList<>();
        for (Element opt : Jsoup.parse(landingHtml).select("select[name=P_TERM_184] option")) {
            values.add(opt.attr("value"));
        }
        return values.stream()
                .filter(v -> v.matches("\\d{6}"))
                .sorted(Comparator.reverseOrder())
                .toList();
    }

    // ------------------------------------------------------------- CSV parsing

    List<SectionGrade> parseTerm(String summaryCsv, String detailedCsv, String term) {
        Map<String, SectionGrade> byCrn = new LinkedHashMap<>();
        parseSummary(summaryCsv, term, byCrn);
        parseDetailed(detailedCsv, byCrn);
        return new ArrayList<>(byCrn.values());
    }

    private void parseSummary(String csv, String term, Map<String, SectionGrade> byCrn) {
        List<List<String>> rows = parseCsv(csv);
        if (rows.isEmpty()) {
            return;
        }
        List<String> h = normalizeHeaders(rows.get(0));
        int iCrn = col(h, x -> x.equalsIgnoreCase("CRN"));
        int iCourse = col(h, x -> x.equalsIgnoreCase("Course"));
        int iProf = col(h, x -> x.equalsIgnoreCase("Professor"));
        int iA = col(h, x -> x.startsWith("A ") || x.contains("(90-100)"));
        int iB = col(h, x -> x.contains("(80-89)"));
        int iC = col(h, x -> x.contains("(70-79)"));
        int iD = col(h, x -> x.contains("(60-69)"));
        int iF = col(h, x -> x.startsWith("F") && x.contains("60"));
        int iWf = col(h, x -> x.equals("WF"));
        int iW = col(h, x -> x.equals("W"));
        int iGpa = col(h, x -> x.equalsIgnoreCase("CRS AVG"));
        int iOther = col(h, x -> x.equalsIgnoreCase("Other"));
        int iTotal = col(h, x -> x.equalsIgnoreCase("Total"));
        int iMethod = col(h, x -> x.toLowerCase().contains("instruction"));

        for (int r = 1; r < rows.size(); r++) {
            List<String> c = rows.get(r);
            String crn = at(c, iCrn);
            if (crn == null || !crn.matches("\\d{4,}")) {
                continue;
            }
            String[] parts = splitCourse(at(c, iCourse));
            SectionGrade s = SectionGrade.builder()
                    .term(term)
                    .crn(crn)
                    .subject(parts[0])
                    .courseNumber(parts[1])
                    .section(parts[2])
                    .professor(at(c, iProf))
                    .professorKey(normalizeName(at(c, iProf)))
                    .instructionMethod(at(c, iMethod))
                    .gradeA(toInt(at(c, iA)))
                    .gradeB(toInt(at(c, iB)))
                    .gradeC(toInt(at(c, iC)))
                    .gradeD(toInt(at(c, iD)))
                    .gradeF(toInt(at(c, iF)))
                    .wf(toInt(at(c, iWf)))
                    .withdrawCount(toInt(at(c, iW)))
                    .otherCount(toInt(at(c, iOther)))
                    .total(toInt(at(c, iTotal)))
                    .gpa(toDouble(at(c, iGpa)))
                    .build();
            byCrn.put(crn, s);
        }
    }

    private void parseDetailed(String csv, Map<String, SectionGrade> byCrn) {
        List<List<String>> rows = parseCsv(csv);
        if (rows.isEmpty()) {
            return;
        }
        List<String> h = normalizeHeaders(rows.get(0));
        int iCrn = col(h, x -> x.equalsIgnoreCase("CRN"));
        int iAp = col(h, x -> x.equals("A+"));
        int iA = col(h, x -> x.equals("A"));
        int iAm = col(h, x -> x.equals("A-"));
        int iBp = col(h, x -> x.equals("B+"));
        int iB = col(h, x -> x.equals("B"));
        int iBm = col(h, x -> x.equals("B-"));
        int iCp = col(h, x -> x.equals("C+"));
        int iC = col(h, x -> x.equals("C"));
        int iCm = col(h, x -> x.equals("C-"));

        for (int r = 1; r < rows.size(); r++) {
            List<String> c = rows.get(r);
            String crn = at(c, iCrn);
            SectionGrade s = (crn == null) ? null : byCrn.get(crn);
            if (s == null) {
                continue;
            }
            s.setAPlus(toInt(at(c, iAp)));
            s.setAFlat(toInt(at(c, iA)));
            s.setAMinus(toInt(at(c, iAm)));
            s.setBPlus(toInt(at(c, iBp)));
            s.setBFlat(toInt(at(c, iB)));
            s.setBMinus(toInt(at(c, iBm)));
            s.setCPlus(toInt(at(c, iCp)));
            s.setCFlat(toInt(at(c, iC)));
            s.setCMinus(toInt(at(c, iCm)));
        }
    }

    /** Minimal RFC-4180 CSV parser (handles quoted fields and escaped quotes). */
    static List<List<String>> parseCsv(String text) {
        List<List<String>> rows = new ArrayList<>();
        if (text == null) {
            return rows;
        }
        List<String> row = new ArrayList<>();
        StringBuilder field = new StringBuilder();
        boolean inQuotes = false;
        for (int i = 0; i < text.length(); i++) {
            char ch = text.charAt(i);
            if (inQuotes) {
                if (ch == '"') {
                    if (i + 1 < text.length() && text.charAt(i + 1) == '"') {
                        field.append('"');
                        i++;
                    } else {
                        inQuotes = false;
                    }
                } else {
                    field.append(ch);
                }
            } else if (ch == '"') {
                inQuotes = true;
            } else if (ch == ',') {
                row.add(field.toString());
                field.setLength(0);
            } else if (ch == '\n' || ch == '\r') {
                if (ch == '\r' && i + 1 < text.length() && text.charAt(i + 1) == '\n') {
                    i++;
                }
                row.add(field.toString());
                field.setLength(0);
                if (row.size() > 1 || !row.get(0).isEmpty()) {
                    rows.add(row);
                }
                row = new ArrayList<>();
            } else {
                field.append(ch);
            }
        }
        if (field.length() > 0 || !row.isEmpty()) {
            row.add(field.toString());
            if (row.size() > 1 || !row.get(0).isEmpty()) {
                rows.add(row);
            }
        }
        return rows;
    }

    // ------------------------------------------------------------- aggregation

    public GradeDistributionResponse getDistribution(String subject, String courseNumber, String instructor) {
        List<SectionGrade> rows = index.getOrDefault(key(subject, courseNumber), List.of());
        return buildResponse(subject, courseNumber, instructor, rows);
    }

    /** Pure aggregation + instructor matching over a set of section rows (testable). */
    GradeDistributionResponse buildResponse(String subject, String courseNumber, String instructor,
                                            List<SectionGrade> rows) {
        if (rows.isEmpty()) {
            return GradeDistributionResponse.builder()
                    .subject(subject).courseNumber(courseNumber)
                    .hasData(false)
                    .instructorQueried(instructor)
                    .instructorHasTaught(false)
                    .build();
        }

        List<String> termsIncluded = rows.stream().map(SectionGrade::getTerm)
                .distinct().sorted(Comparator.reverseOrder()).toList();

        GradeAggregate overall = aggregate(null, rows);

        Map<String, List<SectionGrade>> byProf = new LinkedHashMap<>();
        for (SectionGrade s : rows) {
            byProf.computeIfAbsent(keyOrUnknown(s), k -> new ArrayList<>()).add(s);
        }
        List<GradeAggregate> professors = byProf.values().stream()
                .map(group -> aggregate(group.get(0).getProfessor(), group))
                .sorted(Comparator.comparingInt(GradeAggregate::getTotal).reversed())
                .toList();

        GradeAggregate matched = null;
        if (instructor != null && !instructor.isBlank()) {
            String wanted = normalizeName(instructor);
            matched = byProf.entrySet().stream()
                    .filter(e -> e.getKey().equals(wanted))
                    .findFirst()
                    .map(e -> aggregate(e.getValue().get(0).getProfessor(), e.getValue()))
                    .orElse(null);
        }

        return GradeDistributionResponse.builder()
                .subject(subject).courseNumber(courseNumber)
                .hasData(true)
                .termsIncluded(termsIncluded)
                .overall(overall)
                .professors(professors)
                .instructorQueried(instructor)
                .instructorHasTaught(matched != null)
                .instructorDistribution(matched)
                .build();
    }

    /** Coverage snapshot for the admin panel. */
    public Map<String, Object> getStatus() {
        Map<String, Object> status = new LinkedHashMap<>();
        int total = index.values().stream().mapToInt(List::size).sum();
        status.put("totalSections", total);
        status.put("terms", loadedTerms);
        status.put("lastUpdated", lastUpdated == null ? null : lastUpdated.toString());
        return status;
    }

    private GradeAggregate aggregate(String professor, List<SectionGrade> rows) {
        Map<String, Integer> counts = new LinkedHashMap<>();
        for (String k : GRADE_KEYS) {
            counts.put(k, 0);
        }
        int total = 0;
        int withdraw = 0;
        double gpaWeightSum = 0;
        int gpaTotal = 0;

        for (SectionGrade s : rows) {
            add(counts, "A+", s.getAPlus());
            add(counts, "A", s.getAFlat());
            add(counts, "A-", s.getAMinus());
            add(counts, "B+", s.getBPlus());
            add(counts, "B", s.getBFlat());
            add(counts, "B-", s.getBMinus());
            add(counts, "C+", s.getCPlus());
            add(counts, "C", s.getCFlat());
            add(counts, "C-", s.getCMinus());
            add(counts, "D", s.getGradeD());
            add(counts, "F", s.getGradeF());
            add(counts, "WF", s.getWf());
            total += s.getTotal();
            withdraw += s.getWithdrawCount();
            if (s.getGpa() != null && s.getTotal() > 0) {
                gpaWeightSum += s.getGpa() * s.getTotal();
                gpaTotal += s.getTotal();
            }
        }

        Double gpa = gpaTotal > 0 ? round2(gpaWeightSum / gpaTotal) : null;
        int dwfCount = counts.get("D") + counts.get("F") + counts.get("WF") + withdraw;
        Double dwfPercent = total > 0 ? round1(100.0 * dwfCount / total) : null;

        List<String> terms = rows.stream().map(SectionGrade::getTerm)
                .distinct().sorted(Comparator.reverseOrder()).toList();

        return GradeAggregate.builder()
                .professor(professor)
                .gpa(gpa)
                .dwfPercent(dwfPercent)
                .total(total)
                .withdrawCount(withdraw)
                .sectionsCount(rows.size())
                .termsTaught(terms)
                .gradeCounts(counts)
                .build();
    }

    // ---------------------------------------------------------------- helpers

    private static String key(String subject, String courseNumber) {
        return (subject == null ? "" : subject.toUpperCase()) + "|" + (courseNumber == null ? "" : courseNumber);
    }

    private static void add(Map<String, Integer> m, String k, int v) {
        m.merge(k, v, Integer::sum);
    }

    private String keyOrUnknown(SectionGrade s) {
        String k = s.getProfessorKey();
        return (k == null || k.isBlank()) ? "|" : k;
    }

    /** Normalizes a name to a "lastname|firstname" key for cross-source matching. */
    static String normalizeName(String raw) {
        if (raw == null || raw.isBlank()) {
            return "";
        }
        String s = raw.toLowerCase()
                .replaceAll("\\([^)]*\\)", " ") // drop parenthetical preferred names
                .replace(".", "")
                .trim();
        String last;
        String first;
        if (s.contains(",")) {
            String[] p = s.split(",", 2);
            last = p[0].trim();
            String[] given = p[1].trim().split("\\s+");
            first = given.length > 0 ? given[0] : "";
        } else {
            String[] tokens = s.split("\\s+");
            last = tokens[tokens.length - 1];
            first = tokens[0];
        }
        last = last.replaceAll("[^a-z\\s-]", "").replaceAll("\\s+", " ").trim();
        first = first.replaceAll("[^a-z-]", "");
        return last + "|" + first;
    }

    /** "CSC 4520 " -> ["CSC","4520",""]; "CSC 1301 L" -> ["CSC","1301","L"]. */
    private static String[] splitCourse(String course) {
        if (course == null) {
            return new String[]{"", "", ""};
        }
        String[] t = course.trim().split("\\s+");
        String subject = t.length > 0 ? t[0] : "";
        String number = t.length > 1 ? t[1] : "";
        StringBuilder section = new StringBuilder();
        for (int i = 2; i < t.length; i++) {
            if (i > 2) section.append(" ");
            section.append(t[i]);
        }
        return new String[]{subject, number, section.toString()};
    }

    private static List<String> normalizeHeaders(List<String> headers) {
        return headers.stream().map(GradeDistributionService::normalizeWs).toList();
    }

    private static int col(List<String> headers, Predicate<String> match) {
        for (int i = 0; i < headers.size(); i++) {
            if (match.test(headers.get(i))) {
                return i;
            }
        }
        return -1;
    }

    private static String at(List<String> cells, int i) {
        return (i >= 0 && i < cells.size()) ? cells.get(i).trim() : null;
    }

    private static int toInt(String s) {
        if (s == null) return 0;
        String t = s.replaceAll("[,\\s]", "");
        if (t.isEmpty() || !t.matches("-?\\d+")) return 0;
        return Integer.parseInt(t);
    }

    private static Double toDouble(String s) {
        if (s == null) return null;
        String t = s.replaceAll("[,\\s%]", "");
        if (!t.matches("-?\\d+(\\.\\d+)?")) return null;
        return Double.parseDouble(t);
    }

    private static String normalizeWs(String s) {
        return s == null ? "" : s.replaceAll("\\s+", " ").trim();
    }

    private static double round1(double v) {
        return Math.round(v * 10.0) / 10.0;
    }

    private static double round2(double v) {
        return Math.round(v * 100.0) / 100.0;
    }
}
