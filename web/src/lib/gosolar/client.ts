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

export interface CourseGroup {
  subject: string;
  courseNumber: string;
  crns: string[];
}

const DEFAULT_CONCURRENCY = 4;
const MAX_CONCURRENCY = 16;

export interface FindSectionsOptions extends GoSolarOptions {
  /** Max searches in flight at once (each on its own session). Default 4, clamped to 1..16. */
  concurrency?: number;
  /**
   * Called when a group's search fails; its CRNs are then absent from the result. GoSolar
   * cannot look up a CRN directly, so callers must treat "absent" as "unknown", never as
   * "closed". Defaults to logging.
   */
  onError?: (group: CourseGroup, error: unknown) => void;
}

/**
 * Resolves CRNs to sections by searching each subject+courseNumber group (GoSolar ignores
 * CRN filters) and keeping the requested CRNs. Shared by the seat watcher and tracked classes.
 */
export async function findSectionsByCrn(
  term: string,
  groups: CourseGroup[],
  { concurrency, onError = logGroupError, ...options }: FindSectionsOptions = {},
): Promise<Map<string, CourseData>> {
  const sections = new Map<string, CourseData>();
  const limit =
    concurrency !== undefined && Number.isFinite(concurrency)
      ? Math.min(MAX_CONCURRENCY, Math.max(1, Math.floor(concurrency)))
      : DEFAULT_CONCURRENCY;

  await forEachLimited(groups, limit, async (group) => {
    if (group.crns.length === 0) return;
    try {
      const result = await searchCourses(
        { term, subject: group.subject, courseNumber: group.courseNumber },
        options,
      );
      const wanted = new Set(group.crns);
      for (const course of result.data) {
        const crn = course.courseReferenceNumber;
        if (crn && wanted.has(crn)) sections.set(crn, course);
      }
    } catch (error) {
      // A throwing callback must not abort the remaining groups.
      try {
        onError(group, error);
      } catch (callbackError) {
        console.error("findSectionsByCrn onError callback threw", callbackError);
      }
    }
  });

  return sections;
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
