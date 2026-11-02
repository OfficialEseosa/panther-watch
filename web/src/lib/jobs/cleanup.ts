import { and, eq, inArray, lt, ne, sql } from "drizzle-orm";
import { getDb } from "@/db";
import {
  emailLog,
  jobRuns,
  oauthAssertionJtis,
  oauthClients,
  oauthCodes,
  oauthTokens,
  scheduleEntries,
  terms,
  watchedSections,
} from "@/db/schema";
import type { GoSolarOptions } from "@/lib/gosolar";
import { errorMessage, withJobRun, type JobOutcome } from "./runs";
import { isTermExpired, refreshTerms } from "./terms";

export const EMAIL_LOG_RETENTION_DAYS = 90;
export const JOB_RUNS_RETENTION_DAYS = 30;

const DAY_MS = 24 * 60 * 60_000;

export interface CleanupOptions {
  now?: Date;
  /** Outcome of the terms refresh the route ran first, recorded in the summary. */
  termsRefresh?: { ok: true; terms: number } | { ok: false; error: string };
}

export interface CleanupSummary extends Record<string, unknown> {
  /** Terms whose watches were purged (view-only or expired), sorted. */
  purgedTerms: string[];
  /** Terms whose schedule entries were purged (view-only only), sorted. */
  purgedScheduleTerms: string[];
  watchedSectionsDeleted: number;
  scheduleEntriesDeleted: number;
  emailLogDeleted: number;
  jobRunsDeleted: number;
  oauthCodesDeleted: number;
  oauthTokensDeleted: number;
  oauthClientsDeleted: number;
  oauthAssertionJtisDeleted: number;
  termsRefresh?: CleanupOptions["termsRefresh"];
}

/**
 * Daily purge:
 * - watches for terms that are view-only (per the `terms` cache) or expired (term start +
 *   2 months; seat alerts are pointless after add/drop),
 * - schedule entries only for view-only terms (never by the 2-month rule: students use the
 *   schedule for the semester in progress),
 * - `email_log` rows older than 90 days and `job_runs` older than 30 days,
 * - expired OAuth codes and tokens, and idle OAuth clients (`pruneOAuth`).
 * Idempotent, so the Vercel backup cron running it a second time each day is harmless.
 */
export async function runCleanup({ now = new Date(), termsRefresh }: CleanupOptions = {}): Promise<
  JobOutcome<CleanupSummary>
> {
  return withJobRun("cleanup", async (runId) => {
    const db = getDb();

    const [viewOnly, watchedTerms, scheduledTerms] = await Promise.all([
      db.select({ code: terms.code }).from(terms).where(eq(terms.viewOnly, true)),
      db.selectDistinct({ term: watchedSections.term }).from(watchedSections),
      db.selectDistinct({ term: scheduleEntries.term }).from(scheduleEntries),
    ]);
    const viewOnlyCodes = new Set(viewOnly.map((row) => row.code));
    const purgedTerms = watchedTerms
      .map((row) => row.term)
      .filter((term) => viewOnlyCodes.has(term) || isTermExpired(term, now))
      .sort();
    const purgedScheduleTerms = scheduledTerms
      .map((row) => row.term)
      .filter((term) => viewOnlyCodes.has(term))
      .sort();

    let watchedSectionsDeleted = 0;
    let scheduleEntriesDeleted = 0;
    if (purgedTerms.length > 0) {
      const watches = await db
        .delete(watchedSections)
        .where(inArray(watchedSections.term, purgedTerms))
        .returning({ id: watchedSections.id });
      watchedSectionsDeleted = watches.length;
    }
    if (purgedScheduleTerms.length > 0) {
      const entries = await db
        .delete(scheduleEntries)
        .where(inArray(scheduleEntries.term, purgedScheduleTerms))
        .returning({ id: scheduleEntries.id });
      scheduleEntriesDeleted = entries.length;
    }

    const emails = await db
      .delete(emailLog)
      .where(lt(emailLog.sentAt, new Date(now.getTime() - EMAIL_LOG_RETENTION_DAYS * DAY_MS)))
      .returning({ id: emailLog.id });
    const runs = await db
      .delete(jobRuns)
      .where(
        and(
          lt(jobRuns.startedAt, new Date(now.getTime() - JOB_RUNS_RETENTION_DAYS * DAY_MS)),
          ne(jobRuns.id, runId),
        ),
      )
      .returning({ id: jobRuns.id });

    const oauth = await pruneOAuth(now);

    const summary: CleanupSummary = {
      purgedTerms,
      purgedScheduleTerms,
      watchedSectionsDeleted,
      scheduleEntriesDeleted,
      emailLogDeleted: emails.length,
      jobRunsDeleted: runs.length,
      ...oauth,
      ...(termsRefresh ? { termsRefresh } : {}),
    };
    return { ok: termsRefresh?.ok !== false, summary };
  });
}

