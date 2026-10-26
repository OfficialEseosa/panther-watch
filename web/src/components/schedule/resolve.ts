/**
 * Meeting-time resolution shared by the schedule builder's server loader (`resolve.server.ts`)
 * and its client resolver (`useSectionResolver`). GoSolar has no CRN search, so a schedule
 * entry is resolved by searching its course (term, subject, course number) once and picking
 * the CRN from the results. Pure and client-safe.
 */
import type { CourseData } from "@/lib/gosolar/types";

/** One search per course: `202608|CSC|2720`. */
export const courseKey = (term: string, subject: string, courseNumber: string) =>
  `${term}|${subject.toUpperCase()}|${courseNumber.toUpperCase()}`;

export type ResolvedSchedule = {
  /** `term|crn` -> live section, only for CRNs on the schedule. */
  sections: Record<string, CourseData>;
  /**
   * Course key -> outcome of its search. "ok" = searched (CRNs it didn't return are "missing");
   * "error" = GoSolar failed. Courses absent here were not searched (the client resolves them).
   */
  outcomes: Record<string, "ok" | "error">;
};

export const EMPTY_RESOLVED: ResolvedSchedule = { sections: {}, outcomes: {} };
