"use client";

import { Fragment, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button, ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Chip } from "@/components/ui/Chip";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { ChevronLeftIcon, ChevronRightIcon, FilterIcon, SearchIcon } from "@/components/ui/icons";
import { Input, Select } from "@/components/ui/Input";
import type { SectionMeta, TermInfo } from "@/lib/client/courses";
import { useNavEntrance } from "@/lib/ui/navEntrance";
import { ScheduleToggle, WatchToggle } from "./CourseActions";
import { CourseCard } from "./CourseCard";
import { CourseSearchForm } from "./CourseSearchForm";
import {
  DAY_KEYS,
  DAY_LETTER,
  foldText,
  formatGpa,
  gpaBadgeTone,
  meetingRows,
  sectionLabel,
  titleOf,
  type DayKey,
  type Section,
} from "./format";
import { DEFAULT_FILTERS, filterParams, resultsHref, type DialogTab, type Filters, type SortKey, type TimeFilter } from "./params";
import { RetryButton } from "./RetryButton";
import { SectionDialog } from "./SectionDialog";
import { urlWith, useCourseDialog } from "./useCourseDialog";
import { useSectionActions } from "./useSectionActions";
import { useSectionMeta } from "./useSectionMeta";
import styles from "./CourseResults.module.css";
import { compareSections, compareText, courseCode, instructorsOf, keyOf, plural } from "@/lib/format";

export const PAGE_SIZE = 12;
/** The filtered count is announced this long after the last change (pages.md §4). */
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
  /** Registration closed for the term: no schedule toggles, Watch only to remove. */
  viewOnly: boolean;
  /** For the inline Edit search form; null when the list couldn't be loaded. */
  terms: TermInfo[] | null;
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

const DAY_FILTERS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const DAY_LONG: Record<DayKey, string> = {
  monday: "Monday",
  tuesday: "Tuesday",
  wednesday: "Wednesday",
  thursday: "Thursday",
  friday: "Friday",
  saturday: "Saturday",
  sunday: "Sunday",
};
const TIME_LABELS: Record<TimeFilter, string> = {
  any: "Any time",
  morning: "Morning (before noon)",
  afternoon: "Afternoon (12–5 PM)",
  evening: "Evening (5 PM and later)",
};
const SORT_LABELS: Record<SortKey, string> = {
  course: "Course & section",
  seats: "Most open seats",
  title: "Title",
};

type Indexed = {
  section: Section;
  key: string;
  text: string;
  days: Set<DayKey>;
  starts: number[];
  course: string;
};

const compareCourse = (a: Indexed, b: Indexed) => compareSections(a.section, b.section);

function inTimeRange(start: number, time: TimeFilter): boolean {
  if (time === "morning") return start < 12 * 60;
  if (time === "afternoon") return start >= 12 * 60 && start < 17 * 60;
  if (time === "evening") return start >= 17 * 60;
  return true;
}

function countActive(filters: Filters): number {
  return (filters.open ? 1 : 0) + (filters.days.length ? 1 : 0) + (filters.time !== "any" ? 1 : 0) + (filters.sort !== "course" ? 1 : 0);
}

