/** Small presentation helpers shared by the schedule components. Pure. */
import type { Tone } from "@/components/ui/Badge";
import { seatStatus } from "@/components/ui/Meter";
import type { CourseData } from "@/lib/gosolar/types";
import { SCHEDULE_COLORS } from "@/lib/schedule/colors";
import { DAY_LABELS } from "@/lib/schedule/conflicts";
import type { PositionedBlock } from "./layout";

/** Block background: the palette token (spec.md §2.17), never the stored hex. */
export function colorVar(colorIndex: number): string {
  const color = SCHEDULE_COLORS[colorIndex] ?? SCHEDULE_COLORS[0];
  return `var(--sched-${color.id})`;
}

export function colorLabel(colorIndex: number): string {
  return (SCHEDULE_COLORS[colorIndex] ?? SCHEDULE_COLORS[0]).label;
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

/** Seat status word and badge tone (status is never color alone). */
export function seatSummary(section: Pick<CourseData, "seatsAvailable" | "maximumEnrollment">): {
  text: string;
  tone: Tone;
} {
  const status = seatStatus(section.seatsAvailable, section.maximumEnrollment);
  switch (status) {
    case "open":
      return { text: `${section.seatsAvailable} open`, tone: "success" };
    case "low":
      return { text: `${section.seatsAvailable} open`, tone: "warning" };
    case "full":
      return { text: "Full", tone: "danger" };
    default:
      return { text: "Seats unknown", tone: "neutral" };
  }
}
