-- PantherWatch production cutover, step 3 (after 01-prepare.sql and drizzle/0000..0002):
-- copy every legacy row into the new tables, check the counts, drop the *_legacy tables.
--
-- Plain SQL for the Supabase MCP `execute_sql` (also fine in the SQL editor or `psql -f`). No psql
-- meta-commands. ONE transaction: any failed check is a RAISE EXCEPTION and rolls everything back.
-- Progress and every skipped row are reported with RAISE NOTICE; because `execute_sql` does not
-- show notices, the same numbers come back in the trailing SELECT (one row per table).
--
-- >>> BEFORE RUNNING: set the expected user count on the line marked "EXPECTED USERS" below to
-- >>> the pre-flight `SELECT count(*) FROM users` (27 on 2026-10-26).
--
-- Mapping:
--   users_legacy           -> users             ids kept (the session JWT `sub` is the user id)
--   announcements_legacy   -> announcements     new ids
--   watched_classes_legacy -> watched_sections  new ids; skipped (with a NOTICE) when the user is
--                                               gone, term is not 6 digits, crn is not 5 digits,
--                                               subject/course_number is missing or > 8 chars,
--                                               or it duplicates (user_id, term, crn)
--   user_schedules_legacy  -> schedule_entries  same rules; term_code -> term, color NULL
-- Legacy timestamps are naive UTC (the JVM wrote them in UTC); they are read AT TIME ZONE 'UTC'.

BEGIN;

-- EXPECTED USERS: edit the number in quotes. ------------------------------------------------
SELECT set_config('pantherwatch.expected_users', '27', true);
-- -------------------------------------------------------------------------------------------

SET LOCAL lock_timeout = '10s';
-- The legacy timestamps are naive. Pin the session zone so every conversion below is explicit.
SET LOCAL TimeZone = 'UTC';

DO $$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['users_legacy', 'announcements_legacy', 'watched_classes_legacy', 'user_schedules_legacy'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '02-copy: public.% is missing: run 01-prepare.sql first (or 02 already ran)', t;
    END IF;
  END LOOP;
  FOREACH t IN ARRAY ARRAY['users', 'announcements', 'watched_sections', 'schedule_entries', 'email_log', 'grade_terms'] LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE EXCEPTION '02-copy: public.% is missing: apply drizzle/0000_core.sql and 0001_course_meta.sql first', t;
    END IF;
  END LOOP;
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns
                 WHERE table_schema = 'public' AND table_name = 'watched_sections' AND column_name = 'missing_runs') THEN
    RAISE EXCEPTION '02-copy: watched_sections.missing_runs is missing: apply drizzle/0002_watch_unlisted.sql first';
  END IF;
  IF EXISTS (SELECT 1 FROM public.users) OR EXISTS (SELECT 1 FROM public.announcements)
     OR EXISTS (SELECT 1 FROM public.watched_sections) OR EXISTS (SELECT 1 FROM public.schedule_entries) THEN
    RAISE EXCEPTION '02-copy: the new users/announcements/watched_sections/schedule_entries are not empty: has this already run, or is the app live?';
  END IF;
  IF current_setting('pantherwatch.expected_users', true) !~ '^\d+$' THEN
    RAISE EXCEPTION '02-copy: the EXPECTED USERS line is missing or not a number';
  END IF;
END $$;

LOCK TABLE public.users_legacy, public.announcements_legacy, public.watched_classes_legacy,
           public.user_schedules_legacy IN ACCESS EXCLUSIVE MODE;

-- Survives COMMIT so the trailing SELECT can read it; it is session-local and vanishes with the
-- connection. (A leftover from an earlier successful run in the same session cannot clash: the
-- guards above abort first.)
CREATE TEMP TABLE cutover_report (
  ord          int PRIMARY KEY,
  item         text NOT NULL,
  legacy_rows  bigint,
  copied_rows  bigint,
  skipped_rows bigint,
  note         text
);

-- users ---------------------------------------------------------------------------------------
-- Keep ids. One audited legacy row has a null created_at; it gets the launch date.
INSERT INTO public.users (id, email, name, picture_url, google_sub, created_at, updated_at)
SELECT user_id,
       email,
       name,
       picture,
       google_sub,
       coalesce(created_at, timestamp '2025-09-01 00:00:00') AT TIME ZONE 'UTC',
       coalesce(coalesce(updated_at, created_at) AT TIME ZONE 'UTC', now())
