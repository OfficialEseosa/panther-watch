"use client";

import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { Tabs } from "@/components/ui/Tabs";
import { BookmarkIcon, SearchIcon } from "@/components/ui/icons";
import type { CourseData } from "@/lib/gosolar/types";
import { searchSections, type WatchDetailsItem } from "@/lib/client/courses";
import { errorMessage, isAbortError } from "@/lib/client/http";
import { AddClassRow, AddClassRowsSkeleton, addClassListClass } from "./AddClassRow";
import { SubjectCombobox } from "./SubjectCombobox";
import styles from "./AddClassesDialog.module.css";

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
  /** Tracked sections in this term (from the DB, before live details load). */
  trackedCount: number;
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

type SearchState =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "ok"; sections: CourseData[]; query: string }
  | { status: "error"; message: string };

const bySection = (a: CourseData, b: CourseData) =>
  (a.courseNumber ?? "").localeCompare(b.courseNumber ?? "", undefined, { numeric: true }) ||
  (a.sequenceNumber ?? "").localeCompare(b.sequenceNumber ?? "", undefined, { numeric: true });

/** Add classes (pages.md §6): Search and Tracked tabs sharing one AddClassRow. `md`, sheet on mobile. */
export function AddClassesDialog(props: AddClassesDialogProps) {
  const { open, onClose, termLabel, tab, onTabChange, trackedCount } = props;
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={`Add classes to ${termLabel}`}
      size="md"
      fixedHeight
      footer={
        <Button variant="primary" onClick={onClose}>
          Done
        </Button>
      }
    >
      <Tabs
        label="Add classes from"
        value={tab}
        onValueChange={(id) => onTabChange(id === "tracked" ? "tracked" : "search")}
        panelClassName={styles.panel}
        tabs={[
          { id: "search", label: "Search", icon: <SearchIcon size={16} />, panel: <SearchPanel {...props} /> },
          {
            id: "tracked",
            label: `Tracked classes (${trackedCount})`,
            icon: <BookmarkIcon size={16} />,
            panel: <TrackedPanel {...props} />,
          },
        ]}
      />
    </Dialog>
  );
}

function SearchPanel({ term, scheduledCrns, busyCrns, conflictsFor, onAdd, onRemove }: AddClassesDialogProps) {
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
    const id = ++requestId.current;
    setState({ status: "loading" });
    searchSections({ term, subject: code, courseNumber: number || undefined }, ctrl.signal)
      .then((sections) => {
        if (id !== requestId.current) return;
        setState({ status: "ok", sections: [...sections].sort(bySection), query: number ? `${code} ${number}` : code });
      })
      .catch((err: unknown) => {
        if (isAbortError(err) || id !== requestId.current) return;
        setState({
          status: "error",
          message: errorMessage(err, "Couldn't search GoSolar. Try again."),
        });
      });
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    run();
  };

  return (
    <div className={styles.stack}>
      <form className={styles.form} onSubmit={onSubmit} noValidate>
        <Field label="Subject" error={error ?? undefined} className={styles.subject}>
          <SubjectCombobox
            term={term}
            value={subject}
            onChange={setSubject}
            onSubmit={(code) => run(code)}
            invalid={Boolean(error)}
            data-autofocus
          />
        </Field>
        <Field label="Course number" hint="Optional" className={styles.number}>
          <Input
            value={courseNumber}
            onChange={(event) => setCourseNumber(event.target.value)}
            inputMode="text"
            autoComplete="off"
            maxLength={8}
            placeholder="2720"
          />
        </Field>
        <Button type="submit" variant="secondary" leadingIcon={<SearchIcon />} loading={state.status === "loading"} className={styles.submit}>
          Search
        </Button>
      </form>

      <div className={styles.results}>
        {state.status === "loading" ? <AddClassRowsSkeleton label="Searching sections" /> : null}
        {state.status === "error" ? (
          <Banner
            tone="danger"
            role="alert"
            action={
              <Button size="sm" variant="secondary" onClick={() => run()}>
                Try again
              </Button>
            }
          >
            {state.message}
          </Banner>
        ) : null}
        {state.status === "ok" ? (
          state.sections.length === 0 ? (
            <div role="status">
              <EmptyState variant="no-results" icon={<SearchIcon size={24} />} title="No sections match" headingAs="h3">
                Nothing for {state.query} this term. Check the course number, or search the whole subject.
              </EmptyState>
            </div>
          ) : (
            <>
              <p className={styles.count} role="status">
                {state.sections.length} {state.sections.length === 1 ? "section" : "sections"} for {state.query}
                {state.sections.length > RESULT_LIMIT ? `; showing the first ${RESULT_LIMIT}. Add a course number to narrow it.` : ""}
              </p>
              <ul className={addClassListClass}>
                {state.sections.slice(0, RESULT_LIMIT).map((section) => {
                  const crn = section.courseReferenceNumber ?? "";
                  const added = scheduledCrns.has(crn);
                  return (
                    <AddClassRow
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
              </ul>
            </>
          )
        ) : null}
        {state.status === "idle" ? (
          <p className={styles.hint}>Pick a subject, optionally a course number, then search. Live seat counts come from GoSolar.</p>
        ) : null}
      </div>
    </div>
  );
}

function TrackedPanel({
  term,
  termLabel,
  tracked,
  onRetryTracked,
  scheduledCrns,
  busyCrns,
  conflictsFor,
  onAdd,
  onRemove,
}: AddClassesDialogProps) {
  if (tracked.status === "idle" || tracked.status === "loading") {
    return <AddClassRowsSkeleton label="Loading tracked classes" />;
  }
  if (tracked.status === "error") {
    return (
      <Banner
        tone="danger"
        role="alert"
        action={
          <Button size="sm" variant="secondary" onClick={onRetryTracked}>
            Try again
          </Button>
        }
      >
        {tracked.message}
      </Banner>
    );
  }
  const items = tracked.items.filter((item) => item.watch.term === term);
  if (items.length === 0) {
    return (
      <EmptyState icon={<BookmarkIcon size={24} />} title={`None of your tracked sections are in ${termLabel}.`} headingAs="h3">
        Watch a section from search to see it here.
      </EmptyState>
    );
  }
  return (
    <ul className={addClassListClass}>
      {items.map(({ watch, section, partial }) => {
        const added = scheduledCrns.has(watch.crn);
        const gone = !section && !partial;
        return (
          <AddClassRow
            key={watch.crn}
            section={section}
            fallback={{
              subject: watch.subject,
              courseNumber: watch.courseNumber,
              crn: watch.crn,
              title: watch.courseTitle,
              instructor: watch.instructor,
            }}
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
    </ul>
  );
}
