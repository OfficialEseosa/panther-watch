/**
 * The results page's Filters popover as pure functions: meeting days / delivery, open seats,
 * honors, minimum professor rating and GPA, and the sort. Client- and server-safe (no
 * server-only imports); grades and ratings come from the page's meta map, so a section whose
 * meta hasn't loaded has no rating or GPA (it fails a minimum and sorts last).
 */
import type { SectionMeta } from "@/lib/courses/meta";
import type { CourseData } from "@/lib/gosolar/types";
import { meetingsOf, type WeekDay } from "@/lib/schedule/conflicts";

/** Days the section meets (exactly), or how it is delivered (GoSolar section attributes). */
export const DAY_PATTERNS = ["any", "MW", "TR", "MWF", "online", "hybrid"] as const;
export type DayPattern = (typeof DAY_PATTERNS)[number];

export const SORT_KEYS = ["course", "seats", "rating", "gpa", "start"] as const;
export type SortKey = (typeof SORT_KEYS)[number];

export type SectionFilters = {
  days: DayPattern;
  /** Only sections with an open seat (cross-listed: in the shared pool too). */
  open: boolean;
  /** Only honors sections (attribute HC). */
  honors: boolean;
  /** Minimum RateMyProfessors average, 0 = any. */
  minRating: number;
  /** Minimum average GPA (the card's: the professor's history, else the course's), 0 = any. */
  minGpa: number;
  sort: SortKey;
};

export const DEFAULT_SECTION_FILTERS: SectionFilters = {
  days: "any",
  open: false,
  honors: false,
  minRating: 0,
  minGpa: 0,
  sort: "course",
};

/**
 * Fields GoSolar sends that the base CourseData type may not declare: the section attributes
 * (LF2F face-to-face, SONL online synchronous, LONL online asynchronous, HYB hybrid, HC honors,
 * ...) and the cross-list seat pool.
 */
export type FilterableSection = CourseData & {
  sectionAttributes?: ReadonlyArray<{ code?: string | null; description?: string | null } | null> | null;
  crossList?: string | null;
  crossListAvailable?: number | null;
};

/** What filtering and sorting read for one item: the section and its meta (undefined while loading). */
export type FilterSubject = { section: FilterableSection; meta: SectionMeta | undefined };

const PATTERN_DAYS: Record<"MW" | "TR" | "MWF", readonly WeekDay[]> = {
  MW: ["monday", "wednesday"],
  TR: ["tuesday", "thursday"],
  MWF: ["monday", "wednesday", "friday"],
};

/** The section's attribute codes, upper case. */
export function attributeCodes(section: FilterableSection): Set<string> {
  const codes = new Set<string>();
  for (const attribute of section.sectionAttributes ?? []) {
    const code = attribute?.code?.trim().toUpperCase();
    if (code) codes.add(code);
  }
  return codes;
}

/** Every day the section's timed meetings fall on (TBA meetings have none). */
export function meetingDaySet(section: FilterableSection): Set<WeekDay> {
  const days = new Set<WeekDay>();
  for (const meeting of meetingsOf(section)) for (const day of meeting.days) days.add(day);
  return days;
}

/** MW / TR / MWF: meets on exactly those days. Online: SONL or LONL. Hybrid: HYB. */
export function matchesDays(section: FilterableSection, pattern: DayPattern): boolean {
  if (pattern === "any") return true;
  if (pattern === "online") {
    const codes = attributeCodes(section);
    return codes.has("SONL") || codes.has("LONL");
  }
  if (pattern === "hybrid") return attributeCodes(section).has("HYB");
  const wanted = PATTERN_DAYS[pattern];
  const days = meetingDaySet(section);
  return days.size === wanted.length && wanted.every((day) => days.has(day));
}

export const isHonors = (section: FilterableSection) => attributeCodes(section).has("HC");

/**
 * Seats a student can actually take: a cross-listed section shares its pool with the other
 * listings, so it is the smaller of its own and the pool's.
 */
