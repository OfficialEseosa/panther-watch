"use client";

import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { AlertIcon, CheckIcon, PlusIcon } from "@/components/ui/icons";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import type { CourseData } from "@/lib/gosolar/types";
import { meetingSummary } from "./layout";
import { seatSummary } from "./format";
import styles from "./AddClassRow.module.css";
import { courseCode, instructorOf } from "@/lib/format";
import { displayTitle } from "@/components/courses/format";

export type AddClassRowProps = {
  /** Live section; null when only the stored watch is known (GoSolar failed or no longer lists it). */
  section: CourseData | null;
  /** Shown when `section` is null. */
  fallback?: { subject: string; courseNumber: string; crn: string; title: string | null; instructor: string | null };
  /** Note under the title when the live section is missing. */
  note?: string;
  added: boolean;
  busy: boolean;
  disabled?: boolean;
  /** Codes of scheduled courses this section overlaps. */
  conflictsWith: string[];
  onToggle: () => void;
};

/** One row of the Add classes dialog (both tabs): identity, time, instructor, seats, Add toggle. */
export function AddClassRow({ section, fallback, note, added, busy, disabled, conflictsWith, onToggle }: AddClassRowProps) {
  const code = section ? courseCode(section.subject, section.courseNumber) : fallback ? courseCode(fallback.subject, fallback.courseNumber) : "";
  const seq = section?.sequenceNumber ?? null;
  const name = seq ? `${code} · ${seq}` : fallback ? `${code} (CRN ${fallback.crn})` : code;
  const title = displayTitle(section?.courseTitle ?? fallback?.title) || null;
  const instructor = section ? instructorOf(section) : (fallback?.instructor ?? null);
  const seats = section ? seatSummary(section) : null;

  return (
    <li className={styles.row}>
      <div className={styles.main}>
        <p className={styles.name}>
          <span className={styles.code}>{name}</span>
          {title ? <span className={styles.title}>{title}</span> : null}
        </p>
        <p className={styles.meta}>
          <span className={styles.time}>{section ? meetingSummary(section) : (note ?? "Meeting times unavailable")}</span>
          {instructor ? <span className={styles.instructor}>{instructor}</span> : null}
        </p>
        {conflictsWith.length > 0 && !added ? (
          <p className={styles.conflict}>
            <AlertIcon size={16} />
            overlaps {conflictsWith.join(", ")}
          </p>
        ) : null}
      </div>
      <div className={styles.side}>
        {seats ? <Badge tone={seats.tone}>{seats.text}</Badge> : null}
        {/* A toggle: the visible word shows the state ("Add" / "Added" with a check), the name is
            that word plus sr-only context (WCAG 2.5.3), and aria-pressed carries the state. */}
        <Button
          size="sm"
          variant="secondary"
          aria-pressed={added}
          leadingIcon={added ? <CheckIcon /> : <PlusIcon />}
          loading={busy}
          disabled={disabled && !added}
          onClick={onToggle}
          className={added ? styles.added : undefined}
        >
          {added ? "Added" : "Add"}
          <span className="sr-only"> {name}</span>
        </Button>
      </div>
    </li>
  );
}

/** Three placeholder rows while a search or the tracked list loads. */
export function AddClassRowsSkeleton({ label }: { label: string }) {
  return (
    <SkeletonGroup label={label}>
      <ul className={styles.list}>
        {[0, 1, 2].map((i) => (
          <li key={i} className={styles.row}>
            <div className={styles.main}>
              <Skeleton width="40%" height={14} />
              <Skeleton width="65%" height={12} style={{ marginTop: 8 }} />
            </div>
            <div className={styles.side}>
              <Skeleton width={56} height={22} radius="full" />
              <Skeleton width={64} height={32} radius="md" />
            </div>
          </li>
        ))}
      </ul>
    </SkeletonGroup>
  );
}

export const addClassListClass = styles.list;
