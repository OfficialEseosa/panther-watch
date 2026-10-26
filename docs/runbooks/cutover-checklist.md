# Cutover checklist: Spring/Koyeb + SPA → Next.js on Vercel

Do the steps in order and tick each box. Placeholders:

| Placeholder | Meaning |
|---|---|
| `<DB_PASSWORD>` | Supabase database password (Dashboard → Database → Settings) |
| `<POOLER_HOST>` | from Dashboard → **Connect** (shape `aws-N-us-east-1.pooler.supabase.com`) |
| `<NEW_PROJECT>` | new Vercel project name; its production domain is `https://<NEW_PROJECT>.vercel.app` |
| `<OLD_PROJECT>` | existing Vercel project serving the SPA from `frontend-web/` |
| `$CRON_SECRET` | value of Vercel `CRON_SECRET` (`export CRON_SECRET=...` in your shell; never commit) |
| `supabase-root.crt` | Supabase root CA PEM (Dashboard → Database settings → SSL Configuration → Download certificate). Keep it next to the backups, outside the repo. `db:migrate` and `scripts/backfill-grades.ts` read it from `DATABASE_CA_CERT` and fail closed without it. |

Connection strings:

```sh
# Session pooler (port 5432): pg_dump, psql, migrations. IPv4-reachable.
export PGURL='postgresql://postgres.movyaglwmwaunkowajxu:<DB_PASSWORD>@<POOLER_HOST>:5432/postgres?sslmode=require'
# Transaction pooler (port 6543): the app's DATABASE_URL only.
```

