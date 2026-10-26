/**
 * Pure layout math for the Schedule Builder (week grid and agenda). No React, no DOM: the
 * components stay thin and this file is unit-tested (layout.test.ts).
 */
import type { CourseData } from "@/lib/gosolar/types";
import { DAY_LABELS, WEEK_DAYS, meetingsOf, type Conflict, type WeekDay } from "@/lib/schedule/conflicts";
import { formatTimeRange } from "@/lib/format";

/** A scheduled section whose live GoSolar data is known. */
export interface ResolvedCourse {
  crn: string;
  /** "CSC 2720" */
  code: string;
  section: CourseData;
  colorIndex: number;
}

/** One meeting of one course on one day. */
export interface CalendarBlock {
  /** Unique per document: crn, meeting index and day. */
  id: string;
  /** view-transition-name (motion.md §4.11). Unique per document, CSS-ident safe. */
  vtName: string;
  crn: string;
  code: string;
  day: WeekDay;
  /** Minutes after midnight. */
  start: number;
  end: number;
  meetingIndex: number;
  location: string | null;
  course: ResolvedCourse;
}

export interface PositionedBlock extends CalendarBlock {
  /** 0-based lane inside its overlap cluster. */
  lane: number;
  /** Lanes in the cluster (1 = full width). */
  laneCount: number;
  /** Codes of the courses this block conflicts with on this day (empty = no conflict). */
  conflictsWith: string[];
}

/** "Langdale Hall 405", "Online", or null when GoSolar gives nothing. */
export function meetingLocation(building: string | null | undefined, room: string | null | undefined): string | null {
  const parts = [building?.trim(), room?.trim()].filter((part): part is string => Boolean(part));
  return parts.length ? parts.join(" ") : null;
}

/** Every timed meeting of every course, one block per (meeting, day). */
export function buildBlocks(courses: readonly ResolvedCourse[]): CalendarBlock[] {
  const blocks: CalendarBlock[] = [];
  for (const course of courses) {
    meetingsOf(course.section).forEach((meeting, meetingIndex) => {
      for (const day of meeting.days) {
        blocks.push({
          id: `${course.crn}-${meetingIndex}-${day}`,
          vtName: `sb-${course.crn}-${meetingIndex}-${DAY_LABELS[day].ics.toLowerCase()}`,
          crn: course.crn,
          code: course.code,
          day,
          start: meeting.start,
          end: meeting.end,
          meetingIndex,
          location: meetingLocation(meeting.meetingTime.buildingDescription, meeting.meetingTime.room),
          course,
        });
      }
    });
  }
  return blocks;
}

/** Courses with no timed meeting (online asynchronous, TBA): listed under the grid. */
export function unscheduledCourses(courses: readonly ResolvedCourse[]): ResolvedCourse[] {
  return courses.filter((course) => meetingsOf(course.section).length === 0);
}

const byStart = (a: { start: number; end: number; code?: string }, b: { start: number; end: number; code?: string }) =>
  a.start - b.start || a.end - b.end || (a.code ?? "").localeCompare(b.code ?? "");

/**
 * Lane assignment for one day's blocks (the old `layoutDayBlocks`): blocks are grouped into
 * clusters of transitively overlapping blocks; within a cluster each block takes the first
 * lane that is free at its start. Non-overlapping blocks keep the full width. Back-to-back
 * blocks (one ends exactly when the next starts) do not overlap.
 */
export function layoutDay<T extends { start: number; end: number; code?: string }>(
  blocks: readonly T[],
): Array<T & { lane: number; laneCount: number }> {
  const sorted = [...blocks].sort(byStart);
  const clusters: T[][] = [];
  let current: T[] | null = null;
  let clusterEnd = -1;
  for (const block of sorted) {
    if (!current || block.start >= clusterEnd) {
      current = [];
      clusters.push(current);
      clusterEnd = block.end;
    } else {
      clusterEnd = Math.max(clusterEnd, block.end);
    }
    current.push(block);
  }

  const out: Array<T & { lane: number; laneCount: number }> = [];
  for (const cluster of clusters) {
    const laneEnds: number[] = [];
    const placed = cluster.map((block) => {
      let lane = laneEnds.findIndex((end) => block.start >= end);
      if (lane === -1) {
        lane = laneEnds.length;
        laneEnds.push(block.end);
      } else {
        laneEnds[lane] = block.end;
      }
      return { block, lane };
    });
    for (const { block, lane } of placed) out.push({ ...block, lane, laneCount: laneEnds.length });
  }
  return out;
}

/** `"80001|80002"` with the CRNs sorted, for pair lookups. */
const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/**
 * Lays out every day and marks conflicts. A block is outlined when it overlaps in time, on
 * the same day, with a block of a course that `findConflicts` reported as clashing with it
 * (so first-half / second-half sessions that share a slot split lanes but are not flagged).
 */
