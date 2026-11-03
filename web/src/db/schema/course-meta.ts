/**
 * Course metadata that PantherWatch scrapes from public GSU / third-party sources: grade
 * distributions (GSU APEX), syllabus PDFs (GSU syllabi CDN), RateMyProfessors lookups and the
 * GoSolar course catalog.
 * Unlike `core`, these tables are new (the Spring backend kept this data in memory or on
 * local disk), so they use clean types: timestamptz everywhere, DB-level defaults.
 *
 * Proposed in docs/audit-2026-10/02-backend-audit.md section 4. Code in
 * src/lib/course-meta imports these tables from this module directly.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
} from "drizzle-orm/pg-core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

/**
 * One row per term the APEX ingester has looked at. `posted = true` means the term's
 * grades are stored in `section_grades` (posted grades are immutable, so it is never
 * re-downloaded). `posted = false` records a check that found no posted grades yet, so the
 * ingester can skip that term until it is due for a re-check instead of retrying it on
 * every run.
 */
export const gradeTerms = pgTable("grade_terms", {
  term: char("term", { length: 6 }).primaryKey(),
  posted: boolean("posted").notNull().default(true),
  fetchedAt: timestamptz("fetched_at").notNull().defaultNow(),
});

/** One row per section (term + CRN): APEX summary + detailed CSVs merged by CRN. */
export const sectionGrades = pgTable(
  "section_grades",
  {
    term: char("term", { length: 6 })
      .notNull()
      .references(() => gradeTerms.term, { onDelete: "cascade" }),
    crn: text("crn").notNull(),
    subject: text("subject").notNull(),
    courseNumber: text("course_number").notNull(),
    section: text("section").notNull().default(""),
    /** Display name as APEX prints it, e.g. "Nemira, Alina". */
    professor: text("professor"),
    /** `last|first` from names.ts; null when the section has no named professor. */
    professorKey: text("professor_key"),
    instructionMethod: text("instruction_method"),
    // Coarse buckets from the summary CSV.
    gradeA: integer("grade_a").notNull().default(0),
    gradeB: integer("grade_b").notNull().default(0),
    gradeC: integer("grade_c").notNull().default(0),
    gradeD: integer("grade_d").notNull().default(0),
    gradeF: integer("grade_f").notNull().default(0),
    // Fine +/- grades from the detailed CSV.
    aPlus: integer("a_plus").notNull().default(0),
    aFlat: integer("a_flat").notNull().default(0),
    aMinus: integer("a_minus").notNull().default(0),
    bPlus: integer("b_plus").notNull().default(0),
    bFlat: integer("b_flat").notNull().default(0),
    bMinus: integer("b_minus").notNull().default(0),
    cPlus: integer("c_plus").notNull().default(0),
    cFlat: integer("c_flat").notNull().default(0),
    cMinus: integer("c_minus").notNull().default(0),
    wf: integer("wf").notNull().default(0),
    withdrawCount: integer("withdraw_count").notNull().default(0),
    otherCount: integer("other_count").notNull().default(0),
    total: integer("total").notNull().default(0),
    /** APEX "CRS AVG"; null until grades post (or for sections with no graded students). */
    gpa: numeric("gpa", { precision: 4, scale: 2, mode: "number" }),
  },
  (table) => [
    primaryKey({ columns: [table.term, table.crn] }),
    index("section_grades_course_idx").on(table.subject, table.courseNumber),
    index("section_grades_professor_key_idx").on(table.professorKey),
  ],
);

/** Syllabus PDF path per section, from cdn.gsu.edu/static/syllabi-public/{term}.json. */
export const syllabi = pgTable(
  "syllabi",
  {
    term: char("term", { length: 6 }).notNull(),
    crn: text("crn").notNull(),
    /** Relative to https://cdn.gsu.edu/static/syllabi-public/files/ */
    path: text("path").notNull(),
    fetchedAt: timestamptz("fetched_at").notNull().defaultNow(),
  },
  (table) => [primaryKey({ columns: [table.term, table.crn] })],
);

/**
 * RateMyProfessors lookups keyed by `rmp:{last|first}`. A null payload is a cached miss
 * (RMP answered, nobody matched), which expires sooner than a hit.
 */
export const rmpCache = pgTable("rmp_cache", {
  queryKey: text("query_key").primaryKey(),
  payload: jsonb("payload"),
  fetchedAt: timestamptz("fetched_at").notNull().defaultNow(),
});

