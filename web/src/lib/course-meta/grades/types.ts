/** Ordered grade keys of `GradeAggregate.gradeCounts` (fine A+..C-, then D, F, WF). */
export const GRADE_KEYS = ["A+", "A", "A-", "B+", "B", "B-", "C+", "C", "C-", "D", "F", "WF"] as const;
export type GradeKey = (typeof GRADE_KEYS)[number];

/**
 * Grade distribution for a whole course (`professor: null`) or one professor's sections of
 * it, summed across the ingested term window. Same fields as the Java `GradeAggregate`.
 */
export interface GradeAggregate {
  /** Display name (most recent spelling), or null for the course-wide aggregate. */
  professor: string | null;
  /** Enrollment-weighted CRS AVG across sections that have one, 2 decimals. */
  gpa: number | null;
  /** (D + F + WF + W) / total, as a percentage with 1 decimal. */
  dwfPercent: number | null;
  total: number;
  withdrawCount: number;
  sectionsCount: number;
  /** Terms this aggregate draws from, newest first. */
  termsTaught: string[];
  /** Grade -> count, in GRADE_KEYS order. */
  gradeCounts: Record<GradeKey, number>;
}

/** Same fields as the Java `GradeDistributionResponse` (the frontend's grade payload). */
export interface GradeDistributionResponse {
  subject: string;
  courseNumber: string;
  /** False when there is no grade history for this course in the window. */
  hasData: boolean;
  /** Terms included, newest first ([] when hasData is false). */
  termsIncluded: string[];
  /** Course-wide aggregate; null when hasData is false. */
  overall: GradeAggregate | null;
  /** One aggregate per professor, most students first ([] when hasData is false). */
  professors: GradeAggregate[];
  instructorQueried: string | null;
  /** True when the queried instructor matched a professor with history for this course. */
  instructorHasTaught: boolean;
  instructorDistribution: GradeAggregate | null;
}
