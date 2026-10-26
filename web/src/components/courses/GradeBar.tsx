import type { CSSProperties } from "react";
import type { GradeKey } from "@/lib/course-meta/grades/types";
import { cn } from "@/lib/ui/cn";
import { coarseGrades } from "./format";
import styles from "./GradeBar.module.css";

export type GradeBarProps = {
  gradeCounts: Partial<Record<GradeKey, number>> | null | undefined;
  /** 8 px (cards, tables) or 12 px (detail view). */
  size?: "sm" | "lg";
  /** Letter + percentage legend under the bar. */
  legend?: boolean;
  className?: string;
};

/**
 * Stacked A-F share bar (spec.md §2.22). role="img" with the shares in its label, so the
 * colors are never the only carrier. Renders nothing when there are no graded students.
 */
export function GradeBar({ gradeCounts, size = "sm", legend = false, className }: GradeBarProps) {
  const buckets = coarseGrades(gradeCounts);
  if (buckets.length === 0) return null;
  const label = `Grades: ${buckets.map((b) => `${b.key} ${Math.round(b.percent)}%`).join(", ")}`;
  return (
    <div className={cn(styles.root, className)}>
      <div className={cn(styles.bar, styles[size])} role="img" aria-label={label}>
        {buckets.map((b) =>
          b.count > 0 ? (
            <span
              key={b.key}
              className={styles.segment}
              data-grade={b.key}
              style={{ "--_share": b.percent } as CSSProperties}
            />
          ) : null,
        )}
      </div>
      {legend ? (
        <ul className={styles.legend} aria-hidden="true">
          {buckets.map((b) => (
            <li key={b.key} className={styles.legendItem}>
              <span className={styles.swatch} data-grade={b.key} />
              {b.key} {Math.round(b.percent)}%
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
