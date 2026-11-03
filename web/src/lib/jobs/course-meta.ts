import {
  ingestNextTerm,
  ingestSyllabiForTerm,
  refreshCatalog,
  type CatalogTermResult,
  type IngestOptions,
  type SyllabiIngestResult,
} from "@/lib/course-meta";
import { defaultTermCode, inProgressTermCode } from "@/lib/courses/term-picks";
import { defaultJobsGoSolarOptions } from "./gosolar-options";
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

/** The catalog route runs for at most a minute; a run left unfinished by a crash stops blocking after this. */
const CATALOG_STALE_MS = 2 * 60_000;

export interface CatalogJobSummary extends Record<string, unknown> {
  terms: CatalogTermResult[];
  /** The time budget ran out with a pass still unfinished; the next run resumes it. */
  outOfTime: boolean;
  errors: string[];
}

export interface CatalogJobOptions {
  budgetMs?: number;
  /** Only these subjects (manual runs). */
  subjects?: string[];
  force?: boolean;
}

/**
 * Refreshes `catalog_courses` for the registrable terms (list_terms' default, then the term in
 * progress), resuming each term's pass where the last run stopped (src/lib/course-meta/catalog.ts).
 * pg_cron calls it several times in a row off-peak; runs after a term's daily pass is done only
 * read its progress row.
 */
export function runCatalogJob(options: CatalogJobOptions = {}): Promise<JobOutcome<CatalogJobSummary>> {
  return withJobRun(
    "catalog",
    async () => {
      const cached = await getTermsCached(24 * 60);
      const terms = [...new Set([defaultTermCode(cached), inProgressTermCode(cached)].filter((code): code is string => !!code))];
      const result = await refreshCatalog({ terms, gosolar: defaultJobsGoSolarOptions(), ...options });
      const errors = result.terms.filter((t) => t.error).map((t) => `${t.term}: ${t.error}`);
      return { ok: errors.length === 0, summary: { terms: result.terms, outOfTime: result.outOfTime, errors } };
    },
    { staleAfterMs: CATALOG_STALE_MS },
  );
}