/**
 * Claude-written summaries of syllabus PDFs (src/lib/course-meta/syllabus-summary.ts), keyed by
 * the PDF's public URL. `text_sha256` is the hash of the text extracted from the PDF when it was
 * summarized: every lookup re-reads the PDF and reuses the summary only while the hash matches.
 * `status = 'unavailable'` records a PDF that can't be summarized (no text, not a PDF, the
 * model declined) so it isn't paid for again until the text changes; transient failures (fetch
 * errors, budget, no API key) are never stored. Cost columns are the latest generation's, in
 * micro-dollars (the spend itself is added to `assistant_daily`).
 */
export const syllabusSummaries = pgTable(
  "syllabus_summaries",
  {
    url: text("url").primaryKey(),
    status: text("status").notNull(),
    textSha256: text("text_sha256"),
    summary: jsonb("summary"),
    error: text("error"),
    model: text("model"),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    costMicroUsd: bigint("cost_micro_usd", { mode: "number" }).notNull().default(0),
    /** When this text version was first seen (reset when the text changes). */
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    /** When `summary` was generated; null for unavailable rows the model never saw. */
    summarizedAt: timestamptz("summarized_at"),
    /** Last time the live PDF was read and matched `text_sha256`. */
    checkedAt: timestamptz("checked_at").notNull().defaultNow(),
  },
  (table) => [check("syllabus_summaries_status_check", sql`${table.status} IN ('ok', 'unavailable')`)],
);

/**
 * GSU's course catalog (not sections): one row per subject + course number, from GoSolar's
 * "Browse Course Catalog" search (src/lib/course-meta/catalog.ts), refreshed nightly for the
 * registrable terms. It lets the assistant map a course name ("calculus 2") to a code
 * (MATH 2212) without guessing (src/lib/course-meta/catalog-lookup.ts).
 *
 * - `title` is the catalog's full title (the first line of Banner's description), e.g.
 *   "Calculus of One Variable II"; Banner's own `courseTitle` is abbreviated ("CALCULUS OF ONE
 *   VARIABLE II", "PRINCIPLES OF COMPUTER SCI I") and is only the fallback.
 * - `level` is derived, not Banner's: Banner gives a course a SET of levels (most 6000-9000
 *   courses are open to US as well as GS) and no single "home" level. LW for the LAW subject,
 *   GS for course numbers 5000 and up, UA for courses owned by Perimeter College (college
 *   code PC), else US. A code is unique within a subject, so level is not part of the key.
 * - `first_seen_term` / `last_seen_term`: the oldest and newest refreshed term that listed it.
 */
export const catalogCourses = pgTable(
  "catalog_courses",
  {
    subject: text("subject").notNull(),
    courseNumber: text("course_number").notNull(),
    title: text("title").notNull(),
    description: text("description"),
    /** "3", "1-6" (Banner "TO"), "3 or 4" (Banner "OR"); null when Banner gives none. */
    credits: text("credits"),
    level: text("level"),
    source: text("source").notNull().default("gosolar"),
    firstSeenTerm: char("first_seen_term", { length: 6 }).notNull(),
    lastSeenTerm: char("last_seen_term", { length: 6 }).notNull(),
    updatedAt: timestamptz("updated_at").notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.subject, table.courseNumber] }),
    check("catalog_courses_level_check", sql`${table.level} IN ('US', 'UA', 'GS', 'LW')`),
  ],
);

/**
 * Progress of the catalog refresh, one row per term, so a run cut short by the function time
 * limit resumes where it stopped. Subjects are processed in code order; `cursor` is the last
 * subject stored in the current pass (null: the pass starts from the first subject).
 * `pass_finished_at` is set when a pass reaches the last subject; the next pass starts once it
 * is older than the job's re-run interval (a day).
 */
export const catalogRefresh = pgTable("catalog_refresh", {
  term: char("term", { length: 6 }).primaryKey(),
  cursor: text("cursor"),
  passStartedAt: timestamptz("pass_started_at"),
  passFinishedAt: timestamptz("pass_finished_at"),
  /** Courses stored so far in the current (or last finished) pass. */
  coursesSeen: integer("courses_seen").notNull().default(0),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

export type GradeTerm = typeof gradeTerms.$inferSelect;
export type SectionGrade = typeof sectionGrades.$inferSelect;
export type NewSectionGrade = typeof sectionGrades.$inferInsert;
export type Syllabus = typeof syllabi.$inferSelect;
export type RmpCacheEntry = typeof rmpCache.$inferSelect;
export type SyllabusSummaryRow = typeof syllabusSummaries.$inferSelect;
export type CatalogCourseRow = typeof catalogCourses.$inferSelect;
export type CatalogRefreshRow = typeof catalogRefresh.$inferSelect;
