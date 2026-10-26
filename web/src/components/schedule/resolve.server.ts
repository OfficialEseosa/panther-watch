import "server-only";
import { unstable_rethrow } from "next/navigation";
import { searchSections } from "@/lib/courses";
import { sectionKey } from "@/lib/format";
import type { ScheduleEntry } from "@/lib/schedule";
import { courseKey, type ResolvedSchedule } from "./resolve";

const CONCURRENCY = 4;
/** The page never waits longer than this; courses not done by then resolve on the client. */
const BUDGET_MS = 10_000;

type Course = { term: string; subject: string; courseNumber: string; crns: Set<string> };

const TIMEOUT = Symbol("timeout");

function within<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMEOUT> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => resolve(TIMEOUT), Math.max(0, ms));
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error: unknown) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

/**
 * Resolves every scheduled section's live GoSolar data on the server (pages.md §6): one
 * `searchSections` per distinct (term, subject, course number), at most 4 in flight, terms in
 * `priority` order first. Only the scheduled CRNs are kept, so the payload stays small. A
 * failed search is recorded as "error" (the client offers Retry); a search still running at the
 * 10 s budget is left out and the client resolver picks it up.
 */
export async function resolveScheduleSections(
  schedule: Record<string, ScheduleEntry[]>,
  priority: string[] = [],
): Promise<ResolvedSchedule> {
  const courses = new Map<string, Course>();
  for (const [term, entries] of Object.entries(schedule)) {
    for (const entry of entries) {
      const key = courseKey(term, entry.subject, entry.courseNumber);
      const course = courses.get(key) ?? { term, subject: entry.subject, courseNumber: entry.courseNumber, crns: new Set() };
      course.crns.add(entry.crn);
      courses.set(key, course);
    }
  }
  const rank = (term: string) => {
    const index = priority.indexOf(term);
    return index === -1 ? priority.length : index;
  };
  const queue = [...courses.entries()].sort(([, a], [, b]) => rank(a.term) - rank(b.term) || b.term.localeCompare(a.term));
  const result: ResolvedSchedule = { sections: {}, outcomes: {} };
  const deadline = Date.now() + BUDGET_MS;

  const worker = async () => {
    for (let next = queue.shift(); next; next = queue.shift()) {
      const [key, course] = next;
      const left = deadline - Date.now();
      if (left <= 0) return;
      try {
        const found = await within(
          searchSections({ term: course.term, subject: course.subject, courseNumber: course.courseNumber }),
          left,
        );
        if (found === TIMEOUT) return;
        for (const section of found) {
          const crn = section.courseReferenceNumber;
          if (crn && course.crns.has(crn)) result.sections[sectionKey(course.term, crn)] = section;
        }
        result.outcomes[key] = "ok";
      } catch (error) {
        unstable_rethrow(error);
        console.warn(`schedule builder: meeting times for ${key} failed:`, error instanceof Error ? error.message : error);
        result.outcomes[key] = "error";
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
  return result;
}
