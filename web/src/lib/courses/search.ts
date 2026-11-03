import "server-only";
import { z } from "zod";
import {
  createGoSolarSession,
  getSubjects,
  type CourseData,
  type GoSolarOptions,
  type Subject,
} from "@/lib/gosolar";
import { decodeEntities } from "@/lib/email/escape";
import { compareSections, keyOf } from "@/lib/format";
import { gosolarOptions } from "./gosolar-options";
import { currentTerms, currentTermsMemo, type TermInfo } from "./terms";
import {
  blankToUndefined,
  courseNumberSchema,
  levelSchema,
  MAX_COURSE_NUMBERS,
  MAX_SEARCH_PAIRS,
  subjectSchema,
  termCodeSchema,
} from "./validation";

export const searchSectionsSchema = z.object({
  term: termCodeSchema,
  subject: subjectSchema,
  courseNumber: z.preprocess(blankToUndefined, courseNumberSchema.optional()),
  level: z.preprocess(blankToUndefined, levelSchema.optional()),
});
export type SearchSectionsInput = z.input<typeof searchSectionsSchema>;

/** Banner's maximum page size. */
const PAGE_SIZE = 500;
/** A whole subject (e.g. ENGL) can exceed one page; 5 pages covers every GSU subject. */
const MAX_PAGES = 5;

/**
 * Every section matching (term, subject[, courseNumber][, level]). One GoSolar session
 * (declare + search pages on one connection, see src/lib/gosolar/session.ts). Throws a
 * ZodError for invalid input and GoSolar errors as-is.
 */
export async function searchSections(
  input: SearchSectionsInput,
  options: GoSolarOptions | undefined = gosolarOptions(),
): Promise<CourseData[]> {
  const { term, subject, courseNumber, level } = searchSectionsSchema.parse(input);
  const session = await createGoSolarSession(term, options);
  try {
    const sections: CourseData[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await session.search({
        subject,
        courseNumber,
        level,
        pageOffset: page * PAGE_SIZE,
        pageMaxSize: PAGE_SIZE,
      });
      sections.push(...result.data);
      if (result.data.length < PAGE_SIZE || sections.length >= result.totalCount) break;
    }
    return sections.map((section) => (section.term ? section : { ...section, term }));
  } finally {
    await session.close();
  }
}

/**
 * How many sections match (term, subject[, courseNumber][, level]): one GoSolar session and a
 * one-row page, reading Banner's `totalCount`. For "this course also exists at another level"
 * hints, where the sections themselves aren't needed.
 */
export async function countSections(
  input: SearchSectionsInput,
  options: GoSolarOptions | undefined = gosolarOptions(),
): Promise<number> {
  const { term, subject, courseNumber, level } = searchSectionsSchema.parse(input);
  const session = await createGoSolarSession(term, options);
  try {
    const result = await session.search({ subject, courseNumber, level, pageOffset: 0, pageMaxSize: 1 });
    return typeof result.totalCount === "number" ? result.totalCount : result.data.length;
  } finally {
    await session.close();
  }
}

export const searchCourseListSchema = z
  .object({
    term: termCodeSchema,
    subjects: z.array(subjectSchema).min(1),
    /** Empty: every course of each subject. */
    courseNumbers: z.array(courseNumberSchema).max(MAX_COURSE_NUMBERS).default([]),
    level: z.preprocess(blankToUndefined, levelSchema.optional()),
  })
  .superRefine((input, ctx) => {
    const pairs = input.subjects.length * Math.max(1, input.courseNumbers.length);
    if (pairs > MAX_SEARCH_PAIRS) {
      ctx.addIssue({
        code: "custom",
        path: ["courseNumbers"],
        message: `Search up to ${MAX_SEARCH_PAIRS} subject and course number combinations at a time (this search has ${pairs}).`,
      });
    }
  });
export type SearchCourseListInput = z.input<typeof searchCourseListSchema>;

/** One (subject, course number) search of a list search; `courseNumber` null = whole subject. */
export type SearchPair = { subject: string; courseNumber: string | null };

export interface SearchCourseListResult {
  /** Every section, deduplicated by (term, CRN), in course order. */
  sections: CourseData[];
  /** Pairs whose GoSolar search failed (partial results), with the error. */
  failed: Array<SearchPair & { error: unknown }>;
}

/**
 * The results page's search: every subject x course number pair (at most MAX_SEARCH_PAIRS,
 * else a ZodError) searched concurrently through `searchSections`, merged, deduplicated by
 * (term, CRN) and sorted once. A failed pair is reported in `failed`, not thrown; when every
 * pair fails the caller decides what to show.
 */
export async function searchCourseList(
  input: SearchCourseListInput,
  options: GoSolarOptions | undefined = gosolarOptions(),
): Promise<SearchCourseListResult> {
  const { term, subjects, courseNumbers, level } = searchCourseListSchema.parse(input);
  const numbers: Array<string | null> = courseNumbers.length ? [...new Set(courseNumbers)] : [null];
  const pairs: SearchPair[] = [...new Set(subjects)].flatMap((subject) => numbers.map((courseNumber) => ({ subject, courseNumber })));
  const settled = await Promise.allSettled(
    pairs.map((pair) => searchSections({ term, subject: pair.subject, courseNumber: pair.courseNumber ?? undefined, level }, options)),
  );
  const seen = new Set<string>();
  const sections: CourseData[] = [];
  const failed: SearchCourseListResult["failed"] = [];
  settled.forEach((result, index) => {
    if (result.status === "rejected") {
      failed.push({ ...pairs[index], error: result.reason });
      return;
    }
    for (const section of result.value) {
      const key = keyOf(section);
      if (seen.has(key)) continue;
      seen.add(key);
      sections.push(section);
    }
  });
  sections.sort(compareSections);
  return { sections, failed };
}

/**
 * GoSolar's terms from the `terms` cache: registrable terms first (newest first), then
 * view-only ones, still flagged so the UI can show them read-only. `memo`: the in-process copy
 * (currentTermsMemo), for the on-site assistant's per-turn reads.
 */
export async function getTerms({ memo = false }: { memo?: boolean } = {}): Promise<TermInfo[]> {
  const list = await (memo ? currentTermsMemo() : currentTerms());
  return [...list.filter((t) => !t.viewOnly), ...list.filter((t) => t.viewOnly)];
}

export const searchSubjectsSchema = z.object({
  term: termCodeSchema,
  query: z.string().trim().max(64).default(""),
});
export type SearchSubjectsInput = z.input<typeof searchSubjectsSchema>;

const SUBJECTS_MAX = 50;

/** Subject autocomplete: code or description contains `query` (blank = first page). */
export async function searchSubjects(
  input: SearchSubjectsInput,
  options: GoSolarOptions | undefined = gosolarOptions(),
): Promise<Subject[]> {
  const { term, query } = searchSubjectsSchema.parse(input);
  const subjects = await getSubjects({ searchTerm: query, term, offset: 1, max: SUBJECTS_MAX }, options);
  // Banner sends descriptions HTML-escaped ("COMMUNICATION SCI &amp; DISORDERS").
  return subjects.map((subject) => ({ ...subject, description: decodeEntities(subject.description ?? "") }));
}
