# Hosting feasibility: $0/month on Vercel Hobby (verified 2026-10-25)

Vercel Hobby cron runs once per day at most, with up to a 59-minute timing window. Vercel can still run the seat-watcher route; the trigger has to come from outside. The constraints that actually bind are Vercel's 360 GB-hr memory allowance, Neon's compute cap and Resend's 100 emails/day.

## 1. Vercel Hobby limits

| Item | Hobby value | Source |
|---|---|---|
| Cron jobs | 100 per project, but **once per day at most**. More frequent expressions fail at deploy. Timing is per hour: `0 1 * * *` fires anywhere from 1:00 to 1:59. | https://vercel.com/docs/cron-jobs/usage-and-pricing (2026-07-15) |
| Function duration | 300 s default and 300 s maximum, with fluid compute. 800 s and the 30-minute beta are Pro/Enterprise only. | https://vercel.com/docs/functions/configuring-functions/duration (2026-08-24) |
| Memory | Fixed at 2 GB / 1 vCPU. | https://vercel.com/docs/functions/configuring-functions/memory |
| Monthly allowance | 1M invocations, 4 CPU-hours Active CPU, **360 GB-hrs Provisioned Memory**, 100 GB Fast Data Transfer, 1M CDN requests | https://vercel.com/docs/plans/hobby (2026-09-14) |
| Going over | "In most cases… you will have to wait until 30 days have passed before you can use the feature again." | same |
| Builds | 45 min per deployment, 100 deployments/day. No build-minute quota. | https://vercel.com/docs/limits |
| Commercial use | Non-commercial personal use only. Ads, payments, affiliate links count as commercial; donations do not. A free, ad-free PantherWatch qualifies. | https://vercel.com/docs/limits/fair-use-guidelines |
| Workflows / Queues | 50,000 workflow events/month. 1M queue operations/month. | https://vercel.com/docs/workflows/pricing |
| Daemons (beta) | 10 vCPU-hours/month. Not usable for an always-on poller. | https://vercel.com/kb/guide/vercel-daemons (2026-10-15) |

**Memory allowance is the real ceiling.** Provisioned memory is billed for the whole time a request is in flight, including time waiting on GoSolar.

- 360 GB-hrs at 2 GB = 180 instance-hours ≈ 648,000 s/month.
- Leaving room for app traffic: roughly **~25 s per run at every 2 min**, **~38 s at every 3 min**, **~63 s at every 5 min**.
- Concurrent requests on one instance share the memory bill, so parallel GoSolar calls inside one run are effectively free.

Vercel Workflow as an in-Vercel scheduler is marginal (step = 3 events, sleep = 2; every 5 min ≈ 43k events/month, every 2 min ≈ 108k). Fragile; not recommended.

## 2. Free ways to call the route every 1–5 minutes

| Option | Free limits | Reliability | Secret-header route? |
|---|---|---|---|
| **cron-job.org** | Free, no job limit, down to every minute. **30 s request timeout.** | No punctuality guarantee; auto-disables after 25 consecutive failures (email alert available). | Yes, custom headers. Return 202 immediately, do work in `after()`. |
| **GitHub Actions schedule** | Every 5 min at most. Free on public repos; 2,000 min/month private. | Delayed under load, jobs may be dropped. Disabled after 60 days inactivity on public repo. | Yes. |
| **Supabase pg_cron + pg_net** | Down to every second. pg_net `http_post` accepts headers; **default timeout 2000 ms** (configurable). | Runs inside your own DB. Scheduled queries also keep the free project from pausing. | Yes. Secret in Supabase Vault. Return 202 and use `after()`. |
| **Upstash QStash** | **1,000 messages/day**, 10 schedules. Every 2 min (720/day) fits; every minute does not. Retries count. | Managed, retries, DLQ. | Yes. |
| **Cloudflare Workers cron** | 5 triggers, 1-min granularity, 100k req/day, **10 ms CPU**, **50 subrequests/run**. | Good. | Yes. Fine as trigger, too tight as the scraper. |
| **Val Town** | Free crons every **15 min** only. | — | Doesn't meet requirement. |

## 3. Free Postgres

