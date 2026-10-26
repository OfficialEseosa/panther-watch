"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { prefersReducedMotion } from "@/lib/ui/motion";
import { DAY_LABELS, formatMinutes, type WeekDay } from "@/lib/schedule/conflicts";
import type { HourRange, PositionedBlock } from "./layout";
import { blockColors, blockNameSuffix, timeLabel } from "./format";
import styles from "./WeekGrid.module.css";

export type WeekGridProps = {
  /** Accessible name of the grid region, e.g. "Fall 2026 week". */
  label: string;
  days: WeekDay[];
  range: HourRange;
  week: Map<WeekDay, PositionedBlock[]>;
  /** CRNs to highlight once (added from the dialog). */
  freshCrns: ReadonlySet<string>;
  onFreshDone: (crn: string) => void;
  onOpen: (crn: string) => void;
};

/** Pixels per hour on the week grid (old ScheduleCalendar.jsx). */
const HOUR_HEIGHT = 64;
const FRESH_STATIC_MS = 2000;
const FRESH_SAFETY_MS = 1000;

/** Tooltip for a lane-split block: "CSC 2720 · 003, Monday 10:00 AM - 11:15 AM, Langdale 405, conflicts with MATH 2211". */
function blockTitle(block: PositionedBlock, time: string): string {
  const seq = block.course.section.sequenceNumber;
  const parts = [`${block.code}${seq ? ` · ${seq}` : ""}`, `${DAY_LABELS[block.day].long} ${time}`];
  if (block.location) parts.push(block.location);
  if (block.conflictsWith.length) parts.push(`conflicts with ${block.conflictsWith.join(" and ")}`);
  return parts.join(", ");
}

/**
 * The original week grid (old ScheduleCalendar.jsx): a day header row, an hour rail and one
 * column per day, with class blocks absolutely positioned so start time and duration are exact.
 * Overlapping blocks share the column side by side and get a red conflict outline. Hidden at
 * 768 px and below in favor of the agenda list.
 */
export function WeekGrid({ label, days, range, week, freshCrns, onFreshDone, onOpen }: WeekGridProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const hours = Array.from({ length: range.endHour - range.startHour }, (_, i) => range.startHour + i);
  const totalMinutes = hours.length * 60;

  // Reveal the earliest fresh block; under reduced motion the static ring is cleared after 2 s.
  useEffect(() => {
    if (freshCrns.size === 0) return;
    const scroller = scrollerRef.current;
    const fresh = scroller ? [...scroller.querySelectorAll<HTMLElement>("[data-fresh]")] : [];
    const first = fresh.sort((a, b) => a.offsetTop - b.offsetTop)[0];
    const reduced = prefersReducedMotion();
    if (first && first.getClientRects().length > 0) {
      first.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
    }
    // Each block clears itself on the ring's animationend; the timer is a backstop.
    const timer = window.setTimeout(
      () => {
        for (const crn of freshCrns) onFreshDone(crn);
      },
      reduced ? FRESH_STATIC_MS : first ? FRESH_SAFETY_MS : 0,
    );
    return () => window.clearTimeout(timer);
  }, [freshCrns, onFreshDone]);

  return (
    <div ref={scrollerRef} className={styles.calendarWeek} role="region" aria-label={label} tabIndex={0}>
      <div className={styles.inner} style={{ "--day-count": days.length } as CSSProperties}>
        <div className={styles.headRow} aria-hidden="true">
          <div className={styles.corner} />
          {days.map((day) => (
            <div key={day} className={styles.dayHead}>
              <span className={styles.dayFull}>{DAY_LABELS[day].long}</span>
              <span className={styles.dayAbbr}>{DAY_LABELS[day].short}</span>
            </div>
          ))}
        </div>

        <div className={styles.body} style={{ height: `${hours.length * HOUR_HEIGHT}px` }}>
          <div className={styles.hours} aria-hidden="true">
            {hours.map((hour) => (
              <div key={hour} className={styles.hourLabel} style={{ height: `${HOUR_HEIGHT}px` }}>
                {formatMinutes(hour * 60)}
              </div>
            ))}
          </div>

          {days.map((day) => (
            <div key={day} role="group" aria-label={DAY_LABELS[day].long} className={styles.dayCol}>
              {hours.map((hour) => (
                <div key={hour} className={styles.hourLine} style={{ height: `${HOUR_HEIGHT}px` }} aria-hidden="true" />
              ))}
              {(week.get(day) ?? []).map((block) => {
                const conflict = block.conflictsWith.length > 0;
                const seq = block.course.section.sequenceNumber;
                const time = timeLabel(block.start, block.end);
                const top = ((block.start - range.startHour * 60) / totalMinutes) * 100;
                const height = ((block.end - block.start) / totalMinutes) * 100;
                const width = 100 / Math.max(1, block.laneCount);
                const single = block.laneCount === 1;
                return (
                  <button
                    key={block.id}
                    type="button"
                    className={styles.classBlock}
                    data-block=""
                    data-conflict={conflict || undefined}
                    data-fresh={freshCrns.has(block.crn) || undefined}
                    title={single ? `${block.code}${block.location ? ` · ${block.location}` : ""}` : blockTitle(block, time)}
                    onClick={() => onOpen(block.crn)}
                    onAnimationEnd={(event) => {
                      if (event.animationName.includes("fresh-ring")) onFreshDone(block.crn);
                    }}
                    style={{
                      top: `${top}%`,
                      height: `${Math.max(height, 2)}%`,
                      left: `${block.lane * width}%`,
                      width: `calc(${width}% - 3px)`,
                      ...blockColors(block.course.colorIndex),
                      viewTransitionName: block.vtName,
                    }}
                  >
                    <span className={styles.classCode}>
                      {block.code}
                      {seq ? <span className="sr-only"> · {seq}</span> : null}
                    </span>
                    <span className={styles.classTime}>{time}</span>
                    {block.location ? (
                      <span className={single ? styles.classLocation : "sr-only"}>{block.location}</span>
                    ) : null}
                    <span className="sr-only">{blockNameSuffix(block)}</span>
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
