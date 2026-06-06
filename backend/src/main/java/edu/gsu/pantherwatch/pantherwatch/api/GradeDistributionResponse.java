package edu.gsu.pantherwatch.pantherwatch.api;

import lombok.Builder;
import lombok.Data;

import java.util.List;

/**
 * Grade-distribution payload for a course card. Carries the course-wide
 * aggregate plus a per-professor breakdown, and (when an instructor is supplied)
 * resolves whether that specific professor has taught the course.
 */
@Data
@Builder
public class GradeDistributionResponse {
    private String subject;
    private String courseNumber;

    /** False when we have no scraped grade history for this course at all. */
    private boolean hasData;

    /** Term codes included in the aggregation, newest first. */
    private List<String> termsIncluded;

    /** Course-wide aggregate across all professors. Null when hasData is false. */
    private GradeAggregate overall;

    /** One aggregate per professor, sorted by enrollment (most-taught first). */
    private List<GradeAggregate> professors;

    /** The instructor name that was queried, echoed back (null if none supplied). */
    private String instructorQueried;

    /**
     * True when the queried instructor matched a professor with grade history for
     * this course. When false (and an instructor was supplied), the frontend
     * shows "This professor hasn't taught this course before".
     */
    private boolean instructorHasTaught;

    /** The matched professor's aggregate, or null if no match. */
    private GradeAggregate instructorDistribution;
}
