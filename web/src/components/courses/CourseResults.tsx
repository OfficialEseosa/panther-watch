"use client";

import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import type { SectionMeta } from "@/lib/client/courses";
import { courseCode, instructorsOf, keyOf, plural } from "@/lib/format";
import { ScheduleToggle, WatchToggle } from "./CourseActions";
import { CourseCard } from "./CourseCard";
import { foldText, sectionLabel, titleOf, type Section } from "./format";
import { OldIcon } from "./icons";
import { filterParams, resultsHref, resultsTitle, searchFormHref, type DialogTab, type Filters } from "./params";
import { ResultsToolbar } from "./ResultsToolbar";
import { RetryButton } from "./RetryButton";
import { SectionDialog } from "./SectionDialog";
import { ErrorMessage } from "./SectionParts";
import { urlWith, useCourseDialog } from "./useCourseDialog";
import { useSectionActions } from "./useSectionActions";
import { useSectionMeta } from "./useSectionMeta";
import buttons from "./buttons.module.css";
import styles from "./CourseResults.module.css";

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
  /** Subjects whose GoSolar search failed (partial results). */
  failedSubjects: string[];
  /** Meta the server fetched for the first page, keyed by (term, crn). */
  initialMeta: Record<string, SectionMeta>;
  /** (term, crn) keys the viewer watches / has scheduled. */
  watched: string[];
  scheduled: string[];
  isSignedIn: boolean;
  initialFilters: Filters;
  initialDialog: { crn: string | null; tab: DialogTab };
};

type Indexed = { section: Section; key: string; text: string };

/**
 * The original results page body: toolbar, "Found N sections" with the one text filter, a
 * two-column card grid (12 per page) with the original pagination, and the URL-addressable
 * detail dialog. Filtering runs on the client and is mirrored to the URL (`?q=&page=`).
 */
export function CourseResults({
  search,
  termName,
  viewOnly,
  sections,
  failedSubjects,
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
  const sectionTopRef = useRef<HTMLDivElement>(null);

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
      })),
    [sections],
  );
  const byKey = useMemo(() => new Map(indexed.map((item) => [item.key, item.section])), [indexed]);

  // One box that matches a CRN, an instructor, the title or the course code (the original
  // matched CRN or professor; the rest comes along for free).
  const filtered = useMemo(() => {
    const q = foldText(deferredQ.trim());
    return q ? indexed.filter((item) => item.text.includes(q)) : indexed;
  }, [indexed, deferredQ]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const pageItems = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  // Meta for the visible page: one batch for keys never requested before.
  useEffect(() => {
    ensure(pageItems.map((item) => item.section));
  }, [pageItems, ensure]);

  // Mirror the filter and page to the URL (shareable, survives reload) without a server round trip.
  useEffect(() => {
    const next = urlWith(filterParams({ q: deferredQ, page }));
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(null, "", next);
    }
  }, [deferredQ, page]);

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
    setFilters({ q, page: 1 });
  };
  const goToPage = (next: number) => {
    setFilters((prev) => ({ ...prev, page: Math.min(Math.max(1, next), pageCount) }));
    const top = sectionTopRef.current;
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: "start", behavior: "smooth" });
  };

  const filtering = filters.q.trim() !== "";
  const countText = filtering
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

      {failedSubjects.length ? (
        <ErrorMessage role="status" action={<RetryButton variant="secondary">Try again</RetryButton>}>
          {failedSubjects.join(", ")} results couldn&rsquo;t be loaded. Georgia State&rsquo;s course system didn&rsquo;t
          answer in time.
        </ErrorMessage>
      ) : null}

      {sections.length === 0 ? (
        <div className={styles.empty}>
          No sections of {search.subjects.join(", ")}
          {search.courseNumber ? ` ${search.courseNumber}` : ""} in {termName}. Check the course number or try another
          level.
        </div>
      ) : (
        <div ref={sectionTopRef} className={styles.results}>
          <div className={styles.header}>
            <p className={styles.count}>{countText}</p>
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
            {/* Announced once typing pauses, not on every keystroke. */}
            <p className="sr-only" role="status">
              {announcedCount}
            </p>
          </div>

          {filtered.length === 0 ? (
            <div className={styles.empty}>No sections match &ldquo;{filters.q}&rdquo;.</div>
          ) : (
            <>
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

              {pageCount > 1 ? (
                <nav className={styles.pagination} aria-label="Pages">
                  <button type="button" className={buttons.secondary} disabled={page <= 1} onClick={() => goToPage(page - 1)}>
                    <OldIcon name="chevronLeft" size={16} />
                    Previous
                  </button>
                  <p className={styles.pageInfo} aria-live="polite">
                    Page {page} of {pageCount}
                  </p>
                  <button
                    type="button"
                    className={buttons.secondary}
                    disabled={page >= pageCount}
                    onClick={() => goToPage(page + 1)}
                  >
                    Next
                    <OldIcon name="chevronRight" size={16} />
                  </button>
                </nav>
              ) : null}
            </>
          )}
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

