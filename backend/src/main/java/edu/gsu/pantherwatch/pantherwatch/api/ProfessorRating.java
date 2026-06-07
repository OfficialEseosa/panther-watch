package edu.gsu.pantherwatch.pantherwatch.api;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * RateMyProfessors summary for a single instructor, resolved by name against
 * Georgia State's RMP school. {@code found} is false when the professor has no
 * RMP profile at GSU (the frontend then shows a "no ratings" state).
 */
@Data
@Builder
public class ProfessorRating {

    /** The instructor name we were asked about, echoed back. */
    private String professorQueried;

    /** True when a matching RMP profile was found. */
    private boolean found;

    /** The matched RMP display name, e.g. "Alina Nemira". */
    private String matchedName;

    private String department;

    /** RMP legacy id, used to build the public profile URL. */
    private Integer legacyId;

    /** Public RMP profile page for "see full reviews" links. */
    private String profileUrl;

    /** Overall quality, 0–5. */
    private Double avgRating;

    /** Average difficulty, 0–5. */
    private Double avgDifficulty;

    private Integer numRatings;

    /** Percentage of raters who would take the professor again, 0–100. */
    private Double wouldTakeAgainPercent;

    /** Star-bucket counts, Awful(1) → Awesome(5). Null when unavailable. */
    private Distribution distribution;

    /** Most-applied rating tags, highest count first. */
    private List<Tag> topTags;

    @Data
    @Builder
    public static class Distribution {
        private int r1;
        private int r2;
        private int r3;
        private int r4;
        private int r5;
    }

    @Data
    @Builder
    public static class Tag {
        private String name;
        private int count;
    }
}
