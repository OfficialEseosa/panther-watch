import "server-only";
import { isTermExpired } from "@/lib/jobs/terms";
import { listSchedule } from "@/lib/schedule";
import { listWatches } from "@/lib/watches";
import { termLabel } from "@/lib/format";

/** What the member dashboard shows. Database only: the dashboard never calls GoSolar. */
export type DashboardSummary = {
  /** Watched sections in terms that haven't expired yet. */
  tracked: number;
  /** Watches whose open-seat email has gone out and hasn't re-armed yet. */
  seatsOpened: number;
  /** Classes on the schedule of the newest term that hasn't expired (null: none). */
  scheduled: { count: number; termCode: string | null; termLabel: string | null };
  /** Any schedule entry at all, in any term (for the Getting started checklist). */
  hasSchedule: boolean;
};

/**
 * Loads the dashboard numbers for `userId`. Throws on database errors; the caller renders a
 * Banner instead. Reads the clock (term expiry), so call it after the request's cookie read.
 */
export async function loadDashboardSummary(userId: string): Promise<DashboardSummary> {
  const [watches, schedule] = await Promise.all([listWatches(userId), listSchedule(userId)]);
  const now = new Date();
  const live = watches.filter((watch) => !isTermExpired(watch.term, now));

  // listSchedule's keys are newest term first.
  const terms = Object.keys(schedule);
  const activeTerm = terms.find((term) => schedule[term].length > 0 && !isTermExpired(term, now)) ?? null;

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
