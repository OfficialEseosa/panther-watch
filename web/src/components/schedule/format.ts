/** Small presentation helpers shared by the schedule components. Pure. */
import type { CourseData } from "@/lib/gosolar/types";
import { SCHEDULE_COLORS, scheduleTextColor } from "@/lib/schedule/colors";
import { DAY_LABELS, WEEK_DAYS, formatMinutes, meetingsOf, type Meeting } from "@/lib/schedule/conflicts";
import type { PositionedBlock } from "./layout";

/** Block fill: the original flat palette hex (old scheduleColors.js), dark enough for white text. */
export function colorHex(colorIndex: number): string {
  return (SCHEDULE_COLORS[colorIndex] ?? SCHEDULE_COLORS[0]).hex;
}

/** Fill and readable text color for a block or swatch of palette color `colorIndex`. */
export function blockColors(colorIndex: number): { backgroundColor: string; color: string } {
  return { backgroundColor: colorHex(colorIndex), color: scheduleTextColor(colorIndex) };
}

/** "9:00 AM - 9:50 AM", the old calendar's time label. */
export function timeLabel(start: number, end: number): string {
  return `${formatMinutes(start)} - ${formatMinutes(end)}`;
}

/**
 * Screen-reader-only tail of a block's accessible name: ", Monday, conflicts with MATH 2211".
 * Blocks and agenda rows are named by their visible text (code, time, room) plus this, never
 * by an aria-label that drops the visible words (WCAG 2.5.3 Label in Name).
 */
export function blockNameSuffix(block: PositionedBlock): string {
  const parts = [DAY_LABELS[block.day].long];
  if (block.conflictsWith.length) parts.push(`conflicts with ${block.conflictsWith.join(" and ")}`);
  return `, ${parts.join(", ")}`;
}

/** "12 of 40 seats open", "Full", or null when GoSolar gives no counts. */
export function seatText(section: Pick<CourseData, "seatsAvailable" | "maximumEnrollment">): string | null {
  const { seatsAvailable: open, maximumEnrollment: max } = section;
  if (typeof open !== "number" || typeof max !== "number" || max <= 0) return null;
  return open <= 0 ? "Full" : `${open} of ${max} seats open`;
}

/** A section's timed meetings in week order (GoSolar lists them in arbitrary order). */
export function weekOrderedMeetings(section: Pick<CourseData, "courseReferenceNumber" | "meetingsFaculty">): Meeting[] {
  const firstDay = (meeting: Meeting) => WEEK_DAYS.indexOf(meeting.days[0]);
  return [...meetingsOf(section)].sort((a, b) => firstDay(a) - firstDay(b) || a.start - b.start);
}
