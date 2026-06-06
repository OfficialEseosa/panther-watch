package edu.gsu.pantherwatch.pantherwatch.model;

import lombok.Builder;
import lombok.Data;

/**
 * One graded section (a single CRN in a single term) from GSU's APEX
 * "Grade Distributions By Course Sections" report. Held in memory (not persisted):
 * the full dataset is small, static, and cheaply re-downloaded as CSV, so there's
 * no DB table behind it.
 */
@Data
@Builder
public class SectionGrade {
    private String term;
    private String crn;
    private String subject;
    private String courseNumber;
    /** Section component suffix ("" for lecture, "L" lab, "K" honors, etc.). */
    private String section;

    private String professor;
    /** Normalized "last|first" key for matching against GoSolar display names. */
    private String professorKey;
    private String instructionMethod;

    // Coarse A-F buckets (from the summary report).
    private int gradeA;
    private int gradeB;
    private int gradeC;
    private int gradeD;
    private int gradeF;

    // Fine +/- grades (from the detailed report, merged by CRN).
    private int aPlus;
    private int aFlat;
    private int aMinus;
    private int bPlus;
    private int bFlat;
    private int bMinus;
    private int cPlus;
    private int cFlat;
    private int cMinus;

    private int wf;
    private int withdrawCount;
    private int otherCount;
    private int total;

    /** Course GPA average (APEX "CRS AVG"); null if not reported. */
    private Double gpa;
}
