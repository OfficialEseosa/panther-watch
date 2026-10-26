-- =============================================================================
-- PantherWatch: scheduled triggers from Supabase (pg_cron + pg_net + Vault)
-- =============================================================================
-- Target: Supabase project movyaglwmwaunkowajxu (us-east-1, Postgres 17.4).
-- Run in: Dashboard -> SQL Editor (runs as role `postgres`). Idempotent: re-running
-- replaces the function and every job below, and updates the Vault secrets.
--
-- What it does
--   1. Enables pg_cron and pg_net.
--   2. Stores CRON_SECRET and the app base URL in Supabase Vault.
--   3. Creates app.trigger_cron(path), which calls net.http_post with
--      Authorization: Bearer <CRON_SECRET>.
--   4. Schedules the three app jobs plus a history-purge job (all times UTC).
--
-- Why it lives here
--   Vercel Hobby cron runs at most once per day (docs/audit-2026-10/01-hosting-feasibility.md
--   section 1), so the 3-minute seat watcher has to be triggered from the database.
--   Supabase Free pauses a project after 7 days without enough user database activity
--   (https://supabase.com/docs/guides/platform/free-project-pausing). The watcher job
--   runs every 3 minutes, and the route it calls queries the DB on every run, so this
--   schedule also keeps the project from pausing.
--
-- Before running
--   * Replace <PASTE_CRON_SECRET> below with the same value as Vercel's CRON_SECRET.
--     Leave the placeholder in on later re-runs to keep the stored secret unchanged.
--   * Do NOT commit this file with a real secret in it.
--   * Run it only at the cutover step "Enable pg_cron jobs" (cutover-checklist.md). As
--     soon as it runs, the watcher starts sending seat alerts.
--
-- pg_net is asynchronous. A `succeeded` status in cron.job_run_details only means the
-- SQL ran and the HTTP request was queued. The HTTP result (status code, timeout, error)
-- lands in net._http_response, which keeps rows for 6 hours by default (pg_net.ttl).
-- Source: https://supabase.com/docs/guides/database/extensions/pg_net
-- =============================================================================


-- 1. Extensions --------------------------------------------------------------
-- pg_cron's control file pins it to pg_catalog (`schema = pg_catalog`), so
-- `create extension pg_cron with schema extensions` fails with
-- "extension "pg_cron" must be installed in schema "pg_catalog"". Supabase's own install
-- SQL uses pg_catalog: https://supabase.com/docs/guides/cron/install
-- pg_net is not pinned. Supabase installs it into `extensions`; its functions live in `net`.
create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net  with schema extensions;

grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;


-- 2. Vault secrets -----------------------------------------------------------
-- Secret names are unique in vault.secrets. Existing secrets are updated in place.
do $$
declare
  v_cron_secret text := '<PASTE_CRON_SECRET>';
  v_base_url    text := 'https://pantherwatch.app';   -- no trailing slash
begin
  -- CRON_SECRET: write only if a real value was pasted.
  if v_cron_secret <> '<PASTE_CRON_SECRET>' then
    if length(v_cron_secret) < 32 then
      raise exception 'CRON_SECRET looks too short (% chars); generate one with: openssl rand -hex 32',
        length(v_cron_secret);
    end if;
    perform vault.update_secret(id, v_cron_secret)
       from vault.secrets where name = 'pantherwatch_cron_secret';
    if not found then
      perform vault.create_secret(v_cron_secret, 'pantherwatch_cron_secret',
                                  'Bearer token for POST /api/cron/* on the PantherWatch app');
    end if;
  elsif not exists (select 1 from vault.secrets where name = 'pantherwatch_cron_secret') then
    raise exception 'Replace <PASTE_CRON_SECRET> before the first run';
  end if;

  -- App base URL.
  perform vault.update_secret(id, v_base_url)
     from vault.secrets where name = 'pantherwatch_app_base_url';
  if not found then
    perform vault.create_secret(v_base_url, 'pantherwatch_app_base_url',
                                'Origin the cron jobs call, e.g. https://pantherwatch.app');
  end if;
end
$$;


-- 3. Trigger function --------------------------------------------------------
create schema if not exists app;

create or replace function app.trigger_cron(path text)
returns bigint                      -- pg_net request id (= net._http_response.id)
language plpgsql
set search_path = ''
as $$
declare
  v_base   text;
  v_secret text;
begin
  if path !~ '^/api/cron/[a-z0-9-]+$' then
    raise exception 'app.trigger_cron: refusing path %', path;
  end if;

  select decrypted_secret into v_base
    from vault.decrypted_secrets where name = 'pantherwatch_app_base_url';
  select decrypted_secret into v_secret
    from vault.decrypted_secrets where name = 'pantherwatch_cron_secret';

  if v_base is null or v_secret is null then
    raise exception 'app.trigger_cron: Vault secret pantherwatch_app_base_url or pantherwatch_cron_secret is missing';
  end if;

  return net.http_post(
    url                  := rtrim(v_base, '/') || path,
    body                 := jsonb_build_object('source', 'pg_cron', 'path', path, 'queued_at', now()),
    headers              := jsonb_build_object(
                              'Content-Type',  'application/json',
                              'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 10000   -- pg_net default is 2000 ms
  );
end
$$;

-- Only postgres (the role that owns the cron jobs) needs to call it. Schema `app` is not
-- in the Data API's exposed schemas, but revoke anyway.
revoke all on function app.trigger_cron(text) from public;
revoke all on function app.trigger_cron(text) from anon, authenticated, service_role;


-- 4. Schedules (UTC) ---------------------------------------------------------
-- GSU is on America/New_York. 07:00-10:59 UTC = 03:00-06:59 EDT / 02:00-05:59 EST, the
-- quietest window. Route handlers take a pg advisory lock, so an overlap with a slow
-- previous run is skipped rather than run twice.
--
--   job name                          schedule      route / action
--   pantherwatch-watch                */3 * * * *   POST /api/cron/watch    seat watcher
--   pantherwatch-purge-cron-history   15 7 * * *    trims cron.job_run_details (never cleaned
--                                                   automatically; the watcher alone adds
--                                                   480 rows/day against the 500 MB DB cap)
--   pantherwatch-cleanup              5 8 * * *     POST /api/cron/cleanup  expired watches/schedules, old email_logs
--   pantherwatch-syllabi              5 10 * * *    POST /api/cron/syllabi  refresh syllabi table
--
-- No grades job. GSU's grade-distribution APEX site (dssapex.gsu.edu, app 140 page 184) now
-- sits behind a Cloudflare challenge that blocks non-browser clients, so /api/cron/grades
-- can only fail from Vercel. Grades are loaded from the CSVs committed in web/data/grade-csv/
-- (scripts/backfill-grades.ts, run once at cutover). Each new term after that is exported
-- from APEX in a browser and uploaded through the admin grade upload
-- (POST /api/admin/grades/upload); see web/data/README.md. 'pantherwatch-grades' stays in the
-- unschedule list below so re-running this file removes it from a project that still has it.
--
-- cron.schedule() with an existing name already upserts. Unscheduling first as well
-- also drops any job removed from the list above on a later edit.
do $$
declare
  j record;
begin
  for j in
    select jobid from cron.job
     where jobname in ('pantherwatch-watch', 'pantherwatch-cleanup', 'pantherwatch-grades',
                       'pantherwatch-syllabi', 'pantherwatch-purge-cron-history')
  loop
    perform cron.unschedule(j.jobid);
  end loop;
end
$$;

select cron.schedule('pantherwatch-watch',   '*/3 * * * *', $$select app.trigger_cron('/api/cron/watch')$$);
select cron.schedule('pantherwatch-cleanup', '5 8 * * *',   $$select app.trigger_cron('/api/cron/cleanup')$$);
select cron.schedule('pantherwatch-syllabi', '5 10 * * *',  $$select app.trigger_cron('/api/cron/syllabi')$$);
select cron.schedule('pantherwatch-purge-cron-history', '15 7 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '7 days'$$);


-- =============================================================================
-- Inspection and maintenance queries (run individually; uncomment as needed)
-- =============================================================================

-- Time zone the schedules use (expect GMT or UTC):
-- show cron.timezone;

-- Registered jobs:
-- select jobid, jobname, schedule, active, command
--   from cron.job where jobname like 'pantherwatch-%' order by jobname;

-- Last 20 runs. status = whether the SQL ran and queued the request, not the HTTP result.
-- select j.jobname, d.runid, d.status, d.return_message,
--        d.start_time, d.end_time - d.start_time as took
--   from cron.job_run_details d
--   join cron.job j using (jobid)
--  where j.jobname like 'pantherwatch-%'
--  order by d.start_time desc
--  limit 20;

-- HTTP results of the last 20 requests (rows kept 6 h). Expect status_code 202 (or 200)
-- and timed_out = false.
--   401        CRON_SECRET in Vault differs from Vercel's CRON_SECRET
--   404        route not deployed, or base URL wrong
--   timed_out  route took > 10 s to answer; it must return 202 and do the work in after()
-- select id, created, status_code, timed_out, error_msg, left(content::text, 200) as body
--   from net._http_response
--  order by created desc
--  limit 20;

-- Fire one job by hand (returns the request id; read net._http_response a few seconds later):
-- select app.trigger_cron('/api/cron/watch');

-- Pause / resume the watcher without losing its definition:
-- select cron.alter_job((select jobid from cron.job where jobname = 'pantherwatch-watch'), active := false);
-- select cron.alter_job((select jobid from cron.job where jobname = 'pantherwatch-watch'), active := true);

-- Point the jobs at another origin (e.g. during rollback), then re-check net._http_response:
-- select vault.update_secret(id, 'https://<other-origin>') from vault.secrets where name = 'pantherwatch_app_base_url';

-- Remove everything this file created:
-- select cron.unschedule(jobid) from cron.job where jobname like 'pantherwatch-%';
-- drop function if exists app.trigger_cron(text);
-- delete from vault.secrets where name in ('pantherwatch_cron_secret', 'pantherwatch_app_base_url');
