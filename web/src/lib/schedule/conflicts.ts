/**
 * Meeting parsing and time-conflict detection for GoSolar sections. One module replacing
 * frontend-web/src/utils/scheduleConflicts.js and the meeting helpers in
 * pages/ScheduleBuilder/utils.js. Pure: safe to import from client components.
 */
import type { CourseData, MeetingTime } from "@/lib/gosolar";

/** Calendar order. GoSolar's MeetingTime has one boolean per lowercase day name. */
export const WEEK_DAYS = [
  "monday",
  "tuesday",
  "wednesday",
  "thursday",
  "friday",
  "saturday",
  "sunday",
] as const;
export type WeekDay = (typeof WEEK_DAYS)[number];

export const DAY_LABELS: Record<WeekDay, { long: string; short: string; ics: string }> = {
  monday: { long: "Monday", short: "Mon", ics: "MO" },
  tuesday: { long: "Tuesday", short: "Tue", ics: "TU" },
  wednesday: { long: "Wednesday", short: "Wed", ics: "WE" },
  thursday: { long: "Thursday", short: "Thu", ics: "TH" },
  friday: { long: "Friday", short: "Fri", ics: "FR" },
  saturday: { long: "Saturday", short: "Sat", ics: "SA" },
  sunday: { long: "Sunday", short: "Sun", ics: "SU" },
};

/** One scheduled (non-TBA) meeting of a section. */
export interface Meeting {
  crn: string | null;
  days: WeekDay[];
  /** Minutes after midnight. `start < end`. */
  start: number;
  end: number;
  /** Day numbers (days since 1970-01-01) of the meeting's date range; null when unknown. */
  startDay: number | null;
  endDay: number | null;
  meetingTime: MeetingTime;
}