FROM public.users_legacy;

-- announcements -------------------------------------------------------------------------------
-- New ids. `type` becomes `level` (anything unexpected falls back to the legacy default
-- 'warning'). expires_at was entered as naive browser-local time (America/New_York), created_at
-- as naive server UTC. created_by was free text, not a user id, so it becomes NULL.
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

-- watched_classes_legacy -> watched_sections --------------------------------------------------
CREATE TEMP TABLE ws_stage ON COMMIT DROP AS
SELECT w.id                                    AS legacy_id,
       w.user_id,
       btrim(w.term)                           AS term,
       btrim(w.crn)                            AS crn,
       nullif(upper(btrim(w.subject)), '')     AS subject,
       nullif(upper(btrim(w.course_number)), '') AS course_number,
       w.course_title,
       w.instructor,
       w.notified_at,
       w.created_at,
       w.updated_at,
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = w.user_id) THEN 'user not in users'
         WHEN btrim(w.term) !~ '^\d{6}$' THEN 'term not 6 digits'
         WHEN btrim(w.crn) !~ '^\d{5}$' THEN 'crn not 5 digits'
         WHEN nullif(btrim(w.subject), '') IS NULL OR nullif(btrim(w.course_number), '') IS NULL
           THEN 'subject or course_number missing'
         WHEN length(btrim(w.subject)) > 8 OR length(btrim(w.course_number)) > 8
           THEN 'subject or course_number longer than 8'
       END                                     AS skip_reason
FROM public.watched_classes_legacy w;

-- Dedupe on the new key (user_id, term, crn) among the copyable rows; keep the oldest legacy id.
UPDATE ws_stage s SET skip_reason = 'duplicate (user_id, term, crn)'
FROM (SELECT legacy_id,
             row_number() OVER (PARTITION BY user_id, term, crn ORDER BY legacy_id) AS rn
      FROM ws_stage WHERE skip_reason IS NULL) d
WHERE d.legacy_id = s.legacy_id AND d.rn > 1;

INSERT INTO public.watched_sections
  (user_id, term, crn, subject, course_number, course_title, instructor, notified_at, created_at, updated_at)
SELECT user_id,
       term,
       crn,
       subject,
       course_number,
       course_title,
       instructor,
       notified_at AT TIME ZONE 'UTC',
       coalesce(created_at AT TIME ZONE 'UTC', now()),
       coalesce(coalesce(updated_at, created_at) AT TIME ZONE 'UTC', now())
FROM ws_stage
WHERE skip_reason IS NULL
ORDER BY legacy_id;
-- last_closed_at stays NULL and missing_runs takes its default 0.

-- user_schedules_legacy -> schedule_entries ---------------------------------------------------
CREATE TEMP TABLE se_stage ON COMMIT DROP AS
SELECT s.id                                    AS legacy_id,
       s.user_id,
       btrim(s.term_code)                      AS term,
       btrim(s.crn)                            AS crn,
       nullif(upper(btrim(s.subject)), '')     AS subject,
       nullif(upper(btrim(s.course_number)), '') AS course_number,
       s.course_title,
       s.added_at,
       CASE
         WHEN NOT EXISTS (SELECT 1 FROM public.users u WHERE u.id = s.user_id) THEN 'user not in users'
         WHEN btrim(s.term_code) !~ '^\d{6}$' THEN 'term_code not 6 digits'
         WHEN btrim(s.crn) !~ '^\d{5}$' THEN 'crn not 5 digits'
         WHEN nullif(btrim(s.subject), '') IS NULL OR nullif(btrim(s.course_number), '') IS NULL
           THEN 'subject or course_number missing'
         WHEN length(btrim(s.subject)) > 8 OR length(btrim(s.course_number)) > 8
           THEN 'subject or course_number longer than 8'
       END                                     AS skip_reason
FROM public.user_schedules_legacy s;

UPDATE se_stage s SET skip_reason = 'duplicate (user_id, term, crn)'
FROM (SELECT legacy_id,
             row_number() OVER (PARTITION BY user_id, term, crn ORDER BY legacy_id) AS rn
      FROM se_stage WHERE skip_reason IS NULL) d
WHERE d.legacy_id = s.legacy_id AND d.rn > 1;

INSERT INTO public.schedule_entries (user_id, term, crn, subject, course_number, course_title, color, added_at)
SELECT user_id,
       term,
       crn,
       subject,
       course_number,
       course_title,
       NULL,
       coalesce(added_at AT TIME ZONE 'UTC', now())
