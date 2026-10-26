"use client";

import type { CSSProperties, MouseEvent, ReactNode } from "react";
import { Card, cardClasses } from "@/components/ui/Card";
import { Meter } from "@/components/ui/Meter";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import type { SectionMeta } from "@/lib/courses/meta";
import { cn } from "@/lib/ui/cn";
import { RemoveWatchButton, ScheduleToggle, WatchToggle } from "./CourseActions";
import {
  DAY_KEYS,
  DAY_LETTER,
  DAY_SHORT,
  instructorLabel,
  meetingRows,
  sectionLabel,
  titleOf,
  type DayKey,
  type Section,
} from "./format";
import { GpaBadge, RmpBadge } from "./MetaBadges";
import styles from "./CourseCard.module.css";
import { creditsLabel, instructorsOf, keyOf } from "@/lib/format";

const WEEKDAYS: DayKey[] = ["monday", "tuesday", "wednesday", "thursday", "friday"];
const MAX_MEETINGS = 2;

export type CourseCardProps = {
  section: Section;
  /** Grades/rating/syllabus from the page's shared meta map (undefined while loading). */
  meta?: SectionMeta;
  watched: boolean;
  scheduled: boolean;
  isSignedIn: boolean;
  onToggleWatch?: (section: Section) => Promise<boolean> | void;
  onToggleSchedule?: (section: Section) => Promise<boolean> | void;
  /** Opens the detail dialog; receives the card element for the shared view transition. */
  onOpen?: (section: Section, card: HTMLElement) => void;
  /** href of the title link (the dialog's URL), so it works as a real link too. */
  href?: string;
  /** Position in the grid: drives the entrance stagger and the meter fill delay. */
  index?: number;
  /** Play the entrance stagger (motion.md §4.2). */
  stagger?: boolean;
  /** "tracked" replaces Watch with Remove (spec.md §2.6). */
  mode?: "results" | "tracked";
  watchPending?: boolean;
  schedulePending?: boolean;
  /** View-only term: no schedule toggle, Watch only when already watching. */
  viewOnly?: boolean;
  /** Term name in the meta line (tracked view). */
  termName?: string;
  /** Notices above the meter (Banner, Badges). */
  notice?: ReactNode;
  /** No live data (stored watch only): hides seats, meetings and credits. */
  limited?: boolean;
  onRemove?: (section: Section) => void;
  removePending?: boolean;
  /** Level of the title heading: 3 under a group heading (h2), 2 when the cards sit right under the page h1. */
  headingLevel?: 2 | 3;
  className?: string;
};

function DayLetters({ days, weekend }: { days: DayKey[]; weekend: ReadonlySet<DayKey> }) {
  const shown = DAY_KEYS.filter((d) => WEEKDAYS.includes(d) || weekend.has(d));
  return (
    <span className={styles.days}>
      <span className="sr-only">{days.map((d) => DAY_SHORT[d]).join(", ")}</span>
      {shown.map((day) => (
        <span key={day} className={styles.day} data-active={days.includes(day) || undefined} aria-hidden="true">
          {DAY_LETTER[day]}
        </span>
      ))}
    </span>
  );
}

