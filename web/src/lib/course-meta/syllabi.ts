import { and, eq, lt, sql } from "drizzle-orm";
import { z } from "zod";
import { syllabi } from "@/db/schema/course-meta";
import { resolveDb, type DbOptions } from "./db";
import { CHROME_USER_AGENT, CourseMetaHttpError, defaultFetch, type FetchLike } from "./http";

/**
 * GSU's public syllabi repository (the data behind cdn.gsu.edu/apps/syllabi-public)
 * publishes one static file per term, `{base}{term}.json`:
 * `{ termName, datePublished, courses: [{ crn, subjectCode, courseNumber, syllabus, ... }] }`
 * with thousands of course records. `syllabus` is the file name under `{base}files/`, "" when
 * none was uploaded. Current uploads use a generated name like "0028109491792443249404.pdf"
 * (rarely without the .pdf extension, e.g. "....0"); older ones a path like
 * "syllabi/202508/83410.pdf". Both are stored verbatim and served at `{base}files/{path}`.
 * The files send no CORS header, so the browser cannot read them; a cron ingests each term
 * into `syllabi` and requests are a primary-key lookup.
 */

export const SYLLABI_BASE_URL = "https://cdn.gsu.edu/static/syllabi-public/";
const SYLLABI_TIMEOUT_MS = 60_000;
const UPSERT_BATCH = 500;

export interface SyllabusOptions extends DbOptions {
  fetchImpl?: FetchLike;
  baseUrl?: string;
  timeoutMs?: number;
}

const termFile = z.object({
  courses: z.array(
    z.looseObject({
      crn: z.union([z.string(), z.number()]).transform((value) => String(value).trim()),
      syllabus: z
        .string()
        .nullish()
        .transform((value) => (value ?? "").trim()),
    }),
  ),
});

export interface SyllabiFile {
  /** Number of course records in the file (with or without a syllabus). */
  courseCount: number;
  /** CRN -> path for every course with a non-empty syllabus path (last entry wins). */
  paths: Map<string, string>;
}

export function parseSyllabiFile(body: unknown): SyllabiFile {
  const { courses } = termFile.parse(body);
  const paths = new Map<string, string>();
  for (const course of courses) {
    if (course.crn && course.syllabus) paths.set(course.crn, course.syllabus);
  }
  return { courseCount: courses.length, paths };
}

function assertTerm(term: string): void {
  if (!/^\d{6}$/.test(term)) throw new Error(`Invalid term code: ${term}`);
}

export interface SyllabiIngestResult {
  term: string;
  /** Rows upserted (sections that have a syllabus). */
  upserted: number;
  /** Rows deleted because the CRN no longer lists a syllabus. */
  removed: number;
}

/**
 * Downloads one term's syllabi file and syncs `syllabi` for that term in one transaction.
 * Fetch or parse failures throw before anything is written, so a bad response can never
 * hide a term's syllabi (the Java service cached an empty map for 6 h on failure).
 */
export async function ingestSyllabiForTerm(term: string, options: SyllabusOptions = {}): Promise<SyllabiIngestResult> {
  assertTerm(term);
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const url = `${options.baseUrl ?? SYLLABI_BASE_URL}${term}.json`;

  const response = await fetchImpl(url, {
    method: "GET",
    headers: { "User-Agent": CHROME_USER_AGENT, Accept: "application/json" },
    signal: AbortSignal.timeout(options.timeoutMs ?? SYLLABI_TIMEOUT_MS),
  });
  if (!response.ok) {
    await response.text().catch(() => "");
    throw new CourseMetaHttpError(`Syllabi file responded ${response.status}`, response.status, url);
  }
  const file = parseSyllabiFile(await response.json());
  // A real term file lists thousands of courses; an empty one is a broken publish, and
  // syncing it would delete every stored syllabus for the term.
  if (file.courseCount === 0) throw new Error(`Syllabi file for term ${term} lists no courses`);
  const entries = [...file.paths.entries()];

  const db = await resolveDb(options.db);
  return db.transaction(async (tx) => {
    // now() is the transaction start time, constant for this run: rows the run did not
    // touch keep an older fetched_at and are the ones whose syllabus disappeared.
    for (let i = 0; i < entries.length; i += UPSERT_BATCH) {
      const batch = entries.slice(i, i + UPSERT_BATCH).map(([crn, path]) => ({ term, crn, path, fetchedAt: sql`now()` }));
      await tx
        .insert(syllabi)
        .values(batch)
        .onConflictDoUpdate({
          target: [syllabi.term, syllabi.crn],
          set: { path: sql`excluded.path`, fetchedAt: sql`excluded.fetched_at` },
        });
    }
    const removed = await tx
      .delete(syllabi)
      .where(and(eq(syllabi.term, term), lt(syllabi.fetchedAt, sql`now()`)))
      .returning({ crn: syllabi.crn });
    return { term, upserted: entries.length, removed: removed.length };
  });
}

/** Public PDF URL for a stored path. */
export function syllabusUrl(path: string, baseUrl: string = SYLLABI_BASE_URL): string {
  return `${baseUrl}files/${path.replace(/^\/+/, "")}`;
}

/** The section's syllabus PDF, or null when none is published (or the term is not ingested). */
export async function getSyllabus(
  term: string,
  crn: string,
  options: DbOptions = {},
): Promise<{ url: string } | null> {
  const t = term.trim();
  const c = crn.trim();
  if (!/^\d{6}$/.test(t) || !c) return null;
  const db = await resolveDb(options.db);
  const [row] = await db
    .select({ path: syllabi.path })
    .from(syllabi)
    .where(and(eq(syllabi.term, t), eq(syllabi.crn, c)))
    .limit(1);
  return row ? { url: syllabusUrl(row.path) } : null;
}