function FilterControls({
  filters,
  update,
  idPrefix,
}: {
  filters: Filters;
  update: (patch: Partial<Filters>) => void;
  idPrefix: string;
}) {
  return (
    <>
      <Chip pressed={filters.open} onClick={() => update({ open: !filters.open })}>
        Open seats
      </Chip>
      <div role="group" aria-label="Meeting days" className={styles.days}>
        {DAY_FILTERS.map((day) => {
          const on = filters.days.includes(day);
          return (
            <Chip
              key={day}
              pressed={on}
              aria-label={DAY_LONG[day]}
              className={styles.dayChip}
              onClick={() =>
                update({
                  days: on
                    ? filters.days.filter((d) => d !== day)
                    : [...filters.days, day].sort((a, b) => DAY_KEYS.indexOf(a) - DAY_KEYS.indexOf(b)),
                })
              }
            >
              {DAY_LETTER[day]}
            </Chip>
          );
        })}
      </div>
      <Field label="Time of day" hideLabel id={`${idPrefix}-time`} className={styles.selectField}>
        <Select value={filters.time} onChange={(event) => update({ time: event.target.value as TimeFilter })}>
          {(Object.keys(TIME_LABELS) as TimeFilter[]).map((value) => (
            <option key={value} value={value}>
              {TIME_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>
      <Field label="Sort by" hideLabel id={`${idPrefix}-sort`} className={styles.selectField}>
        <Select value={filters.sort} onChange={(event) => update({ sort: event.target.value as SortKey })}>
          {(Object.keys(SORT_LABELS) as SortKey[]).map((value) => (
            <option key={value} value={value}>
              Sort: {SORT_LABELS[value]}
            </option>
          ))}
        </Select>
      </Field>
    </>
  );
}

/**
 * Course results grid (pages.md §4): sticky filter bar (text, open seats, days, time, sort),
 * 12 cards per page, per-page meta fetched once per section, watch/schedule toggles and the
 * URL-addressable detail dialog. Filtering runs on the client; filter state is mirrored to
 * the URL with replaceState (no server re-render).
 */
export function CourseResults({
  search,
  termName,
  viewOnly,
  terms,
  sections,
  failedSubjects,
  initialMeta,
  watched,
  scheduled,
  isSignedIn,
  initialFilters,
  initialDialog,
}: CourseResultsProps) {
  const navEntrance = useNavEntrance();
  const [filters, setFilters] = useState<Filters>(initialFilters);
  const [animate, setAnimate] = useState(navEntrance);
  const [editing, setEditing] = useState(false);
  const [filtersTouched, setFiltersTouched] = useState(false);
  const [sheetOpen, setSheetOpen] = useState(false);
  const deferredQ = useDeferredValue(filters.q);
  const sentinelRef = useRef<HTMLDivElement>(null);
  const barRef = useRef<HTMLDivElement>(null);
  const gridTopRef = useRef<HTMLDivElement>(null);

  const { meta, failed: metaFailed, ensure, retry: retryMeta } = useSectionMeta(initialMeta);
  const actions = useSectionActions({ initialWatched: watched, initialScheduled: scheduled, isSignedIn });

  const indexed = useMemo<Indexed[]>(
    () =>
      sections.map((section) => {
        const rows = meetingRows(section);
        return {
          section,
          key: keyOf(section),
          text: foldText([titleOf(section), sectionLabel(section), section.courseReferenceNumber ?? "", ...instructorsOf(section)].join(" ")),
          days: new Set(rows.flatMap((row) => row.days)),
          starts: rows.flatMap((row) => (row.start === null ? [] : [row.start])),
          course: courseCode(section),
        };
      }),
    [sections],
  );
  const byKey = useMemo(() => new Map(indexed.map((item) => [item.key, item.section])), [indexed]);
  const courseCount = useMemo(() => new Set(indexed.map((item) => item.course)).size, [indexed]);
  const openCount = useMemo(() => sections.filter((s) => s.seatsAvailable > 0).length, [sections]);

  const filtered = useMemo(() => {
    const q = foldText(deferredQ.trim());
    const list = indexed.filter((item) => {
      if (q && !item.text.includes(q)) return false;
      if (filters.open && !(item.section.seatsAvailable > 0)) return false;
      if (filters.days.length) {
        for (const day of item.days) if (!filters.days.includes(day)) return false;
      }
      if (filters.time !== "any") {
        if (item.starts.length === 0 || !item.starts.every((start) => inTimeRange(start, filters.time))) return false;
      }
      return true;
    });
    // `sections` arrive in course order (the server sorts them), so the default needs no sort.
    if (filters.sort === "seats") {
      return list.sort((a, b) => b.section.seatsAvailable - a.section.seatsAvailable || compareCourse(a, b));
    }
    if (filters.sort === "title") {
      return list.sort((a, b) => compareText(titleOf(a.section), titleOf(b.section)) || compareCourse(a, b));
    }
    return list;
  }, [indexed, deferredQ, filters.open, filters.days, filters.time, filters.sort]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const page = Math.min(filters.page, pageCount);
  const pageItems = useMemo(() => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE), [filtered, page]);

  // Meta for the visible page: one batch for keys never requested before.
  useEffect(() => {
    ensure(pageItems.map((item) => item.section));
  }, [pageItems, ensure]);

  // Mirror filters to the URL (shareable, survives reload) without a server round trip.
  useEffect(() => {
    const next = urlWith(filterParams({ ...filters, q: deferredQ, page }));
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(null, "", next);
    }
  }, [filters, deferredQ, page]);

  // Sticky filter bar shadow (motion.md §4.17): a 1 px sentinel above the bar.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    const bar = barRef.current;
    if (!sentinel || !bar) return;
    // Below 900 px the bar sticks under the top bar (--topbar-h).
    const topbar = window.matchMedia("(min-width: 900px)").matches
      ? 0
      : Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--topbar-h")) || 0;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) delete bar.dataset.stuck;
        else bar.dataset.stuck = "";
      },
      { rootMargin: `-${topbar + 1}px 0px 0px 0px` },
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

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

  useEffect(() => {
    if (openSection) ensure([openSection]);
  }, [openSection, ensure]);

  const update = (patch: Partial<Filters>) => {
    setAnimate(false);
    setFiltersTouched(true);
    setFilters((prev) => ({ ...prev, ...patch, page: 1 }));
  };
  const clearFilters = () => {
    setAnimate(false);
    setFiltersTouched(true);
    setFilters(DEFAULT_FILTERS);
  };
  const goToPage = (next: number) => {
    setAnimate(true);
    setFilters((prev) => ({ ...prev, page: next }));
    const top = gridTopRef.current;
    if (top && top.getBoundingClientRect().top < 0) top.scrollIntoView({ block: "start" });
  };

  const baseHref = resultsHref(search);
  const subjectsLabel = search.subjects.join(", ");
  const heading = `${subjectsLabel}${search.courseNumber ? ` ${search.courseNumber}` : ""} · ${termName}`;
  const levelLabel = search.level === "US" ? "Undergraduate" : search.level === "GS" ? "Graduate" : "All levels";
  const filteredOut = filtered.length !== sections.length;
  const countText = filteredOut
    ? `${filtered.length} of ${plural(sections.length, "section")}`
    : `${plural(sections.length, "section")} · ${openCount} open`;
  // Spoken after filtering pauses; empty until the first change (the count is on the page).
  const spokenCount = filteredOut
    ? `Showing ${plural(filtered.length, "section")} out of ${sections.length}.`
    : `Showing all ${plural(sections.length, "section")}, ${openCount} open.`;
  const announcedCount = useDebouncedValue(filtersTouched ? spokenCount : "", COUNT_ANNOUNCE_MS);
  const activeFilters = countActive(filters);
  const editHref = `/course-search?${new URLSearchParams({
    term: search.term,
    subjects: search.subjects.join(","),
    ...(search.courseNumber ? { courseNumber: search.courseNumber } : {}),
    ...(search.level ? { level: search.level } : {}),
  }).toString()}`;

  const groupStats = useMemo(() => {
    const stats = new Map<string, { count: number; title: string }>();
    for (const item of filtered) {
      const entry = stats.get(item.course);
      if (entry) entry.count += 1;
      else stats.set(item.course, { count: 1, title: titleOf(item.section) });
    }
    return stats;
  }, [filtered]);
  const courseGpa = (course: string): number | null => {
    for (const item of indexed) {
      if (item.course !== course) continue;
      const gpa = meta[item.key]?.grades?.overall?.gpa;
      if (gpa != null) return gpa;
    }
    return null;
  };
  const grouped = courseCount > 1 && filters.sort === "course";

  const editButton = terms ? (
    <Button variant="secondary" aria-expanded={editing} onClick={() => setEditing((v) => !v)} leadingIcon={<SearchIcon />}>
      Edit search
    </Button>
  ) : (
    <ButtonLink variant="secondary" href={editHref} leadingIcon={<SearchIcon />}>
      Edit search
    </ButtonLink>
  );

  const dialogActions = openSection ? (
    <>
      {!viewOnly ? (
        <ScheduleToggle
          scheduled={actions.isScheduled(openSection)}
          pending={actions.isSchedulePending(openSection)}
          code={sectionLabel(openSection)}
          onToggle={() => actions.toggleSchedule(openSection)}
        />
      ) : null}
      {!viewOnly || actions.isWatched(openSection) ? (
        <WatchToggle
          watched={actions.isWatched(openSection)}
          pending={actions.isWatchPending(openSection)}
          code={sectionLabel(openSection)}
          onToggle={() => actions.toggleWatch(openSection)}
        />
      ) : null}
    </>
  ) : null;

  return (
    <>
      <PageHeader
        title={heading}
        description={`${levelLabel} · ${plural(search.subjects.length, "subject")} · Live seat counts`}
        actions={editButton}
      >
        {viewOnly ? (
          <Banner tone="info">Registration for {termName} is closed. Sections are view-only.</Banner>
        ) : null}
        {failedSubjects.length ? (
          <Banner tone="warning" role="status" action={<RetryButton size="sm" variant="secondary">Retry</RetryButton>}>
            {failedSubjects.join(", ")} results couldn&rsquo;t be loaded. Georgia State&rsquo;s course system didn&rsquo;t answer in time.
          </Banner>
        ) : null}
        {editing && terms ? (
          <Card className={styles.editCard}>
            <CourseSearchForm
              inline
              terms={terms}
              initial={{ term: search.term, subjects: search.subjects, courseNumber: search.courseNumber, level: search.level }}
              onCancel={() => setEditing(false)}
            />
          </Card>
        ) : null}
      </PageHeader>

      {sections.length === 0 ? (
        <EmptyState
          variant="no-results"
          icon={<SearchIcon size={24} />}
          title={`No sections of ${subjectsLabel}${search.courseNumber ? ` ${search.courseNumber}` : ""} in ${termName}.`}
          actions={
            <ButtonLink href={editHref} variant="primary">
              Edit search
            </ButtonLink>
          }
        >
          Check the course number, try another level, or leave the course number blank to see every course in the subject.
        </EmptyState>
      ) : (
        <>
          <div ref={sentinelRef} className={styles.sentinel} aria-hidden="true" />
          <div ref={barRef} className={styles.bar}>
            <div className={styles.barInner}>
              <Input
                type="search"
                leadingIcon={<SearchIcon size={16} />}
                placeholder="Filter by instructor, title, CRN"
                aria-label="Filter sections by instructor, title or CRN"
                value={filters.q}
                onChange={(event) => update({ q: event.target.value })}
                className={styles.search}
              />
              <div className={styles.inlineControls}>
                <FilterControls filters={filters} update={update} idPrefix="bar" />
              </div>
              <Button
                variant="secondary"
                className={styles.filtersButton}
                leadingIcon={<FilterIcon />}
                aria-haspopup="dialog"
                onClick={() => setSheetOpen(true)}
              >
                Filters{activeFilters ? ` (${activeFilters})` : ""}
              </Button>
              <p className={styles.count}>{countText}</p>
              {/* Announced once typing pauses (500 ms), not on every keystroke. */}
              <p className="sr-only" role="status">
                {announcedCount}
              </p>
            </div>
          </div>

          <div ref={gridTopRef} className={styles.gridTop} />
          {filtered.length === 0 ? (
            <EmptyState
              variant="no-results"
              icon={<FilterIcon size={24} />}
              title="No sections match these filters."
              actions={
                <Button variant="secondary" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            >
              Try other words, fewer days or another time of day, or turn off Open seats.
            </EmptyState>
          ) : (
            <ul key={`page-${page}`} className={styles.grid} aria-label="Sections">
              {pageItems.map((item, index) => {
                const prev = pageItems[index - 1];
                const header = grouped && (!prev || prev.course !== item.course) ? groupStats.get(item.course) : undefined;
                const gpa = header ? courseGpa(item.course) : null;
                return (
                  <Fragment key={item.key}>
                    {header ? (
                      <li className={styles.groupHeader}>
                        <h2 className={styles.groupTitle}>
                          {item.course} <span className={styles.groupName}>{header.title}</span>
                        </h2>
                        <span className={styles.groupMeta}>{plural(header.count, "section")}</span>
                        {gpa != null ? <Badge tone={gpaBadgeTone(gpa)}>Course GPA {formatGpa(gpa)}</Badge> : null}
                      </li>
                    ) : null}
                    <li className={styles.item}>
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
                        onOpen={(section, card) => dialog.open(keyOf(section), section.courseReferenceNumber ?? "", card)}
                        href={`${baseHref}&crn=${item.section.courseReferenceNumber ?? ""}`}
                        index={index}
                        stagger={animate}
                        headingLevel={grouped ? 3 : 2}
                      />
                    </li>
                  </Fragment>
                );
              })}
            </ul>
          )}

          {pageCount > 1 && filtered.length > 0 ? (
            <nav className={styles.pagination} aria-label="Pages">
              <Button
                variant="secondary"
                leadingIcon={<ChevronLeftIcon />}
                disabled={page <= 1}
                onClick={() => goToPage(page - 1)}
              >
                Previous
              </Button>
              <p className={styles.pageLabel} aria-live="polite">
                Page {page} of {pageCount}
              </p>
              <Button
                variant="secondary"
                trailingIcon={<ChevronRightIcon />}
                disabled={page >= pageCount}
                onClick={() => goToPage(page + 1)}
              >
                Next
              </Button>
            </nav>
          ) : null}
        </>
      )}

      <Dialog
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title="Filters"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={clearFilters}>
              Clear
            </Button>
            <Button onClick={() => setSheetOpen(false)}>Show {plural(filtered.length, "section")}</Button>
          </>
        }
      >
        <div className={styles.sheetControls}>
          <FilterControls filters={filters} update={update} idPrefix="sheet" />
        </div>
      </Dialog>

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
      />
    </>
  );
}

/** Every subject search failed (GoSolar down): pages.md §4 error copy + Try again. */
export function ResultsUnavailable({ editHref, details }: { editHref: string; details?: string }) {
  return (
    <EmptyState
      variant="error"
      title="Couldn't reach Georgia State's course system."
      details={details}
      actions={
        <>
          <RetryButton />
          <ButtonLink href={editHref} variant="secondary">
            Edit search
          </ButtonLink>
        </>
      }
    >
      This usually clears in a minute.
    </EmptyState>
  );
}
