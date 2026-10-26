"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { useToast } from "@/components/ui/Toast";
import { CalendarIcon, ChevronLeftIcon, PlusIcon } from "@/components/ui/icons";
import type { CourseData } from "@/lib/gosolar/types";
import { fetchWatchDetails } from "@/lib/client/courses";
import { errorMessage, isAbortError, reportApiError } from "@/lib/client/http";
import { addScheduleEntry, removeScheduleEntry, setScheduleColor, type ScheduleEntry } from "@/lib/client/schedule";
import { SCHEDULE_PALETTE } from "@/lib/schedule/colors";
import { findConflicts, findConflictsWith, meetingsOf, type Conflict } from "@/lib/schedule/conflicts";
import { generateIcs } from "@/lib/schedule/ics";
import { prefersReducedMotion, withViewTransition } from "@/lib/ui/motion";
import { AddClassesDialog, type AddRequest, type AddTab, type TrackedState } from "./AddClassesDialog";
import { AgendaList, UnscheduledList, type UnscheduledItem } from "./AgendaList";
import { BlockDialog } from "./BlockDialog";
import { buildBlocks, fileSlug, hourRange, layoutWeek, visibleDays, type ResolvedCourse } from "./layout";
import type { ResolvedSchedule } from "./resolve";
import { useSectionResolver } from "./useSectionResolver";
import { WeekGrid } from "./WeekGrid";
import styles from "./SchedulePlanner.module.css";
import { courseCode, sectionKey } from "@/lib/format";

export type TermOption = { code: string; label: string; viewOnly: boolean };

export type SchedulePlannerProps = {
  /** Every term's entries (GET /api/schedule shape). The server is the source of truth. */
  initialSchedule: Record<string, ScheduleEntry[]>;
  /** Terms with entries plus the open registration terms, newest first. */
  termOptions: TermOption[];
  initialTerm: string;
  /** The GoSolar term list failed to load; only terms from the schedule are offered. */
  termsUnavailable: boolean;
  /** Live sections for the scheduled classes, resolved by the page on the server. */
  resolved: ResolvedSchedule;
};

/** Pause before the fresh highlight, so it starts once the Add classes dialog has faded out. */
const FRESH_DELAY_MS = 250;

/** Below this width the week grid gives way to the agenda list (old ScheduleBuilder.css). */
const WIDE_QUERY = "(min-width: 769px)";
const isWide = () => typeof window !== "undefined" && window.matchMedia(WIDE_QUERY).matches;

const without = <T,>(set: ReadonlySet<T>, value: T) => {
  const next = new Set(set);
  next.delete(value);
  return next;
};

function upsert(schedule: Record<string, ScheduleEntry[]>, entry: ScheduleEntry, index?: number) {
  const list = schedule[entry.term] ?? [];
  const at = list.findIndex((e) => e.crn === entry.crn);
  if (at !== -1) return { ...schedule, [entry.term]: list.map((e, i) => (i === at ? entry : e)) };
  const next = [...list];
  next.splice(index ?? next.length, 0, entry);
  return { ...schedule, [entry.term]: next };
}

/** Replaces an entry that is still on the schedule; never re-adds one (e.g. removed meanwhile). */
function replaceIfPresent(schedule: Record<string, ScheduleEntry[]>, entry: ScheduleEntry) {
  const list = schedule[entry.term] ?? [];
  return list.some((e) => e.crn === entry.crn) ? upsert(schedule, entry) : schedule;
}

/**
 * The Schedule Builder controller, laid out like the original page (old ScheduleBuilder.jsx):
 * back link, title, term selector, Add classes and Export to calendar; the week grid on wide
 * screens and the agenda list on phones; conflicts, the class dialog (color, remove), the Add
 * classes dialog and .ics export. All
 * writes go straight to the API; local state only mirrors what the server confirmed (plus
 * optimistic removes/color changes that roll back on failure).
 */
