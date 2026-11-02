/**
 * URL <-> search/filter state for the course pages. Pure: used by the server pages (to parse
 * `searchParams`) and by the client (to mirror filters back into the URL).
 */
import {
  DAY_PATTERNS,
  DEFAULT_SECTION_FILTERS,
  SORT_KEYS,
  type DayPattern,
  type SectionFilters,
  type SortKey,
} from "@/lib/courses/filters";
import {
  courseNumberListSchema,
  crnSchema,
  levelSchema,
  MAX_COURSE_NUMBERS,
  MAX_SEARCH_PAIRS,
  subjectSchema,
  termCodeSchema,
} from "@/lib/courses/validation";

export const DIALOG_TABS = ["overview", "grades", "ratings", "syllabus"] as const;
export type DialogTab = (typeof DIALOG_TABS)[number];

export const isDialogTab = (value: unknown): value is DialogTab =>
  typeof value === "string" && (DIALOG_TABS as readonly string[]).includes(value);

export type RawSearchParams = Record<string, string | string[] | undefined>;

const first = (value: string | string[] | undefined): string | undefined =>
  Array.isArray(value) ? value[0] : value;

/** First non-blank value among several param names (new names first, then the old app's). */
function pick(params: RawSearchParams, ...names: string[]): string | undefined {
  for (const name of names) {
    const value = first(params[name])?.trim();
    if (value) return value;
  }
  return undefined;
}

export const MAX_SEARCH_SUBJECTS = 5;

/**
 * A search's course numbers. `courseNumber` holds one or more, normalized and comma-joined
 * ("4352,4350,4110"); null means every course of each subject.
 */
export const courseNumbersOf = (courseNumber: string | null | undefined): string[] =>
  courseNumber ? courseNumber.split(",").filter(Boolean) : [];

/** "4352, 4350, 4110": a course number list for display. */
export const displayCourseNumbers = (courseNumber: string | null | undefined): string =>
  courseNumbersOf(courseNumber).join(", ");

export type ParsedSearch =
  | { ok: true; term: string; subjects: string[]; courseNumber: string | null; level: string | null }
  | { ok: false; reason: "empty" | "invalid"; message: string; term: string | null; subjects: string[]; courseNumber: string | null; level: string | null };

/**
 * `?term=202608&subjects=CSC,MATH&courseNumber=2720,3320&level=US`. Also accepts `subject`,
 * `number`, and the old app's `txtTerm`/`txtSubject`/`txtCourseNumber`/`txtLevel`.
 */
export function parseSearch(params: RawSearchParams): ParsedSearch {
  const rawTerm = pick(params, "term", "txtTerm") ?? null;
  const rawSubjects = pick(params, "subjects", "subject", "txtSubject") ?? "";
  const rawNumber = pick(params, "courseNumber", "number", "txtCourseNumber") ?? null;
  const rawLevel = pick(params, "level", "txtLevel") ?? null;

  const subjects: string[] = [];
  let badSubject = false;
  for (const part of rawSubjects.split(/[\s,]+/)) {
    if (!part) continue;
    const parsed = subjectSchema.safeParse(part);
    if (!parsed.success) badSubject = true;
    else if (!subjects.includes(parsed.data)) subjects.push(parsed.data);
  }
  const number = rawNumber ? courseNumberListSchema.safeParse(rawNumber) : null;
  const level = rawLevel && rawLevel.toLowerCase() !== "all" ? levelSchema.safeParse(rawLevel) : null;
  const term = rawTerm ? termCodeSchema.safeParse(rawTerm) : null;

  const base = {
    term: term?.success ? term.data : null,
    subjects: subjects.slice(0, MAX_SEARCH_SUBJECTS),
    courseNumber: number?.success ? number.data.join(",") : null,
    level: level?.success ? level.data : null,
  };
  if (!rawTerm && subjects.length === 0) {
    return { ok: false, reason: "empty", message: "Choose a term and at least one subject.", ...base };
  }
  if (!term?.success) return { ok: false, reason: "invalid", message: "That term code isn't valid.", ...base };
  if (subjects.length === 0) {
    return { ok: false, reason: "invalid", message: badSubject ? "That subject code isn't valid." : "Choose at least one subject.", ...base };
  }
  if (subjects.length > MAX_SEARCH_SUBJECTS) {
    return { ok: false, reason: "invalid", message: `Search up to ${MAX_SEARCH_SUBJECTS} subjects at a time.`, ...base };
  }
  if (number && !number.success) {
    const tooMany = rawNumber!.split(/[\s,]+/).filter(Boolean).length > MAX_COURSE_NUMBERS;
    return {
      ok: false,
      reason: "invalid",
      message: tooMany ? `Search up to ${MAX_COURSE_NUMBERS} course numbers at a time.` : "That course number isn't valid.",
      ...base,
    };
  }
  const pairs = subjects.length * Math.max(1, number?.success ? number.data.length : 0);
  if (pairs > MAX_SEARCH_PAIRS) {
    return {
      ok: false,
      reason: "invalid",
      message: `Search up to ${MAX_SEARCH_PAIRS} subject and course number combinations at a time (this search has ${pairs}).`,
      ...base,
    };
  }
  return { ok: true, term: base.term as string, subjects: base.subjects, courseNumber: base.courseNumber, level: base.level };
}

