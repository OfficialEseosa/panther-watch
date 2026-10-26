"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import { RemoveWatchButton, ScheduleToggle } from "@/components/courses/CourseActions";
import { CourseCard } from "@/components/courses/CourseCard";
import { sectionLabel, type Section } from "@/components/courses/format";
import type { DialogTab } from "@/components/courses/params";
import { SectionDialog } from "@/components/courses/SectionDialog";
import { urlWith, useCourseDialog } from "@/components/courses/useCourseDialog";
import { RetryButton } from "@/components/courses/RetryButton";
import { reportActionError, useSectionActions } from "@/components/courses/useSectionActions";
import { useSectionMeta } from "@/components/courses/useSectionMeta";
import { PageHeader } from "@/components/shell/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { BellIcon, ClockIcon, RefreshIcon, SearchIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { addWatch, removeWatch, type WatchDetailsItem } from "@/lib/client/courses";
import { playExit } from "@/lib/ui/motion";
import { useNavEntrance } from "@/lib/ui/navEntrance";
import gridStyles from "@/components/courses/CourseResults.module.css";
import styles from "./TrackedClasses.module.css";
import { compareText, courseCode, keyOf, plural, sectionKey, termLabel } from "@/lib/format";

export type TrackedFilter = "all" | "open" | "full";

export type TrackedClassesProps = {
  items: WatchDetailsItem[];
  /** term code -> display name ("Fall 2026"). */
  termNames: Record<string, string>;
  /** (term, crn) keys on the viewer's schedule. */
  scheduled: string[];
  /** Terms whose registration is closed. */
  viewOnlyTerms: string[];
  initialFilter: TrackedFilter;
  initialDialog: { crn: string | null; term: string | null; tab: DialogTab };
  /** term code -> "Tracking ends Oct 1" when its watches expire soon (computed on the server). */
  expiryNotices: Record<string, string>;
};

type Status = "open" | "full" | "unknown";

/** A CourseData stand-in built from the stored watch, for items without live data. */
function stubSection(item: WatchDetailsItem): Section {
  const w = item.watch;
  return {
    term: w.term,
    termDesc: null,
    courseReferenceNumber: w.crn,
    partOfTerm: null,
    courseNumber: w.courseNumber,
    subject: w.subject,
    subjectDescription: null,
    sequenceNumber: null,
    campusDescription: null,
    scheduleTypeDescription: null,
    courseTitle: w.courseTitle,
    creditHours: Number.NaN,
    maximumEnrollment: 0,
    enrollment: 0,
    seatsAvailable: 0,
    waitCapacity: 0,
    waitCount: 0,
    waitAvailable: 0,
    creditHourHigh: Number.NaN,
    creditHourLow: Number.NaN,
    linkIdentifier: null,
    isSectionLinked: false,
    subjectCourse: null,
    faculty: w.instructor
      ? [{ bannerId: null, courseReferenceNumber: w.crn, displayName: w.instructor, emailAddress: null, primaryIndicator: true }]
      : [],
    meetingsFaculty: [],
  };
}

const sectionOf = (item: WatchDetailsItem): Section => (item.section as Section | null) ?? stubSection(item);

function statusOf(item: WatchDetailsItem): Status {
  if (!item.section || item.section.maximumEnrollment <= 0) return "unknown";
  return item.section.seatsAvailable > 0 ? "open" : "full";
}

const itemKey = (item: WatchDetailsItem) => sectionKey(item.watch.term, item.watch.crn);


/**
 * Tracked classes (pages.md §5): watched sections grouped by term (newest first), open ones
 * first. Remove stops watching right away (the card leaves with an exit animation) and offers
 * Undo. Items GoSolar couldn't confirm show the stored watch with a notice.
 */
