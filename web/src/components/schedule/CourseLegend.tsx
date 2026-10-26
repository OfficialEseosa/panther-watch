"use client";

import type { CSSProperties } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { AlertIcon } from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import type { ScheduleEntry } from "@/lib/client/schedule";
import { meetingSummary } from "./layout";
import { colorLabel, colorVar } from "./format";
import type { Resolution } from "./useSectionResolver";
import styles from "./ScheduleExtras.module.css";
import { courseCode } from "@/lib/format";
import { displayTitle } from "@/components/courses/format";

export type LegendItem = {
  entry: ScheduleEntry;
  resolution: Resolution;
  conflict: boolean;
};

/** Course chips with their schedule colors; each opens the class dialog. */
export function CourseLegend({ items, onOpen }: { items: LegendItem[]; onOpen: (crn: string) => void }) {
  return (
    <ul className={styles.legend} aria-label="Classes on this schedule">
      {items.map(({ entry, resolution, conflict }) => {
        const seq = resolution.section?.sequenceNumber;
        const code = courseCode(entry.subject, entry.courseNumber);
        const status =
          resolution.status === "loading"
            ? "loading details"
            : resolution.status === "missing"
              ? "no longer listed"
              : resolution.status === "failed"
                ? "details unavailable"
                : null;
        return (
          <li key={entry.crn}>
            <button
              type="button"
              className={styles.chip}
              data-conflict={conflict || undefined}
              aria-label={[
                // Starts with the visible text "CSC 1301 · 001" (WCAG 2.5.3 Label in Name).
                seq ? `${code} · ${seq}` : code,
                `${colorLabel(entry.colorIndex)} color`,
                conflict ? "has a conflict" : null,
                status,
              ]
                .filter(Boolean)
                .join(", ")}
              onClick={() => onOpen(entry.crn)}
              style={{ "--_color": colorVar(entry.colorIndex) } as CSSProperties}
            >
              <span className={styles.dot} aria-hidden="true" />
              <span>
                {code}
                {seq ? <span className={styles.chipSeq}> · {seq}</span> : null}
              </span>
              {conflict ? <AlertIcon size={16} className={styles.chipAlert} /> : null}
              {resolution.status === "loading" ? <Spinner size={12} /> : null}
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export type UnscheduledItem = {
  entry: ScheduleEntry;
  resolution: Resolution;
};

/**
 * "Online and unscheduled" (pages.md §6): classes the grid can't place (no meeting time, or
 * their live data is missing). They are listed, never silently dropped.
 */
export function UnscheduledList({ items, onOpen }: { items: UnscheduledItem[]; onOpen: (crn: string) => void }) {
  if (items.length === 0) return null;
  return (
    <Card title="Online and unscheduled" titleAs="h2" flush>
      <ul className={styles.unscheduled}>
        {items.map(({ entry, resolution }) => {
          const section = resolution.section;
          const code = courseCode(entry.subject, entry.courseNumber);
          const seq = section?.sequenceNumber;
          return (
            <li key={entry.crn} className={styles.unscheduledRow} style={{ "--_color": colorVar(entry.colorIndex) } as CSSProperties}>
              <span className={styles.bar} aria-hidden="true" />
              <div className={styles.unscheduledMain}>
                <p className={styles.unscheduledCode}>
                  {code}
                  {seq ? ` · ${seq}` : ""}
                  <span className={styles.unscheduledTitle}>{displayTitle(section?.courseTitle ?? entry.courseTitle)}</span>
                </p>
                <p className={styles.unscheduledMeta}>
                  {resolution.status === "ok" && section ? (
                    meetingSummary(section)
                  ) : resolution.status === "missing" ? (
                    <Badge tone="warning">No longer listed in GoSolar</Badge>
                  ) : (
                    <Badge tone="warning">Meeting times unavailable</Badge>
                  )}
                </p>
              </div>
              <Button size="sm" variant="ghost" onClick={() => onOpen(entry.crn)} aria-label={`Details for ${code}`}>
                Details
              </Button>
            </li>
          );
        })}
      </ul>
    </Card>
  );
}
