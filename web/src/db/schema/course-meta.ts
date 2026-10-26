/**
 * Course metadata that PantherWatch scrapes from public GSU / third-party sources: grade
 * distributions (GSU APEX), syllabus PDFs (GSU syllabi CDN) and RateMyProfessors lookups.
 * Unlike `core`, these tables are new (the Spring backend kept this data in memory or on
 * local disk), so they use clean types: timestamptz everywhere, DB-level defaults.
 *
 * Proposed in docs/audit-2026-10/02-backend-audit.md section 4. Code in
 * src/lib/course-meta imports these tables from this module directly.
 */
import {
  boolean,
  char,
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

export type GradeTerm = typeof gradeTerms.$inferSelect;
export type SectionGrade = typeof sectionGrades.$inferSelect;
export type NewSectionGrade = typeof sectionGrades.$inferInsert;
export type Syllabus = typeof syllabi.$inferSelect;
export type RmpCacheEntry = typeof rmpCache.$inferSelect;
