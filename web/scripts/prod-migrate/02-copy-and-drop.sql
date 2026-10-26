-- PantherWatch production cutover, step 3 of 3: copy legacy rows into the new tables, then
-- drop the legacy tables. Run AFTER 01-prepare.sql and `npm run db:migrate` (see
-- scripts/README.md). One transaction; any failed check rolls everything back.
--
--   psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/prod-migrate/02-copy-and-drop.sql

BEGIN;

SET LOCAL lock_timeout = '10s';
-- The legacy timestamps are naive. Pin the session zone so every conversion below is explicit.
SET LOCAL TimeZone = 'UTC';

DO $$
BEGIN
  IF to_regclass('public.users_legacy') IS NULL OR to_regclass('public.announcements_legacy') IS NULL THEN
    RAISE EXCEPTION 'legacy tables missing: run 01-prepare.sql first';
  END IF;
  IF to_regclass('public.watched_sections') IS NULL THEN
    RAISE EXCEPTION 'new schema missing: run npm run db:migrate first';
  END IF;
  IF (SELECT count(*) FROM public.users) > 0 OR (SELECT count(*) FROM public.announcements) > 0 THEN
    RAISE EXCEPTION 'new users/announcements are not empty: has this already run, or is the app live?';
  END IF;
END $$;

-- users: keep ids (the session JWT `sub` is the user id). Legacy timestamps were written by the
-- JVM as naive UTC. One legacy row has a null created_at; it gets the launch date.
INSERT INTO public.users (id, email, name, picture_url, google_sub, created_at, updated_at)
SELECT user_id,
       email,
       name,
       picture,
       google_sub,
       coalesce(created_at, timestamp '2025-09-01 00:00:00') AT TIME ZONE 'UTC',
       coalesce(coalesce(updated_at, created_at) AT TIME ZONE 'UTC', now())
FROM public.users_legacy;

-- announcements: new ids (only 1 legacy row). `type` becomes `level`; anything unexpected
-- falls back to the legacy default 'warning'. expires_at was entered as naive browser-local
-- time (America/New_York), created_at as naive server UTC. created_by was free text, not a
-- user id, so it becomes NULL.
INSERT INTO public.announcements (message, level, active, starts_at, expires_at, created_by, created_at)
SELECT message,
       (CASE lower(btrim(type))
          WHEN 'info' THEN 'info'
          WHEN 'error' THEN 'error'
          ELSE 'warning'
        END)::public.announcement_level,
       active,
       created_at AT TIME ZONE 'UTC',
       expires_at AT TIME ZONE 'America/New_York',
       NULL,
       created_at AT TIME ZONE 'UTC'
FROM public.announcements_legacy
ORDER BY id;

DO $$
BEGIN
  IF (SELECT count(*) FROM public.users) <> (SELECT count(*) FROM public.users_legacy) THEN
    RAISE EXCEPTION 'user count mismatch: % new vs % legacy',
      (SELECT count(*) FROM public.users), (SELECT count(*) FROM public.users_legacy);
  END IF;
  IF (SELECT count(*) FROM public.announcements) <> (SELECT count(*) FROM public.announcements_legacy) THEN
    RAISE EXCEPTION 'announcement count mismatch';
  END IF;
  -- Expected user count at the 2026-10-26 audit: 27. If users signed up since, edit this
  -- number to the `SELECT count(*) FROM users` you saw right before step 1.
  IF (SELECT count(*) FROM public.users) <> 27 THEN
    RAISE EXCEPTION 'expected 27 users (audit), found %; update the expected count if that is right',
      (SELECT count(*) FROM public.users);
  END IF;
END $$;

DROP TABLE public.users_legacy, public.announcements_legacy;

-- Same block as the end of drizzle/0000_core.sql; repeated in case grants changed meanwhile.
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

-- Sanity (outside the transaction, read-only). Expect: users = 27, announcements = 1,
-- two rows in drizzle.__drizzle_migrations (0000_core, 0001_course_meta), and no anon/authenticated grants.
SELECT count(*) AS users FROM public.users;
SELECT count(*) AS announcements FROM public.announcements;
SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id;
SELECT grantee, table_name, privilege_type
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated');
