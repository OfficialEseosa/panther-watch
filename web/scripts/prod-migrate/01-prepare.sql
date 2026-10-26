-- PantherWatch production cutover, step 1 of 3: move the Hibernate tables out of the way.
-- Run by hand against the live Supabase database (see scripts/README.md). NOT idempotent:
-- it aborts if it has already run. Everything happens in one transaction.
--
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/prod-migrate/01-prepare.sql
--
-- Then: step 2 `npm run db:migrate`, step 3 `02-copy-and-drop.sql`.

BEGIN;

SET LOCAL lock_timeout = '10s';

-- Guards: the shape must be the audited Hibernate one, and the tables we drop must still be
-- empty (they were at the 2026-10-26 audit; the app's purge jobs keep emptying them).
DO $$
BEGIN
  IF to_regclass('public.users_legacy') IS NOT NULL
     OR to_regclass('public.announcements_legacy') IS NOT NULL THEN
    RAISE EXCEPTION 'users_legacy/announcements_legacy already exist: 01-prepare.sql has already run';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'users' AND column_name = 'user_id') THEN
    RAISE EXCEPTION 'public.users is not the legacy Hibernate table (no user_id column)';
  END IF;
  IF (SELECT count(*) FROM public.watched_classes) > 0 THEN
    RAISE EXCEPTION 'watched_classes has % rows; it was empty at the audit. Copy them before dropping.',
      (SELECT count(*) FROM public.watched_classes);
  END IF;
  IF (SELECT count(*) FROM public.user_schedules) > 0 THEN
    RAISE EXCEPTION 'user_schedules has % rows; it was empty at the audit. Copy them before dropping.',
      (SELECT count(*) FROM public.user_schedules);
  END IF;
  IF (SELECT count(*) FROM public.email_logs) > 0 THEN
    RAISE EXCEPTION 'email_logs has % rows; it was empty at the audit. Copy or discard them first.',
      (SELECT count(*) FROM public.email_logs);
  END IF;
END $$;

-- Block writers on the tables we keep until COMMIT.
LOCK TABLE public.users, public.announcements IN ACCESS EXCLUSIVE MODE;

-- watched_classes has the FK to users, so drop the dependents first.
DROP TABLE public.watched_classes, public.user_schedules, public.email_logs;

ALTER TABLE public.users RENAME TO users_legacy;
ALTER TABLE public.announcements RENAME TO announcements_legacy;

-- Renaming a table does not rename its indexes, constraints or identity sequence, and the new
-- tables reuse these names (users_pkey, announcements_pkey, announcements_id_seq).
ALTER TABLE public.users_legacy RENAME CONSTRAINT users_pkey TO users_legacy_pkey;
ALTER TABLE public.announcements_legacy RENAME CONSTRAINT announcements_pkey TO announcements_legacy_pkey;
ALTER SEQUENCE public.announcements_id_seq RENAME TO announcements_legacy_id_seq;

-- Close the anon/authenticated hole now (the legacy tables live until step 3). Same block as
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
