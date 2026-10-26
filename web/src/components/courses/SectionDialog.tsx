"use client";

import { useId, useMemo, useState } from "react";
import type { CSSProperties, ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button, ButtonAnchor } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { BookmarkIcon, ChartIcon, ExternalIcon, MailIcon, SearchIcon, StarIcon, UserIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/Input";
import { Meter } from "@/components/ui/Meter";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import type { GradeAggregate, GradeDistributionResponse } from "@/lib/course-meta/grades/types";
import type { ProfessorRating } from "@/lib/course-meta/rmp";
import type { SectionMeta } from "@/lib/courses/meta";
import { cn } from "@/lib/ui/cn";
import { useScrollEdges } from "@/lib/ui/hooks";
import {
  DAY_SHORT,
  dwfBadgeTone,
  featuredGrades,
  foldText,
  formatGpa,
  formatPercent,
  gpaBadgeTone,
  meetingRows,
  rmpProfileUrl,
  sectionLabel,
  semesterSpan,
  titleOf,
  usableRating,
  type Section,
} from "./format";
import { GradeBar } from "./GradeBar";
import type { DialogTab } from "./useCourseDialog";
import styles from "./SectionDialog.module.css";
import { creditsLabel, instructorOf, partOfTermName, plural } from "@/lib/format";

export type SectionDialogProps = {
  /** The open section, or null when closed (the last one stays rendered during the exit). */
  section: Section | null;
  /** Meta for the section, read live from the page's shared map. */
  meta: SectionMeta | undefined;
  onClose: () => void;
  tab: DialogTab;
  onTabChange: (tab: DialogTab) => void;
  /** Header controls (the same watch/schedule toggles as the card). */
  actions?: ReactNode;
  /** Term name for the badge row. */
  termName?: string;
  /** Shown above the tabs (e.g. "Couldn't reach GoSolar"). */
  notice?: ReactNode;
  /** The meta lookup for this section failed: the tabs show an error with Retry, not a skeleton. */
  metaFailed?: boolean;
  onRetryMeta?: () => void;
};

type MetaState = { meta: SectionMeta | undefined; failed: boolean; onRetry?: () => void };

/**
 * Course detail dialog (pages.md §4): size lg, fixed height, a sheet on mobile. Tabs:
 * Overview, Grades, Ratings, Syllabus. Reads meta from props on every render, so data that
 * arrives after opening shows up immediately.
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
}: SectionDialogProps) {
  // Keep the last section while the dialog plays its exit (adjusting state during render).
  const [shown, setShown] = useState<Section | null>(section);
  if (section && section !== shown) setShown(section);
  const current = section ?? shown;
  const open = section !== null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      size="lg"
      fixedHeight
      initialFocus="heading"
      viewTransitionName={open ? "course-detail" : undefined}
      title={current ? sectionLabel(current) : ""}
      subtitle={current ? titleOf(current) : undefined}
      actions={actions}
      bodyClassName={styles.body}
    >
      {current ? (
        <DialogContent
          section={current}
          meta={{ meta, failed: metaFailed && meta === undefined, onRetry: onRetryMeta }}
          tab={tab}
          onTabChange={onTabChange}
          termName={termName}
          notice={notice}
        />
      ) : null}
    </Dialog>
  );
}

function DialogContent({
  section,
  meta,
  tab,
  onTabChange,
  termName,
  notice,
}: {
  section: Section;
  meta: MetaState;
  tab: DialogTab;
  onTabChange: (tab: DialogTab) => void;
  termName?: string;
  notice?: ReactNode;
}) {
  const credits = creditsLabel(section);
  const method = section.instructionalMethodDescription?.trim();
  return (
    <>
      <div className={styles.badges}>
        {section.courseReferenceNumber ? <Badge tone="accent">CRN {section.courseReferenceNumber}</Badge> : null}
        {credits ? <Badge>{credits}</Badge> : null}
        {termName ? <Badge>{termName}</Badge> : null}
        {/* GoSolar's method text can be long ("Partially Distance +50% tech"): it wraps, never truncates. */}
        {method ? (
          <Badge className={styles.wrapBadge}>{method}</Badge>
        ) : null}
      </div>
      {notice}
      <Tabs
        label="Section details"
        value={tab}
        onValueChange={(id) => onTabChange(id as DialogTab)}
        className={styles.tabs}
        panelClassName={styles.panel}
        tabs={[
          {
            id: "overview",
            label: "Overview",
            icon: <SearchIcon size={16} />,
            panel: <OverviewPanel section={section} meta={meta.meta} onTabChange={onTabChange} />,
          },
          { id: "grades", label: "Grades", icon: <ChartIcon size={16} />, panel: <GradesPanel section={section} meta={meta} /> },
          { id: "ratings", label: "Ratings", icon: <StarIcon size={16} />, panel: <RatingsPanel section={section} meta={meta} /> },
          { id: "syllabus", label: "Syllabus", icon: <BookmarkIcon size={16} />, panel: <SyllabusPanel section={section} meta={meta} /> },
        ]}
      />
    </>
  );
}

