/**
 * Pure display helpers for GoSolar sections, grades and ratings. Client- and server-safe.
 */
import type { GradeAggregate, GradeDistributionResponse, GradeKey } from "@/lib/course-meta/grades/types";
import type { SectionMeta } from "@/lib/courses/meta";
import type { CourseData, MeetingTime } from "@/lib/gosolar/types";
import { toMinutes } from "@/lib/schedule/conflicts";
import { courseCode, formatTimeRange, instructorOf, MONTHS, plural, termLabel, titleCase } from "@/lib/format";

/** GoSolar sends a few fields the ported DTO doesn't declare. */
export type Section = CourseData & {
  instructionalMethodDescription?: string | null;
  openSection?: boolean;
};

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: String.fromCharCode(34),
  apos: String.fromCharCode(39),
  nbsp: String.fromCharCode(160),
};

/** GoSolar titles arrive HTML-escaped ("Calculus &amp; Analytic Geometry"). */
export function decodeEntities(text: string | null | undefined): string {
  if (!text) return "";
  return text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      return Number.isFinite(code) && code > 0 && code <= 0x10ffff ? String.fromCodePoint(code) : match;
    }
    return NAMED_ENTITIES[body.toLowerCase()] ?? match;
  });
}

/** "CSC 2720 · 003" (section number omitted when unknown). */
export const sectionLabel = (section: Pick<CourseData, "subject" | "courseNumber" | "sequenceNumber">) =>
  section.sequenceNumber ? `${courseCode(section)} · ${section.sequenceNumber}` : courseCode(section);

/** A course title for display: entities decoded, GoSolar's all-caps title-cased ("" when missing). */
export const displayTitle = (title: string | null | undefined): string => titleCase(decodeEntities(title).trim());

export const titleOf = (section: Pick<CourseData, "courseTitle">) => displayTitle(section.courseTitle) || "Untitled course";

// ------------------------------------------------------------------ meetings

export const DAY_KEYS = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday"] as const;
export type DayKey = (typeof DAY_KEYS)[number];
export const DAY_LETTER: Record<DayKey, string> = {
  monday: "M",
  tuesday: "T",
  wednesday: "W",
  thursday: "R",
  friday: "F",
  saturday: "S",
  sunday: "U",
};
export const DAY_SHORT: Record<DayKey, string> = {
  monday: "Mon",
  tuesday: "Tue",
  wednesday: "Wed",
  thursday: "Thu",
  friday: "Fri",
  saturday: "Sat",
  sunday: "Sun",
};

export type MeetingRow = {
  days: DayKey[];
  /** Minutes after midnight, or null for TBA. */
  start: number | null;
  end: number | null;
  /** "10:00 – 11:15 AM", or null for TBA. */
  time: string | null;
  /** "Langdale Hall 405", or null. */
  location: string | null;
  /** "Aug 24 – Dec 8", or null. */
  dates: string | null;
  type: string | null;
  online: boolean;
};

/** GoSolar "MM/DD/YYYY" -> "Aug 24"; null when malformed. */
export function shortDate(date: string | null | undefined): string | null {
  const match = date ? /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date.trim()) : null;
  if (!match) return null;
  const month = MONTHS[Number(match[1]) - 1];
  return month ? `${month} ${Number(match[2])}` : null;
}

function isOnline(meetingTime: MeetingTime, section: Section): boolean {
  const text = [
    meetingTime.buildingDescription,
    meetingTime.campusDescription,
    section.instructionalMethodDescription,
    section.campusDescription,
  ]
    .filter(Boolean)
    .join(" ");
  return /online|virtual|distance/i.test(text);
}

export function meetingRows(section: Section): MeetingRow[] {
  const rows: MeetingRow[] = [];
  for (const entry of section.meetingsFaculty ?? []) {
    const mt = entry?.meetingTime;
    if (!mt) continue;
    const days = DAY_KEYS.filter((day) => mt[day] === true);
    const start = toMinutes(mt.beginTime);
    const end = toMinutes(mt.endTime);
    const timed = start !== null && end !== null && end > start;
    const building = mt.buildingDescription?.trim();
    const location = building ? [building, mt.room?.trim()].filter(Boolean).join(" ") : null;
    const from = shortDate(mt.startDate);
    const to = shortDate(mt.endDate);
    rows.push({
      days,
      start: timed ? start : null,
      end: timed ? end : null,
      time: timed ? formatTimeRange(start, end) : null,
      location,
      dates: from && to ? `${from} – ${to}` : (from ?? to),
      type: mt.meetingTypeDescription?.trim() || null,
      online: isOnline(mt, section),
    });
  }
  return rows;
}

