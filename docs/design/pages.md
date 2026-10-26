# PantherWatch pages

Status: approved for implementation · Companion to [`spec.md`](./spec.md) (components, layout), [`motion.md`](./motion.md) (animation) and `docs/audit-2026-10/03-frontend-audit.md` §8 (route mapping).

Every page below names its components using spec.md names. Wireframes show desktop (≥1200, full sidebar, not drawn unless relevant) and mobile (<640, top bar + bottom nav). Anything not drawn follows spec.md §3.

---

## 0. Route map

| Route | Purpose | Shell | Rendering | Auth |
|---|---|---|---|---|
| `/` | Landing | Own header/footer | Static (server), redirects signed-in users to `/dashboard` via `proxy.ts` | Public |
| `/privacy`, `/terms` | Legal | Own header/footer | Static | Public |
| `/dashboard` | Overview and next actions | App shell | Server + streamed sections | Guest OK |
| `/course-search` | Build a search | App shell | Server page, client form | Guest OK |
| `/course-results` | Sections for a search | App shell | Server (searchParams) + client grid | Guest OK |
| `?course={crn}&tab=` on Results, Tracked, Schedule | Course detail dialog | Dialog | Client, data from page payload | Guest OK |
| `/tracked-classes` | Manage watched sections | App shell | Server, streamed | Signed in |
| `/schedule-builder` | Plan a week, export `.ics` | App shell, wide | Server initial data + client calendar | Signed in |
| `/settings` | Theme, account | App shell, narrow | Server + small client islands | Signed in |
| `/admin`, `/admin/users`, `/admin/announcements`, `/admin/grades` | Operations | App shell | Server, admin-gated (`notFound()` otherwise) | Admin |
| `/auth/callback` | OAuth landing | None | Route handler: sets HttpOnly cookie, redirects | n/a |

**Signed-in-only routes for guests:** don't redirect. Render the route inside the shell with a sign-in EmptyState: icon `lock`, the title "Sign in to track classes" or "Sign in to build a schedule", one sentence on what the feature does, and a primary "Sign in with Google" button. Guests keep their navigation context and see what they're missing. The old app showed locked sidebar items, then silently bounced guests.

**Shared improvements on every app page** (from the audit):
- The shell (`app/(app)/layout.tsx`) persists across navigations. Terms, admin check and announcements are fetched once on the server and cached (`revalidate: 3600` for terms, `60` for announcements), not refetched per page.
- No full-page "Loading..." states and no 500 ms fake loaders. Each page renders its header immediately and streams slow sections behind `<Suspense>` with matching skeletons.
- `error.tsx` per segment renders the EmptyState `error` variant with "Try again" (`reset()`). Nothing ever renders an `Error` object as text.
- Theme is correct on first paint (pre-paint script), so there's no flash.

---

## 1. Home (landing) `/`

**Purpose:** explain PantherWatch in one screen and get the visitor into the app: Sign in with Google, or continue as a guest to search.

**Desktop**
```
┌───────────────────────────────────────────────────────────────────────────────┐
│ [panther] PantherWatch                                   [☾]  [Sign in]       │  header, 64px, static
├───────────────────────────────────────────────────────────────────────────────┤
│  · · · · · · · · · · · soft blue radial glow + dot grid (CSS) · · · · · · · · │
│                                                                               │
│     Track seats.                         ┌───────────────────────────────┐    │
│     Enroll faster.                       │ CSC 2720 · 003     [📅][Watch✓]│    │
│                                          │ Data Structures                │    │
│     PantherWatch watches Georgia State   │ ▓▓▓▓▓▓▓▓▓▓▓▓░░░  3 open · 37/40 │    │
│     course sections and emails you the   │ M T W R F  10:00–11:15 AM      │    │
│     moment a seat opens.                 │ Dr. J. Smith   [GPA 3.12][4.1] │    │
│                                          └───────────────────────────────┘    │
│     [Sign in with Google]  [Search as guest]   (static, inert CourseCard)     │
│                                                                               │
├───────────────────────────────────────────────────────────────────────────────┤
│  ┌ Live seat counts ┐  ┌ Email alerts ┐  ┌ Grades & ratings ┐  ┌ Schedule ┐   │  4 feature cards
│  └──────────────────┘  └──────────────┘  └──────────────────┘  └──────────┘   │
├───────────────────────────────────────────────────────────────────────────────┤
│  © 2026 PantherWatch. Not affiliated with Georgia State University.           │
│  Privacy · Terms                                                              │
└───────────────────────────────────────────────────────────────────────────────┘
```

**Mobile:** header (panther 28 + name, theme IconButton, "Sign in" `sm`); hero text; both buttons full width, stacked; the sample card below the buttons; features in one column.

**Components:** Button (`lg` primary, `lg` secondary), IconButton (theme), CourseCard (static demo props, wrapped in `inert` + `aria-hidden`), Card (features), footer links.

**States:** none. Fully static.
- If `?auth_error=` is present (OAuth failure, audit bug #8), show an inline Banner (danger) above the hero: "Sign-in didn't complete. Try again." with a retry action.

**Server vs client:** server component, statically rendered. `proxy.ts` redirects to `/dashboard` when the session cookie exists, so there's no client redirect flash. The only client islands are the theme IconButton and the sign-in button (a plain link to `/api/auth/google/login`, so it's not even a client component).