/** Unused registered clients are dropped after this long (an abandoned or spam registration). */
export const OAUTH_IDLE_CLIENT_DAYS = 7;

/**
 * OAuth housekeeping: authorization codes a day past expiry, token rows whose refresh token
 * expired (revoked rows are kept until then so a replayed refresh token is still recognised),
 * clients with no codes or tokens left that were registered (or their metadata document
 * fetched) more than a week ago (a client that is still connected always has a live row), and
 * the jti records of expired private_key_jwt client assertions.
 */
async function pruneOAuth(now: Date) {
  const db = getDb();
  const codes = await db
    .delete(oauthCodes)
    .where(lt(oauthCodes.expiresAt, new Date(now.getTime() - DAY_MS)))
    .returning({ codeHash: oauthCodes.codeHash });
  const tokens = await db
    .delete(oauthTokens)
    .where(lt(oauthTokens.refreshExpiresAt, now))
    .returning({ id: oauthTokens.id });
  const clients = await db
    .delete(oauthClients)
    .where(
      and(
        lt(oauthClients.createdAt, new Date(now.getTime() - OAUTH_IDLE_CLIENT_DAYS * DAY_MS)),
        sql`NOT EXISTS (SELECT 1 FROM ${oauthTokens} WHERE ${oauthTokens.clientId} = ${oauthClients.id})`,
        sql`NOT EXISTS (SELECT 1 FROM ${oauthCodes} WHERE ${oauthCodes.clientId} = ${oauthClients.id})`,
      ),
    )
    .returning({ id: oauthClients.id });
  const jtis = await db
    .delete(oauthAssertionJtis)
    .where(lt(oauthAssertionJtis.expiresAt, now))
    .returning({ jti: oauthAssertionJtis.jti });
  return {
    oauthCodesDeleted: codes.length,
    oauthTokensDeleted: tokens.length,
    oauthClientsDeleted: clients.length,
    oauthAssertionJtisDeleted: jtis.length,
  };
}

/** GoSolar's term list must answer well inside pg_net's 10 s wait for the route. */
const TERMS_REFRESH_TIMEOUT_MS = 5_000;

/**
 * What the cleanup route runs: refresh the `terms` cache from GoSolar (so view-only flags are
 * current), then `runCleanup`. A failed refresh does not block the purge; it runs on the
 * cached flags and the run is recorded as not ok.
 */
export async function runCleanupJob({ now, gosolar }: { now?: Date; gosolar?: GoSolarOptions } = {}): Promise<
  JobOutcome<CleanupSummary>
> {
  let termsRefresh: CleanupOptions["termsRefresh"];
  try {
    const refreshed = await refreshTerms({ gosolar: { timeoutMs: TERMS_REFRESH_TIMEOUT_MS, ...gosolar } });
    termsRefresh = { ok: true, terms: refreshed.length };
  } catch (error) {
    termsRefresh = { ok: false, error: errorMessage(error) };
  }
  return runCleanup({ now, termsRefresh });
}
