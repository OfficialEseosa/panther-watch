# Production database cutover (Hibernate tables to the Drizzle schema)

This is a one-time, hand-run move of the live Supabase database (project `movyaglwmwaunkowajxu`)
from the five tables Hibernate created to the schema in `src/db/schema/` (`drizzle/*.sql`).
Nothing in CI or the app runs these files. **No user data is discarded**: every legacy row is
carried over except the send log `email_logs`.

The run is driven through the Supabase MCP connector: `execute_sql` (or `apply_migration`) with
the full text of each file. The files are plain SQL with no psql meta-commands, so they also work
pasted into the dashboard SQL editor or with `psql -f`.

Pre-flight on 2026-10-26 17:22 UTC: `users` 27, `announcements` 1, `user_schedules` 1 (a real
schedule entry for term 202608), `watched_classes` 0, `email_logs` 0. The old app stays live until
Koyeb is paused, so the watch and schedule counts can still grow. That is fine: they are copied.

| Legacy table | Becomes | Data |
|---|---|---|
| `users` | `users` (`user_id` becomes `id`, `picture` becomes `picture_url`, timestamps become `timestamptz`) | copied, ids kept |
| `announcements` | `announcements` (`type` becomes `level`, adds `starts_at`, `created_by` becomes a user FK) | copied, new ids |
| `watched_classes` | `watched_sections` | **copied**, new ids (rules below) |
| `user_schedules` | `schedule_entries` (`term_code` becomes `term`, `color` NULL) | **copied**, new ids (rules below) |
| `email_logs` | `email_log` | dropped (send log only, purged weekly by the old app; the backup export keeps it) |

Watch and schedule rows are copied when the user exists in `users`, the trimmed term is 6 digits,
the trimmed CRN is 5 digits, and `subject` and `course_number` are present and at most 8
characters (the new columns are NOT NULL `varchar(8)`). Subjects are upper-cased. Rows that
duplicate `(user_id, term, crn)` after trimming keep the oldest legacy id. Every row that is not
copied is listed with its legacy id and reason (a `NOTICE`, and the `note` column of the summary).
All legacy timestamps are naive UTC and are converted `AT TIME ZONE 'UTC'`. `notified_at` carries
over, `last_closed_at` starts NULL and `missing_runs` starts at 0.

## Order of operations

| # | What | How |
|---|---|---|
| 1 | Pause the Koyeb service (the Spring backend) | Koyeb dashboard. It runs `ddl-auto=update` and must never start against the new schema. Its purge jobs also delete data. |
| 2 | Pre-flight counts | `execute_sql`: `select 'users', count(*) from users union all select 'announcements', count(*) from announcements union all select 'watched_classes', count(*) from watched_classes union all select 'user_schedules', count(*) from user_schedules union all select 'email_logs', count(*) from email_logs;` |
| 3 | Backup export | `pg_dump` (see `docs/runbooks/cutover-checklist.md` step 1). The free plan has no PITR. |
| 4 | `prod-migrate/01-prepare.sql` | `execute_sql`. Renames `users`, `announcements`, `watched_classes`, `user_schedules` to `*_legacy` (with their pkeys and identity sequences), drops `email_logs`, revokes `anon`/`authenticated`. |
| 5 | `drizzle/0000_core.sql`, then `0001_course_meta.sql`, then `0002_watch_unlisted.sql` | `apply_migration` (names `0000_core`, `0001_course_meta`, `0002_watch_unlisted`) or `execute_sql`: one file per call, in order, full file text unchanged. |
| 6 | `prod-migrate/02-copy-and-drop.sql` | First set the `EXPECTED USERS` line to the step-2 user count. Then `execute_sql`. Copies everything, checks the counts, drops `*_legacy`, revokes again. |
| 7 | `prod-migrate/03-drizzle-bookkeeping.sql` | `execute_sql`. Records the three migrations in `drizzle.__drizzle_migrations`, so a later `npm run db:migrate` applies only newer ones. |
| 8 | Grade backfill | `scripts/backfill-grades.ts` (below), or MCP `execute_sql` batches generated from `web/data/grade-csv/`. |

Each `prod-migrate` file is one `BEGIN … COMMIT` transaction. Every guard is a `RAISE EXCEPTION`
inside a `DO` block, so a failed check rolls the whole file back and changes nothing. Each file
ends with a read-only `SELECT` summary, because `execute_sql` does not show `NOTICE`s.

Guards:

- `01` aborts if it already ran (`*_legacy` exist), if any of the five legacy tables is missing or
  not the Hibernate shape, if any new table already exists, or if the session is not `postgres`
  (the new tables must be owned by `postgres`, or a later `db:migrate` cannot alter them).
- `02` aborts if `01` has not run, if any of the three migrations is missing (it checks
  `grade_terms` and `watched_sections.missing_runs`), if the new tables are not empty, if for any
  table `copied + skipped <> legacy`, or if the user count differs from `EXPECTED USERS`.
- `03` aborts if the schema is incomplete, if `*_legacy` still exist, or if the bookkeeping table
  already has rows.

### Expected summaries

- `01`: `users_legacy` 27, `announcements_legacy` 1, `watched_classes_legacy` and
  `user_schedules_legacy` equal to the pre-flight counts, `email_logs_dropped` true,
  `anon_auth_grants` 0.
- `02`: one row per table with `legacy_rows`, `copied_rows`, `skipped_rows` and a `note` naming
  each skipped legacy id, then `check: *_legacy tables left` 0 and
  `check: anon/authenticated table grants` 0.
