"use client";

import Image from "next/image";
import type { MouseEvent, ReactNode } from "react";
import type { SectionMeta } from "@/lib/courses/meta";
import { cn } from "@/lib/ui/cn";
import { courseCode, creditsLabel, instructorsOf, keyOf } from "@/lib/format";
import { RemoveWatchButton, ScheduleToggle, WatchToggle } from "./CourseActions";
import { displayTitle, featuredGrades, formatGpa, gpaTone, sectionLabel, titleOf, usableRating, type Section } from "./format";
import { GradeBar } from "./GradeBar";
import { EnrollmentStatus, ExpiryNotice, MeetingTimes } from "./SectionParts";
import styles from "./CourseCard.module.css";

export type CourseCardProps = {
  section: Section;
  /** Grades/rating/syllabus from the page's shared meta map (undefined while loading). */
  meta?: SectionMeta;
  watched: boolean;
  scheduled: boolean;
  isSignedIn: boolean;
  onToggleWatch?: (section: Section) => Promise<boolean> | void;
  onToggleSchedule?: (section: Section) => Promise<boolean> | void;
  /** Opens the detail dialog; receives the card element. */
  onOpen?: (section: Section, card: HTMLElement) => void;
  /** href of the title link (the dialog's URL), so it works as a real link too. */
  href?: string;
  /** "tracked" replaces Watch with Remove and shows the term. */
  mode?: "results" | "tracked";
  watchPending?: boolean;
  schedulePending?: boolean;
  /** View-only term: the schedule button (and Watch, unless watching) show disabled. */
  viewOnly?: boolean;
  /** Term name for the info grid (tracked view). */
  termName?: string;
  /** "Tracking ends Oct 1" (tracked view). */
  expiry?: string | null;
  /** Notices under the info grid (partial / stale data). */
  notice?: ReactNode;
  /** No live data (stored watch only): hides seats, meetings and credits. */
  limited?: boolean;
  onRemove?: (section: Section) => void;
  removePending?: boolean;
  /** Level of the title heading (2 when the cards sit right under the page h1). */
  headingLevel?: 2 | 3;
  className?: string;
};

/** "Computer Science (CSC 1301)", the original card title (and the dialog's). */
export function courseHeading(section: Section): string {
  const code = courseCode(section);
  // GoSolar sends some subject names in capitals ("COMPUTER SCIENCE"): title-cased like the titles.
  const subject = displayTitle(section.subjectDescription);
  return subject ? `${subject} (${code})` : code;
}

/** The original "3" / "1–4" credits value (no unit; the label says Credits). */
export function creditsValue(section: Section): string | null {
  return creditsLabel(section)?.replace(/ credits?$/, "") ?? null;
}

function InfoItem({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className={styles.infoItem}>
      <span className={styles.infoLabel}>{label}</span>{" "}
      <span className={styles.infoValue}>{value}</span>
      {/* Read as "Credits 3. 3 Available", not "Credits 33 Available", when linearized. */}
      <span className="sr-only">. </span>
    </div>
  );
}

/** The black Rate My Professors pill next to the instructor (original card). */
function RmpPill({ meta }: { meta: SectionMeta | undefined }) {
  const rating = usableRating(meta);
  if (!rating || rating.avgRating == null) return null;
  const score = rating.avgRating.toFixed(1);
  return (
    <span className={styles.rmp} title={`${score}/5 on Rate My Professors`}>
      <Image src="/brand/rmp.svg" alt="Rate My Professors" width={35} height={20} className={styles.rmpLogo} unoptimized />
      <span className={styles.rmpScore}>{score}</span>
      <span className="sr-only"> out of 5</span>
    </span>
  );
}

/** The original compact grade summary at the foot of the card. */
function GradeLine({ meta }: { meta: SectionMeta | undefined }) {
  const featured = featuredGrades(meta?.grades);
  if (!featured) return null;
  const tone = gpaTone(featured.aggregate.gpa) ?? "unknown";
  return (
    <div className={styles.gradeLine}>
      <div className={styles.gpa} data-tone={tone} title="Average GPA (grade history)">
        <span className={styles.gpaNum}>{formatGpa(featured.aggregate.gpa)}</span>{" "}
        <span className={styles.gpaLabel}>{featured.instructor ? "prof GPA" : "avg GPA"}</span>
      </div>
      <GradeBar gradeCounts={featured.aggregate.gradeCounts} height={8} />
    </div>
  );
}

