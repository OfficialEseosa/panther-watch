import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";

/**
 * Any Drizzle Postgres database: the app's postgres.js `db` in production, a PGlite
 * instance in tests. Course-meta code only uses the query builder (never `db.query.*`, and
 * never reads `execute` results, whose shape differs per driver), so it is independent of
 * the driver and of the app's full schema.
 */
export type CourseMetaDb = PgDatabase<PgQueryResultHKT, Record<string, unknown>>;

export interface DbOptions {
  /** Injectable for tests; defaults to the app's `db` from `@/db`. */
  db?: CourseMetaDb;
}

/**
 * `@/db` is imported lazily so pure helpers (and tests that pass their own db) never load
 * it: it imports `server-only` and reads DATABASE_URL on first use.
 */
export async function resolveDb(db?: CourseMetaDb): Promise<CourseMetaDb> {
  if (db) return db;
  const mod = await import("@/db");
  return mod.db;
}
