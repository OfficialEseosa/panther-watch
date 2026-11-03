import { nyDateParts } from "@/lib/format";

/** The part of a term the picks below need (TermInfo and the `terms` row both fit). */
export interface TermPick {
  code: string;
  viewOnly: boolean;
}

/**
 * The term the course search form preselects (CourseSearchForm: the newest term open for
 * registration, else the newest term), so the assistant defaults to what the site does.
 */
export const defaultTermCode = (terms: readonly TermPick[]): string | undefined =>
  [...terms].sort((a, b) => b.code.localeCompare(a.code)).find((t) => !t.viewOnly)?.code ??
  [...terms].sort((a, b) => b.code.localeCompare(a.code))[0]?.code;

/** Term codes are YYYYMM of the start month: started once that month begins (GSU's local date). */
export function termStarted(code: string, now: Date = new Date()): boolean {
  const today = nyDateParts(now);
  return today.year * 100 + today.month >= Number(code);
}

/** The newest term that has started: the semester under way. */
export const inProgressTermCode = (terms: readonly Pick<TermPick, "code">[], now: Date = new Date()): string | undefined =>
  terms.map((t) => t.code).filter((code) => termStarted(code, now)).sort((a, b) => b.localeCompare(a))[0];
