"use client";

import Image from "next/image";
import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent as ReactPointerEvent, ReactNode, RefObject } from "react";
import { GRADE_KEYS, type GradeAggregate, type GradeDistributionResponse } from "@/lib/course-meta/grades/types";
import type { ProfessorRating } from "@/lib/course-meta/rmp";
import type { SectionMeta } from "@/lib/courses/meta";
import { cn } from "@/lib/ui/cn";
import { playExit } from "@/lib/ui/motion";
import { instructorOf, instructorsOf, plural } from "@/lib/format";
import { courseHeading, creditsValue } from "./CourseCard";
import {
  foldText,
  formatGpa,
  formatPercent,
  gpaTone,
  rmpProfileUrl,
  semesterSpan,
  titleOf,
  usableRating,
  type Section,
} from "./format";
import { GradeBar } from "./GradeBar";
import { OldIcon, type OldIconName } from "./icons";
import { EnrollmentStatus, MeetingTimes } from "./SectionParts";
import type { DialogTab } from "./useCourseDialog";
import styles from "./SectionDialog.module.css";

export type SectionDialogProps = {
  /** The open section, or null when closed (the last one stays rendered during the exit). */
  section: Section | null;
  /** Meta for the section, read live from the page's shared map. */
  meta: SectionMeta | undefined;
  onClose: () => void;
  tab: DialogTab;
  onTabChange: (tab: DialogTab) => void;
  /** Header controls (the same calendar / Watch buttons as the card). */
  actions?: ReactNode;
  /** Term name for the tag row. */
  termName?: string;
  /** Shown above the sections (e.g. "Couldn't reach GoSolar"). */
  notice?: ReactNode;
  /** The meta lookup for this section failed: the sections show an error with Retry. */
  metaFailed?: boolean;
  onRetryMeta?: () => void;
  /** Instructors teaching this course in the current results ("By professor" scope). */
  currentInstructors?: readonly string[];
};

type Frozen = Pick<
  SectionDialogProps,
  "actions" | "termName" | "notice" | "meta" | "metaFailed" | "onRetryMeta" | "currentInstructors"
>;

type MetaState = { meta: SectionMeta | undefined; failed: boolean; onRetry?: () => void };

const SECTIONS: Array<{ id: DialogTab; label: string; icon: OldIconName }> = [
  { id: "overview", label: "Overview", icon: "dashboard" },
  { id: "grades", label: "Grade history", icon: "analytics" },
  { id: "ratings", label: "Professor ratings", icon: "people" },
  { id: "syllabus", label: "Syllabus", icon: "bookmark" },
];

/**
 * The original expanded course card (old ExpandedCourseCard) as a native modal <dialog>: muted
 * header with the red close button, title, tags and the calendar / Watch buttons; a left
 * section sidebar (a top strip on phones) and the scrolling pane. URL-addressable through
 * useCourseDialog; reads meta from props on every render, so late data shows up immediately.
 */
export function SectionDialog({
  section,
  meta,
  onClose,
  tab,
  onTabChange,
  actions,
  termName,
  notice,
  metaFailed = false,
  onRetryMeta,
  currentInstructors,
}: SectionDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const onCloseRef = useRef(onClose);
  const pressStartedOutside = useRef(false);
  const titleId = useId();
  // Keep the last section while the dialog plays its exit (adjusting state during render).
  const [shown, setShown] = useState<Section | null>(section);
  if (section && section !== shown) setShown(section);
  const current = section ?? shown;
  const open = section !== null;
  // Likewise the header buttons and the rest: the parent stops passing them once the section
  // closes, and dropping them mid-exit made the panel jump in height.
  const live: Frozen = { actions, termName, notice, meta, metaFailed, onRetryMeta, currentInstructors };
  const [frozen, setFrozen] = useState<Frozen>(live);
  if (open && (Object.keys(live) as Array<keyof Frozen>).some((k) => live[k] !== frozen[k])) setFrozen(live);
  const view = open ? live : frozen;

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open) {
      delete el.dataset.closing;
      if (!el.open) {
        el.showModal();
        headingRef.current?.focus();
      }
      return;
    }
    if (!el.open) return;
    let cancelled = false;
    void playExit(el, { keep: true }).then(() => {
      if (cancelled) return;
      el.close();
      delete el.dataset.closing;
    });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const isOutside = (event: ReactPointerEvent<HTMLDialogElement>) => {
    const el = ref.current;
    if (!el || event.target !== el) return false;
    const r = el.getBoundingClientRect();
    return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
  };

  return (
    <dialog
      ref={ref}
      className={styles.modal}
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onCloseRef.current();
      }}
      onClose={(event) => {
        if (event.target !== event.currentTarget) return;
        if (open) onCloseRef.current();
      }}
      onPointerDown={(event) => {
        pressStartedOutside.current = isOutside(event);
      }}
      onPointerUp={(event) => {
        if (pressStartedOutside.current && isOutside(event)) onCloseRef.current();
        pressStartedOutside.current = false;
      }}
    >
      {current ? (
        <DialogContent
          section={current}
          titleId={titleId}
          headingRef={headingRef}
          onClose={() => onCloseRef.current()}
          actions={view.actions}
          termName={view.termName}
          notice={view.notice}
          tab={tab}
          onTabChange={onTabChange}
          meta={{ meta: view.meta, failed: Boolean(view.metaFailed) && view.meta === undefined, onRetry: view.onRetryMeta }}
          currentInstructors={view.currentInstructors}
        />
      ) : null}
    </dialog>
  );
}

