# PantherWatch web

Next.js (App Router) app that replaces both `frontend-web/` (React + Vite) and `backend/`
(Spring Boot). It is deployed on Vercel with `web` as the project root directory, and it
uses Supabase Postgres through the transaction pooler.

| Area | Where |
|---|---|
| GoSolar (Banner SSB) client | `src/lib/gosolar` |
| Database client and schema | `src/db` (`index.ts`, `schema/`), migrations in `drizzle/` |
| Google sign-in, sessions | `src/lib/auth`, `src/app/api/auth` |
| Shared HTTP helpers (CSRF, cron auth) | `src/lib/http.ts` |
| Signed-out gate for app pages | `src/proxy.ts` |

## Run

```bash
cp .env.example .env.local   # fill in values
npm install
npm run dev                  # http://localhost:3000
```

You need Node 20 or newer to run the app. The test runner (Vitest 5) needs Node 22.12 or newer.

## Environment variables

Env is validated with zod in `src/lib/env.ts`. Validation is lazy: it runs on first use at
runtime, not at import, so `next build` works without secrets. A missing or invalid
variable fails the first request that needs it, and the error names every bad variable.

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Supabase **transaction pooler** URL (port 6543). Any `ssl*` query parameters are ignored; see TLS below. |
| `DATABASE_CA_CERT` | yes for Supabase | Supabase root CA, PEM (multi-line, or one line with `\n` escapes). Without it TLS verification fails. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | yes | Google OAuth web client. Redirect URI: `${APP_URL}/api/auth/google/callback`. |
| `JWT_SECRET` | yes | HS256 key for the session cookie, at least 32 characters. |
| `RESEND_API_KEY` | yes | Transactional email. |
| `CRON_SECRET` | yes | `Authorization: Bearer <secret>` for cron-triggered routes, at least 32 characters. |
| `APP_URL` | yes | Public origin only (`scheme://host[:port]`), e.g. `http://localhost:3000`. A path is rejected. |
| `ADMIN_EMAILS` | no | Comma-separated admin emails, case-insensitive. |

### Database TLS

`src/db/index.ts` uses node-postgres (`pg`) with `ssl: { rejectUnauthorized: true }`, always.
Supabase's SSL docs say `verify-full` needs **Supabase's own root CA**, downloaded per project
(their example connects through the Supavisor pooler), so production must set `DATABASE_CA_CERT`
to that certificate
(Dashboard > Database settings > SSL Configuration > Download certificate). Without it the
connection fails closed (`SELF_SIGNED_CERT_IN_CHAIN`) instead of silently skipping verification.

node-postgres lets `sslmode` in the URL override the `ssl` option (and treats `require` as
`verify-full`), so the code strips `ssl*` parameters from `DATABASE_URL` and sets `ssl` itself.
The only exception is `?sslmode=disable` on a loopback host, for a local Postgres without TLS.
`npm run db:migrate` applies the same rules.

Pool: `max` 5, 20 s idle timeout, 10 s connect timeout, 30 s `statement_timeout` (sent at
startup; the transaction pooler may not apply it, so there is also a client-side query timeout).
Prepared statements are unnamed, which the transaction pooler supports.

**Locks.** The transaction pooler gives each transaction whatever backend is free, so session
state (`SET`, `pg_advisory_lock`) does not carry over between statements. A lock that spans
work must be `pg_try_advisory_xact_lock(key)` inside `db.transaction(...)`.

## Scripts

| Script | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js |
| `npm run lint` | ESLint (Next config) |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Vitest, run once (`test:watch` to watch) |
| `npm run db:generate` | `drizzle-kit generate`: diff `src/db/schema/` into a new SQL migration in `drizzle/` |
| `npm run db:migrate` | Apply pending `drizzle/` migrations to `DATABASE_URL` (`src/db/migrate.ts`). Prefer a direct or session-pooler URL (port 5432). |
| `npm run db:studio` | `drizzle-kit studio` against `DATABASE_URL` |

## Schema

`src/db/schema/` holds the Drizzle schema, re-exported by `schema/index.ts`:

- `core.ts`: users, terms, watched sections, schedule entries, email log, announcements, job runs.
- `course-meta.ts`: grade distributions, syllabi and RateMyProfessors data.

`drizzle/` holds the generated SQL migrations. The one-time cutover of the live database from
the Hibernate tables is a separate, hand-run procedure in `scripts/prod-migrate/` (see
`scripts/README.md`); do not point `db:migrate` at production before that is done.

## Auth

- Google OAuth (authorization code). Sign-in always starts on `APP_URL`'s origin, so the state
  cookie and the callback share a host.
- Accounts: matched by `google_sub`; a legacy row (null `google_sub`) is linked by email only if
  Google verified it. An email bound to a different Google account is refused
  (`/?auth_error=account_conflict`), as is any unverified email (`/?auth_error=unverified_email`).
  Name, picture and (verified, unclaimed) email are refreshed on every sign-in.
- Session: an HS256 JWT in an HttpOnly, SameSite=Lax cookie named `__Host-pw_session` in
  production and `pw_session` elsewhere. The `__Host-` prefix requires `Secure`, which
  http://localhost cannot satisfy, so cookies are `Secure` only when `NODE_ENV=production`.
- Authorization uses `getCurrentUser()` / `requireUser()` / `requireAdmin()` from
  `src/lib/auth/session.ts`, which load the user row on every request, so deleting a user
  revokes their sessions. `getSession()` only reads JWT claims and must not gate access.
- Cookie-authenticated mutations call `assertSameOrigin(request)` from `src/lib/http.ts`
  (CSRF). Cron routes call `requireCronSecret(request)`.

## Testing

Vitest runs `src/**/*.test.ts` and `tests/**/*.test.ts` (`npm test`).

- **Unit tests** sit next to the code in `__tests__/` folders.
- **Integration tests** live in `tests/` (`tests/api` calls route handlers directly with
  `new NextRequest(...)`; `tests/watcher`, `tests/smoke`). They use real Postgres semantics
  through PGlite and real sockets through local `node:http` servers, not mocks of our own code.
- **Helpers** live in `tests/helpers/`: `db.ts` (PGlite with every migration applied, plus
  `setDbForTests` routing and seeders), `fake-gosolar.ts` (an HTTP fake of GoSolar, including
  its F5 affinity behaviour), `time.ts`, `admin-session.ts`.
- `tests/setup.ts` sets fixed fake env values before every file; tests never read `.env.local`
  and never connect to `DATABASE_URL`. `server-only` is aliased to an empty module
  (`tests/helpers/server-only.ts`) so server modules can be imported.

## Notes

- Every route runs on the Node.js runtime. Cache Components is enabled, so route files do
  not export `runtime`, because Node is the default.
- Each GoSolar search runs on its own single-connection undici `Agent`. This works around
  F5 session affinity; `src/lib/gosolar/session.ts` explains why, and
  `src/lib/gosolar/__tests__/undici.test.ts` checks it over real sockets.