| Option | Free limits | Under a 1–5 minute cron |
|---|---|---|
| **Supabase** | 500 MB DB, shared CPU / 500 MB RAM, 5 GB egress, 2 active projects. Paused after 1 week of inactivity; restorable for 1 year. | **Stays awake.** The poller queries every run. No compute-hour cap. |
| **Neon** | 100 CU-hours/project/month (= 400 h at 0.25 CU). Scale-to-zero after 5 min can't be disabled. | **Breaks.** A 2–5 min cron keeps it awake ~730 h/month ≈ 182 CU-hours, over the cap. DB goes down mid-month. |
| **Vercel Postgres** | Gone; moved to Neon Dec 2024. | Same as Neon. |
| **Prisma Postgres** | 200k operations/month, 1 GB. | Tight. |
| **Turso / libSQL** | 500M rows read, 10M written/month. | Ample, but SQLite, so schema/queries need porting. |

## 4. Resend free tier
**100 emails/day (resets UTC midnight) and 3,000/month**, 10 req/s. Each recipient counts separately. A popular section opening could exhaust the daily quota in one run; the watcher needs a daily email budget and prioritization.

## 5. Hosts for the worker if it leaves Vercel

| Host | Genuinely $0 and reliable for a 1–5 min poller? |
|---|---|
| Cloudflare Workers free | Only as a trigger. |
| Fly.io | **No.** No free tier for new orgs; cheapest always-on $2.19/mo. |
| Render free | Spins down after 15 min; no free cron/workers; free Postgres expires after 30 days. Not recommended. |
| Railway | **No.** $1 credit/month after trial. |
| Oracle Cloud Always Free | **Yes, the only real $0 always-on VM.** 2 AMD micro VMs or Ampere A1 (2 OCPU / 12 GB). Idle instances (p95 CPU < 20%, network < 20%) may be reclaimed after 7 days; switching to Pay-As-You-Go reportedly stops this. Card required. |
| Koyeb (current) | One free web service, 512 MB, 0.1 vCPU, scales to zero after 1 h without traffic, "should not be used for production". Shaky. |

## 6. Node.js cookie and connection handling for GoSolar
- Node `fetch` (undici) has no cookie jar. Use `headers.getSetCookie()` or `fetch-cookie` + tough-cookie `CookieJar`.
- **Why the F5 affinity cookie gets "dropped":** without a OneConnect profile, BIG-IP picks a backend once per TCP connection; later requests on that keep-alive connection go to the same server regardless of the BIGipServer cookie. A shared connection pool sends one session's requests to the wrong backend. Matches Java fix in commit e8233ee.
- **Vercel keeps connections between invocations.** Fluid compute runs multiple invocations in one process; module-level state (undici global dispatcher, keep-alive sockets) persists.
- **Fix:** each run (one cookie jar) gets its own `new Agent()` passed as `fetch(url, { dispatcher })`, closed at the end. Never use the global dispatcher for GoSolar. Don't fire concurrent searches on one session.

## Recommended: $0/month, seat-watcher every 2–5 minutes
**Next.js on Vercel Hobby + Supabase free Postgres + Supabase pg_cron/pg_net calling the watcher route every 3 minutes. Cloudflare Worker cron (or cron-job.org) as backup trigger.**
- Route: constant-time secret-header check, `pg_try_advisory_lock` so runs never overlap, return 202, do work in `after()` with `maxDuration = 300`. Stop at ~30 s and carry the rest to the next run.
- Fewer GoSolar calls: group watched CRNs by subject + course number.
- DB connection: Supabase transaction pooler + `attachDatabasePool` from `@vercel/functions`.
- Cleanup job: native Vercel daily cron.
- Grade-distribution scraper: GitHub Actions on public repo or local, writing straight to Supabase (may exceed 300 s).
- Tradeoffs: 360 GB-hr caps each run at ~25–40 s; going over any Hobby limit pauses the feature up to 30 days; 4 CPU-hour allowance shared with page rendering so keep pages mostly static/client-rendered; runtime logs cover last hour only; Resend 100/day needs throttling.

## Second-best
Vercel + Supabase for the app, poller as a long-running process on an Oracle Always Free VM (keep Spring or port to Node). Gains precise intervals and no duration budget; costs self-managed server, card at signup, idle-reclamation risk.
