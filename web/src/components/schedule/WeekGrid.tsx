"use client";

import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { AlertIcon } from "@/components/ui/icons";
import { prefersReducedMotion } from "@/lib/ui/motion";
import { DAY_LABELS, type WeekDay } from "@/lib/schedule/conflicts";
import { blockGeometry, laneGeometry, type HourRange, type PositionedBlock } from "./layout";
import { blockNameSuffix, colorVar } from "./format";
import styles from "./WeekGrid.module.css";
import { formatTimeRange } from "@/lib/format";

export type WeekGridProps = {
  /** Accessible name of the scroll region, e.g. "Fall 2026 week". */
  label: string;
  days: WeekDay[];
  range: HourRange;
  week: Map<WeekDay, PositionedBlock[]>;
  /** CRNs to highlight once (added from the dialog, motion.md §4.11). */
  freshCrns: ReadonlySet<string>;
  onFreshDone: (crn: string) => void;
  onOpen: (crn: string) => void;
};

const FRESH_STATIC_MS = 2000;
/** --dur-slower (480 ms) plus slack. */
const FRESH_SAFETY_MS = 1000;

function hourLabel(hour: number): string {
  const h = hour % 24;
  return `${h % 12 || 12} ${h >= 12 ? "PM" : "AM"}`;
}

/** Tooltip for a lane-split block: "CSC 2720 · 003, Monday 10:00 – 11:15 AM, Langdale 405, conflicts with MATH 2211". */
function blockTitle(block: PositionedBlock, time: string): string {
  const seq = block.course.section.sequenceNumber;
  const parts = [`${block.code}${seq ? ` · ${seq}` : ""}`, `${DAY_LABELS[block.day].long} ${time}`];
  if (block.location) parts.push(block.location);
  if (block.conflictsWith.length) parts.push(`conflicts with ${block.conflictsWith.join(" and ")}`);
  return parts.join(", ");
}

/**
 * Week grid (spec.md §2.17): sticky day header and hour rail inside one scroll container,
 * blocks absolutely positioned by start/end minutes, overlapping blocks split into lanes.
 * Blocks are buttons in DOM order (day, then start time).
 */
export function WeekGrid({ label, days, range, week, freshCrns, onFreshDone, onOpen }: WeekGridProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const hours = range.endHour - range.startHour;

  // Reveal the earliest fresh block; under reduced motion the static ring is cleared after 2 s.
  useEffect(() => {
    if (freshCrns.size === 0) return;
    const scroller = scrollerRef.current;
    const fresh = scroller ? [...scroller.querySelectorAll<HTMLElement>("[data-fresh]")] : [];
    const first = fresh.sort((a, b) => a.offsetTop - b.offsetTop)[0];
    const reduced = prefersReducedMotion();
    first?.scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
    // With motion, each block clears itself on the ring's animationend; the timer is a backstop
    // (animations disabled, block offscreen) so `data-fresh` can never stick.
    const timer = window.setTimeout(
      () => {
        for (const crn of freshCrns) onFreshDone(crn);
      },
      reduced ? FRESH_STATIC_MS : first ? FRESH_SAFETY_MS : 0,
    );
    return () => window.clearTimeout(timer);
  }, [freshCrns, onFreshDone]);

  return (
    <div ref={scrollerRef} className={styles.scroller} role="region" aria-label={label} tabIndex={0}>
      <div
        className={styles.grid}
        style={{ "--_days": days.length, "--_hours": hours } as CSSProperties}
      >
        {days.map((day, index) => (
          <div key={day} className={styles.head} style={{ gridColumn: index + 2 }} aria-hidden="true">
            <span className={styles.headLong}>{DAY_LABELS[day].short}</span>
          </div>
        ))}
        <div className={styles.corner} aria-hidden="true" />

        <div className={styles.rail} aria-hidden="true">
          {Array.from({ length: hours }, (_, i) => (
            <span key={i} className={styles.hour} style={{ "--_i": i } as CSSProperties}>
              {hourLabel(range.startHour + i)}
            </span>
          ))}
        </div>

        {days.map((day, index) => {
          const blocks = week.get(day) ?? [];
          return (
            <div
              key={day}
              role="group"
              aria-label={DAY_LABELS[day].long}
              className={styles.day}
              style={{ gridColumn: index + 2 }}
            >
              {blocks.map((block) => {
                const { top, height } = blockGeometry(block, range);
                const { left, width } = laneGeometry(block);
                const conflict = block.conflictsWith.length > 0;
                const section = block.course.section;
                const time = formatTimeRange(block.start, block.end);
                // Split lanes are too narrow for more than the course code (spec.md §2.17): the
                // rest stays in the accessible name (sr-only) and the title tooltip.
                const narrow = block.laneCount > 1;
                const hidden = narrow ? "sr-only" : undefined;
                return (
                  <button
                    key={block.id}
                    type="button"
                    className={styles.block}
                    data-conflict={conflict || undefined}
                    data-fresh={freshCrns.has(block.crn) || undefined}
                    data-tall={block.end - block.start >= 75 || undefined}
                    data-narrow={narrow || undefined}
                    title={narrow ? blockTitle(block, time) : undefined}
                    onClick={() => onOpen(block.crn)}
                    onAnimationEnd={(event) => {
                      if (event.animationName.includes("fresh-ring")) onFreshDone(block.crn);
                    }}
                    style={
                      {
                        "--_top": top,
                        "--_len": height,
                        "--_left": left,
                        "--_width": width,
                        background: colorVar(block.course.colorIndex),
                        viewTransitionName: block.vtName,
                      } as CSSProperties
                    }
                  >
                    <span className={styles.code}>
                      {block.code}
                      {section.sequenceNumber ? <span className={hidden ?? styles.seq}> · {section.sequenceNumber}</span> : null}
                    </span>
                    <span className={hidden ?? styles.time}>{time}</span>
                    {block.location ? <span className={hidden ?? styles.location}>{block.location}</span> : null}
                    {conflict ? (
                      <span className={styles.alert} aria-hidden="true">
                        <AlertIcon size={12} strokeWidth={2.25} />
                      </span>
                    ) : null}
                    <span className="sr-only">{blockNameSuffix(block)}</span>
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}
