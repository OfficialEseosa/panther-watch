# Vercel setup: PantherWatch (Next.js, Hobby)

Target: one Vercel project serving `pantherwatch.app` (UI and API) from `web/` in this repo, Node.js runtime, region `iad1` (same AWS region as Supabase `us-east-1`).

Sources: limits come from `docs/audit-2026-10/01-hosting-feasibility.md` section 1. Platform behavior was checked against vercel.com/docs on 2026-10-25, with links inline.

## 1. Create the project

1. Vercel dashboard → **Add New… → Project** → import the PantherWatch GitHub repo.
2. **Root Directory**: `web`. Framework preset: **Next.js**, detected from `web/package.json`. Leave Build/Install/Output commands at their defaults.
3. Leave the environment variables empty for now (section 2). Builds don't need them, because `web/src/lib/env.ts` validates lazily on the first request. Click **Deploy**.
4. Settings → **Build and Deployment** → Node.js Version: **22.x** (matches `@types/node` ^22).
5. Settings → **Functions**:
   - **Fluid Compute**: on. It is on by default for projects created after 2025-04-23 (https://vercel.com/docs/fluid-compute). Confirm the toggle, and keep `"fluid": true` in `vercel.json` (section 3) so the setting is pinned in code.
   - **Function Regions**: `iad1` (Washington, D.C.), the default for new projects. Hobby allows a single region (https://vercel.com/docs/functions/configuring-functions/region).
6. Settings → **Git**: production branch `main`. Every other branch gets a Preview deployment.
7. Settings → **Deployment Protection**: keep **Standard Protection** (Vercel Authentication). It protects every deployment except production domains (https://vercel.com/docs/deployment-protection). Preview URLs therefore return a Vercel login page to curl and to pg_net. Smoke-test on the project's production domain (cutover-checklist.md step 4).

The old SPA project (`frontend-web/`) keeps running untouched until the domain move.

## 2. Environment variables

Set these in Settings → **Environment Variables**. Mark every one **Sensitive** except `APP_URL` and `ADMIN_EMAILS`. The schema lives in `web/src/lib/env.ts`, with an example in `web/.env.example`. If any variable is missing or invalid, the first request that reads env fails with an error that names every bad variable.

| Name | Production value | Preview value | Notes |
|---|---|---|---|
| `DATABASE_URL` | `postgresql://postgres.movyaglwmwaunkowajxu:<DB_PASSWORD>@<POOLER_HOST>:6543/postgres?sslmode=require` | Same, or a separate Supabase project if previews must not touch prod data | **Transaction pooler**, port **6543**. Copy `<POOLER_HOST>` from Supabase Dashboard → **Connect** → Transaction pooler (shape `aws-N-us-east-1.pooler.supabase.com`). User is `postgres.<ref>`. URL-encode the password. `web/src/db/index.ts` (node-postgres) strips every `ssl*` URL parameter and always verifies TLS against `DATABASE_CA_CERT`, so `sslmode` here is informational. |
| `DATABASE_CA_CERT` | Supabase root CA PEM (Dashboard → Database settings → SSL Configuration → Download certificate) | same | **REQUIRED for Supabase.** Supabase's certificates chain to its own root CA, which Node doesn't trust, so without this every connection fails closed (`SELF_SIGNED_CERT_IN_CHAIN`) instead of going unverified. Paste the multi-line PEM, or one line with `\n` escapes. `npm run db:migrate` and `scripts/backfill-grades.ts` read the same variable. |
| `GOOGLE_CLIENT_ID` | existing OAuth client ID | same | Google Cloud Console → Google Auth Platform → Clients (older UI: APIs & Services → Credentials). |
| `GOOGLE_CLIENT_SECRET` | existing client secret | same | |
| `JWT_SECRET` | `openssl rand -base64 48` | a different value | ≥ 32 chars (zod-enforced). HS256 key for the `pw_session` cookie. Generate a new one: old Spring tokens (HS512, `localStorage`) aren't reused, so everyone signs in once after cutover. |
| `RESEND_API_KEY` | Resend key with **Sending access**, restricted to domain `class.pantherwatch.app` | same key, or none (email sends then fail) | Sender is `PantherWatch <no-reply@class.pantherwatch.app>`. The free tier allows 100 emails/day and 3,000/month (audit section 4). |
| `CRON_SECRET` | `openssl rand -hex 32` | a different value | Must equal the Vault secret `pantherwatch_cron_secret` (`supabase-cron.sql`). Vercel also sends this value automatically as `Authorization: Bearer <CRON_SECRET>` on its own cron invocations (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs). |
| `APP_URL` | `https://pantherwatch.app` | the stable URL being tested | No trailing slash (it is stripped anyway). Used to build the OAuth redirect URI `${APP_URL}/api/auth/google/callback`. Until the domain moves, set it to the project's `https://<project>.vercel.app` (cutover step 4). |
| `ADMIN_EMAILS` | copy from the Koyeb service env | same | Comma-separated, case-insensitive. |

CLI alternative, run from `web/`. These commands only manage env vars; deploy through git push, not `vercel deploy`.

```sh
cd web
vercel link                                  # pick the new project
vercel env add DATABASE_URL production --sensitive        # value at the prompt, not in shell history
vercel env add CRON_SECRET production --sensitive
vercel env add APP_URL production --value "https://pantherwatch.app" --no-sensitive --yes
# ...repeat per variable and per environment (production / preview).
# Production and Preview default to the Secret type; --no-sensitive makes a Config var.
vercel env ls
vercel env update APP_URL production                      # change a value later
```

Env changes apply only to **new** deployments. Redeploy after editing (Deployments → ⋯ → Redeploy).

## 3. `web/vercel.json`

`vercel.json` lives in the Root Directory (`web/`).

```json
{
  "$schema": "https://openapi.vercel.sh/vercel.json",
  "fluid": true,
  "regions": ["iad1"],
  "crons": [
    { "path": "/api/cron/cleanup", "schedule": "0 12 * * *" }
  ]
}
```

- **The cron entry is a backup trigger for cleanup only.** pg_cron (`supabase-cron.sql`) is the primary trigger for the three scheduled jobs (watch, cleanup, syllabi; grades are not scheduled, see section 4). Cleanup is idempotent, so a second run each day does no harm and keeps expired-term purges going if pg_cron breaks.
- Hobby limits: one invocation per day at most. More frequent expressions fail the deploy, and the job fires anywhere within the named hour. `0 12 * * *` fires 12:00–12:59 UTC (08:00–08:59 EDT), well after pg_cron's 08:05 UTC cleanup. The schedule is always UTC (https://vercel.com/docs/cron-jobs, `/manage-cron-jobs`).
- **Vercel cron sends `GET`**, not POST, to the production deployment, with user agent `vercel-cron/1.0` (https://vercel.com/docs/cron-jobs#how-cron-jobs-work). `app/api/cron/cleanup/route.ts` must therefore export both `GET` and `POST` with the same handler and the same bearer check. The other three cron routes stay POST-only.
- Vercel does not retry failed cron runs, and cron jobs do not follow redirects. Don't put the route behind `proxy.ts` redirects.
- Do **not** add the watcher here. A `*/3` expression fails Hobby deploys.

## 4. Function duration (`maxDuration`)

- Hobby with fluid compute: default **300 s**, maximum **300 s**. The 800 s maximum and the 30-minute beta are Pro/Enterprise only (https://vercel.com/docs/fluid-compute#default-settings-by-plan).
- Set it per route with segment config: `export const maxDuration = 300;` in each `app/api/cron/*/route.ts`. Function code takes precedence over `vercel.json` and the dashboard.
- pg_net waits **10 s** for a response (`supabase-cron.sql`). Cron routes must verify the bearer, take `pg_try_advisory_lock`, answer **202** immediately, and do the work in `after()`. Time spent in `after()` still counts toward `maxDuration` and Provisioned Memory.
- Budget per watcher run: **~38 s** at a 3-minute cadence leaves room for app traffic inside 360 GB-hr (audit section 1). The watcher should stop starting new GoSolar groups at ~30 s and leave the rest for the next run.
- `grades` is not scheduled. GSU's APEX site now sits behind a Cloudflare challenge that blocks non-browser clients, so `/api/cron/grades` can only fail from Vercel. Grade history is loaded from `web/data/grade-csv/` by `scripts/backfill-grades.ts` at cutover, and new terms come in through the admin grade upload (`web/data/README.md`).

## 5. Move the domain from the old project

Run this at cutover-checklist.md step 6, not earlier.

1. In the **new** project: Settings → **Domains** → **Add Domain** → `pantherwatch.app`. Also add `www.pantherwatch.app` if the old project has it, with the same redirect setting.
2. Vercel shows a **Move Domain** prompt naming the source (old SPA project) and destination. Check the list, since redirecting domains move too, then confirm. Don't delete the domain from the old project first: deleting before reassigning can interrupt traffic (https://vercel.com/kb/guide/zero-downtime-migration-for-dns).
3. Wait for the domain card to show **Valid Configuration**, then load `https://pantherwatch.app` and check the response comes from the new app.
4. Don't change DNS records for `class.pantherwatch.app`. They hold the Resend SPF/DKIM/MX records, and removing them breaks email.

Rollback is the same flow in reverse: add `pantherwatch.app` to the old project and confirm the move.

## 6. Web Analytics and Speed Insights

```sh
cd web
npm i @vercel/analytics @vercel/speed-insights
```

In `web/src/app/layout.tsx`, inside `<body>`:

```tsx
import { Analytics } from "@vercel/analytics/next";
import { SpeedInsights } from "@vercel/speed-insights/next";
// ...
<Analytics />
<SpeedInsights />
```

Then enable both in the project: **Analytics** tab → Enable, and **Speed Insights** tab → Enable. Hobby limits:

- Web Analytics: 50,000 events/month, shared across all projects on the account, with a 1-month reporting window. If you exceed it, collection pauses after a 3-day grace period. You are never billed (https://vercel.com/docs/analytics/limits-and-pricing).
- Speed Insights: 10,000 events over a rolling 30 days, shared across the team. It shows only the Real Experience Score. At the limit, collection pauses for at least 14 days (https://vercel.com/docs/speed-insights/limits-and-pricing). If that gets close, set `sampleRate` on `<SpeedInsights />`.

## 7. Hobby limits that matter, and what to watch

Monthly allowance: 1M invocations, **4 CPU-hours Active CPU**, **360 GB-hrs Provisioned Memory**, 100 GB Fast Data Transfer, 1M CDN requests. Functions are fixed at 2 GB / 1 vCPU. If you go over, the feature is generally unusable until 30 days have passed (audit section 1; https://vercel.com/docs/plans/hobby).

- **Provisioned Memory is the binding limit.** It's billed for the whole time a request is in flight, including time spent waiting on GoSolar. 360 GB-hr at 2 GB is 180 instance-hours ≈ 648,000 s/month. The watcher runs 20 × 24 × 30 = 14,400 times a month, so at 38 s per run it uses ~547,000 s, about 84% of the allowance. Concurrent requests on one instance share that memory bill.
- **Active CPU (4 h)** is shared with page rendering. Keep pages mostly static or client-rendered.
- Runtime logs on Hobby cover only the last hour. Use the `cron.job_run_details` and `net._http_response` queries in `supabase-cron.sql` for history.

Check weekly, and daily during the first week after cutover, under the **Usage** tab (account level):

| Metric | Healthy | Act when |
|---|---|---|
| Provisioned Memory (GB-hrs) | ≤ (day of month ÷ 30) × 360 | Above that pace: lower the watcher's per-run time budget, or drop to `*/5` in `supabase-cron.sql` |
| Active CPU | ≤ (day ÷ 30) × 4 h | Above pace: look for server-rendered pages or CPU-heavy parsing (grades CSV, syllabi JSON) |
| Function Invocations | ≪ 1M (the watcher uses ~14.4k) | Unexpected growth: check for a client polling loop |
| Fast Data Transfer | ≪ 100 GB | |

Also open the project's **Observability** tab and filter by route: `/api/cron/watch` duration should stay well under 38 s, and errors under 5xx.
