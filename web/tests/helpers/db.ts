/**
 * In-memory Postgres (PGlite, real Postgres 17 compiled to WASM) with every migration in
 * `drizzle/` applied, for integration tests.
 *
 *   const { db, close } = await createTestDb();
 *   setDbForTests(db);            // route app code (`getDb()` / `db`) to it
 *   afterAll(async () => { setDbForTests(undefined); await close(); });
 *   beforeEach(() => truncateAll(db));
 *
 * Note: DB-side `now()` defaults use the real clock even under `withFakeNow`; pass explicit
 * timestamps when a test depends on them.
 */
import { fileURLToPath } from "node:url";
import { PGlite } from "@electric-sql/pglite";
import { drizzle, type PgliteDatabase } from "drizzle-orm/pglite";
import { migrate } from "drizzle-orm/pglite/migrator";
import type { Db } from "@/db";
import * as schema from "@/db/schema";
import {
  users,
  watchedSections,
  type NewUser,
  type NewWatchedSection,
  type User,
  type WatchedSection,
} from "@/db/schema";

export type TestDb = PgliteDatabase<typeof schema> & { $client: PGlite };

export interface TestDatabase {
  /** Assignable to `Db`, so it can be passed to `setDbForTests` and to app functions. */
  db: TestDb;
  client: PGlite;
  close: () => Promise<void>;
}

export const MIGRATIONS_FOLDER = fileURLToPath(new URL("../../drizzle", import.meta.url));

export async function createTestDb(): Promise<TestDatabase> {
  const client = new PGlite();
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: MIGRATIONS_FOLDER });
  return {
    db,
    client,
    close: async () => {
      if (!client.closed) await client.close();
    },
  };
}

/**
 * Empties every table in `public` (including tables added by later migrations) and resets
 * identity sequences. Leaves the drizzle migrations bookkeeping alone.
 */
export async function truncateAll(db: TestDb): Promise<void> {
  const { rows } = await db.$client.query<{ name: string }>(
    `SELECT quote_ident(tablename) AS name FROM pg_tables WHERE schemaname = 'public'`,
  );
  if (rows.length === 0) return;
  await db.$client.exec(
    `TRUNCATE TABLE ${rows.map((row) => row.name).join(", ")} RESTART IDENTITY CASCADE`,
  );
}

let seq = 0;
const nextSeq = () => ++seq;

/** Inserts a user with unique email/google_sub unless overridden. */
export async function seedUser(db: Db, overrides: Partial<NewUser> = {}): Promise<User> {
  const n = nextSeq();
  const [user] = await db
    .insert(users)
    .values({
      email: `student${n}@student.gsu.test`,
      name: `Test Student ${n}`,
      pictureUrl: null,
      googleSub: `google-sub-${n}`,
      ...overrides,
    })
    .returning();
  return user;
}

/**
 * Inserts a watch for `userId`: CSC 1301, term 202608, a unique 5-digit CRN, not notified.
 * Override `crn`/`subject`/`courseNumber` to line it up with fake GoSolar sections.
 */
export async function seedWatchedSection(
  db: Db,
  userId: string,
  overrides: Partial<Omit<NewWatchedSection, "userId">> = {},
): Promise<WatchedSection> {
  const n = nextSeq();
  const [watch] = await db
    .insert(watchedSections)
    .values({
      userId,
      term: "202608",
      crn: String(10000 + (n % 90000)),
      subject: "CSC",
      courseNumber: "1301",
      courseTitle: "Principles of Computer Science I",
      instructor: "Test Instructor",
      ...overrides,
    })
    .returning();
  return watch;
}