**Improvements over the old page:**
- Drops `statue.jpg` (343 KB) and the infinite "pulse" glow. The background is a static CSS gradient plus dot grid (spec.md §1.10), about 0 KB.
- Hero text is static: no 0.6 s fade-in with staggered delays, so LCP is the h1 at first paint.
- The hero shows a real CourseCard rendered from the component library, so visitors see the product. It costs no image weight and stays in sync with the design.
- Panther mark served as a 64/128 px WebP (≈ 4 KB), not a 69 KB PNG.
- Copy fixes: the lost em dashes ("in real time  search") and the broken "Switch to  mode" tooltip are gone. The theme button is labelled "Switch to dark theme" / "Switch to light theme".
- The floating bottom-right theme button moves into the header, so it no longer covers content on mobile.
- Copy is factual. Features: "Live seat counts", "Email when a seat opens", "Grade history and professor ratings", "Plan your week and export to your calendar".

---

## 2. Dashboard `/dashboard`

**Purpose:** the first screen after sign-in. Answers "did anything open up?" and gets you into search or your schedule in one click.

**Desktop (signed in)**
```
┌ sidebar ┬─────────────────────────────────────────────────────────────────────┐
│         │ Welcome back, Alex.                                                 │
│         │ Fall 2026 registration is open.                                     │
│         │                                                                     │
│         │ ┌ TRACKED ─────┐ ┌ OPEN NOW ─────┐ ┌ SCHEDULED ──────┐              │  Stat ×3
│         │ │ 6            │ │ 2   ● seats   │ │ 4 classes · 13 cr│              │
│         │ └──────────────┘ └───────────────┘ └─────────────────┘              │
│         │                                                                     │
│         │ ┌ Quick search ───────────────────────────────────────────────────┐ │
│         │ │ [Fall 2026 ▾] [Subjects: CSC × ________] [2720] [Search]        │ │
│         │ └─────────────────────────────────────────────────────────────────┘ │
│         │                                                                     │
│         │ ┌ Tracked classes ─────────── View all ┐ ┌ Fall 2026 schedule ────┐ │
│         │ │ CSC 2720·003  ▓▓▓▓▓▓▓░ 3 open        │ │ M  CSC 2720  10:00     │ │
│         │ │ MATH 2211·010 ▓▓▓▓▓▓▓▓ Full          │ │ M  MATH 2211 12:30     │ │
│         │ │ PHYS 2211K·002 ▓▓▓▓▓▓░ 5 open        │ │ T  ENGL 1102 9:30      │ │
│         │ │ … up to 5 rows                        │ │ ⚠ 1 conflict           │ │
│         │ └───────────────────────────────────────┘ │ [Open schedule builder]│ │
│         │                                           └────────────────────────┘ │
│         │ ┌ Getting started (only until all 3 done) ┐                          │
│         │ │ ✓ Search for a class  ○ Watch a section  ○ Add to your schedule │   │
│         │ └──────────────────────────────────────────────────────────────────┘ │
└─────────┴─────────────────────────────────────────────────────────────────────┘
```

**Mobile:** same order, single column. Stats become a horizontally scrollable row of three tiles (scroll-snap, 140 px each). The Quick search fields stack and the Search button is full width.

**Guest variant:** inline Banner (info) "You're browsing as a guest. Search, grades and ratings are open; sign in to watch classes and build a schedule." with [Sign in]. Stats are hidden. Quick search is shown. The Tracked and Schedule panels become a single Card that explains both features, with a [Sign in with Google] button.

