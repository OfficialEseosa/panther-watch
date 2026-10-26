# Production database cutover (Hibernate tables to the Drizzle schema)

This is a one-time, hand-run move of the live Supabase database (project `movyaglwmwaunkowajxu`)
from the five tables Hibernate created to the schema in `src/db/schema/` (`drizzle/0000_core.sql`).
Nothing in CI or the app runs these files.

The live state is described in `docs/audit-2026-10/04-live-schema.md`: 27 users, 1 (expired)
announcement, `watched_classes`, `user_schedules` and `email_logs` empty, RLS off, and full
`anon`/`authenticated` grants.

| Legacy table | Becomes | Data |
|---|---|---|
| `users` | `users` (`user_id` becomes `id`, `picture` becomes `picture_url`, timestamps become `timestamptz`) | copied, ids kept |
| `announcements` | `announcements` (`type` becomes `level`, adds `starts_at`, `created_by` becomes a user FK) | copied, new ids |
| `watched_classes` | `watched_sections` | dropped; must be empty (guarded) |
| `user_schedules` | `schedule_entries` | dropped; must be empty (guarded) |
| `email_logs` | `email_log` | dropped; must be empty (guarded) |

## Before you start

1. **Stop the Spring backend for good** and remove its Supabase credentials. It runs with
   `ddl-auto=update`. If it starts against the new schema, it recreates `watched_classes`,
   `user_schedules` and `email_logs`, and adds `user_id`/`picture` columns to the new `users`.
   Its purge jobs also delete data.
2. Keep the new web app's cron routes and sign-in disabled until step 3 has committed.
3. Get a **direct or session-pooler** connection string (port 5432, role `postgres`) and export it
   as `DIRECT_URL`. Do not run DDL through the transaction pooler (6543).
4. Take a backup. The free plan has no PITR, so at least run
   `pg_dump "$DIRECT_URL" -n public -f pantherwatch-public-$(date +%F).sql`.
5. Re-check the numbers: `SELECT count(*) FROM users;` (27 at audit), and that the three tables
   being dropped are still empty. If the user count changed, edit the expected count in
   `02-copy-and-drop.sql` (search for `27`).

## Steps (from `web/`)

```bash
# 1. Drop the empty tables, rename users/announcements to *_legacy, revoke anon/authenticated.
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/prod-migrate/01-prepare.sql

# 2. Create the new schema through Drizzle, which also records it as applied.
DATABASE_URL="$DIRECT_URL" npm run db:migrate

# 3. Copy users and announcements, verify the counts, drop *_legacy, revoke again, print checks.
psql "$DIRECT_URL" -v ON_ERROR_STOP=1 -f scripts/prod-migrate/02-copy-and-drop.sql
```

Each file is a single transaction and aborts with no changes if a guard fails: data appeared in a
table being dropped, the step already ran, the steps ran out of order, or the counts are wrong.
If step 2 or 3 fails, fix the cause and rerun that step; step 1 cannot be repeated (and need not be).

Expected output of step 3: `users = 27`, `announcements = 1`, two rows (`0000_core`, `0001_course_meta`) in
`drizzle.__drizzle_migrations`, and zero rows of `anon`/`authenticated` table grants.

### Rollback

- After step 1: `ALTER TABLE users_legacy RENAME TO users;` and the same for announcements (plus
  the constraint and sequence renames in reverse). The three dropped tables were empty; Hibernate
  recreates them if the old backend is started again.
- After step 3: restore from the `pg_dump` taken above.

## Migration bookkeeping (`drizzle.__drizzle_migrations`)

`npm run db:migrate` (step 2) records each migration it applies in `drizzle.__drizzle_migrations`
as a `(hash, created_at)` row. `created_at` is the migration's `when` value from
`drizzle/meta/_journal.json`. Later runs apply only migrations whose `when` is newer than the
newest recorded row, so `0000_core` is never applied twice.

If you ever paste `drizzle/0000_core.sql` by hand instead of running step 2, you must also record
it, or the next `db:migrate` tries to create every table again and fails:

