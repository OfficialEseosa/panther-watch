import { asc, eq, sql } from "drizzle-orm";
import { catalogCourses, catalogRefresh, type CatalogRefreshRow } from "@/db/schema/course-meta";
import {
  createGoSolarSession,
  getCatalogSubjects,
  type CatalogCourseData,
  type GoSolarOptions,
} from "@/lib/gosolar";
import { resolveDb, type CourseMetaDb, type DbOptions } from "./db";

/**
 * GSU's course catalog from GoSolar's "Browse Course Catalog" search, the same Banner SSB behind
 * src/lib/gosolar: catalog courses (not sections) with the catalog description, for every
 * subject and level. Stored in `catalog_courses` for the assistant's name -> code lookup
 * (catalog-lookup.ts).
 *
 * Why GoSolar and not catalogs.gsu.edu (Acalog): GoSolar answers one search for many subjects
 * at once, 500 courses a page with descriptions inline (about 1.5 s a page, live 2026-11-02),
 * and lists exactly what the registration system knows. catalogs.gsu.edu's robots.txt asks every
 * crawler for a 120 s crawl delay and disallows /ajax/ (the per-course preview), which would turn
 * a nightly refresh of thousands of courses into hours.
 *
 * How a refresh runs (resumable, because a cron function has a time limit):
 * - per term (the registrable terms: the default and the one in progress), subjects in code
 *   order, SUBJECTS_PER_SESSION at a time: one GoSolar session per batch (`mode=courseSearch`;
 *   Banner keeps a session's first catalog search, see GoSolarSession.searchCatalog), every page
 *   of that one search, then one transaction that upserts the courses and moves `cursor` in
 *   `catalog_refresh` past the batch;
 * - a new batch only starts while the time budget has BATCH_RESERVE_MS left, so the next run
 *   resumes after the last stored batch;
 * - once the last subject is stored the pass is finished, and the term is skipped until the
 *   pass is PASS_INTERVAL_MS old (one pass a day). A failed batch stops that term for the run
 *   without moving the cursor; the next run retries it.
 */

export const SUBJECTS_PER_SESSION = 20;
const PAGE_SIZE = 500;
/** 20 subjects never come near this; it only stops a misbehaving pager. */
const MAX_PAGES = 20;
const UPSERT_BATCH = 500;
/** Work per run: well inside a 60 s function. */
export const DEFAULT_BUDGET_MS = 45_000;
/** A batch (session + its pages + the upsert) can take ~10 s on a slow GoSolar day. */
export const BATCH_RESERVE_MS = 12_000;
/** A finished pass is good for this long; the daily cron starts the next one after it. */
export const PASS_INTERVAL_MS = 20 * 60 * 60_000;

export type CatalogLevel = "US" | "UA" | "GS" | "LW";
export const CATALOG_LEVELS = ["US", "UA", "GS", "LW"] as const satisfies readonly CatalogLevel[];

// ------------------------------------------------------------------------------- parsing

export interface ParsedCatalogCourse {
  subject: string;
  courseNumber: string;
  title: string;
  description: string | null;
  credits: string | null;
  level: CatalogLevel | null;
}

const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "of", "on", "or", "the", "to", "with"]);
const ROMAN = /^(i|ii|iii|iv|v|vi)$/i;

/** "PRINCIPLES OF COMPUTER SCI I" -> "Principles of Computer Sci I" (only for the fallback title). */
function titleCase(text: string): string {
  if (text !== text.toUpperCase()) return text;
  return text
    .toLowerCase()
    .split(/\s+/)
    .map((word, i) => {
      if (ROMAN.test(word)) return word.toUpperCase();
      if (i > 0 && SMALL_WORDS.has(word)) return word;
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(" ");
}

/** Lines of a catalog text, trimmed, single-spaced, blank ones dropped. */
function cleanLines(text: string): string[] {
  return text
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[ \t ]+/g, " ").trim())
    .filter(Boolean);
}

