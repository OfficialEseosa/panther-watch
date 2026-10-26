# PantherWatch

Course tracking for Georgia State University students. Search GoSolar sections with live seat
counts, see grade distributions and per-professor GPA from past terms, build a weekly schedule,
and get an email when a full class opens a seat.

## Repo layout

| Path | What it is |
|---|---|
| `web/` | The app: Next.js (App Router), Drizzle + Postgres, Google sign-in, Resend email. See [`web/README.md`](web/README.md). |
| `web/drizzle/` | SQL migrations, generated from `web/src/db/schema/` |
| `web/data/grade-csv/` | Committed grade-distribution history (13 terms), loaded by `web/scripts/backfill-grades.ts` |
| `web/tests/`, `web/e2e/` | Integration tests (Vitest + PGlite) and end-to-end tests (Playwright) |
| `docs/audit-2026-10/` | The audits that planned the October 2026 rewrite, and the decisions taken |
| `docs/design/` | Design spec, page specs, motion spec, design tokens |
| `docs/runbooks/` | Local dev, Vercel setup, Supabase cron, production cutover |
| `docker-compose.yml` | Local Postgres for development |

## Quick start

Needs Node 22.12+ and npm. Full guide: [`docs/runbooks/local-dev.md`](docs/runbooks/local-dev.md).

```sh
docker compose up -d postgres        # local Postgres on :5432 (or use PGlite, see local-dev.md)
cd web
npm install
cp .env.example .env.local           # fill in values; local-dev.md §3 lists each one
npm run db:migrate                   # apply drizzle/ migrations to DATABASE_URL
npm run dev                          # http://localhost:3000
```

With the Docker database, `DATABASE_URL` is
`postgres://pantherwatch:pantherwatch@localhost:5432/pantherwatch?sslmode=disable`.
No Docker? local-dev.md option B runs PGlite as a local Postgres server. The test suite needs
no database at all: it brings its own in-memory PGlite.

Local sign-in needs a separate Google OAuth client with redirect URI
`http://localhost:3000/api/auth/google/callback` (local-dev.md §4).

## Scripts (run in `web/`)

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` / `typecheck` | ESLint / `tsc --noEmit` |
| `npm test` | Vitest, once (`test:watch` to watch) |
| `npm run e2e` | Playwright against `next dev`, a throwaway Postgres and a fake GoSolar ([`web/e2e/README.md`](web/e2e/README.md)) |
| `npm run db:generate` | Diff `src/db/schema/` into a new migration in `drizzle/` |
| `npm run db:migrate` | Apply pending migrations to `DATABASE_URL` |
| `npm run db:studio` | Drizzle Studio |

Before pushing: `npm run lint && npm run typecheck && npm test && npm run build`. There is no CI
yet, so these are the gates.

## Testing

Integration and end-to-end tests come first; unit tests are kept for pure parsing code.

- **Integration** (`web/tests/`): route handlers are called directly with signed session
  cookies, against an in-memory PGlite with the real migrations applied, and a local HTTP fake
  of GoSolar (including its F5 affinity behaviour). No mocks of our own code, and nothing
  touches `DATABASE_URL`, Supabase, GoSolar, Google or Resend.
- **End to end** (`web/e2e/`): real Chromium against a real `next dev` and a real Postgres.
- **Unit** (`__tests__/` next to the code): parsers and other pure functions.

## Deployment

- **App:** Vercel Hobby, project root directory `web`. Env vars and limits:
  [`docs/runbooks/vercel-setup.md`](docs/runbooks/vercel-setup.md).
- **Database:** Supabase Postgres (free tier). The app connects through the transaction
  pooler with verified TLS (`DATABASE_CA_CERT`); migrations go through the session pooler.
- **Scheduled jobs:** Supabase pg_cron + pg_net call the `/api/cron/*` routes with
  `CRON_SECRET`; the seat watcher runs every 3 minutes
  ([`docs/runbooks/supabase-cron.sql`](docs/runbooks/supabase-cron.sql)). Vercel's daily cron is
  only a backup trigger for cleanup.
- **Email:** Resend, from `class.pantherwatch.app`.
- **Grades:** new terms are uploaded through the admin grade upload (GSU's APEX source is
  behind a Cloudflare challenge, so there is no grades scraper).
- **Cutover** from the old stack, with backup and rollback steps:
  [`docs/runbooks/cutover-checklist.md`](docs/runbooks/cutover-checklist.md). One-time
  production schema migration: [`web/scripts/README.md`](web/scripts/README.md).

## History

PantherWatch began as a Spring Boot API (Java 21, deployed to Koyeb from a root `Dockerfile`), a
React + Vite SPA, and an Android client. In October 2026 all three were retired and replaced by
the single Next.js app in `web/`, with a normalized schema and the existing users carried over.
The reasoning, the audits of the old code, and the decisions are in
[`docs/audit-2026-10/`](docs/audit-2026-10/README.md). The old code remains in git history.
