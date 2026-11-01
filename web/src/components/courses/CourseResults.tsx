"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { SectionMeta } from "@/lib/client/courses";
import {
  activeFilterCount,
  DEFAULT_SECTION_FILTERS,
  matchesFilters,
  needsMeta,
  sortSections,
  type SectionFilters,
} from "@/lib/courses/filters";
import { courseCode, instructorsOf, keyOf, plural } from "@/lib/format";
import { ScheduleToggle, WatchToggle } from "./CourseActions";
import { CourseCard } from "./CourseCard";
import { CourseFocusChips, type FocusCourse } from "./CourseFocusChips";
import { FiltersPopover } from "./FiltersPopover";
import { foldText, metaItemOf, sectionLabel, titleOf, type Section } from "./format";
import { OldIcon } from "./icons";
import {
  displayCourseNumbers,
  filterParams,
  focusKey,
  resultsHref,
  resultsTitle,
  searchFormHref,
  type DialogTab,
  type Filters,
} from "./params";
import { ResultsPagination } from "./ResultsPagination";
import { ResultsToolbar } from "./ResultsToolbar";
import { RetryButton } from "./RetryButton";
import { SectionDialog } from "./SectionDialog";
import { ErrorMessage } from "./SectionParts";
import { urlWith, useCourseDialog } from "./useCourseDialog";
import { useSectionActions } from "./useSectionActions";
import { useSectionMeta } from "./useSectionMeta";
import styles from "./CourseResults.module.css";
import extra from "./ResultsControls.module.css";

export const PAGE_SIZE = 12;
/** The filtered count is announced this long after the last change. */
const COUNT_ANNOUNCE_MS = 500;

/** `value`, updated only once it has been stable for `ms`. */
function useDebouncedValue<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(value), ms);
    return () => window.clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

export type ResultsSearch = {
  term: string;
  subjects: string[];
  courseNumber: string | null;
  level: string | null;
};

export type CourseResultsProps = {
  search: ResultsSearch;
  /** "Fall 2026" */
  termName: string;
  /** Registration closed for the term: the schedule button (and Watch, unless watching) are disabled. */
  viewOnly: boolean;
  sections: Section[];
  /** Searches ("CSC 4352", or "CSC" for a whole subject) whose GoSolar request failed (partial results). */
  failedSearches: string[];
  /** Meta the server fetched for the first page, keyed by (term, crn). */
  initialMeta: Record<string, SectionMeta>;
  /** (term, crn) keys the viewer watches / has scheduled. */
  watched: string[];
  scheduled: string[];
  isSignedIn: boolean;
  initialFilters: Filters;
  initialDialog: { crn: string | null; tab: DialogTab };
};

type Indexed = { section: Section; key: string; text: string; course: string };

const prefersReducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * The original results page body: toolbar, "Found N sections" with the one text filter (plus a
 * Filters button whose popover holds days, seats, honors, rating, GPA and the sort), course
 * focus chips when the results span several courses, a two-column card grid (12 per page) with
 * the original pagination, and the URL-addressable detail dialog. Filtering runs on the client
 * and is mirrored to the URL (`?q=&page=&focus=&days=&open=&honors=&minRating=&minGpa=&sort=`).
 */
