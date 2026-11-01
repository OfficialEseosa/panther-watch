# SEO: Google Search Console

Google kept showing the old SPA's title ("PantherWatch Web") with no description long after the Next.js cutover. The site now serves a specific title, meta description, canonical URL and JSON-LD on every public page, noindex on the members-only and live-search pages, and a sitemap with `lastmod`. Google only picks that up when it re-crawls, so these steps are for the owner.

## What the site serves (for reference)

- Canonical host: `https://www.pantherwatch.app`. `https://pantherwatch.app` 308s to www (Vercel: Settings → Domains → `pantherwatch.app` → Redirect to `www.pantherwatch.app`, status **308 Permanent**). `http://` 308s to `https://` (Vercel default).
- Indexable: `/`, `/course-search`, `/developers`, `/privacy`, `/terms`, each with `<link rel="canonical">` on the www host. These are the only URLs in `/sitemap.xml`.
- `noindex`: `/dashboard`, `/course-results`, `/tracked-classes`, `/schedule-builder`, `/settings`, `/admin/**`, `/connect`. `robots.txt` also disallows most of them (each `/course-results` hit is a live GoSolar search), so Google won't crawl them at all.
- Home page JSON-LD: `WebApplication`, `Organization`, `WebSite` (no SearchAction: the search form has no free-text `q` parameter).
- Code: `web/src/lib/site.ts` (canonical origin), per-page `metadata` exports, `web/src/app/sitemap.ts`, `web/src/app/robots.ts`.

## 1. Verify the domain

Use a **Domain** property (covers `www`, the apex, `http` and `https` in one):

1. Open <https://search.google.com/search-console>, sign in with the owner Google account, **Add property** → **Domain** → `pantherwatch.app`.
2. Google shows a TXT record (`google-site-verification=…`). Add it as a TXT record on `pantherwatch.app` at whoever serves the DNS:
   - DNS on Vercel: Vercel dashboard → **Domains** → `pantherwatch.app` → **DNS Records** → add `TXT`, name `@`, value from Google. (`vercel dns add pantherwatch.app @ TXT "google-site-verification=…"` does the same.)
   - DNS at the registrar: add the same TXT record there.
3. Back in Search Console click **Verify**. DNS can take minutes to an hour; retry if it fails at first.

Alternative: Vercel's Google Search Console integration (Vercel Marketplace / Integrations) can add the record for you; it still ends with **Verify** in Search Console.

## 2. Submit the sitemap

Search Console → the `pantherwatch.app` property → **Sitemaps** → enter `https://www.pantherwatch.app/sitemap.xml` → **Submit**. Status should turn to "Success" with 5 discovered URLs.

## 3. Request re-indexing of the key pages

Search Console → **URL Inspection** (search bar at the top):

1. Inspect `https://www.pantherwatch.app/` → **Test live URL** (check that the title and canonical look right) → **Request indexing**.
2. Repeat for `https://www.pantherwatch.app/course-search`.

If the old apex URL (`https://pantherwatch.app/`) is what Google has indexed, inspecting it should show "Page with redirect"; that is expected and it will be folded into the www URL.

## 4. Wait, then check

Re-crawling takes days (sometimes a couple of weeks) and the snippet in results updates after that. Don't keep re-requesting indexing; once per page is enough. Check progress in **Pages** (indexing report) and **Performance** (queries such as "pantherwatch"). Google may still rewrite the displayed title or snippet; that is its choice, not a bug.

Quick self-check of what Google will see:

```sh
curl -s https://www.pantherwatch.app/ | grep -o '<title>[^<]*\|<meta name="description"[^>]*\|<link rel="canonical"[^>]*'
curl -sI https://pantherwatch.app/ | head -1   # HTTP/1.1 308 Permanent Redirect
```
