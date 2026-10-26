import "server-only";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { scheduleEntries, type ScheduleEntry as ScheduleEntryRow } from "@/db/schema";
import { termClosedReason } from "@/lib/courses/term-guard";
import {
  courseNumberSchema,
  crnSchema,
  displayTextSchema,
  subjectSchema,
  termCodeSchema,
} from "@/lib/courses/validation";
import { PALETTE_SIZE, colorIndexToHex, pickDefaultColorIndex, resolveColorIndex } from "./colors";

/**
 * The user's planned schedule (Schedule Builder). The server is the source of truth: the
 * client renders what GET returns and sends adds/removes/color changes as they happen. There
 * is deliberately no merge of client-side state, which is what made deleted classes come back
 * in the old localStorage/DB union sync.
 */

export type ScheduleErrorCode = "term_closed" | "term_unknown";

export class ScheduleError extends Error {
  constructor(
    readonly code: ScheduleErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ScheduleError";
  }
}

export interface ScheduleEntry {
  id: number;
  term: string;
  crn: string;
  subject: string;
  courseNumber: string;
  courseTitle: string | null;
  /** Stored palette index; null = never picked (the CRN-derived `colorIndex` is used). */
  color: number | null;
  /** Effective palette index (stored, else derived from the CRN). */
  colorIndex: number;
  /** Hex of `colorIndex`. */
  colorHex: string;
  addedAt: string;
}

export function toScheduleEntry(row: ScheduleEntryRow): ScheduleEntry {
  const colorIndex = resolveColorIndex(row.color, row.crn);
  return {
    id: row.id,
    term: row.term,
    crn: row.crn,
    subject: row.subject,
    courseNumber: row.courseNumber,
    courseTitle: row.courseTitle,
    color: row.color,
    colorIndex,
    colorHex: colorIndexToHex(colorIndex)!,
    addedAt: row.addedAt.toISOString(),
  };
}

export const colorSchema = z.number().int().min(0).max(PALETTE_SIZE - 1);

export const addEntrySchema = z.object({
  term: termCodeSchema,
  crn: crnSchema,
  subject: subjectSchema,
  courseNumber: courseNumberSchema,
  courseTitle: displayTextSchema(200).nullish().transform((v) => v ?? null),
  color: colorSchema.nullish().transform((v) => v ?? null),
});
export type AddEntryInput = z.input<typeof addEntrySchema>;

export const entryKeySchema = z.object({ term: termCodeSchema, crn: crnSchema });

export const setColorSchema = entryKeySchema.extend({ color: colorSchema.nullable() });

/** Every entry, grouped by term (terms newest first, entries in the order they were added). */
export async function listSchedule(userId: string): Promise<Record<string, ScheduleEntry[]>> {
  const rows = await getDb()
    .select()
    .from(scheduleEntries)
    .where(eq(scheduleEntries.userId, userId))
    .orderBy(asc(scheduleEntries.addedAt), asc(scheduleEntries.id));
  const byTerm: Record<string, ScheduleEntry[]> = {};
  for (const term of [...new Set(rows.map((row) => row.term))].sort().reverse()) byTerm[term] = [];
  for (const row of rows) byTerm[row.term].push(toScheduleEntry(row));
  return byTerm;
}

/**
 * Adds a section to the schedule, or updates the existing entry (course identity, and the
 * color when one is given). A new entry without a color gets the first palette color not
 * used in that term. Throws ScheduleError for view-only or unlisted terms.
 */
export async function addEntry(
  userId: string,
  input: AddEntryInput,
): Promise<{ entry: ScheduleEntry; created: boolean }> {
  const data = addEntrySchema.parse(input);
  const reason = await termClosedReason(data.term);
  if (reason === "unknown") throw new ScheduleError("term_unknown", "That term is not offered in GoSolar.");
  if (reason) {
    throw new ScheduleError(
      "term_closed",
      "Registration for this term is closed, so its classes can no longer be scheduled.",
    );
  }

  const db = getDb();
  const sameTerm = await db
    .select({ crn: scheduleEntries.crn, color: scheduleEntries.color })
    .from(scheduleEntries)
    .where(and(eq(scheduleEntries.userId, userId), eq(scheduleEntries.term, data.term)));
  const existing = sameTerm.find((row) => row.crn === data.crn);

  if (existing) {
    const [row] = await db
      .update(scheduleEntries)
      .set({
        subject: data.subject,
        courseNumber: data.courseNumber,
        ...(data.courseTitle !== null ? { courseTitle: data.courseTitle } : {}),
        ...(data.color !== null ? { color: data.color } : {}),
      })
      .where(keyWhere(userId, data.term, data.crn))
      .returning();
    if (row) return { entry: toScheduleEntry(row), created: false };
  }

  const others = sameTerm.filter((row) => row.crn !== data.crn);
  const color =
    data.color ?? pickDefaultColorIndex(others.map((row) => resolveColorIndex(row.color, row.crn)));
  const [row] = await db
    .insert(scheduleEntries)
    .values({ userId, ...data, color })
    .onConflictDoUpdate({
      // A concurrent add of the same section won the insert; keep its color.
      target: [scheduleEntries.userId, scheduleEntries.term, scheduleEntries.crn],
      set: { subject: data.subject, courseNumber: data.courseNumber },
    })
    .returning();
  return { entry: toScheduleEntry(row), created: !existing };
}

/** Removes (term, crn) from the schedule. False when it was not there. */
export async function removeEntry(userId: string, term: string, crn: string): Promise<boolean> {
  const removed = await getDb()
    .delete(scheduleEntries)
    .where(keyWhere(userId, term, crn))
    .returning({ id: scheduleEntries.id });
  return removed.length > 0;
}

/**
 * Sets (or with null, clears back to the CRN-derived default) an entry's color. Returns the
 * updated entry, or null when the user has no such entry. Throws RangeError for an index
 * outside the palette.
 */
export async function setColor(
  userId: string,
  term: string,
  crn: string,
  color: number | null,
): Promise<ScheduleEntry | null> {
  if (color !== null && !colorSchema.safeParse(color).success) {
    throw new RangeError(`color must be an integer from 0 to ${PALETTE_SIZE - 1}`);
  }
  const [row] = await getDb()
    .update(scheduleEntries)
    .set({ color })
    .where(keyWhere(userId, term, crn))
    .returning();
  return row ? toScheduleEntry(row) : null;
}

function keyWhere(userId: string, term: string, crn: string) {
  return and(eq(scheduleEntries.userId, userId), eq(scheduleEntries.term, term), eq(scheduleEntries.crn, crn));
}

export * from "./colors";
export * from "./conflicts";
export * from "./ics";
