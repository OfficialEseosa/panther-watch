import "server-only";
import { isTermExpired } from "@/lib/jobs/terms";
import { getTermStatus } from "./terms";

export type TermClosedReason = "view_only" | "expired" | "unknown";

/**
 * Why `term` cannot take new watches or schedule entries, or null when it can. Mirrors what
 * the daily cleanup job (src/lib/jobs/cleanup.ts) purges, so nothing is accepted only to be
 * deleted overnight:
 * - expired: past term start + 2 months (WatchedClassExpiryPolicy). Only applies to watches;
 *   schedule entries pass `ignoreExpiry` because students keep using the schedule for the
 *   semester in progress, and cleanup only purges them once the term is view-only.
 * - view_only: GoSolar labels the term "(View only)" (registration closed).
 * - unknown: GoSolar's current term list does not contain it.
 */
export async function termClosedReason(
  term: string,
  { now, ignoreExpiry = false }: { now?: Date; ignoreExpiry?: boolean } = {},
): Promise<TermClosedReason | null> {
  if (!ignoreExpiry && isTermExpired(term, now)) return "expired";
  const status = await getTermStatus(term);
  if (status === "view_only") return "view_only";
  if (status === "unknown") return "unknown";
  return null;
}
