# End-to-end tests (Playwright)

Real Chromium against a real `next dev`, a real (throwaway) Postgres 17, and a fake GoSolar.
Nothing here talks to Supabase, GoSolar, Google or Resend.

```sh
cd web
npm run e2e                                  # = npx playwright test (both projects)
npx playwright test --project=chromium       # desktop only
npx playwright test e2e/auth.spec.ts         # one file
npx playwright show-report e2e/.output/report
E2E_SERVER_LOGS=1 npm run e2e                # also print the dev server / fake request logs
```

First time on a machine: `npx playwright install chromium`, and have the Postgres server
binaries (`initdb`, `pg_ctl`) on PATH, in `$PG_BIN`, or from `scoop install postgresql`. Docker
is not needed.

**Stop `npm run dev` first.** `next dev` locks `.next/dev`, so the rig cannot start its own dev
server next to another one in this folder. `playwright.config.ts` checks the lock up front and
names the process holding it.

**Dev server reloads in a loop?** If pages reload over and over (in the suite, or in a browser
against `npm run dev`), the dev cache in `web/.next/dev` is stale. Stop every `next dev` in this
folder, delete it (`rm -rf .next/dev`, or `Remove-Item -Recurse -Force .next\dev` in PowerShell)
and run again. The specs already drop the dev server's reload messages (see "Writing more
specs"), so a loop that still shows up there means the cache itself is broken.

## What runs

| Piece | How | Where |
|---|---|---|
| Fake GoSolar + fake Resend | `webServer` #1: `npx tsx e2e/fake-gosolar-server.ts` | `127.0.0.1:3451` |
| App | `webServer` #2: `npx next dev --port 3450`, env from `APP_ENV` in `e2e/env.ts` | `http://localhost:3450` |
| Postgres | `globalSetup` (`e2e/pg.ts`): `initdb` + `pg_ctl start` + `CREATE DATABASE` + `npm run db:migrate`; its teardown stops the cluster and deletes the data dir | `127.0.0.1:54329`, db `pantherwatch_e2e` |

Playwright starts the web servers before `globalSetup`; that is fine because the app connects
to the database only when a request needs it, and its readiness probe (`/api/test/health`)
does not. Ports can be moved with `E2E_APP_PORT`, `E2E_GOSOLAR_PORT`, `E2E_PG_PORT`; the
cluster directory with `E2E_PG_DIR` (default `%TEMP%/pantherwatch-e2e-pg-<port>`). A cluster
left behind by a killed run is stopped and deleted at the next start, or by `npx tsx e2e/pg.ts stop`.

One worker, no parallelism: the specs share one database and one fake and reset both in
`beforeEach` (`resetAll()` in `support.ts`).

### App environment

Every variable the app reads is set explicitly, so a `.env.local` cannot leak in (Next does not
override variables that are already set). None are real credentials.

| Variable | Value |
|---|---|
| `DATABASE_URL` | `postgres://postgres@127.0.0.1:54329/pantherwatch_e2e?sslmode=disable` |
| `DATABASE_CA_CERT` | empty |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | `e2e-google-client-id.apps.googleusercontent.com` / `e2e-google-client-secret` |
| `JWT_SECRET`, `CRON_SECRET` | fixed 48-character dummies (see `e2e/env.ts`) |
| `RESEND_API_KEY` | `re_test_e2e` |
| `RESEND_BASE_URL` | `http://127.0.0.1:3451/resend` (the Resend SDK reads it; sends land in the fake) |
| `GOSOLAR_BASE_URL` | `http://127.0.0.1:3451/StudentRegistrationSsb/ssb` (`src/lib/gosolar/config.ts`) |
| `APP_URL` | `http://localhost:3450` |
| `ADMIN_EMAILS` | `admin@e2e.test` |
| `E2E_TEST_SECRET` | `e2e-test-secret-not-for-production` (enables `/api/test/*`) |

## Test-only API (`src/app/api/test/`)

