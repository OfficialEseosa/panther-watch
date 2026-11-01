"use client";

import { Chip } from "@/components/ui/Chip";
import styles from "./CourseFocusChips.module.css";

export type FocusCourse = {
  /** URL value, "CSC-4352". */
  key: string;
  /** "CSC 4352" */
  label: string;
  /** Sections of the course that pass the other filters. */
  count: number;
};

export type CourseFocusChipsProps = {
  courses: FocusCourse[];
  /** The focused course's key, or null for all. */
  focus: string | null;
  onChange: (focus: string | null) => void;
};

/**
 * One line of toggle chips above the grid when the results span several courses:
 * "All · CSC 4352 (3) · CSC 4350 (1)". A chip shows only that course; All resets. Scrolls
 * sideways on phones instead of wrapping.
 */
export function CourseFocusChips({ courses, focus, onChange }: CourseFocusChipsProps) {
  return (
    <div role="group" aria-label="Show course" className={styles.row}>
      <Chip pressed={focus === null} className={styles.chip} onClick={() => onChange(null)}>
        All
      </Chip>
      {courses.map((course) => (
        <Chip
          key={course.key}
          pressed={focus === course.key}
          className={styles.chip}
          onClick={() => onChange(focus === course.key ? null : course.key)}
        >
          {course.label} <span className={styles.count}>({course.count})</span>
        </Chip>
      ))}
    </div>
  );
}
