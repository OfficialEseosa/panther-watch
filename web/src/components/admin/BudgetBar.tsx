import type { CSSProperties } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./BudgetBar.module.css";

export type BudgetBarProps = {
  used: number;
  limit: number;
  /** Visible caption, e.g. "38 of 100 today". */
  caption: string;
};

/** A thin used-vs-limit bar for a Stat tile. Decorative: the caption carries the numbers. */
export function BudgetBar({ used, limit, caption }: BudgetBarProps) {
  const share = limit > 0 ? Math.min(1, Math.max(0, used / limit)) : 0;
  const tone = share >= 0.9 ? styles.danger : share >= 0.7 ? styles.warning : styles.ok;
  return (
    <div className={styles.budget}>
      <span className={styles.track} aria-hidden="true">
        <span className={cn(styles.fill, tone)} style={{ "--_share": share } as CSSProperties} />
      </span>
      <span className={styles.caption}>{caption}</span>
    </div>
  );
}
