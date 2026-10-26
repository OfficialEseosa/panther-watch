import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import type { JobRun } from "@/db/schema";
import { gradeTerms } from "@/db/schema/course-meta";
import {
  gradeCsvKind,
  ingestNextTerm,
  isTermPosted,
  listIngestedTerms,
  markTermUnposted,
  parseTerm,
  upsertTerm,
  type IngestResult,
} from "@/lib/course-meta";
import { InvalidInputError } from "./errors";
import { DEFAULT_STALE_AFTER_MS, errorMessage, finishJobRun, recentRuns, startJobRun } from "@/lib/jobs/runs";

/** `job_runs.job` for grade-distribution ingests (cron and admin-triggered alike). */
export const GRADES_JOB = "grades";

export interface GradeStatus {
  /** Stored (posted) grade terms, newest first. */
  terms: string[];
  lastRun: JobRun | null;
  /** The last run has not finished and is not yet stale. */
  running: boolean;
}

export async function getGradeStatus(now: Date = new Date()): Promise<GradeStatus> {
  const [terms, runs] = await Promise.all([listIngestedTerms(), recentRuns(GRADES_JOB, 1)]);
  const lastRun = runs[0] ?? null;
  const running =
    lastRun !== null &&
    lastRun.finishedAt === null &&
    now.getTime() - lastRun.startedAt.getTime() < DEFAULT_STALE_AFTER_MS;
  return { terms, lastRun, running };
}

export interface GradeRefresh {
  runId: number;
  /** Ingests one term and finishes the job run. Rethrows ingest failures after recording them. */
  run: () => Promise<IngestResult>;
}

/**
 * Claims the `grades` job-run lock (shared with the grades cron, so an admin refresh never
 * overlaps it) and returns the work to run, or null when a grades run is already active.
 * The lock is taken up front so the route can answer 409 instead of a 202 that does nothing.
 */
export async function startGradeRefresh(): Promise<GradeRefresh | null> {
  const claimed = await startJobRun(GRADES_JOB);
  if (!claimed) return null;
  return {
    runId: claimed.id,
    run: async () => {
      try {
        const result = await ingestNextTerm();
        await finishJobRun(claimed.id, true, { trigger: "admin", ...result });
        return result;
      } catch (error) {
        await finishJobRun(claimed.id, false, { trigger: "admin", fatal: errorMessage(error) }).catch(() => {});
        throw error;
      }
    },
  };
}

// ---------------------------------------------------------------------------------------------
// Manual upload (the primary path: APEX sits behind a Cloudflare JS challenge, so the
// automated refresh above fails from servers; an admin downloads the two CSV exports in a
// browser and uploads them here)
// ---------------------------------------------------------------------------------------------

export const TERM_CODE = /^\d{6}$/;

export interface GradeUpload {
  term: string;
  /** APEX "summary" export (CRN, Course, Professor, A (90-100) ... CRS AVG, Total). */
  summaryCsv: string;
  /** APEX "detailed" export (CRN, A+, A, A-, ... Total). */
  detailedCsv: string;
}

export interface GradeUploadResult {
  term: string;
  /** Sections stored (0 when not posted). */
  rows: number;
  /** False when no section has a CRS AVG yet: nothing stored, the term is marked unposted. */
  posted: boolean;
}

function checkExport(field: "summary" | "detailed", csv: string): void {
  const kind = gradeCsvKind(csv);
  if (kind === field) return;
  if (kind !== null) {
    throw new InvalidInputError(`${field}: this is the ${kind} export; the files look swapped`);
  }
  throw new InvalidInputError(
    field === "summary"
      ? "summary: not an APEX grade summary CSV (header must start with CRN and include Course and CRS AVG)"
      : "detailed: not an APEX detailed grade CSV (header must start with CRN and include A+)",
  );
}

/**
 * Validates, parses and stores one term from the two APEX exports. Replaces the term's rows if
 * it was stored before. Throws `InvalidInputError` (400) naming the bad file and why.
 */
export async function uploadGradeTerm({ term, summaryCsv, detailedCsv }: GradeUpload): Promise<GradeUploadResult> {
  if (!TERM_CODE.test(term)) throw new InvalidInputError("term: must be a 6-digit term code like 202601");
  checkExport("summary", summaryCsv);
  checkExport("detailed", detailedCsv);

  const rows = parseTerm(summaryCsv, detailedCsv, term);
  if (rows.length === 0) throw new InvalidInputError("summary: no section rows (CRN with 4+ digits) found");

  if (!isTermPosted(rows)) {
    await markTermUnposted(term);
    return { term, rows: 0, posted: false };
  }
  return { term, rows: await upsertTerm(term, rows), posted: true };
}

/** Removes a term and (by cascade) its section grades. Returns false when it was not stored. */
export async function deleteGradeTerm(term: string): Promise<boolean> {
  if (!TERM_CODE.test(term)) return false;
  const rows = await getDb()
    .delete(gradeTerms)
    .where(eq(gradeTerms.term, term))
    .returning({ term: gradeTerms.term });
  return rows.length > 0;
}
