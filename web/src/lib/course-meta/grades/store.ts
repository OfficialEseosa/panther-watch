import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import type { AnyPgColumn } from "drizzle-orm/pg-core";
import { gradeTerms, sectionGrades } from "@/db/schema/course-meta";
import { resolveDb, type DbOptions } from "../db";
import { professorKey } from "../names";
import { isTermPosted, round1, type SectionGradeRow } from "./parse";
import type { GradeAggregate, GradeDistributionResponse, GradeKey } from "./types";

/** How many recent terms with posted grades to keep ingested and aggregate over (~3 years). */
export const DEFAULT_TERM_WINDOW = 8;
/** A term found without posted grades is re-checked after this long. */
export const UNPOSTED_RECHECK_MS = 7 * 24 * 60 * 60 * 1000;

// ~29 bind parameters per row; Postgres caps a statement at 65535.
const INSERT_CHUNK = 1000;

const TERM_RE = /^\d{6}$/;

function assertTerm(term: string): void {
  if (!TERM_RE.test(term)) throw new Error(`Invalid term code: ${term}`);
}

// ------------------------------------------------------------------------- writes

/**
 * Replaces one term's sections (delete + insert) in a single transaction and marks the term
 * posted. Refuses rows without posted grades so a premature download can never mark a term
 * as done. Returns the number of rows stored.
 */
