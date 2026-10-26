"use client";

import { useRouter } from "next/navigation";
import { useEffect, useId, useRef, useState } from "react";
import type { FormEvent, KeyboardEvent } from "react";
import { Dialog } from "@/components/ui/Dialog";
import type { CourseData } from "@/lib/gosolar/types";
import { searchSections, type WatchDetailsItem } from "@/lib/client/courses";
import { errorMessage, isAbortError } from "@/lib/client/http";
import { DAY_LABELS } from "@/lib/schedule/conflicts";
import { meetingLocation } from "./layout";
import { timeLabel, weekOrderedMeetings } from "./format";
import { SubjectCombobox } from "./SubjectCombobox";
import styles from "./AddClassesDialog.module.css";
import { courseCode } from "@/lib/format";
import { displayTitle } from "@/components/courses/format";

export type AddTab = "search" | "tracked";

export type AddRequest = {
  crn: string;
  subject: string;
  courseNumber: string;
  courseTitle: string | null;
  /** Live section when known (seeds the calendar so it doesn't refetch). */
  section: CourseData | null;
};

export type TrackedState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; items: WatchDetailsItem[] }
  | { status: "error"; message: string };

export type AddClassesDialogProps = {
  open: boolean;
  onClose: () => void;
  term: string;
  termLabel: string;
  tab: AddTab;
  onTabChange: (tab: AddTab) => void;
  tracked: TrackedState;
  onRetryTracked: () => void;
  scheduledCrns: ReadonlySet<string>;
  busyCrns: ReadonlySet<string>;
  /** Codes of scheduled courses a candidate overlaps. */
  conflictsFor: (section: CourseData) => string[];
  onAdd: (request: AddRequest) => void;
  onRemove: (crn: string) => void;
};

const RESULT_LIMIT = 150;
const NUMBER = /^[A-Za-z0-9]{1,8}$/;
const TABS: Array<{ id: AddTab; label: string }> = [
  { id: "tracked", label: "From tracked classes" },
  { id: "search", label: "Search catalog" },
];

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; sections: CourseData[]; query: string }
  | { status: "error"; message: string };

const bySection = (a: CourseData, b: CourseData) =>
  (a.courseNumber ?? "").localeCompare(b.courseNumber ?? "", undefined, { numeric: true }) ||
  (a.sequenceNumber ?? "").localeCompare(b.sequenceNumber ?? "", undefined, { numeric: true });