export function layoutWeek(
  blocks: readonly CalendarBlock[],
  conflicts: readonly Conflict[],
): Map<WeekDay, PositionedBlock[]> {
  const clashing = new Set<string>();
  for (const conflict of conflicts) {
    const [a, b] = conflict.crns;
    if (a && b) clashing.add(pairKey(a, b));
  }
  const result = new Map<WeekDay, PositionedBlock[]>();
  for (const day of WEEK_DAYS) {
    const dayBlocks = blocks.filter((block) => block.day === day);
    if (dayBlocks.length === 0) continue;
    const laid = layoutDay(dayBlocks).map((block) => {
      const partners = dayBlocks.filter(
        (other) =>
          other.crn !== block.crn &&
          other.start < block.end &&
          block.start < other.end &&
          clashing.has(pairKey(block.crn, other.crn)),
      );
      return { ...block, conflictsWith: [...new Set(partners.map((other) => other.code))] };
    });
    result.set(day, laid);
  }
  return result;
}

/** Mon–Fri always; Saturday and Sunday only when something meets then (pages.md §6). */
export function visibleDays(blocks: readonly CalendarBlock[]): WeekDay[] {
  const weekend = new Set(blocks.map((block) => block.day).filter((day) => day === "saturday" || day === "sunday"));
  return WEEK_DAYS.filter((day) => (day !== "saturday" && day !== "sunday") || weekend.has(day));
}

export interface HourRange {
  /** First hour line (inclusive), 0–23. */
  startHour: number;
  /** Last hour line (exclusive end of the grid), 1–24. */
  endHour: number;
}

export const DEFAULT_RANGE: HourRange = { startHour: 8, endHour: 18 };
/** The usual window; content is padded by an hour but not past these unless it lies outside. */
const SOFT_MIN_HOUR = 7;
const SOFT_MAX_HOUR = 22;

/**
 * Grid hours: the content's floor/ceiling hours padded by one hour, kept within 7:00–22:00
 * unless a class itself starts before 7 or ends after 22, and always covering 8:00–18:00
 * (spec.md §2.17). An empty week is 8:00–18:00.
 */
export function hourRange(blocks: readonly { start: number; end: number }[]): HourRange {
  if (blocks.length === 0) return DEFAULT_RANGE;
  const earliest = Math.min(...blocks.map((block) => block.start));
  const latest = Math.max(...blocks.map((block) => block.end));
  const floorHour = Math.floor(earliest / 60);
  const ceilHour = Math.ceil(latest / 60);
  const startHour = Math.max(0, Math.min(DEFAULT_RANGE.startHour, Math.max(floorHour - 1, Math.min(SOFT_MIN_HOUR, floorHour))));
  const endHour = Math.min(24, Math.max(DEFAULT_RANGE.endHour, Math.min(ceilHour + 1, Math.max(SOFT_MAX_HOUR, ceilHour))));
  return { startHour, endHour };
}

/** Position in hours from the top of the grid, and length in hours (CSS multiplies by --hour-h). */
export function blockGeometry(block: { start: number; end: number }, range: HourRange): { top: number; height: number } {
  return {
    top: (block.start - range.startHour * 60) / 60,
    height: (block.end - block.start) / 60,
  };
}

/** Horizontal placement as fractions of the day column (CSS subtracts the 2 px lane gutter). */
export function laneGeometry(block: { lane: number; laneCount: number }): { left: number; width: number } {
  const width = 1 / Math.max(1, block.laneCount);
  return { left: block.lane * width, width };
}

/** Agenda: days in calendar order that have classes, each sorted by start time. */
export function agendaDays(blocks: readonly PositionedBlock[]): Array<{ day: WeekDay; blocks: PositionedBlock[] }> {
  return WEEK_DAYS.map((day) => ({ day, blocks: blocks.filter((block) => block.day === day).sort(byStart) })).filter(
    (group) => group.blocks.length > 0,
  );
}

// ---- Text ----

/** Registrar day letters: M T W R F S U. */
const DAY_LETTER: Record<WeekDay, string> = {
  monday: "M",
  tuesday: "T",
  wednesday: "W",
  thursday: "R",
  friday: "F",
  saturday: "S",
  sunday: "U",
};

/** "MW 10:00 – 11:15 AM · TR 9:30 – 10:45 AM", or "Online / TBA" when nothing is timed. */
export function meetingSummary(section: Pick<CourseData, "courseReferenceNumber" | "meetingsFaculty">): string {
  const meetings = meetingsOf(section);
  if (meetings.length === 0) return "Online / TBA";
  // GoSolar often lists one meeting per day ("W 9:00 · M 9:00"): merge equal times, in week order.
  const daysByTime = new Map<string, Set<WeekDay>>();
  for (const meeting of meetings) {
    const time = formatTimeRange(meeting.start, meeting.end);
    const days = daysByTime.get(time) ?? new Set<WeekDay>();
    meeting.days.forEach((day) => days.add(day));
    daysByTime.set(time, days);
  }
  return [...daysByTime]
    .map(([time, days]) => ({ time, days: WEEK_DAYS.filter((day) => days.has(day)) }))
    .sort((a, b) => WEEK_DAYS.indexOf(a.days[0]) - WEEK_DAYS.indexOf(b.days[0]))
    .map(({ time, days }) => `${days.map((day) => DAY_LETTER[day]).join("")} ${time}`)
    .join(" · ");
}

/** "fall-2026" from "Fall 2026"; the term code when the label has no usable characters. */
export function fileSlug(label: string, fallback: string): string {
  const slug = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || fallback;
}