/**
 * Section card (spec.md §2.6): eyebrow + title link (stretched, opens the dialog), meta line,
 * seat meter, up to two meeting rows, instructor with GPA/RMP badges, and the watch/schedule
 * toggles raised above the stretched link.
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
  index = 0,
  stagger = false,
  mode = "results",
  watchPending = false,
  schedulePending = false,
  viewOnly = false,
  termName,
  notice,
  limited = false,
  headingLevel = 3,
  onRemove,
  removePending = false,
  className,
}: CourseCardProps) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  const code = sectionLabel(section);
  const title = titleOf(section);
  const crn = section.courseReferenceNumber ?? "";
  const rows = limited ? [] : meetingRows(section);
  const weekend = new Set(rows.flatMap((row) => row.days).filter((d) => d === "saturday" || d === "sunday"));
  const instructors = instructorsOf(section);
  const credits = limited ? null : creditsLabel(section);
  const method = limited ? null : section.instructionalMethodDescription?.trim() || null;
  const metaParts = [crn ? `CRN ${crn}` : null, credits, method, termName ?? null].filter(Boolean);

  const showSchedule = Boolean(onToggleSchedule) && !viewOnly && !limited;
  const showWatch = mode === "results" && Boolean(onToggleWatch) && (!viewOnly || watched);
  const showRemove = mode === "tracked" && Boolean(onRemove);

  const open = (event: MouseEvent<HTMLAnchorElement>) => {
    if (!onOpen || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) return;
    event.preventDefault();
    const card = event.currentTarget.closest("article");
    if (card) onOpen(section, card);
  };

  return (
    <Card
      as="article"
      interactive={Boolean(onOpen)}
      className={cn(styles.card, className)}
      bodyClassName={styles.body}
      data-card-key={keyOf(section)}
      data-stagger={stagger && index < 12 ? "" : undefined}
      aria-label={`${code}, ${title}`}
      style={{ "--i": Math.min(index, 8) } as CSSProperties}
    >
      <div className={styles.head}>
        <div className={styles.heading}>
          <p className={styles.eyebrow}>{code}</p>
          <Heading className={styles.title}>
            {onOpen ? (
              <a href={href ?? `?crn=${crn}`} className={cn(cardClasses.stretchedLink, styles.titleLink)} onClick={open}>
                {title}
              </a>
            ) : (
              title
            )}
          </Heading>
        </div>
        {showSchedule || showWatch || showRemove ? (
          <div className={cn(styles.actions, cardClasses.raised)}>
            {showSchedule ? (
              <>
                <ScheduleToggle
                  className={styles.watchFull}
                  scheduled={scheduled}
                  pending={schedulePending}
                  code={code}
                  onToggle={() => onToggleSchedule?.(section)}
                />
                <ScheduleToggle
                  compact
                  className={styles.watchCompact}
                  scheduled={scheduled}
                  pending={schedulePending}
                  code={code}
                  onToggle={() => onToggleSchedule?.(section)}
                />
              </>
            ) : null}
            {showWatch ? (
              <>
                <WatchToggle
                  className={styles.watchFull}
                  watched={watched && isSignedIn}
                  pending={watchPending}
                  code={code}
                  onToggle={() => onToggleWatch?.(section)}
                />
                <WatchToggle
                  compact
                  className={styles.watchCompact}
                  watched={watched && isSignedIn}
                  pending={watchPending}
                  code={code}
                  onToggle={() => onToggleWatch?.(section)}
                />
              </>
            ) : null}
            {showRemove ? (
              <>
                <span className={styles.watchFull}>
                  <RemoveWatchButton code={code} pending={removePending} onRemove={() => onRemove?.(section)} />
                </span>
                <span className={styles.watchCompact}>
                  <RemoveWatchButton compact code={code} pending={removePending} onRemove={() => onRemove?.(section)} />
                </span>
              </>
            ) : null}
          </div>
        ) : null}
      </div>

      {metaParts.length ? <p className={styles.meta}>{metaParts.join(" · ")}</p> : null}

      {notice ? <div className={styles.notices}>{notice}</div> : null}

      {limited ? null : (
        <Meter
          enrolled={section.enrollment}
          capacity={section.maximumEnrollment}
          available={section.seatsAvailable}
          waitCount={section.waitCount}
          waitCapacity={section.waitCapacity}
          index={stagger ? Math.min(index, 8) : 0}
        />
      )}

      {rows.length ? (
        <ul className={styles.meetings}>
          {rows.slice(0, MAX_MEETINGS).map((row, i) => (
            <li key={i} className={styles.meeting}>
              {row.days.length && row.time ? (
                <>
                  <DayLetters days={row.days} weekend={weekend} />
                  <span className={styles.time}>{row.time}</span>
                </>
              ) : (
                <span className={styles.time}>{row.online ? "Online · asynchronous" : "Time TBA"}</span>
              )}
              {row.location && !(row.online && !row.time) ? <span className={styles.location}>{row.location}</span> : null}
            </li>
          ))}
          {rows.length > MAX_MEETINGS ? (
            <li className={styles.more}>+{rows.length - MAX_MEETINGS} more</li>
          ) : null}
        </ul>
      ) : null}

      <div className={styles.footer}>
        <span className={styles.instructor} title={instructors.length > 1 ? instructors.join(", ") : undefined}>
          {instructorLabel(section)}
        </span>
        <span className={styles.badges}>
          <GpaBadge meta={meta} />
          <RmpBadge meta={meta} />
        </span>
      </div>
    </Card>
  );
}

/** Same box sizes as CourseCard (spec.md §2.12). */
export function CourseCardSkeleton({ label = "Loading sections" }: { label?: string }) {
  return (
    <Card className={styles.card} bodyClassName={styles.body}>
      <SkeletonGroup label={label} className={styles.skeleton}>
        <div className={styles.head}>
          <div className={styles.heading}>
            <Skeleton width="30%" height={12} />
            <Skeleton width="70%" height={16} />
          </div>
          <Skeleton width={80} height={32} radius="md" />
        </div>
        <Skeleton width="50%" height={12} />
        <Skeleton width="100%" height={12} radius="full" />
        <Skeleton width="80%" height={20} />
        <Skeleton width="60%" height={20} />
        <div className={styles.footer}>
          <Skeleton width="40%" height={14} />
          <Skeleton width={72} height={22} radius="full" />
        </div>
      </SkeletonGroup>
    </Card>
  );
}