```sql
CREATE SCHEMA IF NOT EXISTS drizzle;
CREATE TABLE IF NOT EXISTS drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);
-- hash = sha256 of the file's exact contents; created_at = its journal "when".
INSERT INTO drizzle.__drizzle_migrations (hash, created_at)
VALUES ('96c88b08b5f9fa7e85d320aa27e65fd12b02404c32f138c6200af29620e2b710', 1792984587180);
```

The hash above matches the file as of this writing. Recompute it if the file changes:
`node -e "for (const m of require('drizzle-orm/migrator').readMigrationFiles({migrationsFolder:'./drizzle'})) console.log(m.hash, m.folderMillis)"`.

## Security notes

- The revoke block, which is also at the end of `0000_core.sql`, removes every table and
  sequence privilege from `anon` and `authenticated` in `public`, revokes their explicit `USAGE`
  on `public`, and removes the default privileges that would grant them new tables created by
  `postgres`. It is guarded with `pg_roles` checks, so PGlite and plain local Postgres skip it.
- RLS stays off on purpose. The app connects as `postgres` and must not depend on `BYPASSRLS`.
- `anon` can still `USAGE` the `public` schema through `PUBLIC`, which is the Postgres 15+
  default. That allows no table access. To hide `public` from the Data API completely, also
  remove it from *Settings > API > Exposed schemas* in the Supabase dashboard.
- Default privileges owned by `supabase_admin` are untouched. They only apply to objects that
  role creates, and the app's migrations run as `postgres`.

## Verified locally

The sequence above was run on 2026-10-25 against a throwaway Postgres 17.4 replica of the audited
schema. The replica had fake data (27 users, 19 with a null `google_sub`, 1 with a null
`created_at`, and 1 announcement), plus `anon`/`authenticated` roles with Supabase-style grants
and default privileges. Results: user ids and emails were identical, the null `created_at`
became 2025-09-01, the announcement expiry became 21:00 America/New_York, no grants or default
ACLs remained, and running steps 1 and 3 a second time aborted as intended.

# Grade backfill

GSU's grade-distribution APEX site (app 140, page 184) sits behind a Cloudflare challenge that
blocks non-browser clients, so production cannot scrape it and the grades cron is not scheduled. The
exports live in the repo instead: `web/data/grade-csv/<term>__summary.csv` +
`<term>__detailed.csv` (13 terms, 202205 to 202605; provenance in `web/data/README.md`).
`scripts/backfill-grades.ts` loads them into `grade_terms` / `section_grades` with the same parser
and store the app uses (`parseTerm`, `upsertTerm`, `markTermUnposted`). New terms after cutover go
through the admin grade upload (`POST /api/admin/grades/upload`), or get exported in a browser, committed to
`web/data/grade-csv/` and backfilled with this script.

**When:** right after the production migration above (step 3); see
`docs/runbooks/cutover-checklist.md`.

```bash
# From web/. --dir defaults to ./data/grade-csv (web/data/grade-csv).
# Parse and report only, no database connection:
npx tsx scripts/backfill-grades.ts --dry-run

# Write every term found (or limit with --terms 202508,202601):
DATABASE_URL="$DIRECT_URL" DATABASE_CA_CERT="$(cat supabase-root.crt)" npx tsx scripts/backfill-grades.ts
```

- `DATABASE_URL` must be passed explicitly. Unlike `db:migrate`, the script does not read `.env*`
  files. TLS works like `db:migrate`: set `DATABASE_CA_CERT` to Supabase's root CA PEM (required
  for Supabase; connections fail closed without it).
- Every selected term is parsed before anything is written. A missing half of a pair, a file that
  is not an APEX grade CSV (or is the other export, i.e. swapped), or a term with no rows aborts
  the run with exit code 1 and no writes. The header check is `gradeCsvKind` from
  `@/lib/course-meta`, the same one the admin upload uses.
- Posted terms are replaced in one transaction each (delete + insert), so re-running is safe.
  A term with no `CRS AVG` yet is recorded as unposted; this never downgrades a term that is
  already posted.
- It prints one line per term (rows, posted/unposted, ms) and a total: 13 terms, all posted, 63,594 rows as of 2026-10-26.
- Test: `npx vitest run tests/scripts` (PGlite with the real 202508 and 202601 CSVs from
  `web/data/grade-csv/`).
