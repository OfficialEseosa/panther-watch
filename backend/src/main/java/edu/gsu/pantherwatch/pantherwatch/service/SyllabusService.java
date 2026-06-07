package edu.gsu.pantherwatch.pantherwatch.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import edu.gsu.pantherwatch.pantherwatch.api.SyllabusInfo;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.util.HashMap;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;

/**
 * Resolves a section's syllabus PDF from GSU's public syllabi repository
 * (the same data behind cdn.gsu.edu/apps/syllabi-public).
 *
 * The repo publishes one static file per term — {base}/{term}.json — listing
 * ~11k course records keyed by CRN, each with a "syllabus" path like
 * "syllabi/202508/83410.pdf" (empty when none is uploaded). The PDF itself lives
 * at {base}/files/{path}. Those files send no CORS header, so the browser can't
 * read them directly; we resolve availability here and hand back the embeddable
 * CloudFront URL (PDFs send no X-Frame-Options, so an iframe embed works).
 *
 * Each term's CRN→path map is cached with a short TTL — syllabi trickle in over a
 * term, but the 3–4 MB term file is far too big to refetch per request.
 */
@Service
@Slf4j
public class SyllabusService {

    private static final Duration TTL = Duration.ofHours(6);
    private static final String USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";
    private static final Duration TIMEOUT = Duration.ofSeconds(30);

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(TIMEOUT).build();
    private final ObjectMapper mapper = new ObjectMapper();
    private final ConcurrentHashMap<String, TermData> cache = new ConcurrentHashMap<>();

    /** Base of the public syllabi repository (CloudFront). */
    @Value("${pantherwatch.syllabi.base:https://cdn.gsu.edu/static/syllabi-public/}")
    private String base;

    private record TermData(Map<String, String> crnToPath, Instant fetchedAt) {
        boolean isFresh() {
            return Instant.now().isBefore(fetchedAt.plus(TTL));
        }
    }

    public SyllabusInfo get(String term, String crn) {
        SyllabusInfo.SyllabusInfoBuilder out = SyllabusInfo.builder().term(term).crn(crn).available(false);
        if (term == null || term.isBlank() || crn == null || crn.isBlank()) {
            return out.build();
        }

        TermData td = loadTerm(term.trim());
        String path = td.crnToPath().get(crn.trim());
        if (path == null || path.isBlank()) {
            return out.build();
        }
        return out.available(true).url(base + "files/" + path).build();
    }

    private TermData loadTerm(String term) {
        TermData cached = cache.get(term);
        if (cached != null && cached.isFresh()) {
            return cached;
        }

        try {
            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(base + term + ".json"))
                    .timeout(TIMEOUT)
                    .header("User-Agent", USER_AGENT)
                    .header("Accept", "application/json")
                    .GET()
                    .build();

            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                log.warn("Syllabi term {} returned status {}", term, resp.statusCode());
                return cacheFallback(term, cached);
            }

            Map<String, String> map = new HashMap<>();
            JsonNode courses = mapper.readTree(resp.body()).path("courses");
            for (JsonNode c : courses) {
                String syllabus = c.path("syllabus").asText("");
                if (!syllabus.isBlank()) {
                    map.put(c.path("crn").asText(""), syllabus);
                }
            }
            TermData fresh = new TermData(map, Instant.now());
            cache.put(term, fresh);
            log.info("Loaded {} syllabi for term {}", map.size(), term);
            return fresh;
        } catch (Exception e) {
            log.warn("Failed to load syllabi for term {}: {}", term, e.getMessage());
            return cacheFallback(term, cached);
        }
    }

    /** On failure, keep serving a stale map if we have one; otherwise an empty one. */
    private TermData cacheFallback(String term, TermData stale) {
        if (stale != null) {
            return stale;
        }
        TermData empty = new TermData(Map.of(), Instant.now());
        cache.put(term, empty);
        return empty;
    }
}
