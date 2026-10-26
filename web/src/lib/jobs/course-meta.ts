import { ingestNextTerm, ingestSyllabiForTerm, type IngestOptions, type SyllabiIngestResult } from "@/lib/course-meta";
import { errorMessage, withJobRun, type JobOutcome } from "./runs";
import { getTermsCached } from "./terms";

/** Grades/syllabi runs can use the whole 300 s budget; don't let a slow one look stale. */
const LONG_JOB_STALE_MS = 10 * 60_000;

export interface GradesJobSummary extends Record<string, unknown> {
  /** `ingestNextTerm`'s result: the term ingested (rows, posted) or `done: true`. */
  result: Record<string, unknown>;
}

/** Ingests one missing grade-distribution term from GSU APEX (one per call, by design). */
export function runGradesJob(options: IngestOptions = {}): Promise<JobOutcome<GradesJobSummary>> {
  return withJobRun(
    "grades",
    async () => {
      const result = await ingestNextTerm(options);
      return { ok: true, summary: { result: { ...result } } };
    },
    { staleAfterMs: LONG_JOB_STALE_MS },
  );
}

export interface SyllabiJobSummary extends Record<string, unknown> {
  terms: SyllabiIngestResult[];
  errors: string[];
}

/**
 * Re-syncs `syllabi` for every term in the `terms` cache that is not view-only (the terms
 * students can still register for). One term failing does not stop the others.
 */
export function runSyllabiJob(
  ingest: (term: string) => Promise<SyllabiIngestResult> = (term) => ingestSyllabiForTerm(term),
): Promise<JobOutcome<SyllabiJobSummary>> {
  return withJobRun(
    "syllabi",
    async () => {
      const targets = (await getTermsCached(24 * 60)).filter((term) => !term.viewOnly);
      const summary: SyllabiJobSummary = { terms: [], errors: [] };
      for (const { code } of targets) {
        try {
          summary.terms.push(await ingest(code));
        } catch (error) {
          summary.errors.push(`${code}: ${errorMessage(error)}`);
        }
      }
      return { ok: summary.errors.length === 0, summary };
    },
    { staleAfterMs: LONG_JOB_STALE_MS },
  );
}
