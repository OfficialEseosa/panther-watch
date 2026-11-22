import { buildUrl, getJson, resolveOptions, type GoSolarOptions } from "./http";
import { createGoSolarSession } from "./session";
import type { CourseData, SearchParams, SearchResult, Subject, Term } from "./types";

export interface SearchCoursesParams extends SearchParams {
  term: string;
}

/** Upper bound on rows `searchCourses` collects across pages. */
export const MAX_SEARCH_RESULTS = 1000;
const DEFAULT_PAGE_SIZE = 200;

/**
 * Declare + search on one session. Without an explicit `pageOffset`, follows GoSolar's
 * pagination on the same session until `totalCount` rows (capped at MAX_SEARCH_RESULTS, with a
 * warning) are collected, so callers never silently miss sections past the first page. With a
 * `pageOffset`, returns exactly that one page.
 *
 * The Java backend also called `/classSearch/resetDataForm` afterwards; that reset a fresh
 * anonymous session (a no-op) and cost up to 10 s, so it is intentionally not ported.
 */
export async function searchCourses(
  { term, ...params }: SearchCoursesParams,
  options?: GoSolarOptions,
): Promise<SearchResult> {
  const session = await createGoSolarSession(term, options);
  try {
    const first = await session.search(params);
    if (params.pageOffset !== undefined) return first;

    const pageSize = params.pageMaxSize ?? DEFAULT_PAGE_SIZE;
    const data = [...first.data];
    const wanted = Math.min(first.totalCount, MAX_SEARCH_RESULTS);
    while (data.length < wanted) {
      const page = await session.search({ ...params, pageOffset: data.length, pageMaxSize: pageSize });
      if (page.data.length === 0) break;
      data.push(...page.data);
    }
    if (first.totalCount > data.length) {
      console.warn(
        `GoSolar search ${term} ${params.subject} ${params.courseNumber ?? ""}: ` +
          `collected ${data.length} of ${first.totalCount} sections`,
      );
    }
    return { ...first, data: data.slice(0, MAX_SEARCH_RESULTS) };
  } finally {
    await session.close();
  }
}

export async function getTerms(options?: GoSolarOptions): Promise<Term[]> {
  const resolved = resolveOptions(options);
  const url = buildUrl(resolved.baseUrl, "/classSearch/getTerms", [
    ["offset", "1"],
    ["max", "10"],
  ]);
  return ((await getJson(url, resolved)) as Term[] | null) ?? [];
}

/**
 * Closed registration windows are labelled "(View only)"; tracking/scheduling is refused for
 * them. Case-insensitive: live GoSolar currently sends "(View Only)".
 */
export function isViewOnlyTerm(term: Pick<Term, "description"> | null | undefined): boolean {
  return term?.description?.toLowerCase().includes("(view only)") ?? false;
}

export interface GetSubjectsParams {
  searchTerm: string;
  term: string;
  offset?: number;
  max?: number;
}

export async function getSubjects(
  { searchTerm, term, offset = 1, max = 10 }: GetSubjectsParams,
  options?: GoSolarOptions,
): Promise<Subject[]> {
  const resolved = resolveOptions(options);
  const url = buildUrl(resolved.baseUrl, "/classSearch/get_subject", [
    ["searchTerm", searchTerm],
    ["term", term],
    ["offset", String(offset)],
    ["max", String(max)],
  ]);
  return ((await getJson(url, resolved)) as Subject[] | null) ?? [];
}

/**
 * Every subject of the course catalog for `term` (`GET /courseSearch/get_subject`): a longer list
 * than the class search's (`getSubjects`), since it includes subjects with no sections that term
 * and some retired ones (live 2026-11-02: 248 vs 173). Descriptions read "CSC - COMPUTER SCIENCE".
 */
export async function getCatalogSubjects(term: string, options?: GoSolarOptions): Promise<Subject[]> {
  const resolved = resolveOptions(options);
  const url = buildUrl(resolved.baseUrl, "/courseSearch/get_subject", [
    ["searchTerm", ""],
    ["term", term],
    ["offset", "1"],
    ["max", "2000"],
  ]);
  return ((await getJson(url, resolved)) as Subject[] | null) ?? [];
}

export interface CourseGroup {
  subject: string;
  courseNumber: string;
  crns: string[];
}

const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 16;

/**
 * Courses per combined search, i.e. per GoSolar session. A course adds ~11 characters to the
 * URL, so 40 keeps it near 600 (31 courses, 545 characters, verified live 2026-11-22).
 */
export const COURSES_PER_SEARCH = 40;
/** A combined search matching more sections than this is split in half and retried. */
export const MAX_COMBO_RESULTS = 3000;
/** GoSolar serves 500-row pages (verified live); 31 courses = 502 sections = 2 pages. */
const COMBO_PAGE_SIZE = 500;

export interface FindSectionsOptions extends GoSolarOptions {
  /** Max combined searches in flight at once (each on its own session). Default 4, clamped to 1..16. */
  concurrency?: number;
  /** Courses per combined search. Default COURSES_PER_SEARCH, clamped to 1..COURSES_PER_SEARCH. */
  batchSize?: number;
  /**
   * Called once per group whose search failed; its CRNs are then absent from the result. A
   * combined search covers several groups, so one failure reports every group in it. GoSolar
   * cannot look up a CRN directly, so callers must treat "absent" as "unknown", never as
   * "closed". Defaults to logging.
   */
  onError?: (group: CourseGroup, error: unknown) => void;
}