export function SchedulePlanner({
  initialSchedule,
  termOptions,
  initialTerm,
  termsUnavailable,
  resolved: serverResolved,
}: SchedulePlannerProps) {
  const toast = useToast();
  const [schedule, setSchedule] = useState(initialSchedule);
  const [term, setTerm] = useState(initialTerm);
  const [sources, setSources] = useState({ schedule: initialSchedule, term: initialTerm });
  const [selectedCrn, setSelectedCrn] = useState<string | null>(null);
  const [blockOpen, setBlockOpen] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addTab, setAddTab] = useState<AddTab>("tracked");
  const [tracked, setTracked] = useState<TrackedState>({ status: "idle" });
  /** Busy (term, crn) keys: CRNs repeat across terms. */
  const [busyKeys, setBusyKeys] = useState<ReadonlySet<string>>(new Set());
  const [freshCrns, setFreshCrns] = useState<ReadonlySet<string>>(new Set());
  /** (term, crn) keys added while the Add classes dialog is open. */
  const sessionAdded = useRef(new Set<string>());
  /** Per (term, crn): bumped by every color change and removal, so a stale response is dropped. */
  const colorSeq = useRef(new Map<string, number>());

  // A navigation to this page with new server data (e.g. a link to `?term=`): adopt it
  // (adjusting state during render). Local writes are already on the server.
  if (sources.schedule !== initialSchedule || sources.term !== initialTerm) {
    setSources({ schedule: initialSchedule, term: initialTerm });
    if (sources.schedule !== initialSchedule) setSchedule(initialSchedule);
    if (sources.term !== initialTerm) {
      setTerm(initialTerm);
      setBlockOpen(false);
      setSelectedCrn(null);
      setFreshCrns(new Set());
    }
  }
  const trackedController = useRef<AbortController | null>(null);
  const viewRef = useRef<HTMLDivElement>(null);
  const freshTimer = useRef<number | undefined>(undefined);

  useEffect(
    () => () => {
      trackedController.current?.abort();
      window.clearTimeout(freshTimer.current);
    },
    [],
  );

  const termOption = termOptions.find((t) => t.code === term) ?? null;
  const termLabel = termOption?.label ?? term;
  const viewOnly = termOption?.viewOnly ?? false;
  const entries = useMemo(() => schedule[term] ?? [], [schedule, term]);
  const { resolutions, seed, retryFailed } = useSectionResolver(term, entries, serverResolved);
  const busyCrns = useMemo(() => {
    const set = new Set<string>();
    for (const key of busyKeys) if (key.startsWith(`${term}|`)) set.add(key.slice(term.length + 1));
    return set;
  }, [busyKeys, term]);

  // ---- Derived calendar data ----
  const resolved = useMemo<ResolvedCourse[]>(() => {
    const out: ResolvedCourse[] = [];
    for (const entry of entries) {
      const resolution = resolutions.get(entry.crn);
      if (resolution?.status === "ok" && resolution.section) {
        out.push({ crn: entry.crn, code: courseCode(entry.subject, entry.courseNumber), section: resolution.section, colorIndex: entry.colorIndex });
      }
    }
    return out;
  }, [entries, resolutions]);
  const resolvedSections = useMemo(() => resolved.map((c) => c.section), [resolved]);
  const conflicts = useMemo(() => findConflicts(resolvedSections), [resolvedSections]);
  const blocks = useMemo(() => buildBlocks(resolved), [resolved]);
  const week = useMemo(() => layoutWeek(blocks, conflicts), [blocks, conflicts]);
  const days = useMemo(() => visibleDays(blocks), [blocks]);
  const range = useMemo(() => hourRange(blocks), [blocks]);
  const positioned = useMemo(() => [...week.values()].flat(), [week]);

  const unscheduled: UnscheduledItem[] = entries
    .map((entry) => ({ entry, resolution: resolutions.get(entry.crn) ?? { status: "loading" as const, section: null } }))
    .filter(({ resolution }) =>
      resolution.status === "ok" ? meetingsOf(resolution.section).length === 0 : resolution.status !== "loading",
    );
  const loadingCount = entries.filter((entry) => (resolutions.get(entry.crn)?.status ?? "loading") === "loading").length;
  const failed = entries.filter((entry) => resolutions.get(entry.crn)?.status === "failed");
  const timedCount = resolved.filter((c) => meetingsOf(c.section).length > 0).length;
  const scheduledCrns = useMemo(() => new Set(entries.map((e) => e.crn)), [entries]);

  const selectedEntry = selectedCrn ? (entries.find((e) => e.crn === selectedCrn) ?? null) : null;
  const selectedConflicts = selectedCrn
    ? conflicts
        .filter((c) => c.crns.includes(selectedCrn))
        .map((conflict) => {
          const other = conflict.crns[0] === selectedCrn ? conflict.sections[1] : conflict.sections[0];
          return { other: courseCode(other.subject, other.courseNumber), conflict };
        })
    : [];

  const conflictsFor = useCallback(
    (section: CourseData) =>
      findConflictsWith(section, resolvedSections).map((c) => courseCode(c.sections[1].subject, c.sections[1].courseNumber)),
    [resolvedSections],
  );

  // ---- Term ----
  const changeTerm = (code: string) => {
    if (code === term) return;
    setTerm(code);
    setBlockOpen(false);
    setSelectedCrn(null);
    setFreshCrns(new Set());
    const url = new URL(window.location.href);
    url.searchParams.set("term", code);
    window.history.replaceState(null, "", url);
  };

  // ---- Tracked classes (live details load on demand) ----
  const loadTracked = (force = false) => {
    if (!force && (tracked.status === "loading" || tracked.status === "ok")) return;
    trackedController.current?.abort();
    const ctrl = new AbortController();
    trackedController.current = ctrl;
    setTracked({ status: "loading" });
    fetchWatchDetails(ctrl.signal)
      .then((items) => setTracked({ status: "ok", items }))
      .catch((error: unknown) => {
        if (isAbortError(error)) return;
        setTracked({ status: "error", message: errorMessage(error, "Couldn't load your tracked classes.") });
      });
  };

  const openAdd = (tab: AddTab) => {
    sessionAdded.current.clear();
    setAddTab(tab);
    setAddOpen(true);
    if (tab === "tracked") loadTracked();
  };

  const changeAddTab = (tab: AddTab) => {
    setAddTab(tab);
    if (tab === "tracked") loadTracked();
  };

  const closeAdd = () => {
    setAddOpen(false);
    const added = (schedule[term] ?? []).filter((e) => sessionAdded.current.has(sectionKey(e.term, e.crn))).map((e) => e.crn);
    sessionAdded.current.clear();
    if (!isWide() || added.length === 0) return;
    window.clearTimeout(freshTimer.current);
    freshTimer.current = window.setTimeout(() => setFreshCrns(new Set(added)), FRESH_DELAY_MS);
  };

  const onFreshDone = useCallback((crn: string) => setFreshCrns((prev) => (prev.has(crn) ? without(prev, crn) : prev)), []);

  // ---- Mutations ----
  const setBusy = (busyTerm: string, crn: string, busy: boolean) => {
    const key = sectionKey(busyTerm, crn);
    setBusyKeys((prev) => (busy ? new Set(prev).add(key) : without(prev, key)));
  };

  const addClass = (request: AddRequest) => {
    const addTerm = term;
    if (busyKeys.has(sectionKey(addTerm, request.crn))) return;
    const code = courseCode(request.subject, request.courseNumber);
    const clashes = request.section ? findConflictsWith(request.section, resolvedSections) : [];
    if (request.section) seed(addTerm, [request.section]);
    setBusy(addTerm, request.crn, true);
    addScheduleEntry({
      term: addTerm,
      crn: request.crn,
      subject: request.subject,
      courseNumber: request.courseNumber,
      courseTitle: request.courseTitle,
    })
      .then(({ entry }) => {
        setSchedule((prev) => upsert(prev, entry));
        sessionAdded.current.add(sectionKey(entry.term, entry.crn));
        const label = request.section?.sequenceNumber ? `${code} · ${request.section.sequenceNumber}` : code;
        if (clashes.length > 0) {
          const other = clashes.map((c) => `${courseCode(c.sections[1].subject, c.sections[1].courseNumber)} (${c.label})`);
          toast.warning(`Added ${label} · overlaps ${other.join(", ")}`, {
            body: "It's on your schedule with a conflict outline. GoSolar enforces real conflicts at registration.",
          });
        } else {
          toast.success(`Added ${label}`);
        }
      })
      .catch((error: unknown) => reportApiError(toast, error, `Couldn't add ${code}`))
      .finally(() => setBusy(addTerm, request.crn, false));
  };

  const undoRemove = (entry: ScheduleEntry) => {
    const code = courseCode(entry.subject, entry.courseNumber);
    addScheduleEntry({
      term: entry.term,
      crn: entry.crn,
      subject: entry.subject,
      courseNumber: entry.courseNumber,
      courseTitle: entry.courseTitle,
      color: entry.colorIndex,
    })
      .then(({ entry: restored }) => {
        void withViewTransition("schedule", () => flushSync(() => setSchedule((prev) => upsert(prev, restored))));
      })
      .catch((error: unknown) => reportApiError(toast, error, `Couldn't restore ${code}`));
  };

  const removeClass = (entry: ScheduleEntry, { animate }: { animate: boolean }) => {
    const code = courseCode(entry.subject, entry.courseNumber);
    const index = (schedule[entry.term] ?? []).findIndex((e) => e.crn === entry.crn);
    const apply = () => {
      setBlockOpen(false);
      setSchedule((prev) => ({ ...prev, [entry.term]: (prev[entry.term] ?? []).filter((e) => e.crn !== entry.crn) }));
    };
    // The removed blocks pop out and lanes re-split (motion.md §4.11). The dialog closes inside
    // the same transition, so its snapshot crossfades away with the root.
    if (animate && isWide()) void withViewTransition("schedule", () => flushSync(apply));
    else apply();
    const key = sectionKey(entry.term, entry.crn);
    sessionAdded.current.delete(key);
    // A color response still in flight must not put the removed class back.
    colorSeq.current.set(key, (colorSeq.current.get(key) ?? 0) + 1);
    setBusy(entry.term, entry.crn, true);
    removeScheduleEntry(entry.term, entry.crn)
      .then(() => {
        toast.success(`Removed ${code}`, { action: { label: "Undo", onClick: () => undoRemove(entry) } });
      })
      .catch((error: unknown) => {
        setSchedule((prev) => upsert(prev, entry, index === -1 ? undefined : index));
        reportApiError(toast, error, `Couldn't remove ${code}`);
      })
      .finally(() => setBusy(entry.term, entry.crn, false));
  };

  const changeColor = (entry: ScheduleEntry, colorIndex: number) => {
    if (colorIndex === entry.colorIndex) return;
    const key = sectionKey(entry.term, entry.crn);
    const seq = (colorSeq.current.get(key) ?? 0) + 1;
    colorSeq.current.set(key, seq);
    const previous = entry;
    setSchedule((prev) => replaceIfPresent(prev, { ...entry, color: colorIndex, colorIndex, colorHex: SCHEDULE_PALETTE[colorIndex] }));
    setScheduleColor(entry.term, entry.crn, colorIndex)
      .then((saved) => {
        if (colorSeq.current.get(key) === seq) setSchedule((prev) => replaceIfPresent(prev, saved));
      })
      .catch((error: unknown) => {
        if (colorSeq.current.get(key) !== seq) return;
        setSchedule((prev) => replaceIfPresent(prev, previous));
        reportApiError(toast, error, "Couldn't change the color");
      });
  };

  // ---- Views ----
  const openBlock = (crn: string) => {
    setSelectedCrn(crn);
    setBlockOpen(true);
  };

  const showConflicts = () => {
    // The grid and the agenda are both rendered (CSS shows one): take the first visible outline.
    const target = [...(viewRef.current?.querySelectorAll<HTMLElement>("[data-conflict]") ?? [])].find(
      (element) => element.getClientRects().length > 0,
    );
    if (!target) return;
    target.scrollIntoView({ block: "center", inline: "center", behavior: prefersReducedMotion() ? "auto" : "smooth" });
    target.focus({ preventScroll: true });
  };

  const exportIcs = () => {
    const sections = resolved
      .filter((c) => meetingsOf(c.section).length > 0)
      .map((c) => ({ ...c.section, color: c.colorIndex }));
    if (sections.length === 0) return;
    const ics = generateIcs(sections, { calendarName: `PantherWatch · ${termLabel}` });
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `pantherwatch-${fileSlug(termLabel, term)}.ics`;
    document.body.append(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    const skipped = unscheduled.map(({ entry }) => courseCode(entry.subject, entry.courseNumber));
    toast.success("Calendar file downloaded", {
      body: `Open it to import into Google Calendar or Apple Calendar.${
        skipped.length ? ` Not included (no meeting time): ${skipped.join(", ")}.` : ""
      }`,
    });
  };

  // ---- Render ----
  const exportDisabled = timedCount === 0;
  const addDisabled = viewOnly;
  const allLoading = resolved.length === 0 && loadingCount > 0;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.headerTop}>
          <Link href="/dashboard" className={styles.backButton}>
            <ChevronLeftIcon size={16} />
            Back
          </Link>
        </div>
        <div className={styles.headerContent}>
          <div className={styles.headerText}>
            <h1 className={styles.title}>Schedule Builder</h1>
            <p className={styles.description}>
              Plan your week visually. Add classes straight from search results, your tracked list, or the catalog,
              then export everything to your calendar app.
            </p>
          </div>
          <div className={styles.headerActions}>
            <select
              className={styles.termSelector}
              aria-label="Term"
              value={term}
              onChange={(event) => changeTerm(event.target.value)}
            >
              {termOptions.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.viewOnly ? `${option.label} (view only)` : option.label}
                </option>
              ))}
            </select>
            <button type="button" className={styles.btnSecondary} onClick={() => openAdd("tracked")} disabled={addDisabled}>
              Add classes
            </button>
            <button
              type="button"
              className={styles.btnPrimary}
              onClick={exportIcs}
              disabled={exportDisabled}
              title={exportDisabled ? "No classes with meeting times to export yet" : "Download an .ics file for your calendar app"}
            >
              <CalendarIcon size={18} />
              Export to calendar
            </button>
          </div>
        </div>
      </header>

      {termsUnavailable || viewOnly || failed.length > 0 || conflicts.length > 0 ? (
        <div className={styles.notices}>
          {termsUnavailable ? (
            <p className={styles.notice} data-tone="warning">
              Couldn&rsquo;t load GoSolar&rsquo;s term list, so only terms already on your schedule are shown.
            </p>
          ) : null}
          {viewOnly ? (
            <p className={styles.notice} data-tone="info">
              Registration for {termLabel} is closed. You can view, recolor and export this schedule, but classes can no
              longer be added.
            </p>
          ) : null}
          {failed.length > 0 ? (
            <div className={styles.notice} data-tone="warning">
              <span>
                Couldn&rsquo;t load meeting times for{" "}
                {failed.map((entry) => courseCode(entry.subject, entry.courseNumber)).join(", ")} from GoSolar.
              </span>
              <button type="button" className={styles.noticeAction} onClick={() => retryFailed(term)}>
                Retry
              </button>
            </div>
          ) : null}
          <ConflictNotice conflicts={conflicts} onShow={showConflicts} />
        </div>
      ) : null}

      <div className={styles.container} ref={viewRef}>
        {loadingCount > 0 && !allLoading ? (
          <p className={styles.status} role="status">
            Loading meeting times for {loadingCount} {loadingCount === 1 ? "class" : "classes"}…
          </p>
        ) : null}
        <WeekGrid
          label={`${termLabel} week`}
          days={days}
          range={range}
          week={week}
          freshCrns={freshCrns}
          onFreshDone={onFreshDone}
          onOpen={openBlock}
        />
        <AgendaList blocks={positioned} onOpen={openBlock} />

        {allLoading ? (
          <div className={styles.emptySchedule} role="status">
            <p>Loading meeting times…</p>
          </div>
        ) : entries.length === 0 ? (
          <div className={styles.emptySchedule}>
            <CalendarIcon size={48} />
            <h3>No classes scheduled</h3>
            {addDisabled ? (
              <p>Registration for {termLabel} is closed, so classes can no longer be added.</p>
            ) : (
              <>
                <p>
                  Add classes from your tracked list, or tap the calendar icon on any course in search results to drop it
                  onto your schedule.
                </p>
                <button type="button" className={styles.btnSecondary} onClick={() => openAdd("tracked")}>
                  <PlusIcon size={16} />
                  Add classes
                </button>
              </>
            )}
          </div>
        ) : null}
      </div>

      <UnscheduledList items={unscheduled} onOpen={openBlock} />

      <BlockDialog
        open={blockOpen}
        onClose={() => setBlockOpen(false)}
        entry={selectedEntry}
        termLabel={termLabel}
        resolution={selectedCrn ? (resolutions.get(selectedCrn) ?? null) : null}
        conflicts={selectedConflicts}
        onColor={changeColor}
        onRemove={(entry) => removeClass(entry, { animate: true })}
      />

      <AddClassesDialog
        open={addOpen}
        onClose={closeAdd}
        term={term}
        termLabel={termLabel}
        tab={addTab}
        onTabChange={changeAddTab}
        tracked={tracked}
        onRetryTracked={() => loadTracked(true)}
        scheduledCrns={scheduledCrns}
        busyCrns={busyCrns}
        conflictsFor={conflictsFor}
        onAdd={addClass}
        onRemove={(crn) => {
          const entry = entries.find((e) => e.crn === crn);
          if (entry) removeClass(entry, { animate: false });
        }}
      />
    </div>
  );
}

const codeOf = (section: Conflict["sections"][number]) => courseCode(section.subject, section.courseNumber);

/** Every overlapping pair, styled as the old app's error notice, with [Show]. */
function ConflictNotice({ conflicts, onShow }: { conflicts: Conflict[]; onShow: () => void }) {
  if (conflicts.length === 0) return null;
  const first = conflicts[0];
  return (
    <div className={styles.notice} data-tone="danger" role="status">
      <div>
        <strong>
          {conflicts.length === 1
            ? `1 conflict: ${codeOf(first.sections[0])} and ${codeOf(first.sections[1])} overlap ${first.label}.`
            : `${conflicts.length} conflicts`}
        </strong>
        {conflicts.length > 1 ? (
          <ul className={styles.pairs}>
            {conflicts.map((conflict) => (
              <li key={`${conflict.crns[0]}-${conflict.crns[1]}`}>
                {codeOf(conflict.sections[0])} and {codeOf(conflict.sections[1])} overlap {conflict.label}.
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <button type="button" className={styles.noticeAction} onClick={onShow}>
        Show
      </button>
    </div>
  );
}