/** "0930" / "930" / "09:30" -> 570. Null for blank or malformed input. */
export function toMinutes(time: string | number | null | undefined): number | null {
  if (time === null || time === undefined) return null;
  const digits = String(time).replace(/[^0-9]/g, "");
  if (digits.length === 0 || digits.length > 4) return null;
  const padded = digits.padStart(4, "0");
  const hours = Number(padded.slice(0, 2));
  const minutes = Number(padded.slice(2, 4));
  if (hours > 24 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** 570 -> "9:30 AM". */
export function formatMinutes(minutes: number): string {
  const hours24 = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  const period = hours24 >= 12 ? "PM" : "AM";
  return `${hours24 % 12 || 12}:${String(mins).padStart(2, "0")} ${period}`;
}

/** Days a meeting occurs on, in calendar order. */
export function meetingDays(meetingTime: MeetingTime | null | undefined): WeekDay[] {
  if (!meetingTime) return [];
  return WEEK_DAYS.filter((day) => meetingTime[day] === true);
}

/** GoSolar "MM/DD/YYYY" -> day number, or null. */
export function parseMeetingDate(date: string | null | undefined): number | null {
  if (!date) return null;
  const match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(date.trim());
  if (!match) return null;
  const [, month, day, year] = match.map(Number);
  const ms = Date.UTC(year, month - 1, day);
  const check = new Date(ms);
  if (check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
  return Math.round(ms / 86_400_000);
}

/**
 * The section's meetings that have days and a valid time range. TBA meetings (no days, or
 * no begin/end time, e.g. online asynchronous) are left out: they cannot conflict.
 */
export function meetingsOf(section: Pick<CourseData, "courseReferenceNumber" | "meetingsFaculty"> | null | undefined): Meeting[] {
  const meetings: Meeting[] = [];
  for (const entry of section?.meetingsFaculty ?? []) {
    const meetingTime = entry?.meetingTime;
    if (!meetingTime) continue;
    const days = meetingDays(meetingTime);
    const start = toMinutes(meetingTime.beginTime);
    const end = toMinutes(meetingTime.endTime);
    if (days.length === 0 || start === null || end === null || end <= start) continue;
    meetings.push({
      crn: section?.courseReferenceNumber ?? null,
      days,
      start,
      end,
      startDay: parseMeetingDate(meetingTime.startDate),
      endDay: parseMeetingDate(meetingTime.endDate),
      meetingTime,
    });
  }
  return meetings;
}

/**
 * Meetings with known, disjoint date ranges (first-half vs second-half sessions) never
 * clash. Unknown dates assume overlap.
 */
function dateRangesOverlap(a: Meeting, b: Meeting): boolean {
  if (a.startDay === null || a.endDay === null || b.startDay === null || b.endDay === null) return true;
  return a.startDay <= b.endDay && b.startDay <= a.endDay;
}

/**
 * The first shared day on which `a` and `b` overlap in time (back-to-back meetings, where one
 * ends exactly when the other starts, do not), or null.
 */
export function overlapDay(a: Meeting, b: Meeting): WeekDay | null {
  if (!(a.start < b.end && b.start < a.end)) return null;
  if (!dateRangesOverlap(a, b)) return null;
  return a.days.find((day) => b.days.includes(day)) ?? null;
}

export function overlaps(a: Meeting, b: Meeting): boolean {
  return overlapDay(a, b) !== null;
}

export interface Conflict {
  /** CRNs of the two clashing sections, in input order. */
  crns: [string | null, string | null];
  sections: [CourseData, CourseData];
  /** First shared day of the first clashing meeting pair. */
  day: WeekDay;
  /** The overlapping window, minutes after midnight. */
  start: number;
  end: number;
  /** e.g. "Mon, Wed 11:00 AM – 12:15 PM" (every shared day, the overlapping window). */
  label: string;
}

/**
 * Every clashing pair among `sections` (one entry per pair, at its first clashing meeting).
 * Duplicate CRNs are compared once.
 */
export function findConflicts(sections: readonly CourseData[]): Conflict[] {
  const unique = dedupeByCrn(sections);
  const meetings = unique.map((section) => meetingsOf(section));
  const conflicts: Conflict[] = [];
  for (let i = 0; i < unique.length; i++) {
    for (let j = i + 1; j < unique.length; j++) {
      const conflict = firstConflict(unique[i], meetings[i], unique[j], meetings[j]);
      if (conflict) conflicts.push(conflict);
    }
  }
  return conflicts;
}

/** Conflicts between a candidate and the sections already scheduled (the "add" check). */
export function findConflictsWith(candidate: CourseData, scheduled: readonly CourseData[]): Conflict[] {
  const candidateMeetings = meetingsOf(candidate);
  if (candidateMeetings.length === 0) return [];
  const conflicts: Conflict[] = [];
  for (const other of dedupeByCrn(scheduled)) {
    if (other.courseReferenceNumber === candidate.courseReferenceNumber) continue;
    const conflict = firstConflict(candidate, candidateMeetings, other, meetingsOf(other));
    if (conflict) conflicts.push(conflict);
  }
  return conflicts;
}

function firstConflict(a: CourseData, aMeetings: Meeting[], b: CourseData, bMeetings: Meeting[]): Conflict | null {
  for (const ma of aMeetings) {
    for (const mb of bMeetings) {
      const day = overlapDay(ma, mb);
      if (!day) continue;
      const start = Math.max(ma.start, mb.start);
      const end = Math.min(ma.end, mb.end);
      return {
        crns: [a.courseReferenceNumber, b.courseReferenceNumber],
        sections: [a, b],
        day,
        start,
        end,
        label: `${ma.days.filter((d) => mb.days.includes(d)).map((d) => DAY_LABELS[d].short).join(", ")} ${formatMinutes(start)} – ${formatMinutes(end)}`,
      };
    }
  }
  return null;
}

function dedupeByCrn(sections: readonly CourseData[]): CourseData[] {
  const seen = new Set<string>();
  const out: CourseData[] = [];
  for (const section of sections) {
    const crn = section.courseReferenceNumber;
    if (crn) {
      if (seen.has(crn)) continue;
      seen.add(crn);
    }
    out.push(section);
  }
  return out;
}