/** The results URL for a search (also the identity of a results view: CourseResults' `key`). */
export function resultsHref(search: { term: string; subjects: string[]; courseNumber: string | null; level: string | null }): string {
  const params = new URLSearchParams();
  params.set("term", search.term);
  params.set("subjects", search.subjects.join(","));
  if (search.courseNumber) params.set("courseNumber", search.courseNumber);
  if (search.level) params.set("level", search.level);
  return `/course-results?${params.toString()}`;
}

/** The search form prefilled with `search` (the results page's "New search", and Back). */
export function searchFormHref(search: { term: string; subjects: string[]; courseNumber: string | null; level: string | null }): string {
  const params = new URLSearchParams({ term: search.term, subjects: search.subjects.join(",") });
  if (search.courseNumber) params.set("courseNumber", search.courseNumber);
  params.set("level", search.level ?? "all");
  return `/course-search?${params.toString()}`;
}

/** Short names of the GoSolar levels the search form offers (its "Choose a degree" select). */
const LEVEL_NAMES: Record<string, string> = { US: "Bachelors", UA: "Associates", GS: "Graduate", LW: "Law" };

/** "Bachelors" for US; "All levels" for no level (GoSolar then returns every level). */
export const levelName = (level: string | null): string => (level ? (LEVEL_NAMES[level] ?? level) : "All levels");

/**
 * "CSC 1301 · Spring 2027 · Bachelors" ("CSC 4352, 4350 · …" for a list): the results page's h1
 * (the original toolbar summary), with the level searched, since GoSolar mixes associate
 * (Perimeter College) sections in with bachelor's ones when no level is given.
 */
export function resultsTitle(search: { subjects: string[]; courseNumber: string | null; level: string | null }, termName: string): string {
  const course = `${search.subjects.join(", ")}${search.courseNumber ? ` ${displayCourseNumbers(search.courseNumber)}` : ""}`;
  return `${course} · ${termName} · ${levelName(search.level)}`;
}

// ------------------------------------------------------------------ filters

/**
 * The results page's view state: the original text filter and page number, the course focus
 * chip ("CSC-4352", null = all), and the Filters popover (days/delivery, open seats, honors,
 * minimum rating and GPA, sort).
 */
export type Filters = SectionFilters & {
  q: string;
  page: number;
  focus: string | null;
};

export const DEFAULT_FILTERS: Filters = { q: "", page: 1, focus: null, ...DEFAULT_SECTION_FILTERS };

/** URL value of a course focus: "CSC-4352". */
export const focusKey = (subject: string | null | undefined, courseNumber: string | null | undefined) =>
  `${(subject ?? "").trim().toUpperCase()}-${(courseNumber ?? "").trim().toUpperCase()}`;

const FOCUS = /^[A-Z]{2,8}-[A-Z0-9]{1,8}$/;

/** A number in [0, max] on a 0.5 grid, else 0 ("any"). */
function halfStep(raw: string | undefined, max: number): number {
  const value = Number(raw);
  if (!raw || !Number.isFinite(value) || value <= 0 || value > max) return 0;
  return Math.round(value * 2) / 2;
}

const flag = (raw: string | undefined) => raw === "1" || raw === "true";

export function parseFilters(params: RawSearchParams): Filters {
  const q = (first(params.q) ?? "").slice(0, 100);
  const page = Number.parseInt(first(params.page) ?? "1", 10);
  const focus = first(params.focus)?.trim().toUpperCase() ?? "";
  const days = first(params.days)?.trim() ?? "";
  const sort = first(params.sort)?.trim() ?? "";
  return {
    q,
    page: Number.isFinite(page) && page > 0 ? page : 1,
    focus: FOCUS.test(focus) ? focus : null,
    days: (DAY_PATTERNS as readonly string[]).includes(days) ? (days as DayPattern) : "any",
    open: flag(first(params.open)),
    honors: flag(first(params.honors)),
    minRating: halfStep(first(params.minRating), 5),
    minGpa: halfStep(first(params.minGpa), 4),
    sort: (SORT_KEYS as readonly string[]).includes(sort) ? (sort as SortKey) : "course",
  };
}

/** Filter params for the URL (defaults omitted). */
export function filterParams(filters: Filters): Record<string, string | null> {
  return {
    q: filters.q.trim() ? filters.q.trim() : null,
    page: filters.page > 1 ? String(filters.page) : null,
    focus: filters.focus,
    days: filters.days !== "any" ? filters.days : null,
    open: filters.open ? "1" : null,
    honors: filters.honors ? "1" : null,
    minRating: filters.minRating > 0 ? String(filters.minRating) : null,
    minGpa: filters.minGpa > 0 ? String(filters.minGpa) : null,
    sort: filters.sort !== "course" ? filters.sort : null,
  };
}

/** The dialog deep link: `?crn=12345[&term=202608][&tab=grades]` (also `?course=`). */
export function parseDialog(params: RawSearchParams): { crn: string | null; term: string | null; tab: DialogTab } {
  const raw = pick(params, "crn", "course");
  const crn = raw && crnSchema.safeParse(raw).success ? raw : null;
  const rawTerm = pick(params, "term");
  const term = rawTerm && termCodeSchema.safeParse(rawTerm).success ? rawTerm : null;
  const tab = first(params.tab);
  return { crn, term, tab: isDialogTab(tab) ? tab : "overview" };
}
