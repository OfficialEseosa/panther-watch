# Frontend audit (React + Vite), read-only, 2026-10-25

Paths relative to `frontend-web/src`. Size: 9,632 lines JS/JSX, 7,407 lines CSS. `npx eslint .` → 0 problems.

**Top five:**
1. **Logout leaves the schedule behind.** `clearLocalData` doesn't clear `pantherwatch.schedule.v1`; next account to sign in on that browser gets the previous user's classes POSTed into its own schedule.
2. **Tracked Classes can crash.** `TrackedClasses.jsx:81` passes an `Error` object to a component that renders it as text.
3. **Every navigation rebuilds the whole layout.** Header, sidebar, banner and terms are thrown away and refetched each time.
4. **~24 grade/rating requests per results page, each with a CORS preflight.** Detail popup uses whatever had loaded at click time and never updates.
5. **Heavy page.** 343 KB background image at 4% opacity; framer-motion (127 KB) on every page.

## 1. Routes and pages (`App.jsx:90-164`)
Provider tree `Theme > Auth > WatchedClasses > Schedule > Tutorial` (`:75-79`). While `loading`, plain "Loading..." div (`:80-88`).

| Path | Component | Gate | Wrapper |
|---|---|---|---|
| `/auth/callback` | inline `AuthCallback` (`App.jsx:26`) | none | none. Token grabbed when `authService.js` loads (`:32`, `:57-68`) |
| `/privacy`, `/terms` | Legal pages | public | `LegalLayout` |
| `/dashboard` | `DashboardWrapper` → `Dashboard` | guest OK | TermsProvider + DashboardLayout |
| `/course-search` | `CourseSearch` | guest OK | same |
| `/course-results` | `CourseResultsPage` | guest OK | same |
| `/tracked-classes` | `TrackedClasses` | `isLoggedIn` | same |
| `/admin` | `AdminPanel` (only `lazy()` route) | `isLoggedIn`; admin check inside | same + Suspense |
| `/schedule-builder` | `ScheduleBuilder` | `isLoggedIn` | same |
| `/settings` | `Settings` | `isLoggedIn` | **no layout, no TermsProvider** |
| `/` | `Home` or redirect to `/dashboard` | — | none |

- `TermsProvider` + `DashboardLayout` repeated inside each of six route elements (`App.jsx:101-153`) → remount on every navigation → refetch `/courses/terms`, `/admin/check`, `/announcements/active`.
- `DashboardWrapper.jsx:9-18` forces a 500 ms full-screen loader on every `/dashboard` visit.
- `App` passes `onLogout` to `DashboardLayout`, which ignores it. Logout lives in `Header.jsx:25` and `Settings.jsx:23`, both `window.location.reload()`.
- Login state tracked twice: `App.jsx:39 isLoggedIn` and `AuthContext.isAuthenticated`.
- Sidebar has no Schedule Builder link (`Sidebar.jsx:26-46`).

## 2. State

| Context | Holds | Fetching | Caching | Memoized? |
|---|---|---|---|---|
| Auth | userInfo, loading, error, refreshUserInfo, logout, isAuthenticated | none; decodes JWT from localStorage | memory | No |
| Terms | terms, loading, error, termMappings, getTermName, isTermViewOnly | `/courses/terms` on every mount | none; hardcoded 2024/2025 fallback `:39-46` | No |
| Theme | theme, setTheme, toggleTheme | — | `pantherwatch.theme`; sets `.theme-dark` on `<html>` in an effect (after first paint) | Yes |
| Tutorial | showTutorial, hasSeenTutorial, markTutorialAsSeen | — | `pantherwatch_tutorial_seen` | No |
| WatchedClasses | list, details, count, loading, error, add/remove/isWatching/loadWithDetails/refreshData | count + list in parallel when user known (`:58-61`); reload after every add/remove; details on each TrackedClasses/ScheduleBuilder mount | service 5-min memory cache; in-flight dedupe (`:75`) | No |
| Schedule | scheduleByTerm, loading, add/remove/removeTerms/isScheduled/setCourseColor, conflict toast | `/schedule` on sign-in; local-only POSTed up; DB-only rebuilt via one `/courses/search` per course (`:53-135`) | `pantherwatch.schedule.v1` (full course objects) | No |