Enabled only when `E2E_TEST_SECRET` is set (16+ chars) **and** `NODE_ENV !== "production"`
**and** `VERCEL_ENV !== "production"`; otherwise every route is a plain 404. `next build` /
`next start` always run with `NODE_ENV=production`, so a deployment cannot serve them. All but
`health` and `login` also need the header `x-e2e-secret: <E2E_TEST_SECRET>`.

| Route | Does |
|---|---|
| `GET /api/test/health` | `{ ok: true }`; the rig's readiness probe |
| `POST /api/test/login` `{ secret, email, name?, admin? }` | Upserts a user (`google_sub = e2e:<email>`), sets the real session cookie via `signSession` + `setSessionCookie`; `{ userId, email, isAdmin }`. `admin: true` requires the email to be in `ADMIN_EMAILS`. |
| `POST /api/test/reset` | Truncates every `public` table (identities restarted) |
| `GET /api/test/email-log` | Recent `email_log` rows |
| `GET /api/test/job-runs[?job=watcher]` | Recent `job_runs` rows |
| `GET /api/test/watches[?userId=]`, `PATCH /api/test/watches` `{ id, notifiedAt?, lastClosedAt? }` | Raw watch rows; back-date watcher state |

## The fake (`e2e/fake-gosolar-server.ts`)

Wraps `startFakeGoSolar()` from `tests/helpers/fake-gosolar.ts` (F5 affinity cookies included)
behind a front server on the fixed port. Seed, restored by every reset:

- Terms: `202701` Spring Semester 2027 (open), `202608` Fall Semester 2026 (View only).
- `202701` CSC 1301: CRN `80001` open (3 seats, Mon/Wed 9:00–9:50 AM), CRN `80002` closed
  (Mon/Wed 11:00 AM–12:15 PM). CSC 1302: CRN `80003` open (Mon/Wed 9:30–10:20 AM, overlaps 80001).
  MATH 2211: CRN `80010` open (Tue/Thu 10:00–10:50 AM). Subjects CSC and MATH.

Control endpoints: `POST /__control/reset`, `POST /__control/sections`
`{ subject, courseNumber, crn, seatsAvailable?, waitCount? }`, `POST /__control/fail-searches`
`{ kind: "affinity" | "http", status?, count? }` (the next section searches fail; "affinity" answers
`success:true, data:null`), `GET /__control/emails` (what the fake Resend received),
`GET /__control/requests` (GoSolar requests). Use the `fake` helpers in `support.ts`.

## Coverage

- `home.spec.ts`: landing renders; theme toggle flips `<html data-theme>` and persists across
  reload; `/opengraph-image` is a 200 `image/png` and `/` carries `og:image`, `twitter:card` and
  `twitter:image`; `/privacy`, `/terms`; the 404 page; the landing sample card flip.
- `auth.spec.ts`: `/settings` signed out redirects to `/?next=%2Fsettings`; test login sets an
  HttpOnly SameSite=Lax `pw_session`, `/` then redirects to `/dashboard` and the shell shows the
  account menu; logout (303) clears it; logout with a foreign `Origin` is 403; the Google login
  route redirects to accounts.google.com with `redirect_uri=http://localhost:3450/api/auth/google/callback`
  and a state cookie; the test login rejects a wrong secret.
- `api-flows.spec.ts` (desktop project only): course search returns the fake's 2 sections;
  watch add/list/remove (401 signed out, idempotent add, 403 cross-origin, 409 view-only term);
  schedule add/list/remove; the cron watcher end to end (`POST /api/cron/watch?sync=1`):
  open section sends one alert through the fake Resend, logs `email_log` and a `job_runs` row;
  a repeat run sends nothing; closing the section gives `markedClosed: 1`; back-dating
  `last_closed_at` past `REARM_AFTER_MS` gives `rearmed: 1`; reopening sends a second alert.
- `dashboard.spec.ts`: member greeting with the first name; Tracked / Seats opened / Scheduled
  tiles after seeding 2 watches + 1 schedule entry; feature cards link to the member routes;
  Getting started shows progress (0 → 2 of 3), hides when all done, and stays dismissed across a
  reload; What's new dismisses for good; the active nav item's icon plays (`data-playing` on its
  `svg[data-icon]` wrapper, then off) after Dashboard → Course search; the What's new finale ends
  with "Welcome to PantherWatch" fading (an opacity transition to 0 while still mounted), then the
  overlay fading, never a cut (the story's timers run on Playwright's fake clock).
