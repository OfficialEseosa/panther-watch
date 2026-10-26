import { and, desc, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { jobRuns, type JobRun } from "@/db/schema";

/** A run that has not finished after this long is treated as crashed and no longer blocks. */
export const DEFAULT_STALE_AFTER_MS = 5 * 60_000;

export interface StartJobRunOptions {
  /** How long an unfinished run blocks new ones. Defaults to 5 minutes (Hobby maxDuration). */
  staleAfterMs?: number;
}

/**
 * Inserts a `job_runs` row for `job` unless another run of the same job is still active
 * (`finished_at IS NULL` and started less than `staleAfterMs` ago). Returns null when one is.
 *
 * This row is the mutual-exclusion lock for cron jobs. The check and the insert run in one
 * short transaction holding `pg_advisory_xact_lock`, so two overlapping invocations cannot
 * both pass the check. A transaction-level lock (not a session lock) is used because the
 * Supabase transaction pooler does not keep session state. Timestamps come from the
 * database clock, the one clock every instance shares.
 */
export async function startJobRun(
  job: string,
  { staleAfterMs = DEFAULT_STALE_AFTER_MS }: StartJobRunOptions = {},
): Promise<{ id: number } | null> {
  return getDb().transaction(async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`job_runs:${job}`}))`);
    const active = await tx
      .select({ id: jobRuns.id })
      .from(jobRuns)
      .where(
        and(
          eq(jobRuns.job, job),
          isNull(jobRuns.finishedAt),
          gt(jobRuns.startedAt, sql`now() - (${staleAfterMs}::double precision * interval '1 millisecond')`),
        ),
      )
      .limit(1);
    if (active.length > 0) return null;
    const [row] = await tx.insert(jobRuns).values({ job }).returning({ id: jobRuns.id });
    return { id: row.id };
  });
}

/** Marks a run finished. `summary` must hold counts and short messages only, never PII. */
export async function finishJobRun(id: number, ok: boolean, summary: Record<string, unknown>): Promise<void> {
  await getDb()
    .update(jobRuns)
    .set({ finishedAt: sql`now()`, ok, summary })
    .where(eq(jobRuns.id, id));
}

/** The latest `n` runs of `job`, newest first. */
export async function recentRuns(job: string, n = 10): Promise<JobRun[]> {
  return getDb()
    .select()
    .from(jobRuns)
    .where(eq(jobRuns.job, job))
    .orderBy(desc(jobRuns.startedAt), desc(jobRuns.id))
    .limit(n);
}

export type JobOutcome<T> = { skipped: "locked" } | ({ skipped?: undefined; jobRunId: number } & T);

/**
 * Runs `fn` under a job_run lock: returns `{ skipped: "locked" }` if another run is active,
 * otherwise records the result. `fn` returns the summary and whether the run is ok; a throw
 * is recorded as `ok: false` with the message and then rethrown.
 */
export async function withJobRun<T extends Record<string, unknown>>(
  job: string,
  fn: (runId: number) => Promise<{ ok: boolean; summary: T }>,
  options?: StartJobRunOptions,
): Promise<JobOutcome<T>> {
  const run = await startJobRun(job, options);
  if (!run) return { skipped: "locked" };
  try {
    const { ok, summary } = await fn(run.id);
    await finishJobRun(run.id, ok, summary);
    return { jobRunId: run.id, ...summary };
  } catch (error) {
    await finishJobRun(run.id, false, { fatal: errorMessage(error) }).catch(() => {});
    throw error;
  }
}

/** Short, PII-free error text for summaries. */
export function errorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 300 ? `${message.slice(0, 297)}...` : message;
}
