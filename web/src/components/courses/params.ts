/**
 * URL <-> search/filter state for the course pages. Pure: used by the server pages (to parse
 * `searchParams`) and by the client (to mirror filters back into the URL).
 */
import { courseNumberSchema, crnSchema, levelSchema, subjectSchema, termCodeSchema } from "@/lib/courses/validation";
import { DAY_KEYS, type DayKey } from "./format";

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

export type ParsedSearch =
  | { ok: true; term: string; subjects: string[]; courseNumber: string | null; level: string | null }
  | { ok: false; reason: "empty" | "invalid"; message: string; term: string | null; subjects: string[]; courseNumber: string | null; level: string | null };

/**
 * `?term=202608&subjects=CSC,MATH&courseNumber=2720&level=US`. Also accepts `subject`,
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
  const number = rawNumber ? courseNumberSchema.safeParse(rawNumber) : null;
  const level = rawLevel && rawLevel.toLowerCase() !== "all" ? levelSchema.safeParse(rawLevel) : null;
  const term = rawTerm ? termCodeSchema.safeParse(rawTerm) : null;

  const base = {
    term: term?.success ? term.data : null,
    subjects: subjects.slice(0, MAX_SEARCH_SUBJECTS),
    courseNumber: number?.success ? number.data : null,
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
    return { ok: false, reason: "invalid", message: "That course number isn't valid.", ...base };
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

// ------------------------------------------------------------------ filters

export const TIME_FILTERS = ["any", "morning", "afternoon", "evening"] as const;
export type TimeFilter = (typeof TIME_FILTERS)[number];
export const SORTS = ["course", "seats", "title"] as const;
export type SortKey = (typeof SORTS)[number];

export type Filters = {
  q: string;
  open: boolean;
  days: DayKey[];
  time: TimeFilter;
  sort: SortKey;
  page: number;
};

export const DEFAULT_FILTERS: Filters = { q: "", open: false, days: [], time: "any", sort: "course", page: 1 };

const LETTER_TO_DAY: Record<string, DayKey> = { M: "monday", T: "tuesday", W: "wednesday", R: "thursday", F: "friday", S: "saturday", U: "sunday" };
const DAY_TO_LETTER = Object.fromEntries(Object.entries(LETTER_TO_DAY).map(([letter, day]) => [day, letter])) as Record<DayKey, string>;

export function parseFilters(params: RawSearchParams): Filters {
  const q = (first(params.q) ?? "").slice(0, 100);
  const open = first(params.open) === "1";
  const days = [...new Set((first(params.days) ?? "").toUpperCase().split(""))]
    .map((letter) => LETTER_TO_DAY[letter])
    .filter((day): day is DayKey => Boolean(day))
    .sort((a, b) => DAY_KEYS.indexOf(a) - DAY_KEYS.indexOf(b));
  const time = first(params.time);
  const sort = first(params.sort);
  const page = Number.parseInt(first(params.page) ?? "1", 10);
  return {
    q,
    open,
    days,
    time: (TIME_FILTERS as readonly string[]).includes(time ?? "") ? (time as TimeFilter) : "any",
    sort: (SORTS as readonly string[]).includes(sort ?? "") ? (sort as SortKey) : "course",
    page: Number.isFinite(page) && page > 0 ? page : 1,
  };
}

/** Filter params for the URL (defaults omitted). */
export function filterParams(filters: Filters): Record<string, string | null> {
  return {
    q: filters.q.trim() ? filters.q.trim() : null,
    open: filters.open ? "1" : null,
    days: filters.days.length ? filters.days.map((d) => DAY_TO_LETTER[d]).join("") : null,
    time: filters.time === "any" ? null : filters.time,
    sort: filters.sort === "course" ? null : filters.sort,
    page: filters.page > 1 ? String(filters.page) : null,
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