function DialogContent({
  section,
  titleId,
  headingRef,
  onClose,
  actions,
  termName,
  notice,
  tab,
  onTabChange,
  meta,
  currentInstructors,
}: {
  section: Section;
  titleId: string;
  headingRef: RefObject<HTMLHeadingElement | null>;
  onClose: () => void;
  actions?: ReactNode;
  termName?: string;
  notice?: ReactNode;
  tab: DialogTab;
  onTabChange: (tab: DialogTab) => void;
  meta: MetaState;
  currentInstructors?: readonly string[];
}) {
  const baseId = useId();
  const tabRefs = useRef(new Map<DialogTab, HTMLButtonElement>());
  const sidebarRef = useRef<HTMLDivElement>(null);

  // The active-section highlight slides between items (the original animated it too).
  useLayoutEffect(() => {
    const list = sidebarRef.current;
    const el = tabRefs.current.get(tab);
    if (!list || !el) return;
    const measure = () => {
      list.style.setProperty("--_x", `${el.offsetLeft}px`);
      list.style.setProperty("--_y", `${el.offsetTop}px`);
      list.style.setProperty("--_w", `${el.offsetWidth}px`);
      list.style.setProperty("--_h", `${el.offsetHeight}px`);
    };
    measure();
    const frame = requestAnimationFrame(() => {
      list.dataset.ready = "";
    });
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [tab]);
  const credits = creditsValue(section);
  const crn = section.courseReferenceNumber;

  const onTabKey = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = SECTIONS.length - 1;
    let next: number | null = null;
    if (event.key === "ArrowDown" || event.key === "ArrowRight") next = index === last ? 0 : index + 1;
    else if (event.key === "ArrowUp" || event.key === "ArrowLeft") next = index === 0 ? last : index - 1;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = last;
    if (next === null) return;
    event.preventDefault();
    const id = SECTIONS[next].id;
    onTabChange(id);
    tabRefs.current.get(id)?.focus();
  };

  return (
    <div className={styles.content}>
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <button type="button" className={styles.close} onClick={onClose} aria-label="Close">
            <OldIcon name="x" size={16} />
          </button>
          <div className={styles.heading}>
            <h2
              id={titleId}
              ref={headingRef}
              tabIndex={-1}
              className={styles.title}
              aria-label={section.sequenceNumber ? `${courseHeading(section)}, section ${section.sequenceNumber}` : undefined}
            >
              {courseHeading(section)}
            </h2>
            <p className={styles.subtitle}>{titleOf(section)}</p>
            <div className={styles.tags}>
              {crn ? <span className={cn(styles.tag, styles.tagCrn)}>CRN {crn}</span> : null}
              {section.sequenceNumber ? <span className={styles.tag}>Section {section.sequenceNumber}</span> : null}
              {credits ? <span className={styles.tag}>{credits} credits</span> : null}
              {termName ? <span className={styles.tag}>{termName}</span> : null}
            </div>
          </div>
        </div>
        {actions ? <div className={styles.headerActions}>{actions}</div> : null}
      </header>

      {notice ? <div className={styles.notice}>{notice}</div> : null}

      <div className={styles.main}>
        <div
          ref={sidebarRef}
          className={styles.sidebar}
          role="tablist"
          aria-label="Course detail sections"
          aria-orientation="vertical"
        >
          <span className={styles.navIndicator} aria-hidden="true" />
          {SECTIONS.map((s, index) => {
            const selected = s.id === tab;
            return (
              <button
                key={s.id}
                ref={(el) => {
                  if (el) tabRefs.current.set(s.id, el);
                  else tabRefs.current.delete(s.id);
                }}
                type="button"
                role="tab"
                id={`${baseId}-tab-${s.id}`}
                aria-selected={selected}
                aria-controls={`${baseId}-panel`}
                tabIndex={selected ? 0 : -1}
                className={styles.navItem}
                onClick={() => onTabChange(s.id)}
                onKeyDown={(event) => onTabKey(event, index)}
              >
                <OldIcon name={s.icon} size={17} />
                <span className={styles.navLabel}>{s.label}</span>
              </button>
            );
          })}
        </div>

        <div className={styles.pane} role="tabpanel" id={`${baseId}-panel`} aria-labelledby={`${baseId}-tab-${tab}`} tabIndex={0}>
          <div key={tab} className={styles.paneInner}>
            {tab === "overview" ? <OverviewSection section={section} /> : null}
            {tab === "grades" ? <GradesSection section={section} state={meta} currentInstructors={currentInstructors} /> : null}
            {tab === "ratings" ? <RatingsSection section={section} state={meta} /> : null}
            {tab === "syllabus" ? <SyllabusSection section={section} state={meta} /> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function EmptyState({ icon, title, text, action }: { icon: OldIconName; title: string; text?: ReactNode; action?: ReactNode }) {
  return (
    <div className={styles.empty}>
      <OldIcon name={icon} size={30} />
      <p className={styles.emptyTitle}>{title}</p>
      {text ? <p className={styles.emptyText}>{text}</p> : null}
      {action}
    </div>
  );
}

/** What a meta-backed section shows before its data: a loading line, or the failure with Retry. */
function MetaPending({ state, icon, loading }: { state: MetaState; icon: OldIconName; loading: string }) {
  if (!state.failed) {
    return (
      <div role="status">
        <EmptyState icon={icon} title={loading} />
      </div>
    );
  }
  return (
    <div role="alert">
      <EmptyState
        icon={icon}
        title="Couldn't load this section's details"
        text="Grades, ratings and the syllabus didn't load. This usually clears in a moment."
        action={
          state.onRetry ? (
            <button type="button" className={styles.retry} onClick={state.onRetry}>
              Retry
            </button>
          ) : undefined
        }
      />
    </div>
  );
}

// ------------------------------------------------------------------ overview

function OverviewSection({ section }: { section: Section }) {
  const faculty = instructorsOf(section);
  return (
    <>
      <EnrollmentStatus section={section} />
      {faculty.length ? (
        <div className={styles.faculty}>
          <div className={styles.facultyTitle}>{faculty.length > 1 ? "Instructors" : "Instructor"}</div>
          {faculty.map((name, i) => (
            <div key={`${name}-${i}`} className={styles.facultyName}>
              {name}
            </div>
          ))}
        </div>
      ) : null}
      <MeetingTimes section={section} />
    </>
  );
}

// ------------------------------------------------------------------ grades

/** "last|first" key, mirroring the grade service's name matching (old gradeUtils.normalizeName). */
function normalizeName(raw: string | null | undefined): string {
  if (!raw) return "";
  const s = raw.toLowerCase().replace(/\([^)]*\)/g, " ").replace(/\./g, "").trim();
  let last: string;
  let first: string;
  if (s.includes(",")) {
    const comma = s.indexOf(",");
    last = s.slice(0, comma).trim();
    first = s.slice(comma + 1).trim().split(/\s+/)[0] ?? "";
  } else {
    const tokens = s.split(/\s+/);
    last = tokens[tokens.length - 1] ?? "";
    first = tokens[0] ?? "";
  }
  last = last.replace(/[^a-z\s-]/g, "").replace(/\s+/g, " ").trim();
  first = first.replace(/[^a-z-]/g, "");
  return `${last}|${first}`;
}

type Tone = "high" | "good" | "mid" | "low" | "unknown";

function dwfTone(pct: number | null | undefined): Tone {
  if (pct == null) return "unknown";
  if (pct >= 30) return "low";
  if (pct >= 20) return "mid";
  if (pct >= 10) return "good";
  return "high";
}

function Metric({ value, label, tone }: { value: ReactNode; label: string; tone?: Tone }) {
  return (
    <div className={styles.metric} data-tone={tone}>
      <span className={styles.metricValue}>{value}</span>
      <span className={styles.metricLabel}>{label}</span>
    </div>
  );
}

function AggregateBlock({ aggregate, heading, subheading }: { aggregate: GradeAggregate; heading: string; subheading?: string }) {
  const counts = aggregate.gradeCounts;
  return (
    <section className={styles.block}>
      <div className={styles.blockHead}>
        <div className={styles.blockHeadings}>
          <h3 className={styles.blockTitle}>{heading}</h3>
          {aggregate.termsTaught.length ? <span className={styles.blockSpan}>{semesterSpan(aggregate.termsTaught)}</span> : null}
        </div>
        {subheading ? <span className={styles.blockSub}>{subheading}</span> : null}
      </div>
      <div className={styles.metrics}>
        <Metric value={formatGpa(aggregate.gpa)} label="Avg GPA" tone={gpaTone(aggregate.gpa) ?? "unknown"} />
        <Metric value={formatPercent(aggregate.dwfPercent)} label="DWF rate" tone={dwfTone(aggregate.dwfPercent)} />
        <Metric value={aggregate.total} label="Students" />
        <Metric value={aggregate.withdrawCount} label="Withdrawals" />
        <Metric value={aggregate.sectionsCount} label="Sections" />
      </div>
      <GradeBar gradeCounts={counts} legend height={12} />
      <div className={styles.fineGrid}>
        {GRADE_KEYS.map((g) => (
          <div key={g} className={styles.fineCell}>
            <span className={styles.fineGrade}>{g}</span>
            <span className={styles.fineCount}>{counts[g] ?? 0}</span>
          </div>
        ))}
      </div>
    </section>
  );
}

const PROF_PAGE_SIZE = 8;

function ProfessorTable({
  grades,
  currentInstructors,
}: {
  grades: GradeDistributionResponse;
  currentInstructors?: readonly string[];
}) {
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const current = grades.instructorDistribution?.professor ?? null;

  // Only professors teaching this course now (when the results know who that is).
  const scoped = useMemo(() => {
    const keys = new Set((currentInstructors ?? []).map(normalizeName).filter(Boolean));
    return keys.size ? grades.professors.filter((p) => keys.has(normalizeName(p.professor))) : grades.professors;
  }, [grades.professors, currentInstructors]);

  const shown = useMemo(() => {
    const q = foldText(query.trim());
    const list = q ? scoped.filter((p) => foldText(p.professor ?? "").includes(q)) : scoped;
    return [...list].sort((a, b) => (b.gpa ?? -1) - (a.gpa ?? -1));
  }, [scoped, query]);

  if (scoped.length <= 1) return null;
  const pageCount = Math.max(1, Math.ceil(shown.length / PROF_PAGE_SIZE));
  const safePage = Math.min(page, pageCount);
  const paged = shown.slice((safePage - 1) * PROF_PAGE_SIZE, safePage * PROF_PAGE_SIZE);

  return (
    <section className={styles.block}>
      <div className={styles.blockHead}>
        <h3 className={styles.blockTitle}>By professor</h3>
        <label className={styles.profSearch}>
          <OldIcon name="search" size={14} />
          <input
            type="search"
            className={styles.profSearchInput}
            placeholder="Search professor"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setPage(1);
            }}
            aria-label="Search professors by name"
          />
        </label>
      </div>
      <table className={styles.profTable}>
        <thead>
          <tr className={cn(styles.profRow, styles.profHead)}>
            <th scope="col" className={styles.profName}>
              Professor
            </th>
            <th scope="col">Avg GPA</th>
            <th scope="col">DWF</th>
            <th scope="col">Semesters</th>
            <th scope="col" className={styles.profBarCol}>
              Distribution
            </th>
          </tr>
        </thead>
        <tbody>
          {shown.length === 0 ? (
            <tr>
              <td colSpan={5} className={styles.profEmpty}>
                No professors match &ldquo;{query}&rdquo;.
              </td>
            </tr>
          ) : (
            paged.map((p, i) => (
              <tr key={`${p.professor ?? "unknown"}-${i}`} className={cn(styles.profRow, p.professor && p.professor === current && styles.isCurrent)}>
                <td className={styles.profName}>{p.professor ?? "Unknown"}</td>
                <td className={styles.profGpa} data-tone={gpaTone(p.gpa) ?? "unknown"}>
                  {formatGpa(p.gpa)}
                </td>
                <td className={styles.toned} data-tone={dwfTone(p.dwfPercent)}>
                  {formatPercent(p.dwfPercent)}
                </td>
                <td>{p.termsTaught.length}</td>
                <td className={styles.profBarCol}>
                  <GradeBar gradeCounts={p.gradeCounts} height={7} />
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      {pageCount > 1 ? (
        <div className={styles.pager}>
          <button
            type="button"
            className={styles.pagerButton}
            onClick={() => setPage(Math.max(1, safePage - 1))}
            disabled={safePage === 1}
            aria-label="Previous professors"
          >
            <OldIcon name="chevronLeft" size={14} />
          </button>
          <span className={styles.pagerInfo}>
            {safePage} / {pageCount}
          </span>
          <button
            type="button"
            className={styles.pagerButton}
            onClick={() => setPage(Math.min(pageCount, safePage + 1))}
            disabled={safePage === pageCount}
            aria-label="More professors"
          >
            <OldIcon name="chevronRight" size={14} />
          </button>
        </div>
      ) : null}
    </section>
  );
}

function GradesSection({
  section,
  state,
  currentInstructors,
}: {
  section: Section;
  state: MetaState;
  currentInstructors?: readonly string[];
}) {
  if (state.meta === undefined) return <MetaPending state={state} icon="analytics" loading="Loading grade history…" />;
  const grades = state.meta.grades;
  if (!grades?.hasData || !grades.overall) {
    return (
      <EmptyState
        icon="analytics"
        title="No grade history yet"
        text="There's no published grade data for this course in the available terms."
      />
    );
  }
  const instructor = instructorOf(section);
  return (
    <>
      {instructor ? (
        grades.instructorHasTaught && grades.instructorDistribution ? (
          <AggregateBlock
            aggregate={grades.instructorDistribution}
            heading={`How ${instructor} grades`}
            subheading="This section's instructor"
          />
        ) : (
          <div className={styles.expNotice}>
            <OldIcon name="time" size={16} />
            <span>
              <strong>{instructor}</strong> hasn&rsquo;t taught this course in the available history. The course-wide
              distribution is shown below.
            </span>
          </div>
        )
      ) : null}
      <AggregateBlock aggregate={grades.overall} heading="All instructors" subheading="Course-wide average" />
      <ProfessorTable grades={grades} currentInstructors={currentInstructors} />
    </>
  );
}

// ------------------------------------------------------------------ ratings

const DIST_ROWS: Array<{ key: "r5" | "r4" | "r3" | "r2" | "r1"; label: string; score: number }> = [
  { key: "r5", label: "Awesome", score: 5 },
  { key: "r4", label: "Great", score: 4 },
  { key: "r3", label: "Good", score: 3 },
  { key: "r2", label: "OK", score: 2 },
  { key: "r1", label: "Awful", score: 1 },
];

function ratingTone(value: number | null | undefined): Tone {
  if (value == null) return "unknown";
  if (value >= 4) return "high";
  if (value >= 3.5) return "mid";
  return "low";
}

const oneDecimal = (v: number | null | undefined) => (v == null ? "—" : v.toFixed(1));

function RatingDetails({ rating }: { rating: ProfessorRating }) {
  const dist = rating.distribution;
  const max = dist ? Math.max(1, dist.r1, dist.r2, dist.r3, dist.r4, dist.r5) : 1;
  const reviews = rating.numRatings ?? 0;
  const url = rmpProfileUrl(rating);
  const takeAgain =
    rating.wouldTakeAgainPercent != null && rating.wouldTakeAgainPercent >= 0 ? formatPercent(rating.wouldTakeAgainPercent) : "—";
  return (
    <div className={styles.rmp}>
      <div className={styles.rmpHead}>
        <div className={styles.rmpScore}>
          <div className={styles.rmpScoreNum} data-tone={ratingTone(rating.avgRating)}>
            {oneDecimal(rating.avgRating)}
            <span className={styles.rmpScoreMax}>/5</span>
          </div>
          <div className={styles.rmpScoreMeta}>
            <span className={styles.rmpScoreLabel}>Overall quality</span>
            <span className={styles.rmpScoreSub}>Based on {plural(reviews, "rating")}</span>
          </div>
        </div>
        <div className={styles.rmpSecondary}>
          <div className={styles.rmpStat}>
            <span className={styles.rmpStatNum}>{takeAgain}</span>
            <span className={styles.rmpStatLabel}>Would take again</span>
          </div>
          <div className={styles.rmpDivider} />
          <div className={styles.rmpStat}>
            <span className={styles.rmpStatNum}>{oneDecimal(rating.avgDifficulty)}</span>
            <span className={styles.rmpStatLabel}>Level of difficulty</span>
          </div>
        </div>
      </div>

      {dist ? (
        <section className={styles.rmpPanel}>
          <h4 className={styles.rmpPanelTitle}>Rating distribution</h4>
          <ul className={styles.rmpDist}>
            {DIST_ROWS.map((row) => {
              const count = dist[row.key] ?? 0;
              return (
                <li key={row.key} className={styles.rmpDistRow}>
                  <span className={styles.rmpDistLabel}>
                    {row.label} <strong>{row.score}</strong>
                  </span>
                  <span className={styles.rmpDistTrack} aria-hidden="true">
                    <span className={styles.rmpDistFill} style={{ width: `${(count / max) * 100}%` }} />
                  </span>
                  <span className={styles.rmpDistCount}>{count}</span>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {rating.topTags.length ? (
        <ul className={styles.rmpTags} aria-label="Top tags">
          {rating.topTags.map((tag) => (
            <li key={tag.name} className={styles.rmpTag}>
              {tag.name}
            </li>
          ))}
        </ul>
      ) : null}

      {url ? (
        <a className={styles.rmpButton} href={url} target="_blank" rel="noopener noreferrer">
          <Image src="/brand/rmp.svg" alt="Rate My Professors" width={35} height={20} className={styles.rmpButtonLogo} unoptimized />
          <span className={styles.rmpCta}>
            See all {reviews} review{reviews === 1 ? "" : "s"}
          </span>
          <OldIcon name="external" size={15} />
        </a>
      ) : null}
    </div>
  );
}

function RatingsSection({ section, state }: { section: Section; state: MetaState }) {
  const instructor = instructorOf(section);
  if (!instructor) {
    return <EmptyState icon="people" title="No ratings found" text="No instructor is listed for this section yet." />;
  }
  if (state.meta === undefined) return <MetaPending state={state} icon="people" loading="Looking up ratings…" />;
  const rating = usableRating(state.meta);
  if (!rating) {
    return (
      <EmptyState
        icon="people"
        title="No ratings found"
        text={`We couldn't find ${instructor} on Rate My Professors for Georgia State.`}
      />
    );
  }
  return <RatingDetails rating={rating} />;
}

// ------------------------------------------------------------------ syllabus

/** Syllabi come from GSU's public repository; anything else is never framed or linked. */
const SYLLABUS_HOSTS = new Set(["cdn.gsu.edu"]);

function syllabusUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === "https:" && SYLLABUS_HOSTS.has(url.hostname) ? url.href : null;
  } catch {
    return null;
  }
}

function SyllabusSection({ section, state }: { section: Section; state: MetaState }) {
  if (state.meta === undefined) return <MetaPending state={state} icon="bookmark" loading="Looking for the syllabus…" />;
  const url = syllabusUrl(state.meta.syllabus?.url);
  if (!url) {
    return (
      <EmptyState
        icon="bookmark"
        title="No syllabus published"
        text="GSU doesn't have a syllabus on file for this section yet. Check back closer to the term."
      />
    );
  }
  return (
    <div className={styles.syllabus}>
      <a className={styles.pdfLink} href={url} target="_blank" rel="noopener noreferrer">
        <OldIcon name="external" size={14} /> Open PDF in a new tab
      </a>
      <iframe className={styles.pdf} src={url} title={`Syllabus for ${courseHeading(section)}`} referrerPolicy="no-referrer" />
    </div>
  );
}