export function TrackedClasses({
  items: initialItems,
  termNames,
  scheduled,
  viewOnlyTerms,
  initialFilter,
  initialDialog,
  expiryNotices,
}: TrackedClassesProps) {
  const router = useRouter();
  const toast = useToast();
  const navEntrance = useNavEntrance();
  const [refreshing, startRefresh] = useTransition();
  const [items, setItems] = useState(initialItems);
  const [sourceItems, setSourceItems] = useState(initialItems);
  const [filter, setFilter] = useState<TrackedFilter>(initialFilter);
  const [removing, setRemoving] = useState<ReadonlySet<string>>(() => new Set());

  // A refresh brings new server data: adopt it (adjusting state during render).
  if (initialItems !== sourceItems) {
    setSourceItems(initialItems);
    setItems(initialItems);
  }

  const { meta, failed: metaFailed, ensure, retry: retryMeta } = useSectionMeta({});
  // Memoized so the actions adopt new server data only when a refresh brings it.
  const initialWatched = useMemo(() => initialItems.map(itemKey), [initialItems]);
  const actions = useSectionActions({ initialWatched, initialScheduled: scheduled, isSignedIn: true });
  const viewOnly = useMemo(() => new Set(viewOnlyTerms), [viewOnlyTerms]);

  const counts = useMemo(() => {
    let open = 0;
    let full = 0;
    for (const item of items) {
      const status = statusOf(item);
      if (status === "open") open += 1;
      else if (status === "full") full += 1;
    }
    return { all: items.length, open, full };
  }, [items]);

  const groups = useMemo(() => {
    const visible = items.filter((item) => filter === "all" || statusOf(item) === filter);
    const byTerm = new Map<string, WatchDetailsItem[]>();
    for (const item of visible) {
      const list = byTerm.get(item.watch.term) ?? [];
      list.push(item);
      byTerm.set(item.watch.term, list);
    }
    const rank: Record<Status, number> = { open: 0, full: 1, unknown: 2 };
    return [...byTerm.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([term, list]) => ({
        term,
        items: [...list].sort(
          (a, b) =>
            rank[statusOf(a)] - rank[statusOf(b)] ||
            compareText(courseCode(a.watch), courseCode(b.watch)) ||
            compareText(a.section?.sequenceNumber ?? "", b.section?.sequenceNumber ?? ""),
        ),
      }));
  }, [items, filter]);

  // Badges for live sections, one batch per never-requested key.
  const liveSections = useMemo(
    () => items.flatMap((item) => (item.section ? [item.section as Section] : [])),
    [items],
  );
  useEffect(() => {
    ensure(liveSections.slice(0, 50));
  }, [liveSections, ensure]);

  useEffect(() => {
    const next = urlWith({ filter: filter === "all" ? null : filter });
    if (next !== `${window.location.pathname}${window.location.search}${window.location.hash}`) {
      window.history.replaceState(null, "", next);
    }
  }, [filter]);

  // CRNs repeat across terms: the dialog URL carries the term too (`?term=&crn=`). Links
  // without a term fall back to the newest term that has the CRN.
  const resolve = useCallback(
    (crn: string, term: string | null) => {
      const matches = items.filter((i) => i.watch.crn === crn && i.section && (!term || i.watch.term === term));
      const item = matches.sort((a, b) => b.watch.term.localeCompare(a.watch.term))[0];
      return item ? itemKey(item) : null;
    },
    [items],
  );
  const dialog = useCourseDialog({
    initialKey: initialDialog.crn ? resolve(initialDialog.crn, initialDialog.term) : null,
    initialTab: initialDialog.tab,
    resolve,
    termParam: true,
  });
  const openItem = dialog.openKey ? items.find((i) => itemKey(i) === dialog.openKey && i.section) : undefined;
  const openSection = openItem ? sectionOf(openItem) : null;

  useEffect(() => {
    if (openSection) ensure([openSection]);
  }, [openSection, ensure]);

  const termName = (term: string) => termNames[term] ?? termLabel(term);

  const remove = async (item: WatchDetailsItem) => {
    const key = itemKey(item);
    if (removing.has(key)) return;
    const label = item.section ? sectionLabel(item.section) : courseCode(item.watch);
    setRemoving((prev) => new Set(prev).add(key));
    try {
      await removeWatch(item.watch.term, item.watch.crn);
    } catch (error) {
      reportActionError(toast, error, "Couldn't stop watching this section");
      setRemoving((prev) => {
        const next = new Set(prev);
        next.delete(key);
        return next;
      });
      return;
    }
    if (dialog.openKey === key) dialog.close();
    const card = document.querySelector<HTMLElement>(`[data-card-key="${CSS.escape(key)}"]`);
    // Focus moves to the next card (or the page's main action) once this one leaves.
    const cards = [...document.querySelectorAll<HTMLElement>("[data-card-key]")];
    const next = cards[cards.indexOf(card as HTMLElement) + 1] ?? cards[cards.indexOf(card as HTMLElement) - 1];
    if (card) await playExit(card, { keep: true });
    const index = items.findIndex((i) => itemKey(i) === key);
    setItems((prev) => prev.filter((i) => itemKey(i) !== key));
    setRemoving((prev) => {
      const nextSet = new Set(prev);
      nextSet.delete(key);
      return nextSet;
    });
    (next?.querySelector<HTMLElement>("a, button") ?? document.getElementById("tracked-search"))?.focus();
    toast.success(`Stopped watching ${label}`, {
      action: {
        label: "Undo",
        onClick: () => {
          void addWatch({
            term: item.watch.term,
            crn: item.watch.crn,
            subject: item.watch.subject,
            courseNumber: item.watch.courseNumber,
            courseTitle: item.watch.courseTitle,
            instructor: item.watch.instructor,
          })
            .then(() => {
              setItems((prev) => {
                if (prev.some((i) => itemKey(i) === key)) return prev;
                const copy = [...prev];
                copy.splice(Math.max(0, Math.min(index, copy.length)), 0, item);
                return copy;
              });
              toast.success(`Watching ${label} again`);
            })
            .catch((error: unknown) => reportActionError(toast, error, "Couldn't watch this section again"));
        },
      },
    });
  };

  const refresh = (
    <Button
      variant="secondary"
      leadingIcon={<RefreshIcon />}
      loading={refreshing}
      onClick={() => startRefresh(() => router.refresh())}
    >
      Refresh
    </Button>
  );

  const header = (
    <PageHeader
      title="Tracked classes"
      description={
        items.length
          ? `${plural(items.length, "section")} · We email you when a seat opens.`
          : "We email you when a seat opens in a section you watch."
      }
      actions={
        <>
          {items.length ? refresh : null}
          <ButtonLink id="tracked-search" href="/course-search" leadingIcon={<SearchIcon />}>
            Search classes
          </ButtonLink>
        </>
      }
    >
      {items.length ? (
        <SegmentedControl<TrackedFilter>
          label="Show"
          value={filter}
          onChange={setFilter}
          options={[
            { value: "all", label: `All ${counts.all}` },
            { value: "open", label: `Open ${counts.open}` },
            { value: "full", label: `Full ${counts.full}` },
          ]}
        />
      ) : null}
    </PageHeader>
  );

  if (items.length === 0) {
    return (
      <>
        {header}
        <EmptyState
          variant="first-use"
          icon={<BellIcon size={24} />}
          title="You're not watching any sections."
          actions={
            <ButtonLink href="/course-search" leadingIcon={<SearchIcon />}>
              Search classes
            </ButtonLink>
          }
        >
          Watch a full section and we&rsquo;ll email you when a seat opens.
        </EmptyState>
      </>
    );
  }

  let index = 0;
  return (
    <>
      {header}
      {groups.length === 0 ? (
        <EmptyState variant="no-results" icon={<BellIcon size={24} />} title={filter === "open" ? "No open sections right now." : "No full sections."}>
          {filter === "open" ? "We'll email you when one opens." : "Every section you watch has seats or couldn't be checked."}
        </EmptyState>
      ) : (
        groups.map((group) => (
          <section key={group.term} className={styles.group} aria-labelledby={`term-${group.term}`}>
            <h2 id={`term-${group.term}`} className={styles.groupTitle}>
              {termName(group.term)}
              <span className={styles.groupCount}>{plural(group.items.length, "section")}</span>
            </h2>
            <ul className={gridStyles.grid}>
              {group.items.map((item) => {
                const section = sectionOf(item);
                const key = itemKey(item);
                const expiry = expiryNotices[item.watch.term];
                const notice = (
                  <>
                    {item.partial ? (
                      <Banner tone="warning" className={styles.cardBanner}>
                        Couldn&rsquo;t reach GoSolar for this course. Showing what you saved; try Refresh in a minute.
                      </Banner>
                    ) : null}
                    {!item.section && !item.partial ? (
                      <Banner tone="info" className={styles.cardBanner}>
                        This section is no longer listed. It may have been cancelled or renumbered.
                      </Banner>
                    ) : null}
                    {expiry ? (
                      <span className={styles.expiry}>
                        <ClockIcon size={14} />
                        {expiry}
                      </span>
                    ) : null}
                    {item.section && statusOf(item) === "open" ? <Badge tone="success">Seats open now</Badge> : null}
                  </>
                );
                const position = index++;
                return (
                  <li key={key} className={gridStyles.item}>
                    <CourseCard
                      section={section}
                      meta={meta[keyOf(section)]}
                      watched
                      scheduled={actions.isScheduled(section)}
                      schedulePending={actions.isSchedulePending(section)}
                      isSignedIn
                      mode="tracked"
                      limited={!item.section}
                      viewOnly={viewOnly.has(item.watch.term)}
                      termName={termName(item.watch.term)}
                      notice={item.partial || !item.section || expiry || statusOf(item) === "open" ? notice : undefined}
                      onToggleSchedule={item.section ? actions.toggleSchedule : undefined}
                      onOpen={
                        item.section
                          ? (s, card) => dialog.open(key, s.courseReferenceNumber ?? "", card, item.watch.term)
                          : undefined
                      }
                      href={`/tracked-classes?term=${item.watch.term}&crn=${item.watch.crn}`}
                      onRemove={() => void remove(item)}
                      removePending={removing.has(key)}
                      index={position}
                      stagger={navEntrance}
                    />
                  </li>
                );
              })}
            </ul>
          </section>
        ))
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
        termName={openItem ? termName(openItem.watch.term) : undefined}
        actions={
          openSection && openItem ? (
            <>
              {!viewOnly.has(openItem.watch.term) ? (
                <ScheduleToggle
                  scheduled={actions.isScheduled(openSection)}
                  pending={actions.isSchedulePending(openSection)}
                  code={sectionLabel(openSection)}
                  onToggle={() => actions.toggleSchedule(openSection)}
                />
              ) : null}
              <RemoveWatchButton
                code={sectionLabel(openSection)}
                pending={removing.has(itemKey(openItem))}
                onRemove={() => void remove(openItem)}
              />
            </>
          ) : null
        }
      />
    </>
  );
}

/** The watch list couldn't be loaded (database or session lookup failed). Never shows the error. */
export function TrackedUnavailable() {
  return (
    <>
      <PageHeader title="Tracked classes" />
      <EmptyState
        variant="error"
        title="Couldn&rsquo;t load your tracked classes."
        actions={<RetryButton />}
      >
        Your watches are safe. This usually clears up in a moment.
      </EmptyState>
    </>
  );
}
