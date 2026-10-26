import "server-only";
import { isTermExpired } from "@/lib/jobs/terms";
import { getTermStatus } from "./terms";

export type TermClosedReason = "view_only" | "expired" | "unknown";

/**
 * Why `term` cannot take new watches or schedule entries, or null when it can. Mirrors what
 * the daily cleanup job (src/lib/jobs/cleanup.ts) purges, so nothing is accepted only to be
 * deleted overnight:
 * - expired: past term start + 2 months (WatchedClassExpiryPolicy).
 * - view_only: GoSolar labels the term "(View only)" (registration closed).
 * - unknown: GoSolar's current term list does not contain it.
 */
export async function termClosedReason(term: string, { now }: { now?: Date } = {}): Promise<TermClosedReason | null> {
  if (isTermExpired(term, now)) return "expired";
  const status = await getTermStatus(term);
  if (status === "view_only") return "view_only";
  if (status === "unknown") return "unknown";
  return null;
}
