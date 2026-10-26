import type { CSSProperties } from "react";
import type { GradeKey } from "@/lib/course-meta/grades/types";
import { cn } from "@/lib/ui/cn";
import { coarseGrades } from "./format";
import styles from "./GradeBar.module.css";

export type GradeBarProps = {
  gradeCounts: Partial<Record<GradeKey, number>> | null | undefined;
  /** Bar height in px: 8 on the card, 12 in the detail view, 7 in the professor table. */
  height?: number;
  /** Letter + percentage legend under the bar. */
  legend?: boolean;
  className?: string;
};

/**
 * The original stacked A-F distribution bar (old CourseGrades/GradeBar). role="img" with the
 * shares in its label, so the colors are never the only carrier. Nothing when nothing was graded.
 */
export function GradeBar({ gradeCounts, height = 8, legend = false, className }: GradeBarProps) {
  const buckets = coarseGrades(gradeCounts);
  if (buckets.length === 0) return null;
  const label = `Grades: ${buckets.map((b) => `${b.key} ${Math.round(b.percent)}%`).join(", ")}`;
  return (
    <div className={cn(styles.root, className)}>
      <div className={styles.bar} style={{ height }} role="img" aria-label={label}>
        {buckets.map((b) =>
          b.count > 0 ? (
            <span
              key={b.key}
              className={styles.segment}
              data-grade={b.key}
              title={`${b.key}: ${b.count} (${b.percent.toFixed(0)}%)`}
              style={{ "--_share": `${b.percent}%` } as CSSProperties}
            />
          ) : null,
        )}
      </div>
      {legend ? (
        <ul className={styles.legend} aria-hidden="true">
          {buckets.map((b) => (
            <li key={b.key} className={styles.legendItem}>
              <span className={styles.dot} data-grade={b.key} />
              {b.key} {Math.round(b.percent)}%
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