Supabase recommends the session pooler string for dump and restore. The direct host `db.<ref>.supabase.co` needs IPv6 or the IPv4 add-on (https://supabase.com/docs/guides/platform/migrating-within-supabase/backup-restore).

Pick a low-traffic window. Avoid GSU registration and drop/add weeks. Overnight ET (07:00–10:00 UTC) is best.

---

## 0. Preparation (a day ahead)

- [ ] `web/` deployed to `<NEW_PROJECT>`, with all env vars set per `vercel-setup.md` §2 (including `DATABASE_CA_CERT`). Use `APP_URL=https://<NEW_PROJECT>.vercel.app` for now. Don't sign in on it before step 2 finishes: its tables don't exist yet, and its daily `/api/cron/cleanup` errors harmlessly until then.
- [ ] Download `supabase-root.crt` (see placeholders).
- [ ] Google OAuth client → **Authorized redirect URIs**: add both URIs below and keep `https://api.pantherwatch.app/api/auth/google/callback`. One client can hold all three at once. Google warns changes can take from 5 minutes to a few hours to apply, which is why this happens a day early.
  - `https://<NEW_PROJECT>.vercel.app/api/auth/google/callback`
  - `https://pantherwatch.app/api/auth/google/callback`
- [ ] `pg_dump --version` and `psql --version` report **17.x or newer**. Production runs Postgres 17.4, and pg_dump refuses to dump from a newer major server version.
- [ ] Read `ADMIN_EMAILS` from the Koyeb service env and set it in Vercel.
- [ ] Note the Koyeb app/service name. Confirm in the Koyeb dashboard that Pause and Resume are available on the service.

## 1. Backup

```sh
mkdir -p ~/pantherwatch-backups && cd ~/pantherwatch-backups
STAMP=$(date -u +%Y%m%dT%H%MZ)

# Full public schema + data, custom format (restorable with pg_restore).
pg_dump "$PGURL" --format=custom --no-owner --no-privileges --schema=public \
  --file="pantherwatch-public-$STAMP.dump"

# Plain-text schema, the "\d+ before migrating" record the audit asked for (04-live-schema.md was blocked).
pg_dump "$PGURL" --schema-only --no-owner --no-privileges --schema=public \
  --file="pantherwatch-public-schema-$STAMP.sql"

# Sanity check: one TABLE DATA entry per table (users, watched_classes, user_schedules, email_logs, announcements).
pg_restore --list "pantherwatch-public-$STAMP.dump" | grep "TABLE DATA"

# Row counts, to compare after the migration.
psql "$PGURL" -At -c "
  select 'users', count(*) from users union all
  select 'watched_classes', count(*) from watched_classes union all
  select 'user_schedules', count(*) from user_schedules union all
  select 'email_logs', count(*) from email_logs union all
  select 'announcements', count(*) from announcements" | tee "rowcounts-$STAMP.txt"
```

- [ ] Dump files are non-empty, and `pg_restore --list` shows all five tables.
- [ ] Backups stay **outside the repo**. They contain user emails.
- [ ] Optional full-project dump (needs Docker), per Supabase docs: `supabase db dump --db-url "$PGURL" -f roles.sql --role-only`, then `-f schema.sql`, then `-f data.sql --use-copy --data-only`.

Restore, only if a later step corrupts data. This step is destructive and replaces the public tables:

```sh
pg_restore --clean --if-exists --no-owner --no-privileges --dbname="$PGURL" "pantherwatch-public-$STAMP.dump"
```

## 2. Stop the old backend, migrate the schema, load grades

The migration (`web/scripts/README.md`, files in `web/scripts/prod-migrate/`) drops the empty Hibernate tables and replaces `users`/`announcements` with the Drizzle schema. Spring runs with `ddl-auto=update`: started against the new schema it would recreate `watched_classes`/`user_schedules`/`email_logs` and add its own columns to `users`. So the old backend stops **before** the migration and does not run again, and from here until step 6 the old SPA has no API (pick the low-traffic window for this).

- [ ] Koyeb dashboard → service → **Pause**, or `koyeb service pause <app>/<service>` (check the syntax with `koyeb service --help`). Don't delete it; it stays paused for a week (step 10). Koyeb shows it as paused, and `curl -sI https://api.pantherwatch.app/actuator/health` no longer returns 200.
- [ ] Pre-flight, per `web/scripts/README.md` "Before you start": `select count(*) from users` matches the expected count in `02-copy-and-drop.sql` (27 at audit; edit the file if it changed), and `watched_classes`, `user_schedules`, `email_logs` are still empty.

Apply, from `web/`, in this order:

```sh
cd web
export DIRECT_URL="$PGURL"                                           # session pooler, port 5432
export DATABASE_CA_CERT="$(cat ~/pantherwatch-backups/supabase-root.crt)"

# a. Drop the empty legacy tables, rename users/announcements to *_legacy, revoke anon/authenticated.
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/prod-migrate/01-prepare.sql

# b. Create every table in drizzle/ (0000_core, 0001_course_meta) and record them as applied.
DATABASE_URL="$DIRECT_URL" npm run db:migrate

# c. Copy users and announcements into the new tables, check counts, drop *_legacy.
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/prod-migrate/02-copy-and-drop.sql

# d. Load grade history from web/data/grade-csv/ (APEX is Cloudflare-blocked; there is no grades cron).
DATABASE_URL="$DIRECT_URL" npx tsx scripts/backfill-grades.ts
```

- [ ] a–c each exit 0. Each is one transaction and aborts with no changes if a guard fails; fix the cause and rerun that step (a cannot be repeated, and need not be).
- [ ] c prints `users = 27` (or your pre-flight count), `announcements = 1`, two rows in `drizzle.__drizzle_migrations`, and no `anon`/`authenticated` table grants.
- [ ] d prints 13 terms, all posted, 63,594 rows (as of 2026-10-26), and exits 0. Re-running it is safe. Check: `psql "$DIRECT_URL" -c "select count(*), count(*) filter (where posted) from grade_terms" -c "select count(*) from section_grades"`.

## 3. Deploy the new app to its pre-cutover URL

Deployment Protection's Standard Protection guards preview URLs, so smoke-test on the project's production domain, `https://<NEW_PROJECT>.vercel.app`.

- [ ] Merge to `main` (or Deployments → Promote) so the build is the Production deployment of `<NEW_PROJECT>`.
- [ ] Settings → Cron Jobs lists `/api/cron/cleanup` at `0 12 * * *`. That backup trigger now runs against the migrated prod DB, which is fine because cleanup is idempotent.
- [ ] `export HOST=https://<NEW_PROJECT>.vercel.app`

## 4. Functional smoke test (on `$HOST`)

Use one normal Google account, one admin account (listed in `ADMIN_EMAILS`), and one throwaway account for deletion.

```sh
curl -s -o /dev/null -w '%{http_code}\n' "$HOST/"                               # 200
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$HOST/tracked-classes" # 307 -> $HOST/ (signed out)
curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' "$HOST/api/auth/google/login"
#   302 -> https://accounts.google.com/o/oauth2/v2/auth?...redirect_uri=<HOST>/api/auth/google/callback...
for p in watch cleanup grades syllabi; do                                        # all 401 without the secret
  curl -s -o /dev/null -w "$p %{http_code}\n" -X POST "$HOST/api/cron/$p"; done
curl -s -o /dev/null -w '%{http_code}\n' -X POST -H "Authorization: Bearer $CRON_SECRET" "$HOST/api/cron/syllabi"  # 202
curl -s -o /dev/null -w '%{http_code}\n' -H "Authorization: Bearer $CRON_SECRET" "$HOST/api/cron/cleanup"          # 202/200 (GET, as Vercel cron sends)
```

Don't fire `/api/cron/watch` with the secret yet: it sends real seat alerts. The watcher's first real run is step 9.

In a browser on `$HOST`:

- [ ] **Login** (existing user): Google → back on the app, signed in. DevTools shows the `__Host-pw_session` cookie as HttpOnly, Secure, SameSite=Lax, Path=/. `select count(*) from users` is unchanged, because the account was matched rather than duplicated.
- [ ] **Login** (new account): a user row is created, and the welcome email arrives from `no-reply@class.pantherwatch.app`, not in spam.
- [ ] **Logout** clears the cookie. A protected page then redirects to `/`.
- [ ] **Search**: the term list loads. Searching a current-term subject + course number (e.g. `CSC 1301`) returns sections with seat counts. This proves the GoSolar session/F5 cookie handling works from Vercel egress.
- [ ] **Watch**: add a watch. It shows in Tracked Classes, and `select * from watched_sections where crn = '<crn>'` returns one row. Adding the same CRN again gives a clean "already watching" result, not a 500.
- [ ] **Unwatch**: the row is deleted.
- [ ] **Grades**: a course with history (e.g. `CSC 1301`) shows its grade distribution and per-professor GPA. The admin grade status lists 13 terms.
- [ ] **Schedule add / remove**: add two sections to a term, reload (data persists), then remove one.
- [ ] **Schedule export**: the exported file imports into Google Calendar with the right days and times (America/New_York).
- [ ] **Admin**: a non-admin is denied `/admin`. The admin sees the user list and search. Create an announcement expiring in 1 h: the banner shows, and it is still there 5 min later (the audit's tz bug was early expiry). Then deactivate it.
- [ ] **Account delete** (throwaway account): the user row is gone, and its `watched_sections`/`schedule_entries` rows are cascaded.
- [ ] Vercel → Logs: no 5xx during the test.

## 5. Point the app at the real domain

- [ ] Confirm Google OAuth lists `https://pantherwatch.app/api/auth/google/callback` (added in step 0). Keep the `api.pantherwatch.app` URI until step 11, because rollback needs it.
- [ ] Vercel `<NEW_PROJECT>` → Production `APP_URL=https://pantherwatch.app` (`vercel env update APP_URL production`), then **Redeploy** the production deployment. Login on `<NEW_PROJECT>.vercel.app` stops working after this, which is expected.

## 6. Move the domain

- [ ] Follow `vercel-setup.md` §5: add `pantherwatch.app` (and `www` if present) to `<NEW_PROJECT>`, then confirm **Move Domain** from `<OLD_PROJECT>`.
- [ ] Verify the new app answers. The old SPA would return 200 HTML for this path.
  ```sh
  curl -s -o /dev/null -w '%{http_code} %{redirect_url}\n' https://pantherwatch.app/api/auth/google/login
  # 302 -> accounts.google.com ... redirect_uri=https%3A%2F%2Fpantherwatch.app%2Fapi%2Fauth%2Fgoogle%2Fcallback
  ```
- [ ] Sign in once on `https://pantherwatch.app`.

## 7. Confirm the old watcher is still stopped

Koyeb was paused in step 2. Check it before step 8, because Spring's `CourseWatcher` and the new watcher would both send seat alerts.

- [ ] Koyeb still shows the service as paused, and `curl -sI https://api.pantherwatch.app/actuator/health` does not return 200.

## 8. Enable the pg_cron jobs

- [ ] Supabase Dashboard → SQL Editor → paste `docs/runbooks/supabase-cron.sql`, replace `<PASTE_CRON_SECRET>` with Vercel's `CRON_SECRET`, and Run. Don't save the snippet with the secret in it. Delete the snippet, or re-run it with the placeholder restored.
- [ ] `select jobname, schedule, active from cron.job where jobname like 'pantherwatch-%';` returns 4 active jobs: `watch`, `cleanup`, `syllabi` and `purge-cron-history`. There is no `grades` job (APEX is Cloudflare-blocked; see the comment in `supabase-cron.sql`).
- [ ] `show cron.timezone;` returns GMT/UTC.

## 9. Verify the first watcher runs

Within 3 minutes of step 8:

- [ ] The "Last 20 runs" query in `supabase-cron.sql` shows `pantherwatch-watch` rows with `status = succeeded`.
- [ ] The `net._http_response` query shows `status_code = 202` (or 200) and `timed_out = false` for each run. A 401 means the Vault secret ≠ Vercel `CRON_SECRET`. A timeout means the route isn't returning before doing its work.
- [ ] Vercel → Logs, filter `requestPath:/api/cron/watch`. Hobby keeps the last hour only, so check now. Each run logs its summary (groups checked, sections open, emails sent) with no errors, and the duration stays well under 38 s (`vercel-setup.md` §7).
- [ ] Three consecutive runs are clean, and no run overlaps another (the advisory lock is skipped or released each time).
- [ ] Seat-alert end to end: watch a section that currently shows open seats with no waitlist, using your own account. The next run sends one email, and `watched_sections.notified_at` is set. The following run sends nothing.
- [ ] Next morning: `pantherwatch-cleanup` (08:05 UTC) and `-syllabi` (10:05) each show a 202 in `net._http_response` before its 6 h TTL expires. Check by ~14:00 UTC, or check `cron.job_run_details` plus Vercel logs.
- [ ] Day 2: Vercel Usage → Provisioned Memory is on pace (`vercel-setup.md` §7).

## 10. Retire Koyeb (after 7 clean days)

- [ ] Seven days of clean watcher runs, and no rollback needed.
- [ ] Koyeb → service → Settings → **Delete** the service, then the app.

## 11. Remove `api.pantherwatch.app`

- [ ] Remove the `api.pantherwatch.app` record (a CNAME to Koyeb) wherever `pantherwatch.app` DNS is hosted:
  - Vercel DNS: `vercel dns ls pantherwatch.app`, find the `api` record ID, then `vercel dns rm <record-id>`.
  - External registrar: delete the `api` record in its DNS panel.
- [ ] Don't touch the `class.pantherwatch.app` records (Resend SPF/DKIM/MX/return-path).
- [ ] Google OAuth client: remove `https://api.pantherwatch.app/api/auth/google/callback` and `https://<NEW_PROJECT>.vercel.app/api/auth/google/callback`. Keep only `https://pantherwatch.app/api/auth/google/callback`.
- [ ] `dig +short api.pantherwatch.app` returns nothing (after the TTL).
- [ ] Delete `<OLD_PROJECT>` in Vercel (Settings → Advanced → Delete Project). It's no longer needed for rollback.

## 12. Repo cleanup

Do this only after steps 10–11. The root `Dockerfile` builds `backend/` for Koyeb, and `<OLD_PROJECT>` builds `frontend-web/`. Removing either earlier would break a rollback redeploy.

```sh
git switch -c chore/remove-legacy-stack
git rm -r backend frontend-web Dockerfile
git status   # confirm only legacy paths are staged; keep docker-compose.yml (local dev Postgres)
```

- [ ] Rewrite `README.md`: the monorepo is now `web/` (Next.js), with `docs/runbooks/` for ops. Quick start is `docker compose up -d` plus `cd web && npm i && npm run dev` (see `local-dev.md`). Remove the Spring/Supabase-JWT/Koyeb notes.
- [ ] Commit, open a PR, merge.

---

## Rollback

Use this if steps 2–9 fail, or if a serious bug turns up within the week. The old stack still exists: the domain can go back to `<OLD_PROJECT>`, and the Koyeb service is paused, not deleted, until step 10. The old backend cannot run on the migrated schema, though, so rolling back means restoring the step 1 dump, which **discards every write made since the backup** (sign-ups, watches, schedules, announcements). If step 2a itself aborted, nothing changed: skip item 2 and resume Koyeb (item 3).

1. **Stop the new watcher first**, so the two don't double-alert:
   ```sql
   select cron.alter_job((select jobid from cron.job where jobname = 'pantherwatch-watch'), active := false);
   ```
2. **Restore the old schema** (only if step 2a ran). Drop the new objects, then restore the step 1 dump:
   ```sh
   psql "$PGURL" -v ON_ERROR_STOP=1 -c "begin;
     drop table if exists public.section_grades, public.grade_terms, public.syllabi, public.rmp_cache,
       public.watched_sections, public.schedule_entries, public.email_log, public.announcements,
       public.job_runs, public.terms, public.users,
       public.users_legacy, public.announcements_legacy cascade;
     drop type if exists public.announcement_level, public.email_type;
     drop schema if exists drizzle cascade;
     commit;"
   pg_restore --no-owner --no-privileges --dbname="$PGURL" "pantherwatch-public-$STAMP.dump"
   ```
   Re-run the step 1 row-count query and compare with `rowcounts-$STAMP.txt`.
3. **Resume Koyeb**: dashboard → service → **Resume**, or `koyeb service resume <app>/<service>`. Resume redeploys from the latest deployment configuration, which is one more reason `backend/` and `Dockerfile` stay in `main` until step 12. Wait until `curl -s https://api.pantherwatch.app/actuator/health` returns `{"status":"UP"}`.
4. **Re-point the domain**: in `<OLD_PROJECT>` → Settings → Domains → add `pantherwatch.app` (and `www`), then confirm **Move Domain** from `<NEW_PROJECT>`.
5. Check that `https://pantherwatch.app` serves the SPA and that login works. The `api.pantherwatch.app` callback is still registered with Google.
6. Unschedule the other pg_cron jobs too (`select cron.unschedule(jobid) from cron.job where jobname like 'pantherwatch-%';`): after the restore the new app's tables are gone, so its cleanup and syllabi routes would only fail.
7. Write down what failed before retrying the cutover from step 1 (take a fresh backup).