- `03`: three rows (hashes below).

If a file aborts, fix the cause and rerun that file. `01` cannot be repeated once it has
committed, and need not be.

### Rollback

- After `01` (before `0000`): rename the four `*_legacy` tables, their `*_legacy_pkey`
  constraints and their `*_legacy_id_seq` sequences back. `email_logs` is gone. Hibernate recreates
  it empty if the old backend starts again, or restore it from the backup.
- After `0000`–`0002`: drop the new objects first (see the rollback in
  `docs/runbooks/cutover-checklist.md`), then rename as above.
- After `02`: restore from the backup export.

## Migration bookkeeping (`drizzle.__drizzle_migrations`)

`npm run db:migrate` records each migration it applies in `drizzle.__drizzle_migrations` as a
`(hash, created_at)` row. It creates that table as
`(id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)` in schema `drizzle`. `hash` is the
sha256 hex of the `.sql` file's exact bytes (`readMigrationFiles` in `drizzle-orm/migrator.js`;
the committed files have CRLF line endings and the hash covers them). `created_at` is the entry's
`when` in `drizzle/meta/_journal.json`. A later run applies only migrations whose `when` is greater
than the newest recorded `created_at`. The hash is not compared.

The cutover applies the files by hand, so `03-drizzle-bookkeeping.sql` writes those rows:

| Migration | hash | created_at |
|---|---|---|
| `0000_core` | `96c88b08b5f9fa7e85d320aa27e65fd12b02404c32f138c6200af29620e2b710` | 1792984587180 |
| `0001_course_meta` | `a39e6027e99d407ad7e46ca83ea51672c4988f7bec8965debe344d0040ae09ea` | 1792987490808 |
| `0002_watch_unlisted` | `c8600e9dac5693f4d256391f53da5d370d12179cf793be8edcc86a593a032635` | 1793034650104 |

If a migration file changes before the cutover, recompute and update `03`:
`node -e "import('drizzle-orm/migrator').then(m=>{for(const x of m.readMigrationFiles({migrationsFolder:'./drizzle'}))console.log(x.hash,x.folderMillis)})"`.
New migrations after the cutover go through `npm run db:migrate` as usual.

## Security notes

- The revoke block, which is also at the end of `0000_core.sql`, removes every table and
  sequence privilege from `anon` and `authenticated` in `public`, revokes their explicit `USAGE`
  on `public`, and removes the default privileges that would grant them new tables created by
  `postgres`. It runs in `01`, in `0000`, and again in `02` (after `0001`/`0002` created more
  tables). It is guarded with `pg_roles` checks, so PGlite and plain local Postgres skip it.
- RLS stays off on purpose. The app connects as `postgres` and must not depend on `BYPASSRLS`.
- `anon` can still `USAGE` the `public` schema through `PUBLIC`, which is the Postgres 15+
  default. That allows no table access. To hide `public` from the Data API completely, also
  remove it from *Settings > API > Exposed schemas* in the Supabase dashboard.
- Default privileges owned by `supabase_admin` are untouched. They only apply to objects that
  role creates. `01` refuses to run unless the session is `postgres`, so the new tables are
  created by `postgres`.

## Verified locally

Rehearsed on 2026-10-26 against a throwaway Postgres 17.4 replica of the audited schema: same
columns, constraint names and identity sequences, plus Supabase-style `anon`/`authenticated` grants
and default privileges. Each file was sent as one multi-statement message
(`psql -c "$(cat file)"`), the way `execute_sql` sends it. Fake data: 27 users (19 with a null
`google_sub`, 1 with a null `created_at`), 1 announcement, 1 `user_schedules` row like prod's
(202608 NUTR 3100, CRN 82486), 2 `watched_classes` rows (one with a null `subject`), and 3
`email_logs` rows.

Results: 27 users with identical ids, emails, names, pictures and `google_sub`; 1 announcement;
1 `schedule_entries` row; 1 `watched_sections` row, with the null-subject row reported as skipped;
no `*_legacy` tables; no `anon`/`authenticated` table, sequence, schema or default privileges;
every `public` and `drizzle` relation owned by `postgres`; 3 rows in
`drizzle.__drizzle_migrations`; and `npm run db:migrate` afterwards applied nothing. Re-running
`01`, `02` or `03` aborted with no changes. So did running `02` or `03` too early (before `01`, or
with only `0000`/`0001` applied). A second database exercised every skip reason (orphan user,
4-digit CRN, non-numeric term, over-long subject, empty course number, duplicate after trimming)
and a wrong `EXPECTED USERS`.

# Grade backfill

GSU's grade-distribution APEX site (app 140, page 184) sits behind a Cloudflare challenge that
blocks non-browser clients, so production cannot scrape it and the grades cron is not scheduled. The
exports live in the repo instead: `web/data/grade-csv/<term>__summary.csv` +
`<term>__detailed.csv` (13 terms, 202205 to 202605; provenance in `web/data/README.md`).
`scripts/backfill-grades.ts` loads them into `grade_terms` / `section_grades` with the same parser
and store the app uses (`parseTerm`, `upsertTerm`, `markTermUnposted`). New terms after cutover go
through the admin grade upload (`POST /api/admin/grades/upload`), or get exported in a browser, committed to
`web/data/grade-csv/` and backfilled with this script.

**When:** right after the production migration above (after `03-drizzle-bookkeeping.sql`); see
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
