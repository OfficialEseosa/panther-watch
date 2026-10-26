import "server-only";
import { isTermExpired, listTerms } from "@/lib/jobs/terms";
import { listSchedule } from "@/lib/schedule";
import { listWatches } from "@/lib/watches";
import { termLabel } from "@/lib/format";

/** What the member dashboard shows. Database only: the dashboard never calls GoSolar. */
export type DashboardSummary = {
  /** Watched sections in terms that haven't expired yet. */
  tracked: number;
  /** Watches whose open-seat email has gone out and hasn't re-armed yet. */
  seatsOpened: number;
  /**
   * Classes on the schedule of the newest term that is not view-only in the `terms` cache
   * (null: none). Expiry is ignored: a semester in progress is still the current schedule.
   */
  scheduled: { count: number; termCode: string | null; termLabel: string | null };
  /** Any schedule entry at all, in any term (for the Getting started checklist). */
  hasSchedule: boolean;
};

/**
 * Loads the dashboard numbers for `userId`. Throws on database errors; the caller renders a
 * Banner instead. Reads the clock (term expiry), so call it after the request's cookie read.
 */
export async function loadDashboardSummary(userId: string): Promise<DashboardSummary> {
  const [watches, schedule, cachedTerms] = await Promise.all([listWatches(userId), listSchedule(userId), listTerms()]);
  const now = new Date();
  const live = watches.filter((watch) => !isTermExpired(watch.term, now));

  // View-only per the `terms` cache (DB only, no GoSolar). An empty cache marks nothing view-only.
  const viewOnly = new Set(cachedTerms.filter((term) => term.viewOnly).map((term) => term.code));
  // Sorted here: term codes are integer-like keys, which objects enumerate in ascending order.
  const terms = Object.keys(schedule).sort((a, b) => b.localeCompare(a));
  const activeTerm = terms.find((term) => schedule[term].length > 0 && !viewOnly.has(term)) ?? null;

  return {
    tracked: live.length,
    seatsOpened: live.filter((watch) => watch.notifiedAt !== null).length,
    scheduled: {
      count: activeTerm ? schedule[activeTerm].length : 0,
      termCode: activeTerm,
      termLabel: activeTerm ? termLabel(activeTerm) : null,
    },
    hasSchedule: terms.some((term) => schedule[term].length > 0),
  };
}
