/**
 * Seeds a LOCAL database with something to look at after a local sign-in
 * (`npm run seed:local`; `npm run dev:local` runs it once, on a fresh database):
 *
 * - the owner's user row (OWNER_EMAIL, google_sub `local:<email>`, which the GET
 *   /api/test/login link signs in to; an existing row with that email is reused),
 * - two schedule entries and two watched sections for SEED_TERM, using REAL CRNs fetched live
 *   from GoSolar: CSC 1301 and MATH 2211, first section of each on the schedule, second section
 *   of each watched,
 * - one active "info" announcement.
 *
 * Idempotent: rows that already exist are left alone.
 *
 *   DATABASE_URL='postgres://postgres@127.0.0.1:54330/pantherwatch_local?sslmode=disable' npm run seed:local
 *
 * Refuses any non-loopback DATABASE_URL, and does not read `.env*` files, so it can never touch
 * a real (Supabase) database by accident.
 */
import path from "node:path";
import { pathToFileURL } from "node:url";
import { and, eq, sql } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { announcements, scheduleEntries, users, watchedSections } from "@/db/schema";
import { instructorOf, titleCase } from "@/lib/format";
import { searchCourses, type CourseData } from "@/lib/gosolar";

export const OWNER_EMAIL = "raphaelomorose@gmail.com";
export const OWNER_NAME = "Raphael";
export const SEED_TERM = "202701";
export const WELCOME_MESSAGE = "Welcome to the new PantherWatch";
const COURSES = [
  { subject: "CSC", courseNumber: "1301" },
  { subject: "MATH", courseNumber: "2211" },
] as const;

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/** Throws unless `raw` is a postgres URL on a loopback host. */
export function assertLocalDatabaseUrl(raw: string | undefined): URL {
  if (!raw) throw new Error("DATABASE_URL is not set (pass it explicitly; .env files are not read)");
  const url = new URL(raw);
  if (!LOOPBACK_HOSTS.has(url.hostname)) {
    throw new Error(`refusing to seed a non-local database (${url.hostname}); this script is for local dev only`);
  }
  return url;
}

export interface SeedResult {
  userId: string;
  userCreated: boolean;
  scheduled: string[];
  watched: string[];
}

async function firstTwoSections(subject: string, courseNumber: string): Promise<CourseData[]> {
  const result = await searchCourses({ term: SEED_TERM, subject, courseNumber });
  const sections = result.data.filter((s) => s.courseReferenceNumber && /^\d{5}$/.test(s.courseReferenceNumber));
  if (sections.length === 0) throw new Error(`GoSolar lists no ${subject} ${courseNumber} sections for ${SEED_TERM}`);
  return sections.slice(0, 2);
}

export async function seedLocal(databaseUrl: string, log: (line: string) => void = console.log): Promise<SeedResult> {
  const url = assertLocalDatabaseUrl(databaseUrl);
  const plaintext = url.searchParams.get("sslmode") === "disable";
  url.searchParams.delete("sslmode");
  const pool = new Pool({ connectionString: url.toString(), ssl: plaintext ? false : undefined, max: 1 });
  const db = drizzle(pool);
  try {
    // GoSolar first, so a failed fetch writes nothing (and dev-local retries on its next start).
    log(`seed: fetching CSC 1301 and MATH 2211 sections for ${SEED_TERM} from GoSolar...`);
    const picked = await Promise.all(COURSES.map((c) => firstTwoSections(c.subject, c.courseNumber)));
    const toRow = (s: CourseData) => ({
      term: SEED_TERM,
      crn: s.courseReferenceNumber!,
      subject: s.subject ?? "",
      courseNumber: s.courseNumber ?? "",
      courseTitle: s.courseTitle ? titleCase(s.courseTitle.trim()) : null,
    });
    const label = (s: CourseData) => `${s.subject} ${s.courseNumber} CRN ${s.courseReferenceNumber}`;
    // First section of each course on the schedule; the second (or the first, if it is the only
    // one) watched.
    const scheduled = picked.map((sections) => sections[0]);
    const watched = picked.map((sections) => sections[1] ?? sections[0]);

    const { user, userCreated, announcementCreated } = await db.transaction(async (tx) => {
      const googleSub = `local:${OWNER_EMAIL}`;
      let [user] = await tx.select().from(users).where(eq(users.googleSub, googleSub)).limit(1);
      [user] = user ? [user] : await tx.select().from(users).where(sql`lower(${users.email}) = ${OWNER_EMAIL}`).limit(1);
      const userCreated = !user;
      if (!user) {
        [user] = await tx.insert(users).values({ email: OWNER_EMAIL, name: OWNER_NAME, googleSub }).returning();
      }

      for (const [index, section] of scheduled.entries()) {
        await tx
          .insert(scheduleEntries)
          .values({ userId: user.id, ...toRow(section), color: index })
          .onConflictDoNothing({ target: [scheduleEntries.userId, scheduleEntries.term, scheduleEntries.crn] });
      }
      for (const section of watched) {
        await tx
          .insert(watchedSections)
          .values({ userId: user.id, ...toRow(section), instructor: instructorOf(section) })
          .onConflictDoNothing({ target: [watchedSections.userId, watchedSections.term, watchedSections.crn] });
      }

      const [existing] = await tx
        .select({ id: announcements.id })
        .from(announcements)
        .where(and(eq(announcements.message, WELCOME_MESSAGE), eq(announcements.active, true)))
        .limit(1);
      if (!existing) {
        await tx.insert(announcements).values({ message: WELCOME_MESSAGE, level: "info", active: true, createdBy: user.id });
      }
      return { user, userCreated, announcementCreated: !existing };
    });

    log(`seed: user ${OWNER_EMAIL} ${userCreated ? "created" : "already existed"}`);
    log(`seed: schedule (${SEED_TERM}) ${scheduled.map(label).join(", ")}`);
    log(`seed: watching (${SEED_TERM}) ${watched.map(label).join(", ")}`);
    log(`seed: announcement "${WELCOME_MESSAGE}" ${announcementCreated ? "created" : "already existed"}`);

    return {
      userId: user.id,
      userCreated,
      scheduled: scheduled.map((s) => s.courseReferenceNumber!),
      watched: watched.map((s) => s.courseReferenceNumber!),
    };
  } finally {
    await pool.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  seedLocal(process.env.DATABASE_URL ?? "").then(
    () => console.log("seed: done"),
    (error: unknown) => {
      console.error(error);
      process.exit(1);
    },
  );
}