/** The original Add Classes modal (old AddClassesModal.jsx): tracked / search tabs over one list. */
export function AddClassesDialog(props: AddClassesDialogProps) {
  const { open, onClose, tab, onTabChange } = props;
  const id = useId();

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const next = tab === "tracked" ? "search" : "tracked";
    onTabChange(next);
    document.getElementById(`${id}-tab-${next}`)?.focus();
  };

  return (
    <Dialog open={open} onClose={onClose} title="Add Classes" size="md" fixedHeight className={styles.modal} bodyClassName={styles.modalBody}>
      <div className={styles.tabs} role="tablist" aria-label="Add classes from">
        {TABS.map((item) => (
          <button
            key={item.id}
            id={`${id}-tab-${item.id}`}
            type="button"
            role="tab"
            aria-selected={tab === item.id}
            aria-controls={`${id}-panel`}
            tabIndex={tab === item.id ? 0 : -1}
            className={styles.tab}
            onClick={() => onTabChange(item.id)}
            onKeyDown={onTabKey}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-tab-${tab}`} className={styles.panel}>
        {tab === "tracked" ? <TrackedPanel {...props} /> : <SearchPanel {...props} />}
      </div>
    </Dialog>
  );
}

type RowProps = {
  section: CourseData | null;
  /** Shown when `section` is null (GoSolar failed or no longer lists the CRN). */
  fallback?: { subject: string; courseNumber: string; crn: string; title: string | null };
  note?: string;
  added: boolean;
  busy: boolean;
  disabled?: boolean;
  conflictsWith: string[];
  onToggle: () => void;
};

/** One `.add-list-item`: code + CRN, title, meeting rows, and the Add / Added toggle. */
function AddRow({ section, fallback, note, added, busy, disabled, conflictsWith, onToggle }: RowProps) {
  const code = section ? courseCode(section.subject, section.courseNumber) : fallback ? courseCode(fallback.subject, fallback.courseNumber) : "";
  const seq = section?.sequenceNumber ?? null;
  const name = seq ? `${code} · ${seq}` : code;
  const crn = section?.courseReferenceNumber ?? fallback?.crn ?? "";
  const title = displayTitle(section?.courseTitle ?? fallback?.title);
  const meetings = section ? weekOrderedMeetings(section) : [];

  return (
    <div className={styles.item} role="listitem">
      <div className={styles.info}>
        <div className={styles.itemTitle}>
          {name} {crn ? <span className={styles.crn}>CRN {crn}</span> : null}
        </div>
        {title ? <div className={styles.subtitle}>{title}</div> : null}
        {!section ? (
          <div className={styles.meeting}>{note ?? "Meeting times unavailable"}</div>
        ) : meetings.length === 0 ? (
          <div className={styles.meeting}>Online / TBA</div>
        ) : (
          meetings.map((meeting, index) => (
            <div key={index} className={styles.meeting}>
              <span>{meeting.days.map((day) => DAY_LABELS[day].short).join(", ")}</span>
              <span>{timeLabel(meeting.start, meeting.end)}</span>
              <span>{meetingLocation(meeting.meetingTime.buildingDescription, meeting.meetingTime.room) ?? "Room TBA"}</span>
            </div>
          ))
        )}
        {conflictsWith.length > 0 && !added ? <div className={styles.conflict}>overlaps {conflictsWith.join(", ")}</div> : null}
      </div>
      <button
        type="button"
        className={styles.actionBtn}
        aria-pressed={added}
        data-busy={busy || undefined}
        disabled={busy || (disabled && !added)}
        onClick={onToggle}
      >
        {busy ? (added ? "Removing…" : "Adding…") : added ? "Added" : "Add"}
        <span className="sr-only"> {name}</span>
      </button>
    </div>
  );
}

function SearchPanel({ term, scheduledCrns, busyCrns, conflictsFor, onAdd, onRemove }: AddClassesDialogProps) {
  const id = useId();
  const [subject, setSubject] = useState("");
  const [courseNumber, setCourseNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [state, setState] = useState<SearchState>({ status: "idle" });
  const controller = useRef<AbortController | null>(null);
  const requestId = useRef(0);

  useEffect(() => () => controller.current?.abort(), []);

  const run = (subjectCode = subject) => {
    const code = subjectCode.trim().toUpperCase();
    const number = courseNumber.trim().toUpperCase();
    if (!/^[A-Z]{2,8}$/.test(code)) {
      setError("Choose a subject, e.g. CSC.");
      return;
    }
    if (number && !NUMBER.test(number)) {
      setError("Course numbers are letters and digits, e.g. 2720.");
      return;
    }
    setError(null);
    controller.current?.abort();
    const ctrl = new AbortController();
    controller.current = ctrl;
    const reqId = ++requestId.current;
    setState({ status: "loading" });
    searchSections({ term, subject: code, courseNumber: number || undefined }, ctrl.signal)
      .then((sections) => {
        if (reqId !== requestId.current) return;
        setState({ status: "ok", sections: [...sections].sort(bySection), query: number ? `${code} ${number}` : code });
      })
      .catch((err: unknown) => {
        if (isAbortError(err) || reqId !== requestId.current) return;
        setState({ status: "error", message: errorMessage(err, "Couldn't search GoSolar. Try again.") });
      });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    run();
  };

  return (
    <>
      <form className={styles.searchForm} onSubmit={onSubmit} noValidate>
        <div className={styles.formGrid}>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor={`${id}-subject`}>
              Subject
            </label>
            <SubjectCombobox
              id={`${id}-subject`}
              className={styles.control}
              term={term}
              value={subject}
              onChange={setSubject}
              onSubmit={(code) => run(code)}
              invalid={Boolean(error)}
              aria-describedby={error ? `${id}-error` : undefined}
              data-autofocus
            />
          </div>
          <div className={styles.formField}>
            <label className={styles.formLabel} htmlFor={`${id}-number`}>
              Course number
            </label>
            <input
              id={`${id}-number`}
              className={styles.control}
              value={courseNumber}
              onChange={(event) => setCourseNumber(event.target.value)}
              autoComplete="off"
              maxLength={8}
              placeholder="e.g. 1301 (optional)"
            />
          </div>
        </div>
        {error ? (
          <p id={`${id}-error`} className={styles.fieldError} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.actionsRow}>
          <button type="submit" className={`${styles.actionBtn} ${styles.primary}`} disabled={state.status === "loading"}>
            {state.status === "loading" ? "Searching…" : "Search classes"}
          </button>
        </div>
      </form>

      {state.status === "loading" ? (
        <div className={styles.loading} role="status">
          Searching for courses…
        </div>
      ) : null}
      {state.status === "error" ? (
        <div className={styles.error} role="alert">
          <p>{state.message}</p>
          <button type="button" className={styles.link} onClick={() => run()}>
            Try again
          </button>
        </div>
      ) : null}
      {state.status === "idle" ? (
        <div className={styles.empty}>
          <p>Run a search to find classes and add them to your schedule.</p>
        </div>
      ) : null}
      {state.status === "ok" ? (
        state.sections.length === 0 ? (
          <div className={styles.empty} role="status">
            <p>No sections match {state.query} this term. Check the course number, or search the whole subject.</p>
          </div>
        ) : (
          <>
            <p className={styles.count} role="status">
              {state.sections.length} {state.sections.length === 1 ? "section" : "sections"} for {state.query}
              {state.sections.length > RESULT_LIMIT ? `; showing the first ${RESULT_LIMIT}. Add a course number to narrow it.` : ""}
            </p>
            <div className={styles.list} role="list">
              {state.sections.slice(0, RESULT_LIMIT).map((section) => {
                const crn = section.courseReferenceNumber ?? "";
                const added = scheduledCrns.has(crn);
                return (
                  <AddRow
                    key={crn || `${section.courseNumber}-${section.sequenceNumber}`}
                    section={section}
                    added={added}
                    busy={busyCrns.has(crn)}
                    disabled={!crn || !section.subject || !section.courseNumber}
                    conflictsWith={conflictsFor(section)}
                    onToggle={() =>
                      added
                        ? onRemove(crn)
                        : onAdd({
                            crn,
                            subject: section.subject ?? "",
                            courseNumber: section.courseNumber ?? "",
                            courseTitle: section.courseTitle,
                            section,
                          })
                    }
                  />
                );
              })}
            </div>
          </>
        )
      ) : null}
    </>
  );
}

function TrackedPanel({
  term,
  termLabel,
  tracked,
  onRetryTracked,
  onClose,
  scheduledCrns,
  busyCrns,
  conflictsFor,
  onAdd,
  onRemove,
}: AddClassesDialogProps) {
  const router = useRouter();
  if (tracked.status === "idle" || tracked.status === "loading") {
    return (
      <div className={styles.loading} role="status">
        Loading tracked classes…
      </div>
    );
  }
  if (tracked.status === "error") {
    return (
      <div className={styles.error} role="alert">
        <p>{tracked.message}</p>
        <button type="button" className={styles.link} onClick={onRetryTracked}>
          Try again
        </button>
      </div>
    );
  }
  const items = tracked.items.filter((item) => item.watch.term === term);
  if (items.length === 0) {
    return (
      <div className={styles.empty}>
        <p>No tracked classes for {termLabel || "this term"}.</p>
        <button
          type="button"
          className={styles.link}
          onClick={() => {
            onClose();
            router.push("/tracked-classes");
          }}
        >
          Manage tracked classes
        </button>
      </div>
    );
  }
  return (
    <div className={styles.list} role="list">
      {items.map(({ watch, section, partial }) => {
        const added = scheduledCrns.has(watch.crn);
        const gone = !section && !partial;
        return (
          <AddRow
            key={watch.crn}
            section={section}
            fallback={{ subject: watch.subject, courseNumber: watch.courseNumber, crn: watch.crn, title: watch.courseTitle }}
            note={gone ? "No longer listed in GoSolar" : "Live details unavailable right now"}
            added={added}
            busy={busyCrns.has(watch.crn)}
            disabled={gone}
            conflictsWith={section ? conflictsFor(section) : []}
            onToggle={() =>
              added
                ? onRemove(watch.crn)
                : onAdd({
                    crn: watch.crn,
                    subject: watch.subject,
                    courseNumber: watch.courseNumber,
                    courseTitle: section?.courseTitle ?? watch.courseTitle,
                    section,
                  })
            }
          />
        );
      })}
    </div>
  );
}
