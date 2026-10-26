/**
 * The seat-alert state machine for one `watched_sections` row, as pure functions so every
 * transition is unit-tested without I/O. `run.ts` applies the chosen action to the database.
 *
 * | GoSolar reading | notified_at | last_closed_at         | action           | effect                                       |
 * |-----------------|-------------|------------------------|------------------|----------------------------------------------|
 * | open            | null        | any                    | `notify`         | claim (notified_at = now, last_closed_at = null), then email |
 * | open            | set         | set                    | `clear_debounce` | last_closed_at = null (a single closed blip does not count) |
 * | open            | set         | null                   | `none`           |                                              |
 * | closed          | null        | any                    | `none`           |                                              |
 * | closed          | set         | null                   | `mark_closed`    | last_closed_at = now (first closed reading)  |
 * | closed          | set         | set, < rearmAfterMs ago | `none`          | (same run re-triggered; wait for the next one) |
 * | closed          | set         | set, >= rearmAfterMs ago | `rearm`        | notified_at = null, last_closed_at = null    |
 * | unknown         | any         | any                    | `none`           | search failed or CRN missing: unknown is not closed |
 *
 * Separately, a CRN missing from a SUCCESSFUL search bumps `missing_runs` (reset when it is
 * listed again); see `recordListing` in run.ts. That is display-only and never emails.
 *
 * Tracking a section that is open right now does not alert: `addWatch` checks live seats and
 * inserts the row already notified (`notified_at = now`), so the first alert needs the
 * section to fill (two closed runs, re-arm) and reopen.
 */

/**
 * Minimum gap between the first closed reading and the one that re-arms. The watcher runs
 * every 3 minutes, so the next run's reading of a row lands 180 s +/- the spread of
 * processing inside a run (at most the 25 s group deadline). 2 minutes therefore re-arms on
 * the second consecutive closed run, while a manual re-trigger seconds later does not count
 * as a second run.
 */
export const REARM_AFTER_MS = 2 * 60_000;

/**
 * Consecutive runs a watched CRN may be absent from a successful GoSolar search before the
 * tracked page calls it "no longer listed" (`watched_sections.missing_runs`). Display only.
 */
export const UNLISTED_AFTER_RUNS = 3;
/** `missing_runs` stops counting here (smallint; only ">= UNLISTED_AFTER_RUNS" matters). */
export const MISSING_RUNS_CAP = 1000;

/** The fields of a GoSolar section the watcher reads. */
export interface SeatCounts {
  seatsAvailable: number;
  waitCount: number;
}

export type Observation = "open" | "closed" | "unknown";

/** Open = seats available and nobody on the waitlist (a waitlist gets the seat first). */
export function isOpen(section: SeatCounts): boolean {
  return section.waitCount === 0 && section.seatsAvailable > 0;
}

/** `undefined` (section absent from results, or its group's search failed) is unknown. */
export function observe(section: SeatCounts | undefined): Observation {
  if (!section) return "unknown";
  return isOpen(section) ? "open" : "closed";
}

export interface WatchState {
  notifiedAt: Date | null;
  lastClosedAt: Date | null;
}

export type WatchAction = "notify" | "clear_debounce" | "mark_closed" | "rearm" | "none";

export function decide(
  row: WatchState,
  observation: Observation,
  now: Date,
  rearmAfterMs: number = REARM_AFTER_MS,
): WatchAction {
  if (observation === "unknown") return "none";

  if (observation === "open") {
    if (row.notifiedAt === null) return "notify";
    return row.lastClosedAt !== null ? "clear_debounce" : "none";
  }

  // closed
  if (row.notifiedAt === null) return "none";
  if (row.lastClosedAt === null) return "mark_closed";
  return now.getTime() - row.lastClosedAt.getTime() >= rearmAfterMs ? "rearm" : "none";
}