/**
 * Resolves CRNs to sections (GoSolar ignores CRN filters) and keeps only the requested ones.
 * Shared by the seat watcher, tracked classes and the assistant.
 *
 * Groups are searched together, up to `batchSize` courses per GoSolar session, with Banner's
 * `txt_subjectcoursecombo` (see GoSolarSession.searchCombo). Before 2026-11-22 every group had
 * its own session (a fresh TLS connection, a term declaration and a search); at 31 tracked
 * courses that was 31 sessions per watcher run, every 3 minutes, and it used up the Vercel
 * Hobby Active CPU allowance. A section is kept only when its subject, course number AND CRN
 * match a requested group, exactly what the one-course searches returned.
 */
export async function findSectionsByCrn(
  term: string,
  groups: CourseGroup[],
  { concurrency, batchSize, onError = logGroupError, ...options }: FindSectionsOptions = {},
): Promise<Map<string, CourseData>> {
  const sections = new Map<string, CourseData>();
  const limit = clampInt(concurrency, 1, MAX_CONCURRENCY, DEFAULT_CONCURRENCY);
  const size = clampInt(batchSize, 1, COURSES_PER_SEARCH, COURSES_PER_SEARCH);

  const report = (group: CourseGroup, error: unknown) => {
    // A throwing callback must not abort the remaining groups.
    try {
      onError(group, error);
    } catch (callbackError) {
      console.error("findSectionsByCrn onError callback threw", callbackError);
    }
  };

  const searchBatch = async (batch: CourseGroup[]): Promise<void> => {
    try {
      for (const [crn, section] of await comboSearch(term, batch, options)) sections.set(crn, section);
    } catch (error) {
      if (error instanceof ComboTooLargeError && batch.length > 1) {
        const middle = Math.ceil(batch.length / 2);
        await searchBatch(batch.slice(0, middle));
        await searchBatch(batch.slice(middle));
        return;
      }
      for (const group of batch) report(group, error);
    }
  };

  const batches = chunk(
    groups.filter((group) => group.crns.length > 0),
    size,
  );
  await forEachLimited(batches, limit, searchBatch);
  return sections;
}

/** Thrown before paging a combined search that matched more than MAX_COMBO_RESULTS sections. */
class ComboTooLargeError extends Error {
  constructor(readonly totalCount: number) {
    super(`combined search matched ${totalCount} sections (limit ${MAX_COMBO_RESULTS})`);
    this.name = "ComboTooLargeError";
  }
}

const sectionKey = (subject: string | null | undefined, courseNumber: string | null | undefined, crn: string) =>
  `${(subject ?? "").trim().toUpperCase()}|${(courseNumber ?? "").trim().toUpperCase()}|${crn}`;

/** One session, every course of `batch` in one combined search, paged to the end. */
async function comboSearch(
  term: string,
  batch: CourseGroup[],
  options: GoSolarOptions,
): Promise<Map<string, CourseData>> {
  const wanted = new Set(batch.flatMap((g) => g.crns.map((crn) => sectionKey(g.subject, g.courseNumber, crn))));
  const keep = (raw: CourseData) =>
    !!raw.courseReferenceNumber && wanted.has(sectionKey(raw.subject, raw.courseNumber, raw.courseReferenceNumber));
  const courses = [
    ...new Map(batch.map((g) => [sectionKey(g.subject, g.courseNumber, ""), g])).values(),
  ];

  const found = new Map<string, CourseData>();
  const session = await createGoSolarSession(term, options);
  try {
    let offset = 0;
    for (;;) {
      const page = await session.searchCombo(courses, { pageOffset: offset, pageMaxSize: COMBO_PAGE_SIZE, keep });
      if (offset === 0 && page.totalCount > MAX_COMBO_RESULTS && courses.length > 1) {
        throw new ComboTooLargeError(page.totalCount);
      }
      for (const section of page.data) found.set(section.courseReferenceNumber!, section);
      offset += page.rowsOnPage;
      if (offset >= page.totalCount) break;
      if (page.rowsOnPage === 0 || offset >= MAX_COMBO_RESULTS) {
        console.warn(
          `GoSolar combined search ${term} (${courses.length} courses): read ${offset} of ${page.totalCount} sections`,
        );
        break;
      }
    }
    return found;
  } finally {
    await session.close();
  }
}

function chunk<T>(items: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function clampInt(value: number | undefined, min: number, max: number, fallback: number): number {
  return value !== undefined && Number.isFinite(value) ? Math.min(max, Math.max(min, Math.floor(value))) : fallback;
}

function logGroupError(group: CourseGroup, error: unknown): void {
  console.error(`GoSolar search failed for ${group.subject} ${group.courseNumber}`, error);
}

async function forEachLimited<T>(
  items: readonly T[],
  limit: number,
  worker: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (next < items.length) {
      await worker(items[next++]);
    }
  });
  await Promise.all(runners);
}
