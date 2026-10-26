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
import { isOpen, UNLISTED_AFTER_RUNS } from "@/lib/watcher/state";

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

function listWatchRows(userId: string): Promise<WatchedSection[]> {
  return getDb()
    .select()
    .from(watchedSections)
    .where(eq(watchedSections.userId, userId))
    .orderBy(desc(watchedSections.createdAt), desc(watchedSections.id));
}

/** The user's watches, newest first. */
export async function listWatches(userId: string): Promise<Watch[]> {
  return (await listWatchRows(userId)).map(toWatch);
}

export async function countWatches(userId: string): Promise<number> {
  const [row] = await getDb()
    .select({ n: count() })
    .from(watchedSections)
    .where(eq(watchedSections.userId, userId));
  return Number(row?.n ?? 0);
}

export interface AddWatchOptions {
  now?: Date;
  /** For the live seat check. Defaults to the user-facing GoSolar options (tests: the fake). */
  gosolar?: GoSolarOptions;
}

export interface AddWatchResult {
  watch: Watch;
  created: boolean;
  /**
   * True when this call created the watch while the section was OPEN (seats, no waitlist):
   * no alert is sent for that opening; the first one comes after it fills and reopens.
   * Always false for an existing watch (`created: false`).
   */
  openNow: boolean;
}

/** The live check must not hold up the Track button for long. */
const ADD_CHECK_TIMEOUT_MS = 8_000;

/**
 * Adds a seat alert. Idempotent: watching the same (term, crn) again returns the existing
 * watch unchanged with `created: false`. Throws WatchError("term_closed") for view-only or
 * expired terms, WatchError("term_unknown") for terms GoSolar does not list, ZodError for bad
 * input.
 *
 * Track-while-open rule: a new watch costs one live GoSolar search for its course. If the
 * section is OPEN right now the row is inserted already notified (`notified_at = now`), so
 * tracking an open section never emails; the first alert comes after it fills (two closed
 * watcher runs re-arm it) and reopens. Closed or unknown (search failed, CRN not listed) is
 * inserted armed (`notified_at = null`), so the next open reading alerts.
 */
export async function addWatch(
  userId: string,
  input: AddWatchInput,
  { now, gosolar = gosolarOptions() }: AddWatchOptions = {},
): Promise<AddWatchResult> {
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
  const findExisting = async () => {
    const [row] = await db
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
    return row;
  };

  // Already watching: no GoSolar call and nothing changes (a re-click must not reset alert state).
  const existing = await findExisting();
  if (existing) return { watch: toWatch(existing), created: false, openNow: false };

  const openNow = await isSectionOpenNow(data, gosolar);
  const [created] = await db
    .insert(watchedSections)
    .values({ userId, ...data, notifiedAt: openNow ? (now ?? new Date()) : null })
    .onConflictDoNothing({ target: [watchedSections.userId, watchedSections.term, watchedSections.crn] })
    .returning();
  if (created) return { watch: toWatch(created), created: true, openNow };

  // A concurrent add (double click) inserted it first; its row stands.
  const raced = await findExisting();
  if (!raced) throw new Error("watch insert conflicted but no row was found");
  return { watch: toWatch(raced), created: false, openNow: false };
}

/** One live search for the course; true only for a definite OPEN reading. Never throws. */
async function isSectionOpenNow(
  data: { term: string; crn: string; subject: string; courseNumber: string },
  gosolar: GoSolarOptions | undefined,
): Promise<boolean> {
  const warn = (error: unknown) =>
    console.warn(
      `add watch: live seat check failed for ${data.term} ${data.subject} ${data.courseNumber}; tracking armed:`,
      error instanceof Error ? error.message : error,
    );
  try {
    const sections = await findSectionsByCrn(
      data.term,
      [{ subject: data.subject, courseNumber: data.courseNumber, crns: [data.crn] }],
      {
        ...gosolar,
        concurrency: 1,
        timeoutMs: Math.min(gosolar?.timeoutMs ?? ADD_CHECK_TIMEOUT_MS, ADD_CHECK_TIMEOUT_MS),
        onError: (_group, error) => warn(error),
      },
    );
    const section = sections.get(data.crn);
    return section !== undefined && isOpen(section);
  } catch (error) {
    warn(error);
    return false;
  }
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
  /**
   * The seat watcher has seen GoSolar answer for this course without listing the CRN for at
   * least UNLISTED_AFTER_RUNS consecutive runs (`missing_runs`): show "no longer listed".
   * False whenever the live search does list it.
   */
  unlisted: boolean;
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
  const rows = await listWatchRows(userId);
  if (rows.length === 0) return { items: [] };
  const watches = rows.map(toWatch);
  const unlistedIds = new Set(rows.filter((row) => row.missingRuns >= UNLISTED_AFTER_RUNS).map((row) => row.id));

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
      const unlisted = unlistedIds.has(watch.id);
      if (group.state !== "ok") return { watch, section: null, partial: true, unlisted };
      const section = group.sections.get(watch.crn) ?? null;
      return {
        watch,
        section: section && !section.term ? { ...section, term: watch.term } : section,
        partial: false,
        // A live listing beats the watcher's last count (it may have reappeared since).
        unlisted: unlisted && section === null,
      };
    }),
  };
}