// ------------------------------------------------------------------ grades

export type GpaTone = "high" | "good" | "mid" | "low";

export function gpaTone(gpa: number | null | undefined): GpaTone | null {
  if (gpa == null || !Number.isFinite(gpa)) return null;
  if (gpa >= 3.5) return "high";
  if (gpa >= 3.0) return "good";
  if (gpa >= 2.5) return "mid";
  return "low";
}

export const formatGpa = (gpa: number | null | undefined) => (gpa == null ? "—" : gpa.toFixed(2));
export const formatPercent = (pct: number | null | undefined) => (pct == null ? "—" : `${pct.toFixed(1)}%`);

/** The instructor's own history when they have taught the course, else the course-wide one. */
export function featuredGrades(
  grades: GradeDistributionResponse | null | undefined,
): { aggregate: GradeAggregate; instructor: boolean } | null {
  if (!grades?.hasData) return null;
  if (grades.instructorHasTaught && grades.instructorDistribution) {
    return { aggregate: grades.instructorDistribution, instructor: true };
  }
  return grades.overall ? { aggregate: grades.overall, instructor: false } : null;
}

export type CoarseGrade = "A" | "B" | "C" | "D" | "F";

const COARSE: Array<{ key: CoarseGrade; parts: GradeKey[] }> = [
  { key: "A", parts: ["A+", "A", "A-"] },
  { key: "B", parts: ["B+", "B", "B-"] },
  { key: "C", parts: ["C+", "C", "C-"] },
  { key: "D", parts: ["D"] },
  { key: "F", parts: ["F", "WF"] },
];

/** A-F shares (F folds in WF). Empty when nothing was graded. */
export function coarseGrades(
  counts: Partial<Record<GradeKey, number>> | null | undefined,
): Array<{ key: CoarseGrade; count: number; percent: number }> {
  const buckets = COARSE.map(({ key, parts }) => ({
    key,
    count: parts.reduce((sum, part) => sum + (counts?.[part] ?? 0), 0),
  }));
  const total = buckets.reduce((sum, b) => sum + b.count, 0);
  if (total === 0) return [];
  return buckets.map((b) => ({ ...b, percent: (b.count / total) * 100 }));
}

/** "6 semesters · Fall 2023–Spring 2026" for a newest-first list of term codes. */
export function semesterSpan(terms: readonly string[]): string {
  if (terms.length === 0) return "";
  const newest = termLabel(terms[0]);
  const oldest = termLabel(terms[terms.length - 1]);
  return `${plural(terms.length, "semester")} · ${terms.length === 1 ? newest : `${oldest}–${newest}`}`;
}

// ------------------------------------------------------------------ ratings

/** The usable RMP rating, or null (no match, no score). */
export function usableRating(meta: SectionMeta | undefined) {
  const rating = meta?.rating;
  return rating?.found && rating.avgRating != null && (rating.numRatings ?? 0) > 0 ? rating : null;
}

/**
 * The RMP profile link, built only from the numeric legacy id (never a URL from upstream data,
 * which could point anywhere).
 */
export function rmpProfileUrl(rating: { legacyId: number | null }): string | null {
  const id = rating.legacyId;
  return id != null && Number.isSafeInteger(id) && id > 0 ? `https://www.ratemyprofessors.com/professor/${id}` : null;
}

/** Case- and diacritics-insensitive comparison text. */
export function foldText(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase();
}

// ------------------------------------------------------------------ meta requests

/** The batch-meta request item for a section, or null when it can't be looked up. */
export function metaItemOf(section: CourseData) {
  const { term, courseReferenceNumber: crn, subject, courseNumber } = section;
  if (!term || !/^\d{6}$/.test(term) || !crn || !/^\d{5}$/.test(crn)) return null;
  if (!subject || !/^[A-Za-z]{2,8}$/.test(subject) || !courseNumber || !/^[A-Za-z0-9]{1,8}$/.test(courseNumber)) {
    return null;
  }
  return { term, crn, subject, courseNumber, instructor: instructorOf(section) };
}