/** A first line that is a title rather than a sentence of the description. */
function looksLikeTitle(line: string): boolean {
  if (line.length < 2 || line.length > 120) return false;
  if (/^(pre-?requisites?|co-?requisites?|prereq|this course|students)\b/i.test(line)) return false;
  if (line.split(/\s+/).length > 16) return false;
  // Two sentences ("Foo. This course ...") are description text.
  return !/[a-z]{2}\.\s+[A-Z]/.test(line);
}

/**
 * Splits Banner's `courseDescription` into the full title (its first line, e.g. "Calculus of One
 * Variable II.", sometimes "MATH 0996: Support for Elementary Statistics.") and the rest.
 */
export function splitCatalogDescription(text: string | null | undefined): { title: string | null; description: string | null } {
  const lines = cleanLines(text ?? "");
  if (lines.length === 0) return { title: null, description: null };
  const first = lines[0].replace(/^[A-Z]{2,5}\s*\d{4}[A-Z]?\s*[:.-]\s*/i, "");
  if (!looksLikeTitle(first)) return { title: null, description: lines.join("\n") };
  const title = first.replace(/[\s.]+$/, "").trim();
  const rest = lines.slice(1).join("\n");
  return { title: title || null, description: rest || null };
}

const formatNumber = (value: number): string => String(Math.round(value * 100) / 100);

/** Banner credit hours as text: 3 -> "3", TO 1..6 -> "1-6", OR 3..4 -> "3 or 4". */
export function formatCredits(low: number | null | undefined, high: number | null | undefined, indicator: string | null | undefined): string | null {
  if (typeof low !== "number" || !Number.isFinite(low)) return typeof high === "number" ? formatNumber(high) : null;
  if (typeof high === "number" && Number.isFinite(high) && high !== low) {
    const kind = (indicator ?? "").trim().toUpperCase();
    if (kind === "OR") return `${formatNumber(low)} or ${formatNumber(high)}`;
    return `${formatNumber(low)}-${formatNumber(high)}`;
  }
  return formatNumber(low);
}

/**
 * PantherWatch's single level for a course (see `catalog_courses`): LW for LAW, GS from course
 * number 5000, UA for courses Perimeter College owns (college code PC), else US.
 */
export function catalogLevel(subject: string, courseNumber: string, collegeCode?: string | null): CatalogLevel | null {
  if (subject === "LAW") return "LW";
  const digits = /^(\d{4})/.exec(courseNumber)?.[1];
  if (!digits) return null;
  if (Number(digits) >= 5000) return "GS";
  if ((collegeCode ?? "").trim().toUpperCase() === "PC") return "UA";
  return "US";
}

const SUBJECT_PATTERN = /^[A-Z][A-Z0-9]{1,5}$/;
const COURSE_NUMBER_PATTERN = /^[0-9A-Z]{1,8}$/;

/** One GoSolar catalog course as a `catalog_courses` row; null when it has no usable code. */
export function parseCatalogCourse(raw: CatalogCourseData): ParsedCatalogCourse | null {
  const subject = (raw.subjectCode ?? raw.subject ?? "").trim().toUpperCase();
  const courseNumber = (raw.courseNumber ?? "").trim().toUpperCase();
  if (!SUBJECT_PATTERN.test(subject) || !COURSE_NUMBER_PATTERN.test(courseNumber)) return null;
  const split = splitCatalogDescription(raw.courseDescription);
  const fallback = titleCase((raw.courseTitle ?? "").replace(/\s+/g, " ").trim());
  const title = split.title ?? fallback;
  if (!title) return null;
  return {
    subject,
    courseNumber,
    title,
    description: split.description,
    credits: formatCredits(raw.creditHourLow, raw.creditHourHigh, raw.creditHourIndicator),
    level: catalogLevel(subject, courseNumber, raw.collegeCode),
  };
}

// ------------------------------------------------------------------------------- refresh

export interface RefreshCatalogOptions extends DbOptions {
  /** Terms to refresh, in order. */
  terms: string[];
  gosolar?: GoSolarOptions;
  /** Stop starting new batches once less than BATCH_RESERVE_MS of this is left. */
  budgetMs?: number;
  /** Only these subjects (instead of GoSolar's catalog subject list). */
  subjects?: string[];
  subjectsPerSession?: number;
  /** Start a new pass even when the last one finished less than PASS_INTERVAL_MS ago. */
  force?: boolean;
  /** Clock (ms), injectable for tests. */
  now?: () => number;
}

