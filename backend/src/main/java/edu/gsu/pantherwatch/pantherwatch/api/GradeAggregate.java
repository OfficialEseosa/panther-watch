package edu.gsu.pantherwatch.pantherwatch.api;

import lombok.Builder;
import lombok.Data;

import java.util.List;
import java.util.Map;

/**
 * Aggregated grade distribution for either a whole course (professor == null)
 * or a single professor's sections of that course, summed across a window of
 * recent terms.
 */
@Data
@Builder
public class GradeAggregate {
    /** Professor display name, or null for the course-wide aggregate. */
    private String professor;

    /** Enrollment-weighted course GPA average across the included sections. */
    private Double gpa;

    /** Drop/Withdraw/Fail rate = (D + F + WF + W) / total, as a percentage. */
    private Double dwfPercent;

    private int total;
    private int withdrawCount;
    private int sectionsCount;

    /** Term codes this aggregate draws from, newest first. */
    private List<String> termsTaught;

    /**
     * Grade -> count, insertion-ordered A+ .. F then WF. Lets the frontend draw
     * both a fine breakdown and a coarse A-F bar (by summing +/- variants).
     */
    private Map<String, Integer> gradeCounts;
}
