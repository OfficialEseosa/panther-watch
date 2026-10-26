/**
 * iCalendar export of a schedule, ported from `generateICSFile` in
 * frontend-web/src/pages/ScheduleBuilder/utils.js. Pure (no Node or DOM APIs) so it can run
 * in the browser to build a download.
 *
 * Fixes over the old version:
 * - Times carry TZID=America/New_York (with a VTIMEZONE), not floating local time, so
 *   an import on a phone set to another zone still lands at campus time.
 * - DTSTART is moved to the first meeting weekday on/after the term start date. RFC 5545
 *   always counts DTSTART as an occurrence, so a TR class whose term starts on a Monday used
 *   to get a bogus Monday event.
 * - CRLF line endings, TEXT escaping and 75-octet line folding, as the RFC requires.
 */
import type { CourseData } from "@/lib/gosolar";
import { NY_TZ, titleCase } from "@/lib/format";
import { icsColorName } from "./colors";
import { DAY_LABELS, meetingDays, parseMeetingDate, toMinutes, type WeekDay } from "./conflicts";

export const ICS_TIME_ZONE = NY_TZ;

/** A section to export, optionally with its schedule color (palette index or hex). */
export type IcsSection = CourseData & { color?: number | string | null };

export interface IcsOptions {
  /** DTSTAMP; defaults to now. */
  now?: Date;
  calendarName?: string;
}

const VTIMEZONE = [
  "BEGIN:VTIMEZONE",
  `TZID:${ICS_TIME_ZONE}`,
  "BEGIN:DAYLIGHT",
  "TZOFFSETFROM:-0500",
  "TZOFFSETTO:-0400",
  "TZNAME:EDT",
  "DTSTART:19700308T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU",
  "END:DAYLIGHT",
  "BEGIN:STANDARD",
  "TZOFFSETFROM:-0400",
  "TZOFFSETTO:-0500",
  "TZNAME:EST",
  "DTSTART:19701101T020000",
  "RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU",
  "END:STANDARD",
  "END:VTIMEZONE",
];

/** JS getUTCDay() index (0 = Sunday) per weekday. */
const WEEKDAY_INDEX: Record<WeekDay, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

/** One VEVENT per section meeting that has days, a start time and a start date. */
export function generateIcs(sections: readonly IcsSection[], options: IcsOptions = {}): string {
  const stamp = formatUtcStamp(options.now ?? new Date());
  const lines: string[] = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    "PRODID:-//PantherWatch//Class Schedule//EN",
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    `X-WR-CALNAME:${escapeText(options.calendarName ?? "PantherWatch schedule")}`,
    `X-WR-TIMEZONE:${ICS_TIME_ZONE}`,
    ...VTIMEZONE,
  ];

  for (const section of sections) {
    (section.meetingsFaculty ?? []).forEach((entry, index) => {
      const meetingTime = entry?.meetingTime;
      if (!meetingTime) return;
      const days = meetingDays(meetingTime);
      const start = toMinutes(meetingTime.beginTime);
      const end = toMinutes(meetingTime.endTime);
      const rangeStart = parseMeetingDate(meetingTime.startDate);
      const rangeEnd = parseMeetingDate(meetingTime.endDate);
      if (days.length === 0 || start === null || rangeStart === null) return;

      const firstDay = firstOccurrence(rangeStart, days);
      if (rangeEnd !== null && firstDay > rangeEnd) return;

      const location =
        [meetingTime.buildingDescription, meetingTime.room ? `Room ${meetingTime.room}` : null]
          .filter(Boolean)
          .join(" - ") || "TBA";
      const color = icsColorName(section.color);

      lines.push("BEGIN:VEVENT");
      lines.push(`UID:${section.courseReferenceNumber ?? "section"}-${section.term ?? "term"}-${index}@pantherwatch.app`);
      lines.push(`DTSTAMP:${stamp}`);
      lines.push(`SUMMARY:${escapeText(`${section.courseTitle ? titleCase(section.courseTitle) : "Class"} - ${section.subject ?? ""} ${section.courseNumber ?? ""}`.trim())}`);
      lines.push(`DESCRIPTION:${escapeText(describe(section))}`);
      lines.push(`LOCATION:${escapeText(location)}`);
      if (color) lines.push(`COLOR:${color}`);
      lines.push(`DTSTART;TZID=${ICS_TIME_ZONE}:${formatLocal(firstDay, start)}`);
      if (end !== null && end > start) lines.push(`DTEND;TZID=${ICS_TIME_ZONE}:${formatLocal(firstDay, end)}`);
      const byDay = days.map((day) => DAY_LABELS[day].ics).join(",");
      // With a TZID'd DTSTART, UNTIL must be UTC. 04:59:59Z the next day is 23:59:59 EST
      // (00:59:59 EDT): after the last class of the end date either way.
      lines.push(
        rangeEnd !== null
          ? `RRULE:FREQ=WEEKLY;BYDAY=${byDay};UNTIL=${formatDate(rangeEnd + 1)}T045959Z`
          : `RRULE:FREQ=WEEKLY;BYDAY=${byDay}`,
      );
      lines.push("END:VEVENT");
    });
  }

  lines.push("END:VCALENDAR");
  return lines.map(foldLine).join("\r\n") + "\r\n";
}

function describe(section: CourseData): string {
  const instructors = (section.faculty ?? [])
    .map((faculty) => faculty?.displayName)
    .filter(Boolean)
    .join(", ");
  return [
    `CRN: ${section.courseReferenceNumber ?? ""}`,
    `Instructor: ${instructors || "TBA"}`,
    `Term: ${section.termDesc || section.term || "TBA"}`,
  ].join("\n");
}

/** First day number on/after `fromDay` that falls on one of `days`. */
function firstOccurrence(fromDay: number, days: readonly WeekDay[]): number {
  const wanted = new Set(days.map((day) => WEEKDAY_INDEX[day]));
  for (let offset = 0; offset < 7; offset++) {
    const weekday = new Date((fromDay + offset) * 86_400_000).getUTCDay();
    if (wanted.has(weekday)) return fromDay + offset;
  }
  return fromDay;
}

/** Day number -> "YYYYMMDD". */
function formatDate(dayNumber: number): string {
  const date = new Date(dayNumber * 86_400_000);
  return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}`;
}

function formatLocal(dayNumber: number, minutes: number): string {
  return `${formatDate(dayNumber)}T${pad(Math.floor(minutes / 60))}${pad(minutes % 60)}00`;
}

function formatUtcStamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

const pad = (value: number) => String(value).padStart(2, "0");

/** RFC 5545 TEXT escaping. */
export function escapeText(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** Folds a content line to at most 75 UTF-8 octets per physical line. */
function foldLine(line: string): string {
  const encoder = new TextEncoder();
  if (encoder.encode(line).length <= 75) return line;
  const parts: string[] = [];
  let current = "";
  let currentBytes = 0;
  for (const char of line) {
    const bytes = encoder.encode(char).length;
    // Continuation lines start with a space, which counts toward their 75 octets.
    const limit = parts.length === 0 ? 75 : 74;
    if (currentBytes + bytes > limit) {
      parts.push(current);
      current = "";
      currentBytes = 0;
    }
    current += char;
    currentBytes += bytes;
  }
  parts.push(current);
  return parts.join("\r\n ");
}