Other keys: `pw_token`, `preferredDegreeLevel`, `preferredTerm`, `dismissed_announcements` (unbounded), `pantherwatch_whatsnew_v1_seen`, `avatar_*`. Logout removes `authProvider`, `userData`, `googleUser` (Supabase leftovers, never written) and calls `sessionStorage.clear()` (unused).

**`.js` + `.jsx` split per context** exists only to satisfy `eslint-plugin-react-refresh` `only-export-components` (`eslint.config.js:14`). Side effect: Auth/WatchedClasses/Tutorial "must be used within Provider" guards never fire. Merge to one file per context (18 files → 6).

Hooks: thin wrappers; `useCourseGrades`/`useProfessorRatings`/`useSyllabus` are the same 30-line effect ×3 (no AbortController). `useSchedulePlanner` (342 lines): page controller; its own `/courses/search` at `:259` (third copy); `level: 'US'` hardcoded `:52`.

## 3. API client layer
API base chosen in `apiConfig.js:12`: production if `import.meta.env.PROD` or hostname ≠ `localhost` (so `127.0.0.1` hits prod).

Five auth-header styles: adminService throws without token; watched/schedule send `Authorization: ''`; announcementService makes caller pass token; Settings.jsx builds header by hand; public services none. 11 near-identical try/fetch/!ok/json/catch blocks. Error handling inconsistent (swallow vs rethrow-generic vs read message). **No 401 handling anywhere.** Timeouts only in watched/grade/rating/syllabus; `clearTimeout` in `finally` right after headers so body read isn't covered. `Content-Type: application/json` on GETs makes every grade/rating lookup a preflighted CORS request (two round trips each). `/courses/search` built three ways. `config/index.js` barrel unused.

Raw `fetch` outside `config/`: `TermsContext.jsx:16`, `CourseResultsPage.jsx:58`, `useSchedulePlanner.js:259`, `SubjectAutocomplete.jsx:41`, `Settings.jsx:42`, `CachedAvatar.jsx:53`.

Backend paths actually called (all under `/api`): `GET /auth/google/login`; `GET /courses/{terms,search,subjects,grades,ratings,syllabus}`; `GET/POST/DELETE /watched-classes`; `GET /watched-classes/count`; `GET /watched-classes/full-details`; `GET/POST /schedule`; `DELETE /schedule/{term}/{crn}`; `DELETE /users/me`; `GET /announcements/active`; `GET/POST /announcements`; `PUT/DELETE /announcements/{id}`; `PATCH /announcements/{id}/{deactivate,activate}`; `GET /admin/check`; `GET /admin/users`; `POST /admin/users/search`; `POST /admin/email/send`; `GET /admin/grades/status`; `POST /admin/grades/refresh`.

Uncalled backend endpoints: `GET /admin/emails/stats`, `POST /admin/emails/cleanup`, `GET /watched-classes/check`.

## 4. Components

