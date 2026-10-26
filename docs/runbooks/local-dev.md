# Local development: `web/` (Next.js)

## Fastest way to see it

Needs Node 22, `npm ci` done in `web/`, and the Postgres 17 server binaries (`scoop install postgresql`; `initdb`/`pg_ctl` are found on PATH, `$PG_BIN` or scoop's app dir). No Docker, no Google OAuth client, no `.env.local` to fill in.

```sh
cd web
npm run dev:local
```

It starts a local Postgres on `127.0.0.1:54330` (database `pantherwatch_local`), applies the migrations, loads the grade history (first run only), seeds a demo account, starts a fake Resend on `127.0.0.1:3461`, and runs `next dev` on http://localhost:3000. When it is ready it prints a banner with two one-click sign-in links:

```text
http://localhost:3000/api/test/login?secret=<E2E_TEST_SECRET>&email=raphaelomorose@gmail.com&name=Raphael   (admin, via ADMIN_EMAILS)
http://localhost:3000/api/test/login?secret=<E2E_TEST_SECRET>&email=student@local.test&name=Student          (plain member)
```

`<E2E_TEST_SECRET>` is the value in `web/.env.local`; the banner prints the links with it filled in. Each link sets the session cookie and lands on `/dashboard`. Any other email works too (`&admin=1` asserts the account is in `ADMIN_EMAILS`). The route is the e2e test login (`src/app/api/test/login/route.ts`): it exists only while `E2E_TEST_SECRET` is set and neither `NODE_ENV` nor `VERCEL_ENV` is `production`, and a missing or wrong secret is a plain 404.

What you get:

- **Seed data** for raphaelomorose@gmail.com (`npm run seed:local`, run automatically the first time): term 202701 (Spring 2027) with CSC 1301 and MATH 2211 sections fetched live from GoSolar. The first section of each is on the schedule and the second of each is watched. There is also an active "Welcome to the new PantherWatch" announcement.
- **Real GoSolar** for search, seat counts and the watcher.
- **No real email.** Every send goes to the fake Resend. The terminal logs each one (`EMAIL to ...: "subject"`), and http://127.0.0.1:3461/ lists them with their HTML. To fire seat alerts, run the watcher once (the seeded watches have open seats). `CRON_SECRET` is in `web/.env.local`:

  ```sh
  CRON_SECRET=$(grep '^CRON_SECRET=' web/.env.local | cut -d= -f2-)
  curl -X POST 'http://localhost:3000/api/cron/watch?sync=1' -H "Authorization: Bearer $CRON_SECRET"
  ```

- **Env:** `web/.env.local` is read first. `JWT_SECRET`, `CRON_SECRET` and `E2E_TEST_SECRET` are generated into it on the first run. Real `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` are used if present there, otherwise dummies (Google sign-in then fails, but the links above work). The seeded account is bound to `google_sub` `local:raphaelomorose@gmail.com`, so a real Google sign-in with that email reports an account conflict until you reset the data. `DATABASE_URL`, `RESEND_*`, `APP_URL` and `ADMIN_EMAILS` are always forced to the local values, so a Supabase URL in `.env.local` is never used. A `GOSOLAR_BASE_URL` in `.env.local` makes it refuse to start. Because `E2E_TEST_SECRET` now lives in `.env.local`, plain `npm run dev` also serves the `/api/test` routes. They're still local only.

**Stop:** press Ctrl+C (or Ctrl+Break). That stops `next dev`, the fake Resend and Postgres (`pg_ctl stop`). On Windows, cmd may ask "Terminate batch job (Y/N)?" afterwards; either answer is fine. If a crash leaves Postgres running, the next `npm run dev:local` reuses it and stops it on exit.

**Data** lives in `web/.pglocal/` (gitignored): the cluster in `data/` and the server log in `postgres.log`. It survives restarts. **Reset:** stop it, delete `web/.pglocal`, and run `npm run dev:local` again for a fresh database, grades and seed.

Notes: it clears `web/.next/dev` on every start (see the reload-loop note in section 5), and it refuses to start while another `next dev` is running in `web/`. Stop it before `npm run e2e`, which runs its own dev server. Ports 3000, 3461 and 54330 must be free.

The rest of this page sets things up by hand: Docker or PGlite, a real Google OAuth client, and so on.

Requirements: Node 22, npm. You also need a Postgres: Docker Desktop for option A, or nothing extra for option B (PGlite). `psql` is optional.

```sh
cd web
npm ci
cp .env.example .env.local     # then fill in (section 3)
```

`.env*` is gitignored except `.env.example`. `next dev` and `drizzle-kit` (via `drizzle.config.ts`) both read `.env.local`.

## 1. Database, option A: Docker Postgres (closest to prod)

The repo-root `docker-compose.yml` runs `postgres:15-alpine` as container `pantherwatch-db` on port 5432, with user, password, and database all set to `pantherwatch`. Prod is Postgres 17.4. The app's SQL doesn't depend on 15-vs-17 differences.

```sh
# from the repo root
docker compose up -d postgres
docker exec pantherwatch-db pg_isready -U pantherwatch       # "accepting connections"
```

```dotenv
# web/.env.local
DATABASE_URL=postgres://pantherwatch:pantherwatch@localhost:5432/pantherwatch?sslmode=disable
```

Keep `?sslmode=disable`: the local container has no TLS, and the app (`src/db/index.ts`), `db:migrate` and `scripts/backfill-grades.ts` otherwise always require verified TLS. `sslmode=disable` is honored **only** for a loopback host (`localhost`, `127.0.0.1`, `::1`); on any other host it is ignored and TLS stays on. Reset the data with `docker compose down -v` (this drops the `postgres_data` volume).

## 1. Database, option B: PGlite (no Docker)

PGlite is Postgres compiled to WASM, served over TCP by `@electric-sql/pglite-socket`. It reports PostgreSQL 18.x.

```sh
# separate terminal, from web/ ; data persists in web/.pglite (gitignore it or use --db=memory://)
npx -y --package=@electric-sql/pglite-socket --package=@electric-sql/pglite \
  pglite-server --db=./.pglite --port=5433 --max-connections=10
```

```dotenv
# web/.env.local  (use 127.0.0.1, not localhost: the server binds IPv4 only)
DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/postgres?sslmode=disable
```

Limits, verified locally on 2026-10-25:

- `--max-connections` is required. The default is 1, and postgres.js (`max: 5` in `src/db/index.ts`) then fails with `ECONNRESET`.
- All connections share **one** backend session, so `pg_try_advisory_lock` always succeeds. PGlite can't test the cron routes' no-overlap lock. Use option A for that.
- There's no SSL, no `pg_cron`, no `pg_net`, and no Vault. Simulate cron with curl (section 5).
- If the server aborts on start (`RuntimeError: Aborted()`) after an unclean stop, delete `./.pglite` and run `npm run db:migrate` again.

## 2. Create the schema

Apply the migrations in `drizzle/` (`0000_core`, `0001_course_meta`), the same way prod gets them:

```sh
cd web
npm run db:migrate              # uses DATABASE_URL from .env.local
```

Optionally load the grade history committed in `web/data/grade-csv/` (13 terms, ~64k rows). The script does not read `.env.local`, so pass the URL:

```sh
DATABASE_URL='postgres://pantherwatch:pantherwatch@localhost:5432/pantherwatch?sslmode=disable' npx tsx scripts/backfill-grades.ts
```

After a schema change in `src/db/schema/`, generate a migration with `npx drizzle-kit generate --name <what>` and run `npm run db:migrate` again. Don't use `drizzle-kit push` against a database you also migrate.

To use the exact prod schema instead, load the schema-only dump from cutover step 1. It has no data and no user emails.

```sh
psql "postgres://pantherwatch:pantherwatch@localhost:5432/pantherwatch" -f ~/pantherwatch-backups/pantherwatch-public-schema-<STAMP>.sql
```

Never point local dev or tests at the Supabase project.

## 3. `.env.local`

| Variable | Local value |
|---|---|
| `DATABASE_URL` | from section 1 |
| `DATABASE_CA_CERT` | empty for a local database (`sslmode=disable` on localhost). **REQUIRED for Supabase**: the Supabase root CA PEM (Dashboard → Database settings → SSL Configuration); without it connections fail closed. Local dev should never point at Supabase anyway. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | from the local OAuth client (section 4) |
| `JWT_SECRET` | `openssl rand -base64 48` (≥ 32 chars) |
| `RESEND_API_KEY` | a Resend key, or any non-empty placeholder if you don't exercise email (sends then fail and are logged). To test delivery without mailing real users, send to `delivered@resend.dev`. |
| `CRON_SECRET` | `openssl rand -hex 32` |
| `APP_URL` | `http://localhost:3000` |
| `ADMIN_EMAILS` | your Google account email |

All of them except `ADMIN_EMAILS` and `DATABASE_CA_CERT` are required. `src/lib/env.ts` validates on the first request and names every missing variable. `vercel env pull .env.local --environment=development` can seed the file, but Secret-type values come back as placeholders that you replace by hand.

## 4. Google OAuth client for localhost

Use a **separate** client so localhost URIs never sit on the production client.

1. Google Cloud Console, in the PantherWatch project → **Google Auth Platform → Clients**. In the older UI this is **APIs & Services → Credentials → Create credentials → OAuth client ID**.
2. Application type: **Web application**. Name: `PantherWatch local`.
3. **Authorized redirect URIs**: `http://localhost:3000/api/auth/google/callback`. Google permits plain `http` only for localhost. JavaScript origins aren't needed, because the flow is server-side.
4. Copy the client ID and secret into `.env.local`.
5. If the consent screen (**Audience**) is in **Testing**, add your Google account under **Test users**. The scopes `openid email profile` need no verification.

Open the app at `http://localhost:3000`, not `127.0.0.1`. The OAuth state and session cookies are per-host, and `APP_URL` must match the host you browse. Cookies are set without `Secure` when `NODE_ENV !== "production"`, so plain http works under `next dev`.

## 5. Run, and simulate a cron hit

```sh
cd web
npm run dev                     # http://localhost:3000
```

**Dev server reloads in a loop?** If a page keeps reloading itself (the Turbopack client asks for a full reload on every load, usually after switching branches or upgrading Next), the dev cache in `web/.next/dev` is stale. Stop `npm run dev`, delete that folder and start again:

```sh
cd web
rm -rf .next/dev                # PowerShell: Remove-Item -Recurse -Force .next\dev
npm run dev
```

The cron routes (`/api/cron/watch|cleanup|grades|syllabi`) are POST with `Authorization: Bearer <CRON_SECRET>`. This is what `app.trigger_cron()` sends from Supabase.

bash / Git Bash:

```sh
CRON_SECRET=$(grep '^CRON_SECRET=' web/.env.local | cut -d= -f2-)
curl -i -X POST http://localhost:3000/api/cron/watch \
  -H "Authorization: Bearer $CRON_SECRET" \
  -H 'Content-Type: application/json' -d '{"source":"local"}'
# expect 202; the work then runs in after(), so watch the `npm run dev` terminal for its log lines
curl -i -X POST http://localhost:3000/api/cron/watch           # expect 401
curl -i http://localhost:3000/api/cron/cleanup -H "Authorization: Bearer $CRON_SECRET"   # GET, as Vercel cron sends
```

PowerShell (use `curl.exe`; plain `curl` is an alias for `Invoke-WebRequest` in Windows PowerShell 5.1):

```powershell
$secret = (Select-String -Path web\.env.local -Pattern '^CRON_SECRET=(.*)$').Matches[0].Groups[1].Value
curl.exe -i -X POST http://localhost:3000/api/cron/watch -H "Authorization: Bearer $secret"
```

Firing two `watch` requests back to back on option A should give one run plus one skip (advisory lock). On PGlite both runs execute (see option B limits).

**The watcher calls the real GoSolar and sends real email** through `RESEND_API_KEY`. Locally, watch only with your own account and a placeholder or test key.

## 6. Tests

```sh
cd web
npm test                                        # whole suite, once (vitest run)
npx vitest                                      # watch mode
npx vitest run tests/api                        # one directory
npx vitest run -t "declare term"                # tests whose name matches
```

The config (`vitest.config.mts`) uses the node environment, picks up `src/**/*.test.ts` and `tests/**/*.test.ts`, maps `@` to `src`, and runs `tests/setup.ts` first, which replaces the env with fixed fake values. Integration tests run against an in-memory PGlite with every migration in `drizzle/` applied (`tests/helpers/db.ts`), and call route handlers directly with a signed-in session (`tests/helpers/session.ts`). They never use `DATABASE_URL`, your dev database, or Supabase, and GoSolar is replaced by a local fake (`tests/helpers/fake-gosolar.ts`).

Run these before pushing. They are the same gates the Vercel build applies, plus types and tests:

```sh
npm run lint
npx tsc --noEmit
npx vitest run
npm run build        # needs no secrets (env is validated lazily)
```