/**
 * The original course card (old CourseResults/CourseCard), slightly tighter: header with the
 * course, CRN chip and the calendar/Watch buttons; then title/section/credits, the enrollment
 * numbers, instructor (with the RMP pill), meeting boxes and the compact grade line. The heading
 * link is stretched over the card, so the whole card opens the detail dialog; the buttons sit
 * above it.
 */
export function CourseCard({
  section,
  meta,
  watched,
  scheduled,
  isSignedIn,
  onToggleWatch,
  onToggleSchedule,
  onOpen,
  href,
  mode = "results",
  watchPending = false,
  schedulePending = false,
  viewOnly = false,
  termName,
  expiry,
  notice,
  limited = false,
  onRemove,
  removePending = false,
  headingLevel = 2,
  className,
}: CourseCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const code = sectionLabel(section);
  const title = titleOf(section);
  const crn = section.courseReferenceNumber ?? "";
  const heading = courseHeading(section);
  const credits = limited ? null : creditsValue(section);
  const faculty = instructorsOf(section);

  const showSchedule = Boolean(onToggleSchedule) && !limited;
  const showWatch = mode === "results" && Boolean(onToggleWatch);
  const showRemove = mode === "tracked" && Boolean(onRemove);

  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onOpen || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    const card = event.currentTarget.closest("article");
    if (card) onOpen(section, card);
  };

  return (
    <article
      className={cn(styles.card, onOpen && styles.interactive, className)}
      data-card-key={keyOf(section)}
      aria-label={`${code}, ${title}`}
    >
      <header className={styles.header}>
        <div className={styles.titleSection}>
          <Heading className={styles.title}>
            {onOpen ? (
              // The name adds the section (every card of a course shares the heading); it starts
              // with the visible text (WCAG 2.5.3).
              <a
                href={href ?? `?crn=${crn}`}
                className={styles.titleLink}
                aria-label={section.sequenceNumber ? `${heading}, section ${section.sequenceNumber}` : undefined}
                onClick={open}
              >
                {heading}
              </a>
            ) : (
              heading
            )}
          </Heading>
          {crn ? <span className={styles.crn}>CRN {crn}</span> : null}
        </div>
        {showSchedule || showWatch || showRemove ? (
          <div className={styles.actions}>
            {showSchedule ? (
              <ScheduleToggle
                scheduled={scheduled}
                pending={schedulePending}
                code={code}
                disabled={viewOnly}
                hint={isSignedIn ? undefined : "Sign in to add to your schedule"}
                onToggle={() => onToggleSchedule?.(section)}
              />
            ) : null}
            {showWatch ? (
              <WatchToggle
                watched={watched && isSignedIn}
                pending={watchPending}
                code={code}
                disabled={viewOnly && !watched}
                hint={isSignedIn ? undefined : "Sign in to track classes"}
                onToggle={() => onToggleWatch?.(section)}
              />
            ) : null}
            {showRemove ? <RemoveWatchButton code={code} pending={removePending} onRemove={() => onRemove?.(section)} /> : null}
          </div>
        ) : null}
      </header>

      <div className={styles.body}>
        {expiry ? <ExpiryNotice>{expiry}</ExpiryNotice> : null}

        <div className={styles.info}>
          <InfoItem label="Course title" value={title} />
          {section.sequenceNumber ? <InfoItem label="Section" value={section.sequenceNumber} /> : null}
          {mode === "tracked" && termName ? <InfoItem label="Term" value={termName} /> : null}
          {credits ? <InfoItem label="Credits" value={credits} /> : null}
        </div>

        {notice}

        {limited ? null : <EnrollmentStatus section={section} compact />}

        {faculty.length ? (
          <div className={styles.faculty}>
            <div className={styles.facultyTitle}>{faculty.length > 1 ? "Instructors" : "Instructor"}</div>
            {faculty.map((name, index) => (
              <div key={`${name}-${index}`} className={styles.facultyName}>
                <span className={styles.facultyNameText}>{name}</span>
                {index === 0 ? <RmpPill meta={meta} /> : null}
              </div>
            ))}
          </div>
        ) : null}

        {limited ? null : <MeetingTimes section={section} compact />}

        <GradeLine meta={meta} />
      </div>
    </article>
  );
}