| Dir | Lines | Notes |
|---|---|---|
| AddClassesModal | 306 | item markup copied twice (`:83-112`/`:134-160`); inline styles use **undefined** vars `--border-color`, `--text-secondary`; styles live in `ScheduleBuilder.css` |
| AdminPanel/* | ~700 | UserSearchSection select-all is dead feature; search POSTs every keystroke, no debounce; `<Icon name="play">` (`AnnouncementManager.jsx:390`) **does not exist** |
| AnnouncementBanner | 134 | polls 5 min, rotates 10 s; crash risk (§7) |
| CachedAvatar | 110 | fetches avatar with CORS, stores data URL in localStorage. Replace with `<img referrerPolicy="no-referrer">` |
| CourseGrades | 136 | `COARSE_BUCKETS` exported but internal only |
| CourseResults/CourseCard | 503 | |
| ExpandedCourseCard | 631 | `OverviewSection` (`:97-162`) copies CourseCard markup; `scopedCount` recomputes filter |
| Header | 172 | `userInfo.lastName` (`:63`) never set |
| Icon | 300 | 42 SVGs. Unused: `classes`, `edit`. Missing: `play`. Near-dupes: `x`/`close`, `check`/`checkmark`, `users`/`people`, chevrons rotated inline in 6 places |
| ScheduleCalendar | 348 | renders **both** grid and agenda; CSS hides one |
| Sidebar | 101 | `comingSoon` branch dead; no Schedule Builder link |
| SubjectAutocomplete | 347 | two modes copy ~60 lines; no out-of-order guard |
| Tutorial | 192 | dark styles keyed on `[data-theme="dark"]` which is never set → always light |
| WhatsNew | 438 | hardcoded GSU PDF iframe (`:258`); imports two other components' CSS; eager |

Unused: `enrollmentUtils.*`; `scheduleUtils.formatActiveDays/getActiveDays`; `timeUtils.getTermName`; `ScheduleBuilder/utils.DAYS` and `isViewOnlyTerm` re-export; `authService.isAuthenticated`, SIGNED_IN emit in constructor; `watchedClassService.isWatchingClass`; context members `refreshUserInfo`, `logout`, `error`, `refreshData`, `termMappings`; `DashboardWrapper`; `index.html:8` loads Google Identity Services, never referenced.

Overlapping utils: 12-hour time formatting ×2; day tables ×5; term names ×3 (two hardcoded 2024–2025 maps); "Building – Room" string ×3; instructor name inline in 6+ places; meeting parsing ×4. `utils/scheduleConflicts.js:4` imports from a page folder. `scheduleComponents.jsx` exists only to keep JSX out of `scheduleUtils.js`. **Recommendation:** `lib/time.ts`, `lib/course.ts`, `lib/terms.ts`; ~400 lines saved.

## 5. CSS
145 KB source, 27 files. Built 87 KB (15 KB gz) + 21.5 KB admin chunk. Theming: 29 custom properties on `:root` with `.theme-dark` overrides in `App.css:1-27,151-165`.

- Undefined variables (silently ignored): `--color-primary-400` (ScheduleBuilder ×6, Settings ×2), `--color-card-bg` ×4 and `--color-bg` (AnnouncementManager), `--color-gray-100/400` (CourseResultsPage), `--border-color`/`--text-secondary` (AddClassesModal inline).
- Second private theming system in `Tutorial.css` (`--card-bg`, `--text-primary`, `--hover-bg`, `[data-theme="dark"]`, 56 hex literals), not wired.
- ~160 hex + 113 `rgba()` literals bypass tokens.
- Global class collisions: `.modal-overlay/.modal-header` (Settings vs AnnouncementManager), `.error-message` (CourseResults vs EmailComposer), `.btn-primary/.btn-secondary` (Home vs ScheduleBuilder), `.back-button`, `.page-header/.page-title/.page-description`, `.spinner`, `.loading-spinner`, `.avatar-placeholder` ×3, `.badge`.
- ScheduleCalendar and AddClassesModal have no CSS file (51 rule groups in ScheduleBuilder.css). WhatsNew imports other components' CSS.
- `index.css` and `App.css` duplicate base rules. Inter via blocking `@import`. `@keyframes fadeIn` ×3, `slideUp` ×2. Breakpoints scattered (768, 600, 560, 480, 640, 900, 1024, 1100). 10 files start with a BOM.

**Recommendation:** CSS Modules (built into Next.js) kill collisions and let each modal/button live once; expect 20–30% reduction. Tailwind = full rewrite, only worth it with a redesign.

## 6. Performance
Bundle: main 329 KB (98 KB gz); `react-vendor` 44 KB (manualChunks matches package name so `react-dom/client` lands in main); framer-motion 127 KB (42 KB gz) **modulepreloaded on every page**. Only AdminPanel code-split. `statue.jpg` 343 KB at 4% opacity on every page. `favicon.png` 69 KB.

Re-renders: every CourseCard is `motion.article` with `layoutId` and no `layoutDependency` → re-measure on every render; filter keystroke re-renders all 12 cards. Context values fresh objects every render (Auth `:61`, Terms `:67`, Tutorial `:29`, Watched `:189`, Schedule `:304`). `CourseResults.jsx:234-236,246` new arrays/closures each render → `ExpandedCourseCard` effects re-run. `Dashboard.jsx:61` rebuilds tutorialSteps → Tutorial re-adds listeners; `closeWhatsNew` resets fade timer.

Fetch: 24 grade/rating requests per results page ×2 (preflight); caches store resolved results only so same professor fetched in parallel multiple times, failures retried every mount. Every navigation refetches terms/admin-check/announcements. `/full-details` (35 s timeout) refetched on every TrackedClasses and ScheduleBuilder mount. Removing one tracked class → DELETE, count+list, list+full-details again. Startup chain: auth check → userInfo → render → count+list (count redundant). Artificial delays: 500 ms dashboard loader; Tutorial 500+300+100 ms.

## 7. Bugs
1. TrackedClasses crashes after any watch error (`TrackedClasses.jsx:81` → `CourseResults.jsx:127` renders Error object).
2. Schedule leaks between accounts (`authService.js:127-144` misses `pantherwatch.schedule.v1`; `ScheduleContext.jsx:61-70` POSTs local-only).
3. Schedule deletions come back (union merge across devices).
4. Side effects inside `setState` updaters (`ScheduleContext.jsx:171-200, 209-230, 243-265`) → DB sync skipped when updates pending.
5. Detail popup shows stale grades/ratings (`CourseCard.jsx:53` snapshots at click).
6. AnnouncementBanner crash when poll returns fewer items than `currentIndex` (`:95`).
7. Expired tokens not handled: still "logged in", requests send `Authorization: ''`, no 401 handling.
8. OAuth errors (`/?auth_error=`) never read.
9. Watch state ignores term (`CourseResultsPage.jsx:25`, `CourseResults.jsx:93,186,239`).
10. Schedule Builder hangs if terms fetch fails and no saved schedule (`useSchedulePlanner.js:304`).
11. Out-of-order search responses (`CourseResultsPage.jsx:43-81`, `SubjectAutocomplete.jsx:32-55`).
12. `Home.jsx:43` tooltip `Switch to  mode` (missing var); `:54,82,97` double spaces from lost em dashes.
13. Missing `play` icon; Tutorial dark never applies; undefined CSS vars.
14. Theme flash: class applied in effect, nothing in `index.html` sets it early.

Smells: `alert()` in Settings; logout via full reload; `AdminPanel.jsx:107` "TEMP: remove before release"; `.env.local` never read (`envDir: './env'`); hardcoded URLs (`apiConfig.js:4,7`, PDF in WhatsNew, GSI script); personal email as legal contact (`LegalLayout.jsx:11`, intentional); ~72 console.error/warn; no error boundary. **Secrets: none** in any env file or git history.

## 8. Next.js App Router mapping
```
app/layout.tsx                (server) html/body, next/font Inter, inline pre-paint theme script, <Providers>
app/page.tsx                  (server) Home; session cookie → redirect('/dashboard')
app/privacy, app/terms        (server, static)
app/(app)/layout.tsx          (server) replaces DashboardLayout; persists across navigations.
                              Fetch terms (revalidate ~1h) + active announcements here.
app/(app)/dashboard           (server) cards; watched count; Tutorial + WhatsNew via dynamic(ssr:false)
app/(app)/course-search       client form; terms from layout
app/(app)/course-results      (server) searchParams → search + grades + ratings for distinct pairs server-side.
                              Cards/popup stay client.
app/(app)/tracked-classes     (server) full-details inside <Suspense>; remove = server action
app/(app)/schedule-builder    client page; initial DB schedule from server
app/(app)/settings            client; delete/logout = server actions
app/(app)/admin               (server) admin gate → notFound(); tabs client
proxy.ts / middleware.ts      no session cookie → redirect for protected routes
```
`'use client'` unavoidable: Theme/Tutorial/Schedule providers, Header, Sidebar, AnnouncementBanner, framer components, SubjectAutocomplete, AddClassesModal, forms, admin tabs.

Server-rendered: Legal, Home, dashboard shell, results data, tracked-class data, admin gate. **AuthContext goes away** (decode cookie on server, seed small client context). TermsContext → server data + helper. WatchedClassesContext → server initial data + server actions + `revalidateTag`.

Auth callback: the OAuth callback route sets the JWT (or session id) as `HttpOnly; Secure; SameSite=Lax` cookie and redirects to `/dashboard`. Server components read via `cookies()`. Logout = server action deleting cookie. No more token in localStorage.

Mutations → server actions (watched add/remove, schedule add/remove, delete account, announcement CRUD, admin email, grade refresh) with `revalidatePath`/`revalidateTag`. Public historical reads → server fetch with `revalidate` (terms ~1 h, grades long, ratings/syllabus hours). Route handlers only where browser needs same-origin endpoint (subject autocomplete, batched course-meta for client-only pages, cron routes).

Disappears: `vercel.json` SPA rewrite, hostname sniffing, GSI script, `.js/.jsx` split, `react-vendor` chunk; analytics → `@vercel/analytics/next`. Port as-is after consolidation: `lib/*` helpers, `scheduleConflicts`, `trackedClassExpiry`, `generateICSFile`.
