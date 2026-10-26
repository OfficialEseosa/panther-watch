-- PantherWatch production cutover, step 4 (after 02-copy-and-drop.sql): record drizzle/0000..0002
-- as applied, because they were run by hand (MCP `apply_migration` / `execute_sql`) instead of
-- `npm run db:migrate`. Without these rows the next `db:migrate` would try to create every table
-- again and fail.
--
-- Plain SQL for the Supabase MCP `execute_sql`. ONE transaction; aborts if any row is already there.
--
-- This is exactly what drizzle-orm 0.45's migrator (pg-core/dialect.js `migrate`) would have
-- written: schema `drizzle`, table `__drizzle_migrations (id serial PK, hash text not null,
-- created_at bigint)`, one row per migration with
--   hash       = sha256 hex of the .sql file's exact bytes (drizzle-orm/migrator.js
--                `readMigrationFiles`; the committed files have CRLF line endings, and the hash
--                covers them),
--   created_at = the entry's `when` in drizzle/meta/_journal.json.
-- `db:migrate` only compares created_at: it applies a migration when its `when` is greater than
-- the newest recorded created_at. Recompute after editing a migration file:
--   node -e "import('drizzle-orm/migrator').then(m=>{for(const x of m.readMigrationFiles({migrationsFolder:'./drizzle'}))console.log(x.hash,x.folderMillis)})"

BEGIN;

DO $$
DECLARE
  existing bigint := 0;
BEGIN
  IF to_regclass('public.watched_sections') IS NULL OR to_regclass('public.grade_terms') IS NULL
     OR NOT EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'watched_sections' AND column_name = 'missing_runs') THEN
    RAISE EXCEPTION '03-bookkeeping: drizzle/0000, 0001 and 0002 are not all applied; apply them first';
  END IF;
  IF to_regclass('public.users_legacy') IS NOT NULL THEN
    RAISE EXCEPTION '03-bookkeeping: public.users_legacy still exists: run 02-copy-and-drop.sql first';
  END IF;
  -- Dynamic, so the block still compiles when the table does not exist yet.
  IF to_regclass('drizzle.__drizzle_migrations') IS NOT NULL THEN
    EXECUTE 'SELECT count(*) FROM drizzle.__drizzle_migrations' INTO existing;
  END IF;
  IF existing > 0 THEN
    RAISE EXCEPTION '03-bookkeeping: drizzle.__drizzle_migrations already has % rows (this ran, or db:migrate did)', existing;
  END IF;
END $$;

-- Same DDL as drizzle's migrator.
CREATE SCHEMA IF NOT EXISTS "drizzle";
CREATE TABLE IF NOT EXISTS "drizzle"."__drizzle_migrations" (
  id SERIAL PRIMARY KEY,
  hash text NOT NULL,
  created_at bigint
);

INSERT INTO "drizzle"."__drizzle_migrations" ("hash", "created_at") VALUES
  ('96c88b08b5f9fa7e85d320aa27e65fd12b02404c32f138c6200af29620e2b710', 1792984587180),  -- 0000_core
  ('a39e6027e99d407ad7e46ca83ea51672c4988f7bec8965debe344d0040ae09ea', 1792987490808),  -- 0001_course_meta
  ('c8600e9dac5693f4d256391f53da5d370d12179cf793be8edcc86a593a032635', 1793034650104);  -- 0002_watch_unlisted

COMMIT;

-- Summary: three rows, created_at ascending.
SELECT id, hash, created_at FROM "drizzle"."__drizzle_migrations" ORDER BY id;
