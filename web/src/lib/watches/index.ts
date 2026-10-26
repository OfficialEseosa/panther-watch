import "server-only";
import { and, count, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { watchedSections, type WatchedSection } from "@/db/schema";
import { findSectionsByCrn, type CourseData, type GoSolarOptions } from "@/lib/gosolar";
import { gosolarOptions } from "@/lib/courses/gosolar-options";
import { termClosedReason } from "@/lib/courses/term-guard";
import {
  courseNumberSchema,
  crnSchema,
  displayTextSchema,
  subjectSchema,
  termCodeSchema,
} from "@/lib/courses/validation";

export type WatchErrorCode = "term_closed" | "term_unknown";

/** A watch request that is valid input but not allowed. Routes map `code` to 409. */
export class WatchError extends Error {
  constructor(
    readonly code: WatchErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "WatchError";
  }
}

/** What the API returns for a watch. */
export interface Watch {
  id: number;
  term: string;
  crn: string;
  subject: string;
  courseNumber: string;
  courseTitle: string | null;
  instructor: string | null;
  /** When the open-seat alert was sent (null = armed, no alert outstanding). ISO string. */
  notifiedAt: string | null;
  createdAt: string;
}

export function toWatch(row: WatchedSection): Watch {
  return {
    id: row.id,
    term: row.term,
    crn: row.crn,
    subject: row.subject,
    courseNumber: row.courseNumber,
    courseTitle: row.courseTitle,
    instructor: row.instructor,
    notifiedAt: row.notifiedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export const addWatchSchema = z.object({
  term: termCodeSchema,
  crn: crnSchema,
  subject: subjectSchema,
  courseNumber: courseNumberSchema,
  courseTitle: displayTextSchema(200).nullish().transform((v) => v ?? null),
  instructor: displayTextSchema(200).nullish().transform((v) => v ?? null),
});
export type AddWatchInput = z.input<typeof addWatchSchema>;

export const watchKeySchema = z.object({ term: termCodeSchema, crn: crnSchema });

/** The user's watches, newest first. */
export async function listWatches(userId: string): Promise<Watch[]> {
  const rows = await getDb()
    .select()
    .from(watchedSections)
    .where(eq(watchedSections.userId, userId))
    .orderBy(desc(watchedSections.createdAt), desc(watchedSections.id));
  return rows.map(toWatch);
}

export async function countWatches(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(watchedSections)
    .where(eq(watchedSections.userId, userId));
  return Number(row?.n ?? 0);
}

/**
 * Adds a seat alert. Idempotent: watching the same (term, crn) again returns the existing
 * watch with `created: false`. Throws WatchError("term_closed") for view-only or expired
 * terms, WatchError("term_unknown") for terms GoSolar does not list, ZodError for bad input.
 */
export async function addWatch(
  userId: string,
  input: AddWatchInput,
  { now }: { now?: Date } = {},
): Promise<{ watch: Watch; created: boolean }> {
  const data = addWatchSchema.parse(input);
  const reason = await termClosedReason(data.term, { now });
  if (reason === "unknown") {
    throw new WatchError("term_unknown", "That term is not offered in GoSolar.");
  }
  if (reason) {
    throw new WatchError(
      "term_closed",
      reason === "expired"
        ? "Seat alerts for this term have ended."
        : "Registration for this term is closed, so its classes can no longer be tracked.",
    );
  }

  const db = getDb();
  const [created] = await db
    .insert(watchedSections)
    .values({ userId, ...data })
    .onConflictDoNothing({ target: [watchedSections.userId, watchedSections.term, watchedSections.crn] })
    .returning();
  if (created) return { watch: toWatch(created), created: true };

  const [existing] = await db
    .select()
    .from(watchedSections)
    .where(
      and(
        eq(watchedSections.userId, userId),
        eq(watchedSections.term, data.term),
        eq(watchedSections.crn, data.crn),
      ),
    )
    .limit(1);
  if (!existing) throw new Error("watch insert conflicted but no row was found");
  return { watch: toWatch(existing), created: false };
}

/** Removes the user's watch on (term, crn). False when there was none. */
export async function removeWatch(userId: string, term: string, crn: string): Promise<boolean> {
  const removed = await getDb()
    .delete(watchedSections)
    .where(
      and(eq(watchedSections.userId, userId), eq(watchedSections.term, term), eq(watchedSections.crn, crn)),
    )
    .returning({ id: watchedSections.id });
  return removed.length > 0;
}

// ---------------------------------------------------------------------------------------------
// Details (live GoSolar data for each watch)
// ---------------------------------------------------------------------------------------------

export interface WatchDetailsItem {
  watch: Watch;
  /**
   * Live section. Null when GoSolar failed for this watch's course (`partial: true`) or when
   * the search worked but no longer lists the CRN (`partial: false`: the section was
   * cancelled or renumbered).
   */
  section: CourseData | null;
  /** True when the live data could not be fetched (error or deadline); retry later. */
  partial: boolean;
}

export interface WatchDetails {
  items: WatchDetailsItem[];
}

export interface WatchDetailsOptions {
  /** Max GoSolar searches in flight. Default 4. */
  concurrency?: number;
  /** Overall deadline; groups not finished by then are reported `partial`. Default 20 s. */
  deadlineMs?: number;
  gosolar?: GoSolarOptions;
}

export const DETAILS_DEADLINE_MS = 20_000;
const DEFAULT_REQUEST_TIMEOUT_MS = 10_000;

interface Group {
  term: string;
  subject: string;
  courseNumber: string;
  crns: string[];
  state: "pending" | "ok" | "failed";
  sections: Map<string, CourseData>;
}

const groupKey = (w: { term: string; subject: string; courseNumber: string }) =>
  `${w.term}|${w.subject}|${w.courseNumber}`;

/**
 * Every watch with its live GoSolar section, in listWatches order. One search per
 * (term, subject, courseNumber) group via findSectionsByCrn, at most `concurrency` at once,
 * all within `deadlineMs`. Never throws for GoSolar failures: affected items come back with
 * `section: null, partial: true` (the old backend's "placeholder", now explicit).
 */
export async function listWatchesWithDetails(
  userId: string,
  { concurrency = 4, deadlineMs = DETAILS_DEADLINE_MS, gosolar = gosolarOptions() }: WatchDetailsOptions = {},
): Promise<WatchDetails> {
  const watches = await listWatches(userId);
  if (watches.length === 0) return { items: [] };

  const groups = new Map<string, Group>();
  for (const watch of watches) {
    const key = groupKey(watch);
    let group = groups.get(key);
    if (!group) {
      group = {
        term: watch.term,
        subject: watch.subject,
        courseNumber: watch.courseNumber,
        crns: [],
        state: "pending",
        sections: new Map(),
      };
      groups.set(key, group);
    }
    group.crns.push(watch.crn);
  }

  const deadline = Date.now() + deadlineMs;
  const queue = [...groups.values()];

  const runGroup = async (group: Group) => {
    const remaining = deadline - Date.now();
    if (remaining <= 0) return;
    let failed = false;
    const found = await findSectionsByCrn(
      group.term,
      [{ subject: group.subject, courseNumber: group.courseNumber, crns: group.crns }],
      {
        ...gosolar,
        concurrency: 1,
        // Each request also stops at the deadline, so a hung GoSolar node cannot keep the
        // function running long after the response was sent.
        timeoutMs: Math.min(gosolar?.timeoutMs ?? DEFAULT_REQUEST_TIMEOUT_MS, remaining),
        onError: (_group, error) => {
          failed = true;
          console.warn(
            `watch details: GoSolar search failed for ${group.term} ${group.subject} ${group.courseNumber}:`,
            error instanceof Error ? error.message : error,
          );
        },
      },
    );
    if (group.state !== "pending") return; // finished after the deadline; already reported
    group.state = failed ? "failed" : "ok";
    group.sections = found;
  };

  const workers = Array.from({ length: Math.max(1, Math.min(concurrency, queue.length)) }, async () => {
    for (let group = queue.shift(); group; group = queue.shift()) {
      await runGroup(group);
    }
  });

  let timer: ReturnType<typeof setTimeout> | undefined;
  const timedOut = new Promise<void>((resolve) => {
    timer = setTimeout(resolve, deadlineMs);
  });
  try {
    await Promise.race([Promise.all(workers), timedOut]);
  } finally {
    clearTimeout(timer);
  }
  // Stop workers from starting more groups and freeze whatever has not finished.
  queue.length = 0;
  for (const group of groups.values()) {
    if (group.state === "pending") group.state = "failed";
  }

  return {
    items: watches.map((watch) => {
      const group = groups.get(groupKey(watch))!;
      if (group.state !== "ok") return { watch, section: null, partial: true };
      const section = group.sections.get(watch.crn) ?? null;
      return {
        watch,
        section: section && !section.term ? { ...section, term: watch.term } : section,
        partial: false,
      };
    }),
  };
}
