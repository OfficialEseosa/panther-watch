import { desc, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { terms, type Term } from "@/db/schema";
import { getTerms, isViewOnlyTerm, type GoSolarOptions } from "@/lib/gosolar";
import { nyDateParts, termLabel, termName } from "@/lib/format";
import { defaultJobsGoSolarOptions } from "./gosolar-options";

// ---------------------------------------------------------------------------------------------
// Pure term-code helpers
// ---------------------------------------------------------------------------------------------

/** A tracked class expires this many months after its term starts. */
export const EXPIRY_MONTHS_AFTER_START = 2;

/**
 * GSU term codes are `YYYYMM` of the term's start month (01 Spring, 05 Summer, 08 Fall).
 * Returns the 1-based year/month of the expiry date (always the 1st of that month), or null
 * for a malformed code. Ported from WatchedClassExpiryPolicy.java / trackedClassExpiry.js:
 * Spring 202601 -> 2026-03-01, Summer 202605 -> 2026-07-01, Fall 202608 -> 2026-10-01.
 */
export function termExpiryMonth(termCode: string | null | undefined): { year: number; month: number } | null {
  if (!termCode || !/^\d{6}$/.test(termCode)) return null;
  const year = Number(termCode.slice(0, 4));
  const month = Number(termCode.slice(4, 6));
  if (month < 1 || month > 12) return null;
  const index = year * 12 + (month - 1) + EXPIRY_MONTHS_AFTER_START;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/**
 * True once GSU's local date is on or after the term's expiry date (term start + 2 months).
 * Malformed codes never expire, as in the Java policy. The Java code used the server's
 * local date (UTC on Koyeb); this uses America/New_York so the cutover happens at local
 * midnight, which only matters for the few hours around it.
 */
export function isTermExpired(termCode: string, now: Date = new Date()): boolean {
  const expiry = termExpiryMonth(termCode);
  if (!expiry) return false;
  const today = nyDateParts(now);
  return today.year * 12 + today.month >= expiry.year * 12 + expiry.month;
}

export { termLabel };

/** GoSolar's description without the "(View only)" marker, e.g. "Fall Semester 2026". */
export function termDisplayName(term: Pick<Term, "code" | "description"> | undefined, code: string): string {
  return termName(code, term?.description);
}

// ---------------------------------------------------------------------------------------------
// The `terms` cache
// ---------------------------------------------------------------------------------------------

export interface RefreshTermsOptions {
  gosolar?: GoSolarOptions;
}

/**
 * Fetches GoSolar's term list and upserts it into `terms`. Terms GoSolar no longer lists are
 * kept (it only returns the newest 10). An empty response is treated as a failure and
 * changes nothing, so a GoSolar hiccup cannot make every term look unknown.
 */
export async function refreshTerms({ gosolar }: RefreshTermsOptions = {}): Promise<Term[]> {
  const list = await getTerms({ ...defaultJobsGoSolarOptions(), ...gosolar });
  const rows = list
    .filter((term) => /^\d{6}$/.test(term.code ?? ""))
    .map((term) => ({
      code: term.code,
      description: term.description ?? term.code,
      viewOnly: isViewOnlyTerm(term),
    }));
  if (rows.length === 0) throw new Error("GoSolar returned no terms");

  return getDb()
    .insert(terms)
    .values(rows.map((row) => ({ ...row, fetchedAt: sql`now()` })))
    .onConflictDoUpdate({
      target: terms.code,
      set: {
        description: sql`excluded.description`,
        viewOnly: sql`excluded.view_only`,
        fetchedAt: sql`excluded.fetched_at`,
      },
    })
    .returning();
}

export interface TermsCachedOptions extends RefreshTermsOptions {
  now?: Date;
}

/** Every cached term, newest first. */
export async function listTerms(): Promise<Term[]> {
  return getDb().select().from(terms).orderBy(desc(terms.code));
}

/**
 * Terms from the `terms` table, refreshed from GoSolar first when the table is empty or
 * its newest `fetched_at` is older than `maxAgeMinutes`. If the refresh fails, stale rows
 * are returned; with no rows at all the error is thrown.
 */
export async function getTermsCached(
  maxAgeMinutes = 60,
  { now = new Date(), gosolar }: TermsCachedOptions = {},
): Promise<Term[]> {
  const cached = await listTerms();
  const newest = Math.max(0, ...cached.map((term) => term.fetchedAt.getTime()));
  const fresh = cached.length > 0 && now.getTime() - newest < maxAgeMinutes * 60_000;
  if (fresh) return cached;

  try {
    await refreshTerms({ gosolar });
  } catch (error) {
    if (cached.length === 0) throw error;
    console.error("Term refresh failed; using cached terms", error);
    return cached;
  }
  return listTerms();
}
