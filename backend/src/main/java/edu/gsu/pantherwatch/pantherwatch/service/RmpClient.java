package edu.gsu.pantherwatch.pantherwatch.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.Getter;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

/**
 * Talks to RateMyProfessors' (unofficial) GraphQL API at
 * www.ratemyprofessors.com/graphql.
 *
 * It's a public Relay endpoint guarded only by a hardcoded Basic auth header
 * ("test:test", shipped in RMP's own web bundle). Lookups are scoped to a
 * school by its base64 relay id; GSU is School-360 → "U2Nob29sLTM2MA==".
 *
 * We use a single "search teachers" query, which already returns the summary
 * numbers we display (quality, difficulty, would-take-again, count) plus the
 * legacy id for linking out — no second round trip needed.
 */
@Component
@Slf4j
public class RmpClient {

    private static final String AUTH_HEADER = "Basic dGVzdDp0ZXN0";
    private static final String USER_AGENT =
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
            + "(KHTML, like Gecko) Chrome/124.0 Safari/537.36";
    private static final Duration TIMEOUT = Duration.ofSeconds(15);

    private static final String SEARCH_QUERY =
            "query Search($query: TeacherSearchQuery!) {"
            + "  newSearch {"
            + "    teachers(query: $query) {"
            + "      edges { node {"
            + "        legacyId firstName lastName department"
            + "        avgRating avgDifficulty numRatings wouldTakeAgainPercent"
            + "        ratingsDistribution { r1 r2 r3 r4 r5 total }"
            + "        teacherRatingTags { tagName tagCount }"
            + "      } }"
            + "    }"
            + "  }"
            + "}";

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(TIMEOUT)
            .build();
    private final ObjectMapper mapper = new ObjectMapper();

    @Value("${pantherwatch.rmp.endpoint:https://www.ratemyprofessors.com/graphql}")
    private String endpoint;

    /** GSU's RMP school relay id (School-360). */
    @Value("${pantherwatch.rmp.school-id:U2Nob29sLTM2MA==}")
    private String schoolId;

    /** A tag and how many raters applied it. */
    public record Tag(String name, int count) {}

    /** A single teacher hit from the search results. */
    @Getter
    public static final class Teacher {
        private final int legacyId;
        private final String firstName;
        private final String lastName;
        private final String department;
        private final Double avgRating;
        private final Double avgDifficulty;
        private final Integer numRatings;
        private final Double wouldTakeAgainPercent;
        /** Star buckets [r1..r5] (Awful → Awesome); null when unavailable. */
        private final int[] distribution;
        private final List<Tag> tags;

        public Teacher(int legacyId, String firstName, String lastName, String department,
                       Double avgRating, Double avgDifficulty, Integer numRatings,
                       Double wouldTakeAgainPercent, int[] distribution, List<Tag> tags) {
            this.legacyId = legacyId;
            this.firstName = firstName;
            this.lastName = lastName;
            this.department = department;
            this.avgRating = avgRating;
            this.avgDifficulty = avgDifficulty;
            this.numRatings = numRatings;
            this.wouldTakeAgainPercent = wouldTakeAgainPercent;
            this.distribution = distribution;
            this.tags = tags == null ? List.of() : tags;
        }
    }

    /** Searches GSU professors by free-text name. Returns an empty list on failure. */
    public List<Teacher> searchTeachers(String text) {
        List<Teacher> teachers = new ArrayList<>();
        try {
            Map<String, Object> body = Map.of(
                    "query", SEARCH_QUERY,
                    "variables", Map.of("query", Map.of("text", text, "schoolID", schoolId)));

            HttpRequest req = HttpRequest.newBuilder()
                    .uri(URI.create(endpoint))
                    .timeout(TIMEOUT)
                    .header("Content-Type", "application/json")
                    .header("Authorization", AUTH_HEADER)
                    .header("User-Agent", USER_AGENT)
                    .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(body)))
                    .build();

            HttpResponse<String> resp = http.send(req, HttpResponse.BodyHandlers.ofString());
            if (resp.statusCode() != 200) {
                log.warn("RMP search '{}' returned status {}", text, resp.statusCode());
                return teachers;
            }

            JsonNode edges = mapper.readTree(resp.body())
                    .path("data").path("newSearch").path("teachers").path("edges");
            for (JsonNode edge : edges) {
                JsonNode n = edge.path("node");
                teachers.add(new Teacher(
                        n.path("legacyId").asInt(),
                        n.path("firstName").asText(""),
                        n.path("lastName").asText(""),
                        n.path("department").asText(""),
                        n.hasNonNull("avgRating") ? n.get("avgRating").asDouble() : null,
                        n.hasNonNull("avgDifficulty") ? n.get("avgDifficulty").asDouble() : null,
                        n.hasNonNull("numRatings") ? n.get("numRatings").asInt() : null,
                        n.hasNonNull("wouldTakeAgainPercent") ? n.get("wouldTakeAgainPercent").asDouble() : null,
                        parseDistribution(n.path("ratingsDistribution")),
                        parseTags(n.path("teacherRatingTags"))));
            }
        } catch (Exception e) {
            log.warn("RMP search failed for '{}': {}", text, e.getMessage());
        }
        return teachers;
    }

    private int[] parseDistribution(JsonNode dist) {
        if (dist.isMissingNode() || dist.isNull()) return null;
        return new int[] {
                dist.path("r1").asInt(0),
                dist.path("r2").asInt(0),
                dist.path("r3").asInt(0),
                dist.path("r4").asInt(0),
                dist.path("r5").asInt(0),
        };
    }

    private List<Tag> parseTags(JsonNode tags) {
        List<Tag> out = new ArrayList<>();
        if (tags.isArray()) {
            for (JsonNode t : tags) {
                out.add(new Tag(t.path("tagName").asText(""), t.path("tagCount").asInt(0)));
            }
        }
        return out;
    }
}