export interface CatalogTermResult {
  term: string;
  /** done_recently: skipped, the last pass is fresh; finished: this run completed the pass; partial: out of time or failed. */
  status: "done_recently" | "finished" | "partial";
  /** Subjects (and courses) stored by this run. */
  subjects: number;
  courses: number;
  /** Subjects in GoSolar's list for the term (0 when skipped). */
  subjectsTotal: number;
  /** Last subject stored in the pass so far (null when finished or not started). */
  cursor: string | null;
  error?: string;
}

export interface RefreshCatalogResult {
  terms: CatalogTermResult[];
  /** The budget ran out before every term's pass was finished. */
  outOfTime: boolean;
}

const short = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String(error);
  return message.length > 200 ? `${message.slice(0, 197)}...` : message;
};

/** Subject codes for `term`, sorted and de-duplicated. An empty list is a GoSolar hiccup: thrown. */
async function subjectList(term: string, options: RefreshCatalogOptions): Promise<string[]> {
  const raw = options.subjects ?? (await getCatalogSubjects(term, options.gosolar)).map((s) => s.code);
  const codes = [...new Set(raw.map((code) => (code ?? "").trim().toUpperCase()).filter((code) => SUBJECT_PATTERN.test(code)))].sort();
  if (codes.length === 0) throw new Error(`GoSolar listed no catalog subjects for ${term}`);
  return codes;
}

/** Every course of `subjects` in `term`: one session, every page of one search. */
async function fetchBatch(term: string, subjects: string[], gosolar: GoSolarOptions | undefined): Promise<ParsedCatalogCourse[]> {
  const session = await createGoSolarSession(term, gosolar, { mode: "courseSearch" });
  try {
    const raw: CatalogCourseData[] = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const result = await session.searchCatalog({ subjects, pageOffset: page * PAGE_SIZE, pageMaxSize: PAGE_SIZE });
      raw.push(...result.data);
      if (result.data.length < PAGE_SIZE || raw.length >= result.totalCount) break;
    }
    const wanted = new Set(subjects);
    const byCode = new Map<string, ParsedCatalogCourse>();
    for (const course of raw) {
      const parsed = parseCatalogCourse(course);
      if (parsed && wanted.has(parsed.subject)) byCode.set(`${parsed.subject} ${parsed.courseNumber}`, parsed);
    }
    return [...byCode.values()];
  } finally {
    await session.close();
  }
}

/** Upserts one batch and moves the term's cursor, in one transaction. */
async function storeBatch(db: CourseMetaDb, term: string, courses: ParsedCatalogCourse[], cursor: string): Promise<void> {
  // The newer term's text wins; first/last seen widen.
  const newer = sql`excluded.last_seen_term >= ${catalogCourses.lastSeenTerm}`;
  const pick = (column: string, current: unknown) => sql`CASE WHEN ${newer} THEN ${sql.raw(`excluded.${column}`)} ELSE ${current} END`;
  await db.transaction(async (tx) => {
    for (let i = 0; i < courses.length; i += UPSERT_BATCH) {
      const rows = courses.slice(i, i + UPSERT_BATCH).map((course) => ({
        ...course,
        source: "gosolar",
        firstSeenTerm: term,
        lastSeenTerm: term,
        updatedAt: sql`now()`,
      }));
      await tx
        .insert(catalogCourses)
        .values(rows)
        .onConflictDoUpdate({
          target: [catalogCourses.subject, catalogCourses.courseNumber],
          set: {
            title: pick("title", catalogCourses.title),
            description: pick("description", catalogCourses.description),
            credits: pick("credits", catalogCourses.credits),
            level: pick("level", catalogCourses.level),
            source: sql`excluded.source`,
            firstSeenTerm: sql`LEAST(${catalogCourses.firstSeenTerm}, excluded.first_seen_term)`,
            lastSeenTerm: sql`GREATEST(${catalogCourses.lastSeenTerm}, excluded.last_seen_term)`,
            updatedAt: sql`now()`,
          },
        });
    }
    await tx
      .update(catalogRefresh)
      .set({ cursor, coursesSeen: sql`${catalogRefresh.coursesSeen} + ${courses.length}`, updatedAt: sql`now()` })
      .where(eq(catalogRefresh.term, term));
  });
}