export function CourseResults({
  search,
  termName,
  viewOnly,
  sections,
  failedSearches,
  initialMeta,
  watched,
  scheduled,
  isSignedIn,
  initialFilters,
  initialDialog,
}: CourseResultsProps) {
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [filtersTouched, setFiltersTouched] = useState(false);
  const deferredQ = useDeferredValue(filters.q);
  const gridTopRef = useRef<HTMLDivElement>(null);

  const { meta, failed: metaFailed, ensure, retry: retryMeta } = useSectionMeta(initialMeta);
  const actions = useSectionActions({ initialWatched: watched, initialScheduled: scheduled, isSignedIn });

  const indexed = useMemo<Indexed[]>(
    () =>
      sections.map((section) => ({
        section,
        key: keyOf(section),
        text: foldText(
          [titleOf(section), sectionLabel(section), section.courseReferenceNumber ?? "", ...instructorsOf(section)].join(" "),
        ),
        course: focusKey(section.subject, section.courseNumber),
      })),
    [sections],
  );
  const byKey = useMemo(() => new Map(indexed.map((item) => [item.key, item.section])), [indexed]);

  // One box that matches a CRN, an instructor, the title or the course code (the original
  // matched CRN or professor; the rest comes along for free).
  const textFiltered = useMemo(() => {
    const q = foldText(deferredQ.trim());
    return q ? indexed.filter((item) => item.text.includes(q)) : indexed;
  }, [indexed, deferredQ]);

  const { days, open, honors, minRating, minGpa, sort } = filters;
  const sectionFilters = useMemo<SectionFilters>(
    () => ({ days, open, honors, minRating, minGpa, sort }),
    [days, open, honors, minRating, minGpa, sort],
  );
  const activeCount = activeFilterCount(sectionFilters);
  const wantsMeta = needsMeta(sectionFilters);

  // A rating/GPA minimum or sort reads every candidate's meta, not just the visible page's.
  useEffect(() => {
    if (wantsMeta) ensure(textFiltered.map((item) => item.section));
  }, [wantsMeta, textFiltered, ensure]);
  const metaPending = wantsMeta
    ? textFiltered.filter((item) => !meta[item.key] && !metaFailed.has(item.key) && metaItemOf(item.section)).length
    : 0;

  const passed = useMemo(
    () => textFiltered.filter((item) => matchesFilters({ section: item.section, meta: meta[item.key] }, sectionFilters)),
    [textFiltered, sectionFilters, meta],
  );

  // Focus chips: every course in the results (course order), counting the sections that pass.
  const courses = useMemo<FocusCourse[]>(() => {
    const byCourse = new Map<string, FocusCourse>();
    for (const item of indexed) {
      if (!byCourse.has(item.course)) byCourse.set(item.course, { key: item.course, label: courseCode(item.section), count: 0 });
    }
    for (const item of passed) {
      const course = byCourse.get(item.course);
      if (course) course.count++;
    }
    return [...byCourse.values()];
  }, [indexed, passed]);
  const focus = filters.focus && courses.some((course) => course.key === filters.focus) ? filters.focus : null;

  const filtered = useMemo(() => {
    const focused = focus ? passed.filter((item) => item.course === focus) : passed;
    return sortSections(focused, sectionFilters.sort, (item) => ({ section: item.section, meta: meta[item.key] }));
  }, [passed, focus, sectionFilters.sort, meta]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const pageItems = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  // Meta for the visible page: one batch for keys never requested before.
  useEffect(() => {
    ensure(pageItems.map((item) => item.section));
  }, [pageItems, ensure]);

  // Mirror the filters and page to the URL (shareable, survives reload) without a server round trip.
  useEffect(() => {
    const next = urlWith(filterParams({ ...sectionFilters, q: deferredQ, page, focus }));
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(null, "", next);
    }
  }, [deferredQ, page, focus, sectionFilters]);

  const resolve = useCallback(
    (crn: string) => indexed.find((item) => item.section.courseReferenceNumber === crn)?.key ?? null,
    [indexed],
  );
  const dialog = useCourseDialog({
    initialKey: initialDialog.crn ? resolve(initialDialog.crn) : null,
    initialTab: initialDialog.tab,
    resolve,
  });
  const openSection = dialog.openKey ? (byKey.get(dialog.openKey) ?? null) : null;
  // Stable, so opening the dialog doesn't re-render every (memoized) card.
  const openDialog = dialog.open;
  const openCard = useCallback(
    (section: Section, card: HTMLElement) => openDialog(keyOf(section), section.courseReferenceNumber ?? "", card),
    [openDialog],
  );

  useEffect(() => {
    if (openSection) ensure([openSection]);
  }, [openSection, ensure]);

  // "By professor" in the dialog lists only instructors teaching this course in these results.
  const currentInstructors = useMemo(() => {
    if (!openSection) return undefined;
    const code = courseCode(openSection);
    const names = new Set<string>();
    for (const { section } of indexed) if (courseCode(section) === code) for (const name of instructorsOf(section)) names.add(name);
    return [...names];
  }, [openSection, indexed]);

  const setQuery = (q: string) => {
    setFiltersTouched(true);
    setFilters((prev) => ({ ...prev, q, page: 1 }));
  };
  const updateFilters = (patch: Partial<SectionFilters>) => {
    setFiltersTouched(true);
    setFilters((prev) => ({ ...prev, ...patch, page: 1 }));
  };
  const clearFilters = () => updateFilters(DEFAULT_SECTION_FILTERS);
  const setFocus = (next: string | null) => {
    setFiltersTouched(true);
    setFilters((prev) => ({ ...prev, focus: next, page: 1 }));
  };
  // Previous/Next/the page field: the new page starts at the top of the grid (clear of the
  // sticky phone header: scroll-margin-top), not the top of the page.
  const goToPage = (next: number) => {
    setFilters((prev) => ({ ...prev, page: Math.min(Math.max(1, next), pageCount) }));
    gridTopRef.current?.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  };

  // Sorting alone narrows nothing: the count line says "Found N" until something is filtered.
  const filtersNarrow = activeCount - (sort !== "course" ? 1 : 0) > 0;
  const narrowed = filters.q.trim() !== "" || filtersNarrow || focus !== null;
  const countText = narrowed
    ? `Showing ${filtered.length} of ${plural(sections.length, "section")}`
    : `Found ${plural(sections.length, "section")}`;
  const announcedCount = useDebouncedValue(filtersTouched ? `${countText}.` : "", COUNT_ANNOUNCE_MS);
  const editHref = searchFormHref(search);

  const dialogActions = openSection ? (
    <>
      <ScheduleToggle
        scheduled={actions.isScheduled(openSection)}
        pending={actions.isSchedulePending(openSection)}
        code={sectionLabel(openSection)}
        disabled={viewOnly}
        hint={isSignedIn ? undefined : "Sign in to add to your schedule"}
        onToggle={() => actions.toggleSchedule(openSection)}
      />
      <WatchToggle
        watched={actions.isWatched(openSection)}
        pending={actions.isWatchPending(openSection)}
        code={sectionLabel(openSection)}
        disabled={viewOnly && !actions.isWatched(openSection)}
        hint={isSignedIn ? undefined : "Sign in to track classes"}
        onToggle={() => actions.toggleWatch(openSection)}
      />
    </>
  ) : null;

  return (
    <div className={styles.page}>
      <ResultsToolbar title={resultsTitle(search, termName)} editHref={editHref} />

      {failedSearches.length ? (
        <ErrorMessage role="status" action={<RetryButton variant="secondary">Try again</RetryButton>}>
          {failedSearches.join(", ")} results couldn&rsquo;t be loaded. Georgia State&rsquo;s course system didn&rsquo;t
          answer in time.
        </ErrorMessage>
      ) : null}

      {sections.length === 0 ? (
        <div className={styles.empty}>
          No sections of {search.subjects.join(", ")}
          {search.courseNumber ? ` ${displayCourseNumbers(search.courseNumber)}` : ""} in {termName}. Check the course
          number or try another level.
        </div>
      ) : (
        <div className={styles.results}>
          <div className={styles.header}>
            <p className={styles.count}>
              {countText}
              {metaPending > 0 ? <span className={extra.pending}> &middot; loading ratings and grades&hellip;</span> : null}
              {activeCount > 0 ? (
                <>
                  {" "}
                  <button type="button" className={extra.clear} onClick={clearFilters}>
                    Clear filters
                  </button>
                </>
              ) : null}
            </p>
            <div className={extra.controls}>
              <label className={styles.filter}>
                <OldIcon name="search" size={16} />
                <input
                  type="search"
                  className={styles.filterInput}
                  placeholder="Filter by professor or CRN"
                  aria-label="Filter sections by professor, title or CRN"
                  value={filters.q}
                  onChange={(event) => setQuery(event.target.value)}
                />
                {filters.q ? (
                  <button type="button" className={styles.filterClear} onClick={() => setQuery("")} aria-label="Clear filter">
                    <OldIcon name="x" size={14} />
                  </button>
                ) : null}
              </label>
              <FiltersPopover filters={sectionFilters} onChange={updateFilters} onClear={clearFilters} activeCount={activeCount} />
            </div>
            {/* Announced once typing pauses, not on every keystroke. */}
            <p className="sr-only" role="status">
              {announcedCount}
            </p>
          </div>

          <div ref={gridTopRef} className={extra.gridTop}>
            {courses.length > 1 ? <CourseFocusChips courses={courses} focus={focus} onChange={setFocus} /> : null}

            {filtered.length === 0 ? (
              <div className={styles.empty}>
                {filters.q.trim() ? <>No sections match &ldquo;{filters.q}&rdquo;.</> : "No sections match these filters."}
                {activeCount > 0 ? (
                  <>
                    {" "}
                    <button type="button" className={extra.clear} onClick={clearFilters}>
                      Clear filters
                    </button>
                  </>
                ) : null}
              </div>
            ) : (
              <ul key={`page-${page}`} className={styles.grid} aria-label="Sections">
                {pageItems.map((item) => (
                  <li key={item.key} className={styles.item}>
                    <CourseCard
                      section={item.section}
                      meta={meta[item.key]}
                      watched={actions.isWatched(item.section)}
                      scheduled={actions.isScheduled(item.section)}
                      watchPending={actions.isWatchPending(item.section)}
                      schedulePending={actions.isSchedulePending(item.section)}
                      isSignedIn={isSignedIn}
                      viewOnly={viewOnly}
                      onToggleWatch={actions.toggleWatch}
                      onToggleSchedule={actions.toggleSchedule}
                      onOpen={openCard}
                      href={`${resultsHref(search)}&crn=${item.section.courseReferenceNumber ?? ""}`}
                    />
                  </li>
                ))}
              </ul>
            )}
          </div>

          {filtered.length > 0 && pageCount > 1 ? <ResultsPagination page={page} pageCount={pageCount} onPage={goToPage} /> : null}
        </div>
      )}

      <SectionDialog
        section={openSection}
        meta={openSection ? meta[keyOf(openSection)] : undefined}
        metaFailed={openSection ? metaFailed.has(keyOf(openSection)) : false}
        onRetryMeta={() => {
          if (openSection) retryMeta([openSection]);
        }}
        onClose={dialog.close}
        tab={dialog.tab}
        onTabChange={dialog.setTab}
        actions={dialogActions}
        termName={termName}
        currentInstructors={currentInstructors}
        originRef={dialog.origin}
      />
    </div>
  );
}

/** Every subject search failed (GoSolar down): the original error box with Try again. */
export function ResultsUnavailable({ title, editHref }: { title: string; editHref: string }) {
  return (
    <div className={styles.page}>
      <ResultsToolbar title={title} editHref={editHref} />
      <ErrorMessage action={<RetryButton variant="secondary" />}>
        Couldn&rsquo;t reach Georgia State&rsquo;s course system. This usually clears in a minute.
      </ErrorMessage>
    </div>
  );
}

