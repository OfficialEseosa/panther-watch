"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { RemoveWatchButton, ScheduleToggle } from "@/components/courses/CourseActions";
import { CourseCard } from "@/components/courses/CourseCard";
import { sectionLabel, type Section } from "@/components/courses/format";
import type { DialogTab } from "@/components/courses/params";
import { RetryButton } from "@/components/courses/RetryButton";
import { SectionDialog } from "@/components/courses/SectionDialog";
import { CardNotice, ErrorMessage } from "@/components/courses/SectionParts";
import { useCourseDialog } from "@/components/courses/useCourseDialog";
import { reportActionError, useSectionActions, watchAddedBody } from "@/components/courses/useSectionActions";
import { useSectionMeta } from "@/components/courses/useSectionMeta";
import { useToast } from "@/components/ui/Toast";
import { addWatch, removeWatch, type WatchDetailsItem } from "@/lib/client/courses";
import { playExit } from "@/lib/ui/motion";
import { cn } from "@/lib/ui/cn";
import buttons from "@/components/courses/buttons.module.css";
import gridStyles from "@/components/courses/CourseResults.module.css";
import styles from "./TrackedClasses.module.css";
import { compareText, courseCode, keyOf, sectionKey, termLabel } from "@/lib/format";

export type TrackedClassesProps = {
  items: WatchDetailsItem[];
  /** term code -> display name ("Fall 2026"). */
  termNames: Record<string, string>;
  /** (term, crn) keys on the viewer's schedule. */
  scheduled: string[];
  /** Terms whose registration is closed. */
  viewOnlyTerms: string[];
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
 * The original tracked classes page: the header card (count pill, "Find more classes"), then
 * the same course cards in tracked mode (Remove instead of Watch, the term in the info grid).
 * Remove stops watching right away (the card leaves with a short exit) and offers Undo. Items
 * GoSolar couldn't confirm show the stored watch with a notice.
 */
export function TrackedClasses({
  items: initialItems,
  termNames,
  scheduled,
  viewOnlyTerms,
  initialDialog,
  expiryNotices,
}: TrackedClassesProps) {
  const toast = useToast();
  const [items, setItems] = useState(initialItems);
  const [sourceItems, setSourceItems] = useState(initialItems);
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

  // Newest term first; within a term, open sections first, then by course.
  const sorted = useMemo(() => {
    const rank: Record<Status, number> = { open: 0, full: 1, unknown: 2 };
    return [...items].sort(
      (a, b) =>
        b.watch.term.localeCompare(a.watch.term) ||
        rank[statusOf(a)] - rank[statusOf(b)] ||
        compareText(courseCode(a.watch), courseCode(b.watch)) ||
        compareText(a.section?.sequenceNumber ?? "", b.section?.sequenceNumber ?? ""),
    );
  }, [items]);

  // Grades and ratings for live sections, one batch per never-requested key.
  const liveSections = useMemo(() => items.flatMap((item) => (item.section ? [item.section as Section] : [])), [items]);
  useEffect(() => {
    ensure(liveSections.slice(0, 50));
  }, [liveSections, ensure]);

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
            .then(({ openNow }) => {
              setItems((prev) => {
                if (prev.some((i) => itemKey(i) === key)) return prev;
                const copy = [...prev];
                copy.splice(Math.max(0, Math.min(index, copy.length)), 0, item);
                return copy;
              });
              toast.success(`Watching ${label} again`, openNow ? { body: watchAddedBody(true) } : undefined);
            })
            .catch((error: unknown) => reportActionError(toast, error, "Couldn't watch this section again"));
        },
      },
    });
  };

  return (
    <div className={styles.page}>
      <TrackedHeader count={items.length} />

      {sorted.length ? (
        <ul className={gridStyles.grid} aria-label="Tracked sections">
          {sorted.map((item) => {
            const section = sectionOf(item);
            const key = itemKey(item);
            const notice = item.unlisted ? (
              <CardNotice tone="info">This section is no longer listed by GoSolar. Remove it to stop tracking.</CardNotice>
            ) : item.partial ? (
              <CardNotice>Couldn&rsquo;t reach GoSolar for this course. Showing what you saved; reload in a minute.</CardNotice>
            ) : !item.section ? (
              <CardNotice tone="info">This section is no longer listed. It may have been cancelled or renumbered.</CardNotice>
            ) : null;
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
                  expiry={expiryNotices[item.watch.term]}
                  notice={notice}
                  onToggleSchedule={item.section ? actions.toggleSchedule : undefined}
                  onOpen={
                    item.section ? (s, card) => dialog.open(key, s.courseReferenceNumber ?? "", card, item.watch.term) : undefined
                  }
                  href={`/tracked-classes?term=${item.watch.term}&crn=${item.watch.crn}`}
                  onRemove={() => void remove(item)}
                  removePending={removing.has(key)}
                />
              </li>
            );
          })}
        </ul>
      ) : null}

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
        originRef={dialog.origin}
        actions={
          openSection && openItem ? (
            <>
              <ScheduleToggle
                scheduled={actions.isScheduled(openSection)}
                pending={actions.isSchedulePending(openSection)}
                code={sectionLabel(openSection)}
                disabled={viewOnly.has(openItem.watch.term)}
                onToggle={() => actions.toggleSchedule(openSection)}
              />
              <RemoveWatchButton
                code={sectionLabel(openSection)}
                pending={removing.has(itemKey(openItem))}
                onRemove={() => void remove(openItem)}
              />
            </>
          ) : null
        }
      />
    </div>
  );
}

/**
 * The original header card: "Your Tracked Classes", the count pill and description (or the
 * empty-state line), and the solid "Find more classes" / "Start searching" button.
 */
export function TrackedHeader({ count, loading = false }: { count: number; loading?: boolean }) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>Your Tracked Classes</h1>
      {loading ? (
        <p className={styles.description}>Loading your tracked classes…</p>
      ) : count === 0 ? (
        <p className={styles.description}>
          You have not added any classes yet. Search for courses and add the sections you care about.
        </p>
      ) : (
        <>
          <p className={styles.stats}>
            {/* The spaces keep "Tracking 1 class" apart when read as text (no effect in the flex row). */}
            <span className={styles.statsLabel}>Tracking</span>{" "}
            <span className={styles.statsCount}>{count}</span>{" "}
            <span className={styles.statsLabel}>{count === 1 ? "class" : "classes"}</span>
          </p>
          <p className={styles.description}>
            Stay up to date with enrollment changes and move quickly when seats become available.
          </p>
        </>
      )}
      <div>
        <Link id="tracked-search" href="/course-search" className={cn(buttons.primary, buttons.large, styles.searchMore)}>
          {count > 0 || loading ? "Find more classes" : "Start searching"}
        </Link>
      </div>
    </header>
  );
}

/** The watch list couldn't be loaded (database or session lookup failed). Never shows the error. */
export function TrackedUnavailable() {
  return (
    <div className={styles.page}>
      <TrackedHeader count={0} loading />
      <ErrorMessage action={<RetryButton variant="secondary" />}>
        Failed to load tracked classes. Your watches are safe; please try again.
      </ErrorMessage>
    </div>
  );
}