async function readState(db: CourseMetaDb, term: string): Promise<CatalogRefreshRow | undefined> {
  const [row] = await db.select().from(catalogRefresh).where(eq(catalogRefresh.term, term)).limit(1);
  return row;
}

/** Refreshes `catalog_courses` for `terms` within the time budget, resuming each term's pass. */
export async function refreshCatalog(options: RefreshCatalogOptions): Promise<RefreshCatalogResult> {
  const now = options.now ?? Date.now;
  const started = now();
  const budget = options.budgetMs ?? DEFAULT_BUDGET_MS;
  const perSession = Math.max(1, options.subjectsPerSession ?? SUBJECTS_PER_SESSION);
  const timeLeft = () => budget - (now() - started);
  const db = await resolveDb(options.db);
  const results: CatalogTermResult[] = [];
  let outOfTime = false;

  for (const term of options.terms) {
    if (!/^\d{6}$/.test(term)) throw new Error(`Invalid term code: ${term}`);
    const result: CatalogTermResult = { term, status: "partial", subjects: 0, courses: 0, subjectsTotal: 0, cursor: null };
    results.push(result);

    let state = await readState(db, term);
    const finishedAt = state?.passFinishedAt?.getTime();
    if (!options.force && finishedAt !== undefined && now() - finishedAt < PASS_INTERVAL_MS) {
      result.status = "done_recently";
      continue;
    }
    if (timeLeft() < BATCH_RESERVE_MS) {
      result.cursor = state?.cursor ?? null;
      outOfTime = true;
      continue;
    }
    if (!state || state.passFinishedAt !== null) {
      // A new pass: from the first subject.
      const fresh = { cursor: null, passStartedAt: new Date(now()), passFinishedAt: null, coursesSeen: 0, updatedAt: sql`now()` };
      await db
        .insert(catalogRefresh)
        .values({ term, ...fresh })
        .onConflictDoUpdate({ target: catalogRefresh.term, set: fresh });
      state = await readState(db, term);
    }

    let subjects: string[];
    try {
      subjects = await subjectList(term, options);
    } catch (error) {
      result.error = short(error);
      result.cursor = state?.cursor ?? null;
      continue;
    }
    result.subjectsTotal = subjects.length;
    let cursor = state?.cursor ?? null;
    const remaining = subjects.filter((code) => cursor === null || code > cursor);

    for (let i = 0; i < remaining.length; i += perSession) {
      if (timeLeft() < BATCH_RESERVE_MS) {
        outOfTime = true;
        break;
      }
      const batch = remaining.slice(i, i + perSession);
      try {
        const courses = await fetchBatch(term, batch, options.gosolar);
        await storeBatch(db, term, courses, batch.at(-1)!);
        cursor = batch.at(-1)!;
        result.subjects += batch.length;
        result.courses += courses.length;
      } catch (error) {
        result.error = `${batch[0]}-${batch.at(-1)}: ${short(error)}`;
        break;
      }
    }

    const done = !result.error && (cursor === subjects.at(-1) || remaining.length === 0);
    if (done) {
      await db
        .update(catalogRefresh)
        .set({ cursor: null, passFinishedAt: new Date(now()), updatedAt: sql`now()` })
        .where(eq(catalogRefresh.term, term));
      result.status = "finished";
      result.cursor = null;
    } else {
      result.cursor = cursor;
    }
  }
  return { terms: results, outOfTime };
}

/** Every term's refresh progress (for tests and the admin view). */
export async function catalogRefreshState(options: DbOptions = {}): Promise<CatalogRefreshRow[]> {
  const db = await resolveDb(options.db);
  return db.select().from(catalogRefresh).orderBy(asc(catalogRefresh.term));
}