export async function upsertTerm(
  term: string,
  rows: readonly SectionGradeRow[],
  options: DbOptions = {},
): Promise<number> {
  assertTerm(term);
  if (!isTermPosted(rows)) throw new Error(`Term ${term} has no posted grades; refusing to store it`);
  if (rows.some((row) => row.term !== term)) throw new Error(`Rows for another term passed to upsertTerm(${term})`);

  const db = await resolveDb(options.db);
  await db.transaction(async (tx) => {
    // Serialize concurrent ingests of the same term (overlapping cron runs).
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`grade_terms:${term}`}))`);
    await tx
      .insert(gradeTerms)
      .values({ term, posted: true, fetchedAt: new Date() })
      .onConflictDoUpdate({ target: gradeTerms.term, set: { posted: true, fetchedAt: new Date() } });
    await tx.delete(sectionGrades).where(eq(sectionGrades.term, term));
    for (let i = 0; i < rows.length; i += INSERT_CHUNK) {
      await tx.insert(sectionGrades).values(rows.slice(i, i + INSERT_CHUNK).map((row) => ({ ...row })));
    }
  });
  return rows.length;
}

/** Records that `term` was checked and has no posted grades yet (does not touch posted terms). */
export async function markTermUnposted(term: string, options: DbOptions = {}): Promise<void> {
  assertTerm(term);
  const db = await resolveDb(options.db);
  await db
    .insert(gradeTerms)
    .values({ term, posted: false, fetchedAt: new Date() })
    .onConflictDoUpdate({
      target: gradeTerms.term,
      set: { fetchedAt: new Date() },
      setWhere: eq(gradeTerms.posted, false),
    });
}

// -------------------------------------------------------------------------- reads

/** Terms whose grades are stored, newest first. */
export async function listIngestedTerms(options: DbOptions = {}): Promise<string[]> {
  const db = await resolveDb(options.db);
  const rows = await db
    .select({ term: gradeTerms.term })
    .from(gradeTerms)
    .where(eq(gradeTerms.posted, true))
    .orderBy(desc(gradeTerms.term));
  return rows.map((row) => row.term);
}

export interface TermCheck {
  posted: boolean;
  fetchedAt: Date;
}

/**
 * Pure core of `pickNextTermToIngest`. Walks `available` newest first and returns the
 * first term that still needs a download, or null once `window` posted terms are stored.
 *
 * Fixes the Java bug (audit section 6) where upcoming terms without posted grades sat in
 * the 8-term window and pushed real terms out: here only stored (posted) terms consume a
 * window slot. A term recently found unposted is skipped until `recheckAfterMs` has passed,
 * so one ingest per call still makes progress through older terms.
 */
export function chooseNextTerm(
  available: readonly string[],
  checked: ReadonlyMap<string, TermCheck>,
  window: number,
  now: Date,
  recheckAfterMs: number = UNPOSTED_RECHECK_MS,
): string | null {
  const terms = [...new Set(available.filter((term) => TERM_RE.test(term)))].sort().reverse();
  let filled = 0;
  for (const term of terms) {
    if (filled >= window) break;
    const check = checked.get(term);
    if (check?.posted) {
      filled++;
      continue;
    }
    if (check && now.getTime() - check.fetchedAt.getTime() < recheckAfterMs) continue;
    return term;
  }
  return null;
}

export interface PickOptions extends DbOptions {
  now?: Date;
  recheckAfterMs?: number;
}

/** The next APEX term to download, or null when the newest `window` posted terms are all stored. */
export async function pickNextTermToIngest(
  available: readonly string[],
  window: number = DEFAULT_TERM_WINDOW,
  options: PickOptions = {},
): Promise<string | null> {
  const db = await resolveDb(options.db);
  const rows = await db
    .select({ term: gradeTerms.term, posted: gradeTerms.posted, fetchedAt: gradeTerms.fetchedAt })
    .from(gradeTerms);
  const checked = new Map(rows.map((row) => [row.term, { posted: row.posted, fetchedAt: row.fetchedAt }]));
  return chooseNextTerm(available, checked, window, options.now ?? new Date(), options.recheckAfterMs);
}

export interface CourseGradesQuery {
  subject: string;
  courseNumber: string;
  /** Any spelling ("Nemira, Alina (Alina) ", "Alina Nemira"); matched by professor key. */
  instructor?: string | null;
  /** Aggregate over the newest N stored terms. */
  window?: number;
}

/**
 * Grade distribution for one course: overall + per professor (GROUP BY GROUPING SETS
 * ((professor_key), ())), over the newest `window` stored terms.
 */
export async function getCourseGrades(
  query: CourseGradesQuery,
  options: DbOptions = {},
): Promise<GradeDistributionResponse> {
  const subject = query.subject.trim().toUpperCase();
  const courseNumber = query.courseNumber.trim();
  const instructor = query.instructor ?? null;
  const window = query.window ?? DEFAULT_TERM_WINDOW;
  const db = await resolveDb(options.db);

  const s = sectionGrades;
  const sumInt = (column: AnyPgColumn) => sql<number>`coalesce(sum(${column}), 0)::int`;
  const gpaRated = sql`${s.gpa} is not null and ${s.total} > 0`;
  const windowTerms = db
    .select({ term: gradeTerms.term })
    .from(gradeTerms)
    .where(eq(gradeTerms.posted, true))
    .orderBy(desc(gradeTerms.term))
    .limit(window);

  const rows = await db
    .select({
      isOverall: sql<number>`grouping(${s.professorKey})::int`,
      professorKey: s.professorKey,
      professor: sql<string | null>`(array_agg(${s.professor} order by ${s.term} desc, ${s.crn}))[1]`,
      aPlus: sumInt(s.aPlus),
      aFlat: sumInt(s.aFlat),
      aMinus: sumInt(s.aMinus),
      bPlus: sumInt(s.bPlus),
      bFlat: sumInt(s.bFlat),
      bMinus: sumInt(s.bMinus),
      cPlus: sumInt(s.cPlus),
      cFlat: sumInt(s.cFlat),
      cMinus: sumInt(s.cMinus),
      gradeD: sumInt(s.gradeD),
      gradeF: sumInt(s.gradeF),
      wf: sumInt(s.wf),
      total: sumInt(s.total),
      withdrawCount: sumInt(s.withdrawCount),
      sectionsCount: sql<number>`count(*)::int`,
      gpa: sql<number | null>`round(
        (sum(${s.gpa} * ${s.total}) filter (where ${gpaRated}))
          / nullif(sum(${s.total}) filter (where ${gpaRated}), 0),
        2)::float8`,
      terms: sql<string | null>`string_agg(distinct ${s.term}::text, ',' order by ${s.term}::text desc)`,
    })
    .from(s)
    .where(and(eq(s.subject, subject), eq(s.courseNumber, courseNumber), inArray(s.term, windowTerms)))
    .groupBy(sql`grouping sets ((${s.professorKey}), ())`)
    .orderBy(asc(sql`grouping(${s.professorKey})`));

  type Row = (typeof rows)[number];
  const toAggregate = (row: Row, professor: string | null): GradeAggregate => {
    // Literal order is GRADE_KEYS order (A+ .. C-, D, F, WF).
    const gradeCounts: Record<GradeKey, number> = {
      "A+": row.aPlus,
      A: row.aFlat,
      "A-": row.aMinus,
      "B+": row.bPlus,
      B: row.bFlat,
      "B-": row.bMinus,
      "C+": row.cPlus,
      C: row.cFlat,
      "C-": row.cMinus,
      D: row.gradeD,
      F: row.gradeF,
      WF: row.wf,
    };
    const dwf = row.gradeD + row.gradeF + row.wf + row.withdrawCount;
    return {
      professor,
      gpa: row.gpa === null ? null : Number(row.gpa),
      dwfPercent: row.total > 0 ? round1((100 * dwf) / row.total) : null,
      total: row.total,
      withdrawCount: row.withdrawCount,
      sectionsCount: row.sectionsCount,
      termsTaught: row.terms ? row.terms.split(",") : [],
      gradeCounts,
    };
  };

  const overallRow = rows.find((row) => row.isOverall === 1);
  if (!overallRow || overallRow.sectionsCount === 0) {
    return {
      subject,
      courseNumber,
      hasData: false,
      termsIncluded: [],
      overall: null,
      professors: [],
      instructorQueried: instructor,
      instructorHasTaught: false,
      instructorDistribution: null,
    };
  }

  const professorRows = rows.filter((row) => row.isOverall === 0);
  const professors = professorRows
    .map((row) => ({ key: row.professorKey, aggregate: toAggregate(row, row.professor) }))
    .sort(
      (a, b) =>
        b.aggregate.total - a.aggregate.total ||
        (a.aggregate.professor ?? "").localeCompare(b.aggregate.professor ?? ""),
    );

  const wanted = instructor?.trim() ? professorKey(instructor) : null;
  const matched = wanted ? (professors.find((p) => p.key === wanted)?.aggregate ?? null) : null;
  const overall = toAggregate(overallRow, null);

  return {
    subject,
    courseNumber,
    hasData: true,
    termsIncluded: overall.termsTaught,
    overall,
    professors: professors.map((p) => p.aggregate),
    instructorQueried: instructor,
    instructorHasTaught: matched !== null,
    instructorDistribution: matched,
  };
}