/** What a meta-backed tab shows before its data: a skeleton, or the failure with Retry. */
function MetaPending({ state, label }: { state: MetaState; label: string }) {
  if (!state.failed) return <PanelSkeleton label={label} />;
  return (
    <Banner
      tone="warning"
      role="alert"
      action={
        state.onRetry ? (
          <Button size="sm" variant="secondary" onClick={state.onRetry}>
            Retry
          </Button>
        ) : undefined
      }
    >
      Couldn&rsquo;t load grades, ratings and the syllabus for this section.
    </Banner>
  );
}

function PanelSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label} className={styles.panelSkeleton}>
      <Skeleton width="40%" height={16} />
      <Skeleton width="100%" height={12} radius="full" />
      <Skeleton width="70%" height={12} />
      <Skeleton width="55%" height={12} />
    </SkeletonGroup>
  );
}

// ------------------------------------------------------------------ overview

function OverviewPanel({
  section,
  meta,
  onTabChange,
}: {
  section: Section;
  meta: SectionMeta | undefined;
  onTabChange: (tab: DialogTab) => void;
}) {
  const id = useId();
  const rows = meetingRows(section);
  const featured = featuredGrades(meta?.grades);
  const rating = usableRating(meta);
  const primary = instructorOf(section);
  const faculty = (section.faculty ?? []).filter((f) => f.displayName?.trim());
  const details: Array<[string, string]> = [];
  if (section.campusDescription) details.push(["Campus", section.campusDescription]);
  if (section.instructionalMethodDescription) details.push(["Instructional method", section.instructionalMethodDescription]);
  if (section.scheduleTypeDescription) details.push(["Schedule type", section.scheduleTypeDescription]);
  const credits = creditsLabel(section);
  if (credits) details.push(["Credit hours", credits]);
  const partOfTerm = partOfTermName(section.partOfTerm);
  if (partOfTerm) details.push(["Part of term", partOfTerm]);
  if (section.isSectionLinked) details.push(["Linked sections", "Register for a linked lab or recitation too"]);

  return (
    <div className={styles.stack}>
      <section className={styles.section} aria-labelledby={`${id}-enrollment`}>
        <h3 id={`${id}-enrollment`} className={styles.heading}>
          Enrollment
        </h3>
        <Meter
          size="lg"
          enrolled={section.enrollment}
          capacity={section.maximumEnrollment}
          available={section.seatsAvailable}
          waitCount={section.waitCount}
          waitCapacity={section.waitCapacity}
        />
        {section.maximumEnrollment > 0 ? (
          <p className={styles.muted}>
            {section.enrollment} of {section.maximumEnrollment} seats taken
            {section.waitCapacity > 0 ? ` · ${section.waitAvailable} waitlist spots left` : " · No waitlist"}
          </p>
        ) : null}
      </section>

      <section className={styles.section} aria-labelledby={`${id}-meetings`}>
        <h3 id={`${id}-meetings`} className={styles.heading}>
          Meetings
        </h3>
        {rows.length === 0 ? (
          <p className={styles.muted}>No meeting times are listed for this section.</p>
        ) : (
          <MeetingsTable rows={rows} labelledBy={`${id}-meetings`} />
        )}
      </section>

      <section className={styles.section} aria-labelledby={`${id}-instructors`}>
        <h3 id={`${id}-instructors`} className={styles.heading}>
          {faculty.length > 1 ? "Instructors" : "Instructor"}
        </h3>
        {faculty.length === 0 ? (
          <p className={styles.muted}>No instructor is listed yet (TBA).</p>
        ) : (
          <ul className={styles.people}>
            {faculty.map((f, i) => {
              const name = f.displayName?.trim() ?? "";
              const isPrimary = name === primary;
              return (
                <li key={`${name}-${i}`} className={styles.person}>
                  <span className={styles.personName}>
                    <UserIcon size={16} />
                    {name}
                  </span>
                  {f.emailAddress ? (
                    <a className={styles.link} href={`mailto:${f.emailAddress}`}>
                      <MailIcon size={16} />
                      {f.emailAddress}
                    </a>
                  ) : null}
                  {isPrimary && (featured || rating) ? (
                    <span className={styles.personStats}>
                      {featured && featured.aggregate.gpa != null ? (
                        <button type="button" className={styles.statButton} onClick={() => onTabChange("grades")}>
                          GPA {formatGpa(featured.aggregate.gpa)}{" "}
                          <span className={styles.muted}>
                            ({featured.instructor ? "n" : "course, n"}={featured.aggregate.total})
                          </span>
                        </button>
                      ) : null}
                      {rating?.avgRating != null ? (
                        <button type="button" className={styles.statButton} onClick={() => onTabChange("ratings")}>
                          RMP {rating.avgRating.toFixed(1)}{" "}
                          <span className={styles.muted}>({plural(rating.numRatings ?? 0, "rating")})</span>
                        </button>
                      ) : null}
                    </span>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {details.length ? (
        <section className={styles.section} aria-labelledby={`${id}-details`}>
          <h3 id={`${id}-details`} className={styles.heading}>
            Details
          </h3>
          <dl className={styles.details}>
            {details.map(([label, value]) => (
              <div key={label} className={styles.detail}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      ) : null}
    </div>
  );
}

// ------------------------------------------------------------------ grades

/**
 * The Overview's meetings table. On phones it scrolls sideways: an edge fade shows there is
 * more, and while it overflows the scroller is focusable (keyboard scrolling) and described by
 * an sr-only "scroll for more" hint.
 */
function MeetingsTable({ rows, labelledBy }: { rows: ReturnType<typeof meetingRows>; labelledBy: string }) {
  const hintId = useId();
  const [scrollRef, edges] = useScrollEdges();
  return (
    <div
      ref={scrollRef}
      className={cn(styles.tableWrap, "edge-fade")}
      data-fade={edges.fade}
      role={edges.overflowing ? "region" : undefined}
      aria-labelledby={edges.overflowing ? labelledBy : undefined}
      aria-describedby={edges.overflowing ? hintId : undefined}
      tabIndex={edges.overflowing ? 0 : undefined}
    >
      {edges.overflowing ? (
        <span id={hintId} className="sr-only">
          Scroll sideways for more columns.
        </span>
      ) : null}
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Days</th>
            <th scope="col">Time</th>
            <th scope="col">Location</th>
            <th scope="col">Dates</th>
            <th scope="col">Type</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i}>
              <td>{row.days.length ? row.days.map((d) => DAY_SHORT[d]).join(", ") : row.online ? "Online" : "TBA"}</td>
              <td className={styles.num}>{row.time ?? (row.online ? "Asynchronous" : "TBA")}</td>
              <td>{row.location ?? "TBA"}</td>
              <td className={styles.num}>{row.dates ?? "—"}</td>
              <td>{row.type ?? "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AggregateSummary({ title, aggregate }: { title: string; aggregate: GradeAggregate }) {
  return (
    <div className={styles.aggregate}>
      <h4 className={styles.subheading}>{title}</h4>
      <div className={styles.aggregateStats}>
        <Badge tone={gpaBadgeTone(aggregate.gpa)}>GPA {formatGpa(aggregate.gpa)}</Badge>
        <Badge tone={dwfBadgeTone(aggregate.dwfPercent)}>DWF {formatPercent(aggregate.dwfPercent)}</Badge>
        <span className={styles.muted}>
          {plural(aggregate.total, "student")} · {plural(aggregate.sectionsCount, "section")}
        </span>
      </div>
      <GradeBar gradeCounts={aggregate.gradeCounts} size="lg" legend />
    </div>
  );
}

type ProfSort = "gpa" | "name";

function ProfessorsTable({ grades }: { grades: GradeDistributionResponse }) {
  const id = useId();
  const [sort, setSort] = useState<ProfSort>("gpa");
  const [query, setQuery] = useState("");
  const rows = useMemo(() => {
    const folded = foldText(query.trim());
    const list = grades.professors.filter((p) => !folded || foldText(p.professor ?? "").includes(folded));
    return [...list].sort((a, b) =>
      sort === "name"
        ? (a.professor ?? "").localeCompare(b.professor ?? "")
        : (b.gpa ?? -1) - (a.gpa ?? -1) || (a.professor ?? "").localeCompare(b.professor ?? ""),
    );
  }, [grades.professors, query, sort]);

  if (grades.professors.length === 0) return null;
  return (
    <section className={styles.section} aria-labelledby={`${id}-professors`}>
      <div className={styles.tableHead}>
        <h4 id={`${id}-professors`} className={styles.subheading}>
          By professor
        </h4>
        {grades.professors.length > 8 ? (
          <Input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Filter professors"
            aria-label="Filter professors by name"
            leadingIcon={<SearchIcon size={16} />}
            className={styles.tableFilter}
          />
        ) : null}
      </div>
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th scope="col" aria-sort={sort === "name" ? "ascending" : "none"}>
                <button type="button" className={styles.sortButton} onClick={() => setSort("name")}>
                  Professor
                </button>
              </th>
              <th scope="col" aria-sort={sort === "gpa" ? "descending" : "none"}>
                <button type="button" className={styles.sortButton} onClick={() => setSort("gpa")}>
                  GPA
                </button>
              </th>
              <th scope="col">DWF</th>
              <th scope="col">Sections</th>
              <th scope="col" className={styles.distCol}>
                Grades
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => (
              <tr key={`${p.professor}-${i}`}>
                <td>{p.professor ?? "Unknown"}</td>
                <td className={styles.num}>
                  <Badge tone={gpaBadgeTone(p.gpa)}>{formatGpa(p.gpa)}</Badge>
                </td>
                <td className={styles.num}>{formatPercent(p.dwfPercent)}</td>
                <td className={styles.num}>{p.sectionsCount}</td>
                <td className={styles.distCol}>
                  <GradeBar gradeCounts={p.gradeCounts} />
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className={styles.muted}>
                  No professors match &ldquo;{query}&rdquo;.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function GradesPanel({ section, meta: state }: { section: Section; meta: MetaState }) {
  const { meta } = state;
  if (meta === undefined) return <MetaPending state={state} label="Loading grade history" />;
  const grades = meta.grades;
  if (!grades?.hasData || !grades.overall) {
    return (
      <EmptyState variant="no-results" icon={<ChartIcon size={24} />} title="No published grade data for this course.">
        GSU publishes grade distributions after each term ends. Newer courses may not have any yet.
      </EmptyState>
    );
  }
  const instructor = instructorOf(section);
  return (
    <div className={styles.stack}>
      <p className={styles.muted}>{semesterSpan(grades.termsIncluded)}</p>
      <div className={styles.aggregates}>
        {grades.instructorHasTaught && grades.instructorDistribution ? (
          <AggregateSummary
            title={`How ${grades.instructorDistribution.professor ?? instructor ?? "this instructor"} grades`}
            aggregate={grades.instructorDistribution}
          />
        ) : null}
        <AggregateSummary title="All instructors" aggregate={grades.overall} />
      </div>
      {instructor && !grades.instructorHasTaught ? (
        <p className={styles.muted}>No grade history for {instructor} in this course yet.</p>
      ) : null}
      <ProfessorsTable grades={grades} />
    </div>
  );
}

// ------------------------------------------------------------------ ratings

const DIST_ROWS: Array<{ key: "r5" | "r4" | "r3" | "r2" | "r1"; label: string }> = [
  { key: "r5", label: "Awesome 5" },
  { key: "r4", label: "Great 4" },
  { key: "r3", label: "Good 3" },
  { key: "r2", label: "OK 2" },
  { key: "r1", label: "Awful 1" },
];

function ratingTone(score: number): "success" | "warning" | "danger" {
  if (score >= 4) return "success";
  if (score >= 3) return "warning";
  return "danger";
}

function RatingDetails({ rating }: { rating: ProfessorRating }) {
  const score = rating.avgRating ?? 0;
  const dist = rating.distribution;
  const max = dist ? Math.max(1, dist.r1, dist.r2, dist.r3, dist.r4, dist.r5) : 1;
  const id = useId();
  const url = rmpProfileUrl(rating);
  return (
    <div className={styles.stack}>
      <div className={styles.ratingTop}>
        <p className={styles.score} data-tone={ratingTone(score)}>
          {score.toFixed(1)}
          <span className={styles.scoreOutOf}> / 5</span>
        </p>
        <div className={styles.ratingText}>
          <p className={styles.ratingTitle}>Overall quality</p>
          <p className={styles.muted}>
            Based on {plural(rating.numRatings ?? 0, "rating")}
            {rating.matchedName ? ` for ${rating.matchedName}` : ""}
            {rating.department ? ` · ${rating.department}` : ""}
          </p>
        </div>
      </div>
      <dl className={styles.ratingStats}>
        {rating.avgDifficulty != null ? (
          <div className={styles.detail}>
            <dt>Level of difficulty</dt>
            <dd>{rating.avgDifficulty.toFixed(1)} / 5</dd>
          </div>
        ) : null}
        {rating.wouldTakeAgainPercent != null && rating.wouldTakeAgainPercent >= 0 ? (
          <div className={styles.detail}>
            <dt>Would take again</dt>
            <dd>{Math.round(rating.wouldTakeAgainPercent)}%</dd>
          </div>
        ) : null}
      </dl>
      {dist ? (
        <section className={styles.section} aria-labelledby={`${id}-dist`}>
          <h4 id={`${id}-dist`} className={styles.subheading}>
            Rating distribution
          </h4>
          <ul className={styles.dist}>
            {DIST_ROWS.map((row) => (
              <li key={row.key} className={styles.distRow}>
                <span className={styles.distLabel}>{row.label}</span>
                <span className={styles.distTrack} aria-hidden="true">
                  <span className={styles.distFill} style={{ "--_share": dist[row.key] / max } as CSSProperties} />
                </span>
                <span className={styles.num}>{dist[row.key]}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {rating.topTags.length ? (
        <section className={styles.section} aria-labelledby={`${id}-tags`}>
          <h4 id={`${id}-tags`} className={styles.subheading}>
            Top tags
          </h4>
          <ul className={styles.tags}>
            {rating.topTags.slice(0, 10).map((tag) => (
              <li key={tag.name}>
                <Badge>{tag.name}</Badge>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
      {url ? (
        <div>
          <ButtonAnchor
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            variant="secondary"
            size="sm"
            trailingIcon={<ExternalIcon size={16} />}
          >
            View on Rate My Professors
          </ButtonAnchor>
        </div>
      ) : null}
    </div>
  );
}

function RatingsPanel({ section, meta: state }: { section: Section; meta: MetaState }) {
  const { meta } = state;
  const instructor = instructorOf(section);
  if (!instructor) {
    return (
      <EmptyState variant="no-results" icon={<StarIcon size={24} />} title="No instructor is listed yet.">
        Ratings appear once GSU assigns an instructor to this section.
      </EmptyState>
    );
  }
  if (meta === undefined) return <MetaPending state={state} label="Loading ratings" />;
  const rating = usableRating(meta);
  if (!rating) {
    return (
      <EmptyState variant="no-results" icon={<StarIcon size={24} />} title={`No Rate My Professors profile found for ${instructor}.`}>
        Ratings come from Rate My Professors and only cover instructors with a GSU profile there.
      </EmptyState>
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

function SyllabusPanel({ section, meta: state }: { section: Section; meta: MetaState }) {
  const { meta } = state;
  if (meta === undefined) return <MetaPending state={state} label="Looking for the syllabus" />;
  const url = syllabusUrl(meta.syllabus?.url);
  if (!url) {
    return (
      <EmptyState variant="no-results" icon={<BookmarkIcon size={24} />} title="No syllabus on file for this section.">
        GSU hasn&rsquo;t published one yet. Check back closer to the start of the term.
      </EmptyState>
    );
  }
  return (
    <div className={cn(styles.stack, styles.syllabus)}>
      <div>
        <ButtonAnchor
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          variant="secondary"
          size="sm"
          trailingIcon={<ExternalIcon size={16} />}
        >
          Open PDF in a new tab
        </ButtonAnchor>
      </div>
      <iframe className={styles.pdf} src={url} title={`Syllabus for ${sectionLabel(section)}`} referrerPolicy="no-referrer" />
    </div>
  );
}
