import type { CSSProperties, ReactNode } from "react";
import { formatNumber, shouldCountUp } from "@/lib/format";
import { cn } from "@/lib/ui/cn";
import { Skeleton, SkeletonGroup } from "./Skeleton";
import styles from "./Stat.module.css";

export type StatProps = {
  label: string;
  /** A number (formatted, counts up when 10–999), preformatted text, or null: unknown (an en dash, read as "Not available"). */
  value: number | string | null;
  helper?: ReactNode;
  /** 20 px icon, top right, decorative. */
  icon?: ReactNode;
  /** "success" marks a positive value with a dot and the success color (status is never color alone). */
  tone?: "default" | "success";
  /** Extra content under the helper (e.g. a budget bar). */
  children?: ReactNode;
  className?: string;
};

/**
 * Number tile (spec.md §2.19), used by the dashboard and Admin › Overview. Integers 10–999 count
 * up in pure CSS (a registered integer property and a counter, motion.md §4.14), so it needs no
 * hydration and starts when the tile streams in. Screen readers read the sr-only value; the
 * animated counter has empty alt text.
 */
export function Stat({ label, value, helper, icon, tone = "default", children, className }: StatProps) {
  const text = typeof value === "number" ? formatNumber(value) : value;
  return (
    <div className={cn(styles.stat, className)} data-tone={tone} data-testid="stat">
      <div className={styles.top}>
        <p className={styles.label}>{label}</p>
        {icon ? (
          <span className={styles.icon} aria-hidden="true">
            {icon}
          </span>
        ) : null}
      </div>
      <p className={styles.value}>
        {text === null ? (
          <>
            <span className="sr-only">Not available</span>
            <span aria-hidden="true">&ndash;</span>
          </>
        ) : (
          <>
            {tone === "success" && typeof value === "number" && value > 0 ? (
              <span className={styles.dot} aria-hidden="true" />
            ) : null}
            <span className="sr-only">{text}</span>
            {shouldCountUp(typeof value === "number" ? value : null) ? (
              <span aria-hidden="true" className={styles.countUp} style={{ "--_to": value } as CSSProperties} />
            ) : (
              <span aria-hidden="true">{text}</span>
            )}
          </>
        )}
      </p>
      {helper ? <p className={styles.helper}>{helper}</p> : null}
      {children}
    </div>
  );
}

/** Same box as Stat: label 40 %, value 50 % × 32, helper line. */
export function StatSkeleton({ helper = true }: { helper?: boolean }) {
  return (
    <SkeletonGroup label="Loading" className={styles.stat}>
      <div className={styles.top}>
        <Skeleton width="40%" height={12} />
      </div>
      <div className={styles.value}>
        <Skeleton width="50%" height={32} radius="sm" />
      </div>
      {helper ? (
        <p className={styles.helper}>
          <Skeleton width="75%" height={12} />
        </p>
      ) : null}
    </SkeletonGroup>
  );
}
