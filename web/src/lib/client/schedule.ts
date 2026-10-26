/**
 * Typed wrappers for the schedule route handlers (fetching is `./http`). Used by the Schedule
 * Builder and by the course pages' schedule toggle. Every call takes an optional AbortSignal.
 */
import type { ScheduleEntry } from "@/lib/schedule";
import { del, patchJson, postJson, query } from "./http";

export type { ScheduleEntry };

export interface AddScheduleInput {
  term: string;
  crn: string;
  subject: string;
  courseNumber: string;
  courseTitle?: string | null;
  /** Palette index 0..7; omitted = the server picks the first unused color. */
  color?: number | null;
}

export function addScheduleEntry(input: AddScheduleInput, signal?: AbortSignal) {
  return postJson<{ entry: ScheduleEntry; created: boolean }>("/api/schedule", input, signal);
}

export async function removeScheduleEntry(term: string, crn: string, signal?: AbortSignal): Promise<boolean> {
  return (await del<{ removed: boolean }>(`/api/schedule?${query({ term, crn })}`, signal)).removed;
}

/** `color: null` resets to the CRN-derived default. */
export async function setScheduleColor(term: string, crn: string, color: number | null, signal?: AbortSignal): Promise<ScheduleEntry> {
  return (await patchJson<{ entry: ScheduleEntry }>("/api/schedule/color", { term, crn, color }, signal)).entry;
}
