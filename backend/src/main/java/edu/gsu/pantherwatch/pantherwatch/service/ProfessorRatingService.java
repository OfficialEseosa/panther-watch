package edu.gsu.pantherwatch.pantherwatch.service;

import edu.gsu.pantherwatch.pantherwatch.api.ProfessorRating;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.Comparator;
import java.util.List;
import java.util.Optional;

/**
 * Resolves a GoSolar instructor name to a RateMyProfessors summary.
 *
 * GoSolar names are messy ("Nemira, Alina (Alina) "); we parse them into first
 * and last name, search RMP scoped to GSU, then pick the best match. We query
 * RMP on every request so the displayed rating is always current — the frontend
 * dedupes repeated professors within a search, which keeps the call volume sane.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class ProfessorRatingService {

    private static final String PROFILE_URL = "https://www.ratemyprofessors.com/professor/";
    private static final int MAX_TAGS = 5;

    private final RmpClient rmp;

    public ProfessorRating getRating(String professor) {
        Name name = parseName(professor);
        if (name == null) {
            return ProfessorRating.builder().professorQueried(professor).found(false).build();
        }

        List<RmpClient.Teacher> hits = rmp.searchTeachers(name.first + " " + name.last);
        Optional<RmpClient.Teacher> match = bestMatch(hits, name);

        if (match.isEmpty()) {
            return ProfessorRating.builder().professorQueried(professor).found(false).build();
        }

        RmpClient.Teacher t = match.get();
        return ProfessorRating.builder()
                .professorQueried(professor)
                .found(true)
                .matchedName((t.getFirstName() + " " + t.getLastName()).trim())
                .department(t.getDepartment())
                .legacyId(t.getLegacyId())
                .profileUrl(PROFILE_URL + t.getLegacyId())
                .avgRating(t.getAvgRating())
                .avgDifficulty(t.getAvgDifficulty())
                .numRatings(t.getNumRatings())
                .wouldTakeAgainPercent(t.getWouldTakeAgainPercent())
                .distribution(toDistribution(t.getDistribution()))
                .topTags(toTopTags(t.getTags()))
                .build();
    }

    private ProfessorRating.Distribution toDistribution(int[] d) {
        if (d == null || d.length < 5) return null;
        return ProfessorRating.Distribution.builder()
                .r1(d[0]).r2(d[1]).r3(d[2]).r4(d[3]).r5(d[4])
                .build();
    }

    private List<ProfessorRating.Tag> toTopTags(List<RmpClient.Tag> tags) {
        if (tags == null) return List.of();
        return tags.stream()
                .sorted(Comparator.comparingInt(RmpClient.Tag::count).reversed())
                .limit(MAX_TAGS)
                .map(tag -> ProfessorRating.Tag.builder().name(tag.name()).count(tag.count()).build())
                .toList();
    }

    /**
     * Picks the RMP hit whose last name matches and whose first name matches or is
     * a prefix (handles "Alina" vs "Alina Marie"). Ties break toward the most-rated
     * profile. Falls back to a last-name-only match when nothing matches the first.
     */
    private Optional<RmpClient.Teacher> bestMatch(List<RmpClient.Teacher> hits, Name name) {
        Comparator<RmpClient.Teacher> byRatings =
                Comparator.comparingInt(t -> t.getNumRatings() == null ? 0 : t.getNumRatings());

        Optional<RmpClient.Teacher> exact = hits.stream()
                .filter(t -> t.getLastName().equalsIgnoreCase(name.last))
                .filter(t -> firstNameMatches(t.getFirstName(), name.first))
                .max(byRatings);
        if (exact.isPresent()) {
            return exact;
        }

        return hits.stream()
                .filter(t -> t.getLastName().equalsIgnoreCase(name.last))
                .max(byRatings);
    }

    private boolean firstNameMatches(String rmpFirst, String queryFirst) {
        if (rmpFirst == null || queryFirst == null) return false;
        String a = rmpFirst.toLowerCase();
        String b = queryFirst.toLowerCase();
        return a.equals(b) || a.startsWith(b) || b.startsWith(a);
    }

    /** Parses a GoSolar/raw display name into first + last. Returns null if unusable. */
    private Name parseName(String raw) {
        if (raw == null) return null;
        // Drop parentheticals ("(Alina)"), trailing dots, and collapse whitespace.
        String cleaned = raw.replaceAll("\\([^)]*\\)", "")
                .replace(".", " ")
                .replaceAll("\\s+", " ")
                .trim();
        if (cleaned.isEmpty() || cleaned.equalsIgnoreCase("TBA")) return null;

        String first;
        String last;
        if (cleaned.contains(",")) {
            // "Last, First"
            String[] parts = cleaned.split(",", 2);
            last = parts[0].trim();
            String rest = parts[1].trim();
            first = rest.isEmpty() ? "" : rest.split(" ")[0];
        } else {
            // "First ... Last"
            String[] parts = cleaned.split(" ");
            first = parts[0];
            last = parts[parts.length - 1];
        }

        if (first.isEmpty() || last.isEmpty()) return null;
        return new Name(first, last);
    }

    private record Name(String first, String last) {}
}