- `course-search.spec.ts`: the first load fetches terms from the fake's `getTerms` once, the
  reload is served from the `terms` table; subject combobox (type "CS" → CSC ranks first → chip;
  with a subject picked the list stays shut on focus/click until ArrowDown or typing);
  submit lands on `/course-results?term=202701&subjects=CSC`; the Recent searches chip; the
  missing-subject field error.
- `course-results.spec.ts`: CSC 1301 shows 2 cards ("3 open" / "Full"); Open seats (inline, or
  the Filters sheet on mobile) and the text filter; Edit search from the results page (CSC 1302)
  shows the new results with the old `?q=` filter, edit form and URL state gone; the title opens
  the dialog with `?crn=80001`, tabs switch (`?tab=`), Back closes it; `?crn=` is pushed only after
  the open morph and dropped after the close (Close button, Escape), and a tab picked before the
  push lands on the dialog's entry; a `?crn=` deep link; Watch
  on / off and Add to schedule as a member (visible "Watching" / "Added" labels that the names follow, `aria-pressed` state), checked through
  `/api/watches` and `/api/schedule`; the guest sign-in toast.
- `tracked-classes.spec.ts`: two watches with live seats, open first; the All/Open/Full
  radiogroup counts; Remove survives a refresh;
  Undo; a one-shot affinity failure (`fake.failSearches`) shows the partial banner, Refresh
  recovers; the empty state.
- `schedule-builder.spec.ts`: week grid blocks in the right day columns; Agenda; block dialog
  color change persisted by the PATCH (checked after reload); remove + Undo (color kept); Add
  classes → Search tab → CSC 1302 80003 gives the warning toast, conflict outlines and the
  ConflictBanner, and the new blocks' one-shot `data-fresh` highlight appears and clears; Export
  .ics downloads 3 `VEVENT`s; Agenda is the default at 375 px.
- `settings.spec.ts`: profile name/email; theme System/Light/Dark applies and persists; delete
  account needs `DELETE` typed (any case), then lands on `/` without a cookie, `/settings` redirects, the
  `goodbye` row is in `email_log`.
- `admin.spec.ts` (desktop project only): non-admins get the 404 page; Overview tiles; Users
  search; Announcements publish → banner on another member's dashboard, Pause → gone; dismissing
  the only announcement collapses the banner, stores the dismissal and survives a reload; Grades
  upload of the real `data/grade-csv/202601__*.csv` pair (swap warning + Swap files, success
  toast, term listed); Email tab send → fake Resend + `Logged as #id` toast; Jobs lists the
  watcher run.
- `a11y.spec.ts`: axe (WCAG 2.0/2.1 A+AA) on `/`, `/privacy`, `/terms`, `/dashboard` (guest), and
  signed in on `/dashboard`, `/course-search`, `/course-results`, `/tracked-classes`,
  `/schedule-builder`, `/settings` (with a watch and two scheduled classes); light and dark;
  fails on serious/critical violations.

Both projects (`chromium` 1280x800, `mobile` Pixel 7) run everything except `api-flows` and
`admin`.

## Writing more specs

Import `test`, `expect` and helpers from `./support` (its `test` also filters the dev server's HMR
socket, so files saved mid-run, and Turbopack "restart" updates for a stale dev shell, do not
reload pages). `freshUser()`, `addWatch()` and `addToSchedule()` seed through the real API. Reset in `beforeEach`, sign in with
`login(page.request)` for a browser or `login(request)` for API calls, and send `SAME_ORIGIN`
headers on cookie-authenticated mutations. Before clicking a client component right after
navigation, `await hydrated(locator)`: clicks on server-rendered markup before hydration are lost.
Find toasts with `toast(page, text)` (list items of the "Notifications" region; their text is
announced through the region's persistent sr-only live regions, so don't look for `role="status"`
on the toast itself). Animations are real (dialogs and sheets slide), so call
`await animationsDone(page)` before a `force` action, which skips Playwright's stability wait.
