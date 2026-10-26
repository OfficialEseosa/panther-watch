-- PantherWatch production cutover, step 1: move the Hibernate tables out of the way.
--
-- Plain SQL, written to be pasted whole into the Supabase MCP `execute_sql` (or the dashboard
-- SQL editor, or `psql -f`). No psql meta-commands. ONE transaction: every guard failure is a
-- RAISE EXCEPTION, which rolls everything back and changes nothing. NOT repeatable: a second
-- run aborts at the first guard ("already run").
--
-- What it does (see scripts/README.md for the whole sequence):
--   users, announcements, watched_classes, user_schedules  -> renamed to <name>_legacy (kept,
--     with their rows; 02-copy-and-drop.sql copies them into the new tables, then drops them)
--   email_logs                                            -> DROPPED, whatever its row count.
--     It is only a send log (the old app purged it weekly); the new email_log starts empty.
--     The step-1 backup export keeps a copy.
--   anon / authenticated                                  -> every grant in public revoked.
--
-- Next: drizzle/0000_core.sql, 0001_course_meta.sql, 0002_watch_unlisted.sql, then
-- 02-copy-and-drop.sql, then 03-drizzle-bookkeeping.sql.

BEGIN;

SET LOCAL lock_timeout = '10s';

DO $$
DECLARE
  t text;
BEGIN
  -- Already ran?
  FOREACH t IN ARRAY ARRAY['users_legacy', 'announcements_legacy', 'watched_classes_legacy', 'user_schedules_legacy'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      RAISE EXCEPTION '01-prepare: public.% already exists: this script has already run', t;
    END IF;
  END LOOP;
  -- The audited Hibernate shape (docs/audit-2026-10/04-live-schema.md) must be what is there.
  FOREACH t IN ARRAY ARRAY['users', 'announcements', 'watched_classes', 'user_schedules', 'email_logs'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '01-prepare: public.% is missing; this is not the audited legacy schema', t;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'user_id') THEN
    RAISE EXCEPTION '01-prepare: public.users is not the legacy Hibernate table (no user_id column)';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'user_schedules' AND column_name = 'term_code') THEN
    RAISE EXCEPTION '01-prepare: public.user_schedules is not the legacy table (no term_code column)';
  END IF;
  -- Nothing from the new schema may exist yet.
  FOREACH t IN ARRAY ARRAY['watched_sections', 'schedule_entries', 'email_log', 'job_runs', 'terms', 'grade_terms'] LOOP
    IF to_regclass('public.' || t) IS NOT NULL THEN
      RAISE EXCEPTION '01-prepare: public.% already exists: the new schema is (partly) there already', t;
    END IF;
  END LOOP;
  -- The new tables must be owned by postgres (the app's role, and the one `npm run db:migrate`
  -- uses later; ALTER TABLE needs ownership). Stop if this session runs as anyone else.
  IF current_user <> 'postgres' THEN
    RAISE EXCEPTION '01-prepare: running as %, expected postgres (new tables would get the wrong owner)', current_user;
  END IF;
END $$;

-- Block the old backend (if it is somehow still running) on every table we keep, until COMMIT.
LOCK TABLE public.users, public.announcements, public.watched_classes, public.user_schedules,
           public.email_logs IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
  RAISE NOTICE '01-prepare: users=%, announcements=%, watched_classes=%, user_schedules=%, email_logs=% (dropped)',
    (SELECT count(*) FROM public.users), (SELECT count(*) FROM public.announcements),
    (SELECT count(*) FROM public.watched_classes), (SELECT count(*) FROM public.user_schedules),
    (SELECT count(*) FROM public.email_logs);
END $$;

-- Only the send log goes. Nothing references it.
DROP TABLE public.email_logs;

ALTER TABLE public.users           RENAME TO users_legacy;
ALTER TABLE public.announcements   RENAME TO announcements_legacy;
ALTER TABLE public.watched_classes RENAME TO watched_classes_legacy;
ALTER TABLE public.user_schedules  RENAME TO user_schedules_legacy;

-- Renaming a table does not rename its constraints, indexes or identity sequence. The new schema
-- reuses users_pkey, announcements_pkey and announcements_id_seq, so those must move; the rest are
-- renamed too so every legacy object is recognisable. The Hibernate hash names
-- (uk6dotkott2kjsp8vw4d0m25fb7, uksss08yywl2um9n2uqdnexu0l5, ukdram2miabndtadisicwejeupf,
-- fk4rlc1rog1c12bv87o1acvno34) cannot collide with Drizzle's names and are left as they are. The
-- FK keeps pointing at users_legacy (constraints follow the table, not the name).
ALTER TABLE public.users_legacy           RENAME CONSTRAINT users_pkey           TO users_legacy_pkey;
ALTER TABLE public.announcements_legacy   RENAME CONSTRAINT announcements_pkey   TO announcements_legacy_pkey;
ALTER TABLE public.watched_classes_legacy RENAME CONSTRAINT watched_classes_pkey TO watched_classes_legacy_pkey;
ALTER TABLE public.user_schedules_legacy  RENAME CONSTRAINT user_schedules_pkey  TO user_schedules_legacy_pkey;
ALTER SEQUENCE public.announcements_id_seq   RENAME TO announcements_legacy_id_seq;
ALTER SEQUENCE public.watched_classes_id_seq RENAME TO watched_classes_legacy_id_seq;
ALTER SEQUENCE public.user_schedules_id_seq  RENAME TO user_schedules_legacy_id_seq;

-- Close the anon/authenticated hole now (the legacy tables live until step 02). Same block as
-- the end of drizzle/0000_core.sql.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
    REVOKE USAGE ON SCHEMA public FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;
  END IF;
END $$;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    REVOKE ALL ON ALL TABLES IN SCHEMA public FROM authenticated;
    REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM authenticated;
    REVOKE USAGE ON SCHEMA public FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM authenticated;
    ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM authenticated;
  END IF;
END $$;

COMMIT;

-- Summary (read-only). Expect four *_legacy tables with the pre-flight row counts, no email_logs,
-- and anon_auth_grants = 0.
SELECT (SELECT count(*) FROM public.users_legacy)           AS users_legacy,
       (SELECT count(*) FROM public.announcements_legacy)   AS announcements_legacy,
       (SELECT count(*) FROM public.watched_classes_legacy) AS watched_classes_legacy,
       (SELECT count(*) FROM public.user_schedules_legacy)  AS user_schedules_legacy,
       to_regclass('public.email_logs') IS NULL             AS email_logs_dropped,
       (SELECT count(*) FROM information_schema.role_table_grants
         WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')) AS anon_auth_grants;
