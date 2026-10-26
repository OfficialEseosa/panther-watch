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
import { gosolarOptions } from "./gosolar-options";
import { currentTerms, type TermInfo } from "./terms";
import {
  blankToUndefined,
  courseNumberSchema,
  levelSchema,
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
 * GoSolar's terms from the `terms` cache: registrable terms first (newest first), then
 * view-only ones, still flagged so the UI can show them read-only.
 */
export async function getTerms(): Promise<TermInfo[]> {
  const list = await currentTerms();
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