**Components:** PageHeader, Stat ×3, Card, Autocomplete, Select, Input, Button, EnrollmentMeter (compact, inside list rows), Badge, EmptyState, Banner, Dialog (What's new).

**Content rules:**
- *Tracked* = number of watched sections across active terms. *Open now* = how many of those have `seatsAvailable > 0` (success tone with a dot), linking to `/tracked-classes?filter=open`. *Scheduled* = classes and credits in the active term's schedule. Count-up only applies to values 10–999 (motion.md §4.14), so for most students these numbers are simply there.
- The Tracked panel shows up to 5 rows, open-seat sections first. A row is code·section, mini meter, status word, and the row links to the course dialog (`?course=`).
- The Schedule panel shows the active term's classes grouped by day (compact agenda, max 6 rows), plus a conflict Badge if any.
- **Getting started** checklist: three steps derived from server data (has searched is tracked in localStorage; watched > 0; scheduled > 0). It hides permanently once all three are done or when dismissed (X). This replaces the coach-mark `Tutorial` (409 lines of CSS, a private theme system, and a chain of 500 + 300 + 100 ms timers).
- **What's new:** a static `Dialog` (`md`): a title, 3–4 short items each with an icon, and a "Got it" button. It opens once per version (`pantherwatch.whatsnew.v2`), or via `?whatsnew=1` (the existing admin trigger). Loaded with `next/dynamic` only when it needs to open. This replaces the 438-line 3D `WhatsNewShowcase`.

**Loading:** the header, Quick search and the checklist render immediately. The Stat row and the two panels are in one `<Suspense>` (they share the slow `/watched-classes/full-details` call), with a fallback of StatSkeleton ×3 plus two panel skeletons (5 rows each).

**Empty:** Tracked panel: "You're not watching any sections yet." + [Search classes]. Schedule panel: "Nothing on your Fall 2026 schedule." + [Add classes].

**Error:** if full-details fails, the panels show the EmptyState `error` variant inline ("Couldn't load seat data. Try again."). Stats fall back to the cheap watched count (from `/watched-classes`), and "Open now" shows "–".

**Server vs client:**
- Server: user (from cookie), watched list, schedule, terms (from layout), full-details (streamed).
- Client: the Quick search form (Autocomplete) and the checklist dismiss button. The What's new dialog is a dynamic client island.

**Improvements:** no fake 500 ms loader. Real seat information instead of three marketing cards. No tutorial overlay. Quick search saves a navigation. The checklist teaches by doing.

---

## 3. Course search `/course-search`

**Purpose:** choose term, level, subjects and course number, then go to results.

```
Desktop (narrow, 720)                         Mobile
┌──────────────────────────────────────────┐  ┌──────────────────────────┐
│ Search classes                           │  │ Search classes           │
│ Live seat counts for Georgia State       │  │ Term                     │
│ sections.                                │  │ [Fall 2026          ▾]   │
│ ┌──────────────────────────────────────┐ │  │ Level                    │
│ │ Term              Level              │ │  │ [Undergraduate      ▾]   │
│ │ [Fall 2026 ▾]     [Undergraduate ▾]  │ │  │ Subjects                 │
│ │ Subjects (up to 5)                   │ │  │ [CSC × MATH × ____]      │
│ │ [CSC × MATH × ______________ ]       │ │  │ Course number            │
│ │ Course number                        │ │  │ [2720]                   │
│ │ [2720]                               │ │  │ [       Search        ]  │
│ │                          [ Search ]  │ │  │                          │
│ └──────────────────────────────────────┘ │  │ Recent                   │
│ Recent searches                          │  │ CSC 2720 · Fall 2026  →  │
│ CSC 2720 · Fall 2026 →   MATH 2211 · … → │  └──────────────────────────┘
└──────────────────────────────────────────┘
```

**Components:** PageHeader, Card, Select ×2, Autocomplete, Input, Button (`md` primary; full width on mobile), Chip (recent searches as links), Banner (view-only term notice when the selected term is closed: "Registration for Summer 2026 is closed. You can still view sections.").

**Behavior:**
- All fields are visible from the start. The old "pick a term first, then the rest appears" reveal is removed. Term defaults to `preferredTerm`, or else the current registration term. Level defaults to `preferredDegreeLevel`, or Undergraduate.
- Validation is unchanged from today: term, level, at least one subject, and course number required as the API requires them. Errors use the Field error pattern (spec.md §2.3), shown on submit, then live.
- Submit navigates to `/course-results?term=…&level=…&subjects=CSC,MATH&number=2720`. It's a real `<form method="get" action="/course-results">`, so it works before hydration.
- Recent searches: the last 5 in localStorage `pantherwatch.recentSearches`, as links, rendered after hydration (the section is absent in SSR, so there's no layout shift: it sits below the form).
- Subjects are fetched once per term through a cached route handler (`/api/subjects?term=`, `revalidate: 86400`) and filtered client-side. There are no per-keystroke requests and no out-of-order results (audit bug #11).

**Loading:** terms come from the layout, so there's none on the page. The Autocomplete shows 3 skeleton options until the term's subject list arrives.
**Empty:** n/a.
**Error:** if the subjects list fails, the Autocomplete shows "Couldn't load subjects. Type a subject code (e.g. CSC)." and accepts free text (uppercased, 2–4 letters).

**Server vs client:** the page and form shell are server-rendered. Autocomplete and the recent-searches island are client components.

---

## 4. Course results `/course-results`

**Purpose:** compare sections quickly (seats, time, instructor quality) and act: watch, schedule, or open details.

**Desktop**
```
┌ sidebar ┬─────────────────────────────────────────────────────────────────────┐
│         │ CSC 2720 · Fall 2026                               [Edit search]    │
│         │ Undergraduate · 1 subject                                           │
│         │ ┌ (i) Registration for this term is closed. Sections are view-only.┐│  only if view-only
│         │ └─────────────────────────────────────────────────────────────────┘│
│         │╔═══════════════════════════════════════════════════════════════════╗│  sticky filter bar
│         │║ [⌕ Filter by instructor, title, CRN   ] [Open seats] [M][T][W][R][F]║│
│         │║ [Any time ▾] [Sort: Course ▾]                 12 sections · 5 open  ║│
│         │╚═══════════════════════════════════════════════════════════════════╝│
│         │ CSC 2720 Data Structures · 12 sections · course GPA 2.94            │  group header
│         │ ┌──────────────── CourseCard ─────┐ ┌──────────── CourseCard ──────┐ │
│         │ │ CSC 2720 · 001       [📅][Watch]│ │ CSC 2720 · 002   [📅][Watch] │ │
│         │ │ Data Structures                 │ │ …                            │ │
│         │ │ CRN 81230 · 3 credits           │ │                              │ │
│         │ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ Full · 40/40   │ │                              │ │
│         │ │ M · W · ·  10:00–11:15 AM  LA405│ │                              │ │
│         │ │ Dr. J. Smith    [GPA 3.12][4.1] │ │                              │ │
│         │ └─────────────────────────────────┘ └──────────────────────────────┘ │
│         │ …                                                                   │
└─────────┴─────────────────────────────────────────────────────────────────────┘
```

**Mobile:** the filter bar collapses to one sticky row (under the top bar): [⌕ filter input][Filters (2)]. "Filters" opens a Sheet with Open seats, Days, Time and Sort, plus [Clear] and [Show 12 sections]. Cards are single-column.

**Components:** PageHeader, Banner (inline), filter bar (Input with leading icon, Chip toggles, Select ×2, live count), group header (text-md/600 + text-sm muted + GPA Badge), CourseCard, CourseCardSkeleton, EmptyState, Dialog (course detail), Tabs, GradeBar, Toast, Sheet (mobile filters), popover (guest sign-in prompt).

**Data and rendering:**
- **Server:** `page.tsx` reads `searchParams` and calls the backend search for each subject in parallel. It collects distinct `(subject, courseNumber, instructor)` triples and distinct instructors, and fetches grades and ratings for them **server-side in one batch** (`Promise.all`, `fetch` with `revalidate: 86400` for grades and `21600` for ratings, no `Content-Type` on GETs, so no CORS preflights and no browser round trips). It then passes `sections[]` with `grades` and `rating` attached to the client grid.
  - Result: 0 browser requests for badges. The old app made ~24 requests ×2 (preflight) per page.
  - Result: the detail dialog reads the same objects, so it can't show stale grades (audit bug #5).
- **Streaming:** the PageHeader and filter bar render immediately. The grid is inside `<Suspense>` with a fallback of 6 CourseCardSkeletons. Search and enrichment are awaited inside the boundary. If enrichment for a triple fails or times out (cap 2.5 s), that card renders without badges; enrichment never blocks the section list.
- **Client:** filtering, sorting, watch/schedule toggles (server actions with `useOptimistic`), conflict badges (computed against the ScheduleProvider's current-term schedule), and the dialog.

**Filter bar behavior:**
- Text filter matches instructor, course title and CRN (case-insensitive, diacritics-insensitive). Debounce 100 ms. Filtering runs on the client over at most a few hundred items: no requests, no animation.
- Toggles: **Open seats** (`seatsAvailable > 0`). **Days** (a section matches if all its meeting days are within the selected set; nothing selected = any). **Time**: Any / Morning (starts before 12:00) / Afternoon (12:00–16:59) / Evening (17:00+). **Sort**: Course & section (default) / Most open seats / Highest GPA / Highest rating. Missing GPA or rating sorts last.
- Filter state is mirrored to the URL with `history.replaceState` (shareable, survives reload) without triggering a server re-render.
- Count text: "12 sections · 5 open", with `aria-live="polite"` debounced 500 ms. When filtered: "4 of 12 sections".
- Sticky: `top: 0` (≥900) or under the top bar (<900), gains a shadow when stuck (motion.md §4.17).
- "Edit search" expands the Course search form inline (in a Card above the filter bar), prefilled. Submitting navigates to the new results. There's no trip back to `/course-search`.

**Grouping:** when the results contain more than one distinct course, sections are grouped under a group header per course: code + title + section count + course-wide GPA Badge. With one course there's a single header line and no group chrome.

**Large result sets:** render the first 40 cards, then a [Show 40 more] secondary button (the appended batch staggers, motion.md §4.2). There's no infinite scroll.

**Course detail dialog** (`?course={crn}&tab=overview|grades|ratings|syllabus`, size `lg`, a sheet on mobile):
```
┌───────────────────────────────────────────────────────────────────────┐
│ CSC 2720 · 003                                   [📅] [Watching] [×]   │  sticky header
│ Data Structures                                                       │
│ [CRN 81234] [3 credits] [Fall 2026] [In person]                       │  Badges (accent for CRN)
│ Overview    Grades    Ratings    Syllabus                             │  Tabs
│ ────────                                                              │
├───────────────────────────────────────────────────────────────────────┤
│ Enrollment                                                            │
│ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░░  3 open · 37 of 40 · Waitlist 0 of 10      │
│ Meetings                                                              │
│ Mon, Wed   10:00 – 11:15 AM   Langdale Hall 405   Aug 24 – Dec 8      │
│ Instructor                                                            │
│ Dr. Jane Smith        GPA 3.12 (n=412)     RMP 4.1 (38 ratings)       │
│ Schedule color  ● ● ● ● ● ● ● ●     (only when scheduled)             │
└───────────────────────────────────────────────────────────────────────┘
```
- **Overview:** enrollment (large meter, 10 px track), meetings table, instructors with summary numbers (each links to its tab), schedule color picker (radiogroup of 8 swatches, 24 px, ring on the selected one) when scheduled, partial-data Badge.
- **Grades:** "How Dr. Smith grades" (GradeBar 12 px + GPA + DWF%) next to "All instructors" (the same, course-wide). Then a professors table: name, GPA (toned), DWF%, sections taught, mini GradeBar, sortable by GPA and name, with a filter input when there are more than 8 rows. Empty: EmptyState "No published grade data for this course."
- **Ratings:** large score (text-3xl/700 toned) / 5, difficulty, would-take-again %, rating distribution bars (`--accent` fills, labelled), up to 10 tags as neutral Badges, "View on Rate My Professors" external link. Empty: "No Rate My Professors profile found for Dr. Smith."
- **Syllabus:** fetched when the tab is first opened (route handler `/api/syllabus?…`, cached). A PDF iframe at the full panel height, plus "Open PDF in a new tab". Empty: "No syllabus on file for this section." Loading: skeleton block.
- Watch/schedule toggles in the header behave exactly like the card's (shared hooks), so the card behind updates too.
- The dialog has a fixed height at ≥640 (motion.md §4.4), so switching tabs doesn't resize it.

**Loading:** 6 CourseCardSkeletons (2 columns ≥900).
**Empty (search):** EmptyState `no-results`: "No sections of CSC 9999 in Fall 2026." + [Edit search].
**Empty (filters):** EmptyState `no-results`: "No sections match these filters." + [Clear filters].
**Error:** `error.tsx`: "Couldn't reach Georgia State's course system. This usually clears in a minute." + [Try again]. Partial failure with multiple subjects: render what succeeded, plus an inline warning Banner "MATH results couldn't be loaded." with [Retry].

**Improvements:**
- Sticky filter bar with seats/days/time/sort. The old page had a single text filter.
- Grade and rating badges come from one server batch, not 24 client requests (48 with preflights).
- Cards are about 40% shorter, so more sections fit per screen, and each shows seat status as a word plus a meter.
- No framer `layoutId` on every card, so filtering doesn't re-measure the grid.
- Guest actions explain themselves (popover) instead of being disabled.
- Watch state is keyed by term and CRN (audit bug #9).
- Search responses can't arrive out of order: the URL is the request, and RSC navigation discards stale responses.
- Conflict badges warn before you add a section that overlaps your schedule.
- The dialog is deep-linkable, and Back closes it.

---

## 5. Tracked classes `/tracked-classes`

**Purpose:** see which watched sections have seats right now, and stop watching the ones you no longer need.

```
Desktop
┌ sidebar ┬─────────────────────────────────────────────────────────────────────┐
│         │ Tracked classes                                 [Search classes]    │
│         │ 6 sections · we email you when a seat opens.                        │
│         │ [All 6] [Open 2] [Full 4]                       ← Chip toggles      │
│         │ Fall 2026                                                           │  term group heading
│         │ ┌ CourseCard (tracked) ──────────┐ ┌ CourseCard (tracked) ────────┐ │
│         │ │ CSC 2720 · 003   [📅] [Remove] │ │ …                            │ │
│         │ │ ⏱ Tracking ends Dec 12          │ │                              │ │
│         │ │ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░ 3 open · 37/40 │ │                              │ │
│         │ └────────────────────────────────┘ └──────────────────────────────┘ │
│         │ Spring 2027                                                         │
│         │ …                                                                   │
└─────────┴─────────────────────────────────────────────────────────────────────┘
```

**Components:** PageHeader, Chip (status filter, mirrored to `?filter=`), CourseCard (tracked mode), CourseCardSkeleton, EmptyState, Toast (Undo), Dialog (course detail).

**Behavior:**
- Sections are grouped by term (newest registration term first). Within a term, open sections come first, then by course code.
- Remove: the card leaves immediately (optimistic server action + `revalidateTag('watched')`), focus moves to the next card, and a toast reads "Stopped watching CSC 2720 · 003" with [Undo] (8 s). Undo re-adds via a server action. No confirm dialog.
- The "Tracking ends {date}" notice appears in the last 14 days before the policy expiry (existing `trackedClassExpiry` rule).
- If the API exposes the last check time, show "Seats checked 3 min ago" (text-xs muted) under the description. If not, omit it. Don't invent it.

**Loading:** the header renders immediately with the count from the cheap `/watched-classes` list. The grid streams in `<Suspense>` (full-details can take up to 35 s), with skeleton count = the known count, capped at 6.
**Empty:** EmptyState `first-use`: "You're not watching any sections." / "Watch a full section and we'll email you when a seat opens." / [Search classes].
**Filter empty:** "No open sections right now. We'll email you when one opens." (no action).
**Error:** EmptyState `error` with [Try again]. This fixes the old crash where an `Error` object was rendered as text (audit bug #1).

**Server vs client:** server-rendered list and data. Client: the filter chips, card toggles and the dialog.

**Improvements:** no crash on errors. One request path, server-side. No refetch storm after removal (count+list, then list+full-details, as before). Undo instead of nothing. Open seats are surfaced first.

---

## 6. Schedule builder `/schedule-builder`

**Purpose:** see a term's classes on a week grid, catch overlaps, add classes from search or your tracked list, and export to Google/Apple Calendar.

**Desktop (wide, 1440)**
```
┌ sidebar ┬───────────────────────────────────────────────────────────────────────────────┐
│         │ Schedule                         [Fall 2026 ▾]  [Export .ics]  [+ Add classes]  │
│         │ 4 classes · 13 credits                                    [Week | Agenda]       │
│         │ ┌ ⚠ 1 conflict: CSC 2720 and MATH 2211 overlap Mon/Wed 10:00–10:45. [Show] ┐   │  danger inline Banner
│         │ └───────────────────────────────────────────────────────────────────────────┘ │
│         │ ┌──────┬──────────┬──────────┬──────────┬──────────┬──────────┐               │
│         │ │      │   Mon    │   Tue    │   Wed    │   Thu    │   Fri    │  sticky head  │
│         │ ├──────┼──────────┼──────────┼──────────┼──────────┼──────────┤               │
│         │ │ 9 AM │          │┌────────┐│          │┌────────┐│          │               │
│         │ │      │┌───┐┌───┐││ENGL1102││┌───┐┌───┐││ENGL1102││          │               │
│         │ │10 AM ││CSC││MAT│││9:30–   │││CSC││MAT│││        ││          │  lanes split  │
│         │ │      ││⚠  ││⚠  ││└────────┘││⚠  ││⚠  ││└────────┘│          │  on conflict  │
│         │ │11 AM │└───┘└───┘│          │└───┘└───┘│          │          │               │
│         │ │ …    │          │          │          │          │          │               │
│         │ └──────┴──────────┴──────────┴──────────┴──────────┴──────────┘               │
│         │ Online and unscheduled                                                        │
│         │ ┌ CSC 4350 · 900 · Online asynchronous ───────────────── [Details] ┐          │
│         │ └──────────────────────────────────────────────────────────────────┘          │
└─────────┴───────────────────────────────────────────────────────────────────────────────┘
```

**Mobile (agenda default)**
```
┌──────────────────────────┐
│ Schedule                 │
│ [Fall 2026 ▾]            │
│ 4 classes · 13 credits   │
│ [Week | Agenda]  [⤓] [+] │   IconButtons for export/add
│ ⚠ 1 conflict  [Show]     │
│ MONDAY                   │
│ ▌10:00  CSC 2720 · 003 ⚠ │   color bar = schedule color
│ ▌11:15  Langdale 405   › │
│ ▌10:00  MATH 2211 · 010 ⚠│
│ TUESDAY …                │
└──────────────────────────┘
```

**Components:** PageHeader, Select (term), SegmentedControl (Week/Agenda), Button (Add classes `primary`, Export `secondary` with `download` icon), IconButton (mobile), Banner (conflicts, danger), Calendar grid + Calendar block, agenda list rows, Card (online/unscheduled list), Dialog (course detail, Add classes), Tabs (inside Add classes), Autocomplete (single subject), Input, Toast, EmptyState, CalendarSkeleton.

**Behavior:**
- **Term:** a Select listing terms that have schedule entries plus the current registration term, mirrored to `?term=`. Switching is instant (data for all of the user's terms comes in the initial payload; it's small).
- **View:** Week is the default at ≥640 and Agenda below, user-switchable and remembered in localStorage `pantherwatch.scheduleView`. Only the active view is rendered (the old one rendered both and hid one with CSS).
- **Grid:** Mon–Fri, plus Sat/Sun columns only if a class meets then. Hour range per spec.md §2.17. The hour rail is sticky-left and the day header sticky-top inside the scroll container. On 640–899 px the grid scrolls horizontally with 120 px minimum day columns.
- **Conflicts (behavior change, flag to owner):** adding an overlapping section is **allowed**, with a warning toast. The old app rejected it. Students plan alternatives side by side, and the registrar will enforce real conflicts at registration anyway. Overlaps are shown as split lanes, a danger ring and an `alert` glyph on each block (spec.md §2.17), plus the summary Banner listing each pair. [Show] scrolls to and focuses the first conflicting block. The agenda shows ⚠ and "Conflicts with …" on each row.
- **Online / TBA sections** (no meeting time) are listed under the grid in "Online and unscheduled". The grid can't place them, and they must not be silently dropped.
- **Block click** opens the course detail dialog with the morph (motion.md §4.4). Its Overview has "Remove from schedule" (danger-ghost) and the color picker.
- **Credits:** sum of `creditHourLow` (shows "13–15 credits" when a variable-credit section is included).
- **Export .ics:** generates the file client-side with the existing `generateICSFile` (RRULEs per meeting, term start/end dates, `COLOR` names from `icsName`). The filename is `pantherwatch-fall-2026.ics`. Afterwards a toast reads "Calendar file downloaded" with the body "Open it to import into Google Calendar or Apple Calendar." The button is disabled when the term has no timed classes (tooltip explains). Online sections are excluded and listed in the toast body if any.

**Add classes dialog** (`md`, a sheet on mobile):
```
┌ Add classes to Fall 2026 ─────────────────────────────── [×] ┐
│ Search    From tracked (6)                                  │
│ ─────────                                                   │
│ Subject [CSC ▾]   Course number [2720]          [Search]    │
│ ┌──────────────────────────────────────────────────────────┐│
│ │ CSC 2720 · 001  MW 10:00–11:15 AM  Smith   3 open   [Add]││
│ │ CSC 2720 · 002  TR 9:30–10:45 AM   Lee     Full     [Add]││
│ │ CSC 2720 · 003  MW 10:00–11:15 ⚠ overlaps MATH 2211 [Add]││
│ │ CSC 2720 · 004  Online                    12 open [Added✓]││
│ └──────────────────────────────────────────────────────────┘│
│                                                     [Done]  │
└─────────────────────────────────────────────────────────────┘
```
- One `AddClassRow` component used by both tabs (the old modal duplicated the markup). Row: code·section (600) · days/time (tabular) · instructor (muted, truncated) · seat status word (toned) · toggle Button `sm` (`secondary` "Add" / pressed "Added ✓"; clicking Added removes).
- Search results come from the same server search via a route handler `/api/sections?term&subject&number` (the browser can't call the server component). Requests carry a request id, so stale responses are dropped. Results show 3 skeleton rows while loading.
- The "From tracked" tab lists tracked sections for this term only. Empty: "None of your tracked sections are in Fall 2026."
- Rows that conflict show "⚠ overlaps {code}" in `--warning`.
- [Done] closes. Blocks added during the session get the fresh highlight (motion.md §4.11).

**Loading:** the header renders immediately. The grid area streams with CalendarSkeleton (hour rail + 5 columns + 3 placeholder blocks) while the server resolves meeting details for DB-only schedule entries.
**Empty:** EmptyState `first-use`: "Nothing on your Fall 2026 schedule yet." with [Add classes] and [Add from tracked (6)] (the latter opens the dialog on that tab; hidden when there are no tracked sections in this term).
**Error:** EmptyState `error` + [Try again]. If the terms list fails, the page still renders the terms present in the user's schedule, plus the current term computed locally. It never hangs (audit bug #10).

**Server vs client:**
- Server: the user's schedule (all terms) with meeting details resolved in one pass, plus tracked sections for the "From tracked" tab.
- Client: the calendar (interaction, VT, view switch), the Add classes dialog, export, and color changes (server action, optimistic).
- The schedule is stored server-side only. On logout, nothing is left in localStorage (audit bug #2). Remove is a server action, so deletions don't come back (audit bug #3).

**Improvements:** conflict highlighting with a summary and jump-to. Readable block colors (all ≥ 5:1). Online sections are listed instead of lost. One view rendered instead of two. No back button. Add-classes markup exists once. An export confirmation explains what to do with the file.

---

## 7. Settings `/settings`

**Purpose:** appearance and account management. Small on purpose.

```
┌ narrow 720 ───────────────────────────────────────────┐
│ Settings                                              │
│ ┌ Profile ──────────────────────────────────────────┐ │
│ │ (avatar 64)  Alex Panther                         │ │
│ │              apanther1@student.gsu.edu             │ │
│ │              Managed by your Google account.      │ │
│ └───────────────────────────────────────────────────┘ │
│ ┌ Appearance ───────────────────────────────────────┐ │
│ │ Theme         [ System | Light | Dark ]           │ │
│ └───────────────────────────────────────────────────┘ │
│ ┌ Notifications ────────────────────────────────────┐ │
│ │ Seat alerts go to apanther1@student.gsu.edu.        │ │
│ └───────────────────────────────────────────────────┘ │
│ ┌ Account ──────────────────────────────────────────┐ │
│ │ Sign out of PantherWatch on this device. [Sign out]│ │
│ │ ───────────────────────────────────────────────── │ │
│ │ Delete account                                    │ │
│ │ Removes your tracked classes and schedule.        │ │
│ │ This can't be undone.        [Delete account]     │ │
│ └───────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────┘
```

**Components:** PageHeader, Card ×4, Avatar (64), SegmentedControl, Button (`secondary` Sign out, `danger` Delete), Dialog (`sm` confirm), Toast.

**Behavior:**
- Theme: SegmentedControl System/Light/Dark, applied instantly (motion.md §4.12) and stored in `pantherwatch.theme`.
- Sign out: a server action deletes the cookie and redirects to `/`. No `window.location.reload()`.
- Delete account: a confirm Dialog (`sm`) titled "Delete your PantherWatch account?". The body lists exactly what is deleted. The confirm field requires typing `delete`, and the [Delete account] danger button stays disabled until it matches. Focus starts on [Cancel]. On success, redirect to `/` with a toast. On failure, show an error toast (not `alert()`).
- **Removed:** the disabled "Phone number — Coming soon" field (a dead control), and "Restart tutorial" (the tutorial is gone; the Dashboard checklist replaces it).
- Settings now lives inside the app shell (the old route had no layout).

**Loading / empty / error:** server-rendered profile, so there's no loading state. Action errors go to toasts.
**Server vs client:** server page; the SegmentedControl and the delete dialog are client islands; sign-out and delete are server actions.

---

## 8. Admin `/admin/*`

**Purpose:** operate the service: usage numbers, find users and email one, manage announcements, check and refresh grade data.

**Gate:** `app/(app)/admin/layout.tsx` checks admin on the server and calls `notFound()` for anyone else. There's no client-side "Access denied" flash.

**Layout:** PageHeader "Admin" + TabNav (route links): Overview `/admin` · Users `/admin/users` · Announcements `/admin/announcements` · Grade data `/admin/grades`. The email composer is a Dialog launched from a user, not a tab.

### 8.1 Overview `/admin`
```
┌ TOTAL USERS ┐ ┌ ACTIVE USERS ┐ ┌ WATCHED SECTIONS ┐ ┌ AVG PER USER ┐
│ 412         │ │ 187          │ │ 963              │ │ 2.3          │
└─────────────┘ └──────────────┘ └──────────────────┘ └──────────────┘
[Show "What's new" to me]   (secondary: opens /dashboard?whatsnew=1)
```
Stat ×4 (count-up for 10–999 per motion.md §4.14; "2.3" is not an integer, so it renders statically). Server-rendered inside `<Suspense>` with StatSkeleton ×4. Error: EmptyState `error` inline.

### 8.2 Users `/admin/users`
```
[⌕ Search by name or email          ]                       187 users
┌ (av) Jane Doe        jdoe1@student.gsu.edu    6 tracked   Joined Aug 2026  [⋯] ┐
│ (av) …                                                                         │
└────────────────────────────────────────────────────────────────────────────────┘
                                                        [Load more]
```
- The search input is debounced 300 ms (the old one POSTed on every keystroke), with request ids to drop stale responses, and is mirrored to `?q=`.
- Rows: Avatar 32, name (600), email (muted), tracked count Badge, joined date, and a Menu `⋯` with "Email user…" and "Copy email".
- "Email user…" opens the **Email composer** Dialog (`md`): the recipient chip (avatar + name + email, read-only), Quick templates as Chips (fill subject/body, confirming before overwriting a non-empty body), Subject Input, Message Textarea (min 8 rows), and [Cancel] [Send email]. Send is a server action. On success, close the dialog and show a toast "Email sent to Jane Doe". On error, show an inline Field error plus an error toast, and keep the content.
- The dead "select all" feature is removed.
- Loading: 6 skeleton rows. Empty search: "No users match "xyz"." Initial empty: n/a.

### 8.3 Announcements `/admin/announcements`
```
[+ New announcement]
Active
┌ [info] Registration for Spring 2027 opens Nov 3.   Nov 1 – Nov 10   [Pause][Edit][⋯]┐
Scheduled / Paused
┌ [warning] GoSolar maintenance Sat 2–4 AM            Paused             [Resume][Edit]┐
```
- A list grouped by Active / Paused. Each row: type Badge, message (2-line clamp), date range, and actions. The old missing `play` icon becomes `play` for Resume.
- New/Edit opens a Dialog (`md`): Type (SegmentedControl Info/Warning/Error), Message (Textarea, 280 character counter), Start/End (date inputs), and a **live preview** of the Banner in the selected tone. Save is a server action + `revalidateTag('announcements')`, so the global banner updates on the next navigation.
- Delete: in the `⋯` Menu → confirm Dialog (`sm`).
- Empty: EmptyState "No announcements." + [New announcement].

### 8.4 Grade data `/admin/grades`
```
┌ SECTIONS STORED ┐ ┌ TERMS ON FILE ┐ ┌ SCRAPER ─────────────┐
│ 48,210          │ │ 14            │ │ ● Idle · last run 2d │
└─────────────────┘ └───────────────┘ └──────────────────────┘
Terms covered: [Fall 2019] [Spring 2020] … (neutral Badges)
[Refresh grade data]  → confirm Dialog → server action → status "● Running" (polls status every 10 s while running)
```
- Stat ×2 ("48,210" ≥ 1000, so no count-up) plus a status Card with a status dot (success idle, warning running, danger failed) and the last-run text.
- While running, poll `/admin/grades/status` every 10 s, client-side only, and stop when idle.

**Server vs client (admin):** each sub-route is a server component for its initial data. Client islands: the users search, the composer, the announcement editor, the grade refresh button and its status poller.

**Improvements:** route-based tabs (each linkable, server-rendered). No access-denied flash. Debounced user search. A live preview for announcements. One shared Dialog instead of three bespoke modals. Fixes the missing `play` icon, and removes the "TEMP: remove before release" code path.

---

## 9. Privacy `/privacy` and Terms `/terms`

**Purpose:** legal text.

**Layout:** a minimal header (panther 28 + "PantherWatch" linking to `/`, theme IconButton), then an article at narrow width (72ch measure), then the landing footer. h1 (text-2xl), "Last updated" (text-sm muted), h2 sections (text-lg/600), body text-base with `--leading-base`, lists with 8 px item gap, links `--accent-text` underlined. On ≥1200, a sticky table of contents in the left margin (h2 links, text-sm, active section bolded via IntersectionObserver). Below 1200 there's no TOC.

**States:** none. **Rendering:** fully static. Content moves to MDX or plain TSX unchanged. The contact email remains as the owner intends (audit notes it's intentional).

---

## 10. Global states

| Case | Treatment |
|---|---|
| `not-found.tsx` | Inside the shell when under `(app)`, otherwise minimal. EmptyState: icon `search`, "Page not found", [Go to dashboard]. |
| `error.tsx` (per segment) | EmptyState `error` + [Try again] (`reset`). The error digest appears in a `details` element for support. |
| `global-error.tsx` | Unstyled-safe fallback (inline tokens: `--bg`/`--text` literal values allowed here only): "Something went wrong." + reload link. |
| Expired session (401 from the API) | The server action/route handler clears the cookie and returns `{ reauth: true }`. The client shows a toast "Your session expired. Sign in again." with [Sign in]. Server pages render the guest view. Fixes audit bug #7. |
| Offline (navigator.onLine false) | A warning Banner at the top of the shell: "You're offline. Seat counts may be out of date." Removed on `online`. |
| Sign-in prompt (guest tapping a member action) | A popover anchored to the control (≥640) or a Sheet (<640): one sentence + [Sign in with Google]. |