FROM se_stage
WHERE skip_reason IS NULL
ORDER BY legacy_id;

-- Report + checks -----------------------------------------------------------------------------
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT 'watched_classes' AS tbl, legacy_id, term, crn, skip_reason FROM ws_stage WHERE skip_reason IS NOT NULL
           UNION ALL
           SELECT 'user_schedules', legacy_id, term, crn, skip_reason FROM se_stage WHERE skip_reason IS NOT NULL
           ORDER BY 1, 2 LOOP
    RAISE NOTICE '02-copy: skipped %_legacy id=% (term=%, crn=%): %', r.tbl, r.legacy_id, r.term, r.crn, r.skip_reason;
  END LOOP;
END $$;

INSERT INTO cutover_report (ord, item, legacy_rows, copied_rows, skipped_rows, note)
VALUES
  (1, 'users',
      (SELECT count(*) FROM public.users_legacy), (SELECT count(*) FROM public.users), 0,
      'expected ' || current_setting('pantherwatch.expected_users')),
  (2, 'announcements',
      (SELECT count(*) FROM public.announcements_legacy), (SELECT count(*) FROM public.announcements), 0, NULL),
  (3, 'watched_classes -> watched_sections',
      (SELECT count(*) FROM ws_stage), (SELECT count(*) FROM public.watched_sections),
      (SELECT count(*) FROM ws_stage WHERE skip_reason IS NOT NULL),
      (SELECT string_agg(format('id %s: %s', legacy_id, skip_reason), '; ' ORDER BY legacy_id)
         FROM ws_stage WHERE skip_reason IS NOT NULL)),
  (4, 'user_schedules -> schedule_entries',
      (SELECT count(*) FROM se_stage), (SELECT count(*) FROM public.schedule_entries),
      (SELECT count(*) FROM se_stage WHERE skip_reason IS NOT NULL),
      (SELECT string_agg(format('id %s: %s', legacy_id, skip_reason), '; ' ORDER BY legacy_id)
         FROM se_stage WHERE skip_reason IS NOT NULL));

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT * FROM cutover_report ORDER BY ord LOOP
    RAISE NOTICE '02-copy: %: legacy=% copied=% skipped=%', r.item, r.legacy_rows, r.copied_rows, r.skipped_rows;
    IF r.copied_rows + r.skipped_rows <> r.legacy_rows THEN
      RAISE EXCEPTION '02-copy: % count mismatch: legacy % <> copied % + skipped %',
        r.item, r.legacy_rows, r.copied_rows, r.skipped_rows;
    END IF;
  END LOOP;
  IF (SELECT copied_rows FROM cutover_report WHERE ord = 1)
     <> current_setting('pantherwatch.expected_users')::bigint THEN
    RAISE EXCEPTION '02-copy: expected % users (EXPECTED USERS line), found %; update that line if the new count is right',
      current_setting('pantherwatch.expected_users'), (SELECT copied_rows FROM cutover_report WHERE ord = 1);
  END IF;
END $$;

-- watched_classes_legacy holds the FK to users_legacy; one statement drops them together.
DROP TABLE public.watched_classes_legacy, public.user_schedules_legacy,
           public.users_legacy, public.announcements_legacy;

-- Same block as the end of drizzle/0000_core.sql; repeated because 0001/0002 created tables after
-- it ran, and in case grants changed meanwhile.
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

-- Summary (read-only). Expect: users copied = expected; announcements 1; watched_sections and
-- schedule_entries copied + skipped = legacy (the note lists each skipped legacy id and why);
-- both checks 0.
SELECT item, legacy_rows, copied_rows, skipped_rows, note
FROM (
  SELECT ord, item, legacy_rows, copied_rows, skipped_rows, note FROM cutover_report
  UNION ALL
  SELECT 5, 'check: *_legacy tables left', NULL,
         (SELECT count(*) FROM pg_class
           WHERE relnamespace = 'public'::regnamespace AND relkind = 'r' AND relname LIKE '%\_legacy'),
         NULL, 'expect 0'
  UNION ALL
  SELECT 6, 'check: anon/authenticated table grants', NULL,
         (SELECT count(*) FROM information_schema.role_table_grants
           WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')),
         NULL, 'expect 0'
) summary
ORDER BY ord;
