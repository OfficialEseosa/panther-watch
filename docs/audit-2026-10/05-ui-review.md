# UI code review (read-only), 2026-10-26

Reviewed `web/src/app/**` (non-API), `src/components/**`, `src/lib/client/**`, `src/lib/ui/**`, `src/styles/**` against `docs/design/*` and the old-app problems in `03-frontend-audit.md`. ~180 of ~205 files read in full. Line numbers may have shifted (another agent was editing concurrently).

## Critical
1. **Every animation declared in a `.module.css` is dead.** Turbopack's CSS Modules rename `animation-name` identifiers per module (`gV8Hta_pop-in`, `fgH5JG_fade-out`, `m8I0oq_drawer-in`, `Gga1VW_rise-in`, …), but the `@keyframes` are defined once globally in `src/styles/motion.css` under plain names, so ~49 declarations reference nothing. Consequences beyond missing motion:
   - `AnnouncementBanner.tsx:145-149` dismissal waits for `animationend` that never fires → dismissal never saved, banner returns on reload.
   - `AnnouncementBanner.tsx:124-130,94` rotation sets `leaving` and waits → rotation stops after first 8 s.
   - `lib/ui/motion.ts:56` every Dialog/drawer/Toast close sits 300 ms on the safety timeout.
   - `WeekGrid.tsx:41-53` new blocks keep `data-fresh` forever; `WeekGrid.module.css:150` then hides the conflict outline on a newly added conflicting class.
   - `Skeleton.module.css:11,20` delay lost → skeleton flash; shimmer static.
   - Page enter (`(app)/template.module.css:2`), Stat count-up, tab panel rise-in dead.
   **Fix:** never name shared keyframes directly in modules: either `--_kf: fade-in; animation-name: var(--_kf)` (Lightning CSS doesn't rename inside `var()`), or move animation rules into `motion.css` keyed on data attributes. Add a check on built CSS: every `animation` name must have a matching `@keyframes`.

## High
2. **Nested Dialog close closes the parent.** `ui/Dialog.tsx:186-193`: React propagates `cancel`/`close` to parent components. EmailComposer confirm (`EmailComposer.tsx:251`) inside UsersPanel "Email user" dialog (`UsersPanel.tsx:215`) → Esc/Cancel closes both, draft lost. Fix: `if (e.target !== e.currentTarget) return;` at top of both handlers.
3. **Course results keep previous search state.** `course-results/page.tsx:161` `<CourseResults>` has no `key`; inline Edit search keeps old filters/page/editing/watched sets, and `CourseResults.tsx:272-277` writes old `q/days/page` into the new URL. Fix: `key={resultsHref(search)}`.

## Medium
- Failed meta batch → skeletons forever (`courses/useSectionMeta.ts:63-69`; tabs at `SectionDialog.tsx:405,545,560`). Track failed keys, show error, allow retry.
- Tracked dialog finds section by CRN alone (`TrackedClasses.tsx:176-181`, `useCourseDialog.ts:121`); CRNs repeat across terms. Put `term` in URL; key by `sectionKey(term, crn)`.
- Color change can resurrect a removed class (`SchedulePlanner.tsx:318-333` upsert on color response). Replace only if present; bump `colorSeq` in `removeClass`. `busyCrns`, `colorSeq`, `sessionAdded` (`:107-110`) keyed by CRN without term.
- Enter in Add classes searches with old subject (`AddClassesDialog.tsx:113,144-153`, `SubjectCombobox.tsx:128-137`): `commitTyped` only queues state; `onSubmit` prop never wired. Return the code and call `run(code)`.
- Meeting times load in a client waterfall (`schedule/useSectionResolver.ts`), refetched every visit; pages.md §6 says server resolves. Resolve in the page's Suspense and pass in.
- 401 handling inconsistent: courses shows sign-in toast; schedule (`lib/client/schedule.ts:57-61`) and admin (`lib/client/admin.ts:77`) show text only, no sign-in action. `DeleteAccount.tsx` does it right.
- Three fetch clients → one `lib/client/http.ts`. `ApiError`/`isAbortError` duplicated in `courses.ts:15,27` and `schedule.ts:13,27` (instanceof fails across modules); admin has `AdminApiError`. Duplicate wrappers: `addToSchedule`/`addScheduleEntry`, `removeFromSchedule`/`removeScheduleEntry`, `fetchSubjects`/`searchSubjects`, `fetchSchedule`/`fetchTerms`/`fetchWatchDetails` in both. Dead exports: `fetchTerms` (both), `searchCourses`, `fetchSectionMeta`, `listWatches`, `adminApi.me/.stats/.announcements.list`.
- Toasts may not be announced (`ui/Toast.tsx:103,170`): live region created with its text inside a `display:none` popover. Keep one persistent sr-only live region and write toast text into it.
- Over-chatty live regions: `GradesPanel.tsx:193-203` (RelativeTime), `AddClassesDialog.tsx:170` (150 rows), `CourseResults.tsx:461` (per keystroke; spec wants 500 ms debounce).
- Combobox arrow keys don't scroll active option into view (`SubjectAutocomplete.tsx:390-406`).
- Announcement times: list in Eastern unlabeled (`AnnouncementsPanel.tsx:229-236`), editor in browser zone (`AnnouncementEditor.tsx:155`).
- Duplicated helpers (unify in `src/lib/format/` or similar): `termLabel` ×3 (`courses/format.ts:88`, `admin/format.ts:11`, `lib/jobs/terms.ts:60`); `formatTimeRange` ×2 (normal vs thin spaces); `creditsLabel` ×2 ("1-4" vs "1–4"); `courseCode` ×2; `instructorOf` ×2; `sectionKey` ×2; `plural` ×3; `MONTHS` ×2; `"America/New_York"` ×4; `escapeHtml` ×2 (`admin/emailForm.ts:29`, `lib/email/escape.ts:10`); `greetingName` ×2 (different behavior); Stat tile component ×2 (`admin/Stat.tsx`, `dashboard/Stat.tsx`, `shouldCountUp` twice); course comparator ×2 (sorted twice).

## Low
- Undo races a toggle (`useSectionActions.ts:125-133,173-181`, no busy flag).
- Every 4xx shows "Check your connection." (`useSectionActions.ts:27-39`); server field errors for unrendered fields lost (`EmailComposer.tsx:120`, `AnnouncementEditor.tsx:78`).
- Toggle labels change with `aria-pressed` → double announcement (`CourseActions.tsx:56,69,98`); `AddClassRow.tsx:60` aria-label "Add…" vs visible "Added".
- Disabled-Export tooltip unreachable by keyboard (`SchedulePlanner.tsx:376-380`); `Tabs.tsx:102` `aria-controls` to unmounted panels.
- Heading order (`CourseCard.tsx:141` h3 without h2 when ungrouped); "Loading subjects…" inside `aria-hidden` (`SubjectAutocomplete.tsx:515-519`); every row menu "More actions" (`AnnouncementsPanel.tsx:162`); All/Open/Full as toggle Chips but mutually exclusive (`TrackedClasses.tsx:283-293`).
- Hardcoded ids instead of `useId` (`SectionDialog.tsx` `sd-…`, `BlockDialog.tsx:108,130`).
- Theme icon flicker: ThemeProvider returns "light" on server → swap icon via CSS on `[data-theme]`.
- Clock/hydration: `TrackedClasses.tsx:337` `new Date()` in render; `schedule-builder/page.tsx:19-23` term from UTC month (use America/New_York); `RelativeTime` ICU differences (unconfirmed).
- Stale state: `SchedulePlanner.tsx:99-100` ignores same-route `?term=` change; `TrackedClasses.tsx:120-124` scheduled set stale after Refresh; `WhatsNew.tsx:41-45` no-op subscribe; `useStoredFlag.ts:35` ignores other tabs.
- `router.refresh()` extra in `GradesPanel.tsx:136,174`; Prev/Next during debounce loads wrong offset (`UsersPanel.tsx:94-96`); shared `busyId` (`AnnouncementsPanel.tsx:44`).
- Menu popover not repositioned on scroll/resize (`ui/Menu.tsx:58-73`); sticky-bar `rootMargin` computed once (`CourseResults.tsx:285-293`); stat row negative gutter may overflow (`Dashboard.module.css:26-38`).
- `RailDrawer` (`Sidebar.tsx:141-165`) second hand-rolled modal without `onClose`.
- Security minor: syllabus iframe loads any https URL (`SectionDialog.tsx:562,583`) → allowlist GSU host + `referrerPolicy="no-referrer"`; `rmpProfileUrl` (`courses/format.ts:283`) unchecked; `admin/layout.tsx:28` `notFound()` inside Suspense → 200 not 404.
- `themeColor` literals in `app/layout.tsx:21-22` can drift from `--surface`.
- Spec drift (confirm with owner): results lack conflict badges/color picker/GPA sort; dashboard lacks "Open now", Quick search, Tracked/Schedule panels; schedule block opens `BlockDialog` not shared course dialog; DeleteAccount "DELETE" caps, toast wiped by `location.assign`.

## Mechanical checks (clean)
No undefined CSS vars (23 tokens unused, mostly z-index layers and `--bp-*`). No raw colors in CSS. Breakpoints only 640/900/1200. Two justified `!important`. z-index from scale. No unguarded `100vw`. `dangerouslySetInnerHTML` only for the theme script; email preview `srcDoc` has `sandbox=""`; all `target=_blank` have `rel`.

## What's good
Pre-paint theme (no flash); persistent shell; viewer/announcements resolved in Suspense with `connection()` and `unstable_rethrow`; localStorage via `useSyncExternalStore` with server snapshots; no global class collisions; effects clean up; stable keys; abortable sequenced fetches; optimistic actions roll back; ARIA patterns for Dialog/Menu/Tabs/SegmentedControl; skip link; focus-visible; color never the sole signal.