export function openSeats(section: FilterableSection): number {
  const own = Number.isFinite(section.seatsAvailable) ? section.seatsAvailable : 0;
  const pool = section.crossListAvailable;
  if (section.crossList != null && pool != null && Number.isFinite(pool)) return Math.min(own, pool);
  return own;
}

/** The RMP average the card shows (a match with at least one rating), or null. */
export function ratingOf(meta: SectionMeta | undefined): number | null {
  const rating = meta?.rating;
  return rating?.found && rating.avgRating != null && (rating.numRatings ?? 0) > 0 ? rating.avgRating : null;
}

/** The GPA the card shows: the instructor's own history when they taught the course, else the course's. */
export function gpaOf(meta: SectionMeta | undefined): number | null {
  const grades = meta?.grades;
  if (!grades?.hasData) return null;
  const aggregate = grades.instructorHasTaught && grades.instructorDistribution ? grades.instructorDistribution : grades.overall;
  const gpa = aggregate?.gpa;
  return gpa != null && Number.isFinite(gpa) ? gpa : null;
}

/** Earliest start (minutes after midnight) over the section's timed meetings, or null. */
export function startMinutes(section: FilterableSection): number | null {
  const starts = meetingsOf(section).map((meeting) => meeting.start);
  return starts.length ? Math.min(...starts) : null;
}

/** True when `filters` keep the section. */
export function matchesFilters({ section, meta }: FilterSubject, filters: SectionFilters): boolean {
  if (!matchesDays(section, filters.days)) return false;
  if (filters.open && openSeats(section) <= 0) return false;
  if (filters.honors && !isHonors(section)) return false;
  if (filters.minRating > 0 && (ratingOf(meta) ?? -1) < filters.minRating) return false;
  if (filters.minGpa > 0 && (gpaOf(meta) ?? -1) < filters.minGpa) return false;
  return true;
}

/** Highest `value` first; missing values last; ties keep the incoming (course) order. */
function byDescending<T>(items: readonly T[], value: (item: T) => number | null): T[] {
  return items
    .map((item, index) => ({ item, index, value: value(item) }))
    .sort((a, b) => {
      if (a.value === null || b.value === null) {
        if (a.value === b.value) return a.index - b.index;
        return a.value === null ? 1 : -1;
      }
      return b.value - a.value || a.index - b.index;
    })
    .map((entry) => entry.item);
}

/**
 * `items` (already in course order) sorted by `sort`: seats, rating and GPA highest first,
 * start time earliest first; sections without the value go last, ties keep course order.
 */
export function sortSections<T>(items: readonly T[], sort: SortKey, get: (item: T) => FilterSubject): T[] {
  switch (sort) {
    case "seats":
      return byDescending(items, (item) => openSeats(get(item).section));
    case "rating":
      return byDescending(items, (item) => ratingOf(get(item).meta));
    case "gpa":
      return byDescending(items, (item) => gpaOf(get(item).meta));
    case "start":
      return byDescending(items, (item) => {
        const start = startMinutes(get(item).section);
        return start === null ? null : -start;
      });
    default:
      return [...items];
  }
}

/** Filter, then sort. */
export function applySectionFilters<T>(items: readonly T[], filters: SectionFilters, get: (item: T) => FilterSubject): T[] {
  return sortSections(
    items.filter((item) => matchesFilters(get(item), filters)),
    filters.sort,
    get,
  );
}

/** How many popover settings differ from the defaults (the Filters button's badge). */
export function activeFilterCount(filters: SectionFilters): number {
  return (
    (filters.days !== "any" ? 1 : 0) +
    (filters.open ? 1 : 0) +
    (filters.honors ? 1 : 0) +
    (filters.minRating > 0 ? 1 : 0) +
    (filters.minGpa > 0 ? 1 : 0) +
    (filters.sort !== "course" ? 1 : 0)
  );
}

/** True when the filters or sort read grades/ratings, so every candidate's meta must be fetched. */
export const needsMeta = (filters: SectionFilters) =>
  filters.minRating > 0 || filters.minGpa > 0 || filters.sort === "rating" || filters.sort === "gpa";
