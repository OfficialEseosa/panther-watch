import "server-only";
import { getTermsCached } from "@/lib/jobs/terms";
import { gosolarOptions } from "./gosolar-options";

export interface TermInfo {
  code: string;
  description: string;
  /** GoSolar labels closed registration windows "(View only)". */
  viewOnly: boolean;
}

/** Refresh the `terms` cache from GoSolar when it is older than this. The cron refreshes it daily. */
export const TERMS_MAX_AGE_MINUTES = 60;

/**
 * Rows written by one refresh share `fetched_at` (one INSERT, `now()`); terms GoSolar
 * stopped listing keep an older timestamp and are no longer offered.
 */
const SAME_REFRESH_WINDOW_MS = 60_000;

/** The term list GoSolar currently offers, from the `terms` cache, newest first. */
export async function currentTerms(): Promise<TermInfo[]> {
  const rows = await getTermsCached(TERMS_MAX_AGE_MINUTES, { gosolar: gosolarOptions() });
  const newest = Math.max(0, ...rows.map((row) => row.fetchedAt.getTime()));
  return rows
    .filter((row) => newest - row.fetchedAt.getTime() <= SAME_REFRESH_WINDOW_MS)
    .sort((a, b) => b.code.localeCompare(a.code))
    .map(({ code, description, viewOnly }) => ({ code, description, viewOnly }));
}

export type TermStatus = "open" | "view_only" | "unknown";

/**
 * Whether GoSolar's term list offers `term` for registration. Fails open ("open") when the
 * list cannot be loaded at all, like the Java backend, so a GoSolar outage on an empty
 * cache does not block every add.
 */
export async function getTermStatus(term: string): Promise<TermStatus> {
  let list: TermInfo[];
  try {
    list = await currentTerms();
  } catch (error) {
    console.warn("term status unavailable; allowing:", error instanceof Error ? error.message : error);
    return "open";
  }
  const found = list.find((t) => t.code === term);
  if (!found) return "unknown";
  return found.viewOnly ? "view_only" : "open";
}
