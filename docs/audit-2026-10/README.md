# October 2026 audit and rewrite

Four read-only audits, written 2026-10-25, that planned the move from the Spring Boot backend on Koyeb and the React/Vite SPA to a single Next.js app in `web/`. The runbooks that carry the decisions out are in `docs/runbooks/`. The production database steps are in `web/scripts/README.md`.

## Files

**[01-hosting-feasibility.md](01-hosting-feasibility.md).** Can PantherWatch run for $0/month? It covers Vercel Hobby limits (crons run once a day at most, 300 s functions, 360 GB-hr Provisioned Memory, which is the limit that actually binds), free ways to trigger a route every 1–5 minutes (cron-job.org, GitHub Actions, Supabase pg_cron + pg_net, QStash, Cloudflare Workers), free Postgres options, Resend's 100 emails/day, and fallback worker hosts. Its recommendation is Next.js on Vercel Hobby plus Supabase Postgres, with pg_cron calling the seat watcher every 3 minutes. A run budget of about 38 s at that cadence keeps the watcher inside the memory allowance.

**[02-backend-audit.md](02-backend-audit.md).** A file-by-file read of the ~4,600-line Spring backend. It covers the GoSolar SSB calls and their quirks (the F5 affinity cookie needs a fresh connection, there is no CRN search), the APEX grade-distribution scraper, RateMyProfessors, syllabi, every scheduled job, the HTTP API surface, the data model, and auth. It also lists dead and broken code. The worst bug it found: a class that reopened within 6 h of an earlier alert emailed nobody. Section 4 proposes the normalized schema, which became `web/src/db/schema/` and `web/drizzle/`. Section 7 rates how hard each feature is to port.

**[03-frontend-audit.md](03-frontend-audit.md).** An audit of the 9.6k-line React SPA: routes, contexts, the API client, components, CSS and performance. Its top five findings: logout left the previous user's schedule behind, Tracked Classes could crash, the layout was rebuilt on every navigation, results pages sent ~24 grade/rating requests each, and the page was heavy (a 343 KB background image and framer-motion on every page). It ends with the App Router mapping the new `web/src/app/` follows.

**[04-live-schema.md](04-live-schema.md).** A read-only inspection of the production Supabase project (`movyaglwmwaunkowajxu`, Postgres 17.4). Findings: 27 users and 1 announcement, the working tables were empty (the old app's own purge jobs had cleared them), RLS was off and `anon`/`authenticated` had full grants on every table, a frozen `email_type` CHECK, `public.users` had drifted from `auth.users`, and 19 users had no `google_sub`. These facts set the guards in `web/scripts/prod-migrate/`.

## Decisions taken

- **Hosting:** Next.js on Vercel Hobby, Supabase free Postgres, and Supabase pg_cron + pg_net calling `/api/cron/watch` every 3 minutes (`docs/runbooks/supabase-cron.sql`). Vercel's own once-a-day cron is only a backup trigger for cleanup.
- **framer-motion removed.** It is not a dependency of `web/`, so its 127 KB no longer loads on every page (03 top five, item 5).
- **Grades come in through the admin upload, not a scraper.** GSU's APEX site now sits behind a Cloudflare challenge that blocks non-browser clients. The 13 terms of history are committed in `web/data/grade-csv/` and loaded once by `scripts/backfill-grades.ts`. Each new term is exported in a browser and uploaded through the admin grade upload. There is no grades cron job.
- **Normalized schema, existing users kept.** The five Hibernate tables are replaced by the Drizzle schema (`drizzle/0000_core.sql`, plus `0001_course_meta.sql` for grades, syllabi and the RMP cache). The 27 existing users are copied with their ids, the empty working tables are dropped, and `anon`/`authenticated` grants are revoked (`web/scripts/prod-migrate/`).
- **Integration tests over unit tests.** Route handlers are tested end to end against an in-memory PGlite with the real migrations applied, a local fake GoSolar, and signed session cookies (`web/tests/`). Unit tests are kept for pure parsing code.
- **Android client deleted.** `frontend-android/` was stale and spoke the old Spring API, so it was removed instead of being ported.
