import type { DbOptions } from "../db";
import { createApexSession, downloadTermCsvs, type ApexOptions } from "./apex";
import { isTermPosted, looksLikeGradeCsv, parseTerm } from "./parse";
import {
  DEFAULT_TERM_WINDOW,
  markTermUnposted,
  pickNextTermToIngest,
  upsertTerm,
  type PickOptions,
} from "./store";

export interface IngestOptions extends ApexOptions, DbOptions {
  window?: number;
  now?: Date;
  recheckAfterMs?: number;
}

export type IngestResult =
  | { term: string; rows: number; posted: true }
  /** Downloaded, but no section has a CRS AVG yet; re-checked after the recheck interval. */
  | { term: string; rows: 0; posted: false }
  | { done: true };

/**
 * Ingests exactly one APEX term per call (fits a serverless function budget: one session,
 * three requests, one transaction). Call repeatedly (e.g. a daily cron) until `{ done: true }`.
 */
export async function ingestNextTerm(options: IngestOptions = {}): Promise<IngestResult> {
  const pickOptions: PickOptions = { db: options.db, now: options.now, recheckAfterMs: options.recheckAfterMs };
  const session = await createApexSession(options);
  try {
    const term = await pickNextTermToIngest(session.terms, options.window ?? DEFAULT_TERM_WINDOW, pickOptions);
    if (!term) return { done: true };

    const { summaryCsv, detailedCsv } = await downloadTermCsvs(session, term);
    if (!looksLikeGradeCsv(summaryCsv) || !looksLikeGradeCsv(detailedCsv)) {
      throw new Error(`APEX export for term ${term} is not a grade CSV`);
    }

    const rows = parseTerm(summaryCsv, detailedCsv, term);
    if (!isTermPosted(rows)) {
      await markTermUnposted(term, { db: options.db });
      return { term, rows: 0, posted: false };
    }
    const stored = await upsertTerm(term, rows, { db: options.db });
    return { term, rows: stored, posted: true };
  } finally {
    await session.close();
  }
}
