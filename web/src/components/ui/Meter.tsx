import type { CSSProperties } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./Meter.module.css";

export type SeatStatus = "open" | "low" | "full" | "unknown";

/**
 * Seat status from counts (spec.md §2.6): available 0 -> full; available <= 20% of capacity ->
 * low; else open. Missing/invalid capacity -> unknown.
 */
export function seatStatus(available: number | null | undefined, capacity: number | null | undefined): SeatStatus {
  if (available == null || capacity == null || !Number.isFinite(available) || !Number.isFinite(capacity) || capacity <= 0) {
    return "unknown";
  }
  if (available <= 0) return "full";
  if (available <= capacity * 0.2) return "low";
  return "open";
}

export type MeterProps = {
  /** Seats taken. */
  enrolled?: number | null;
  /** Total seats. */
  capacity?: number | null;
  /** Seats open. Derived from capacity − enrolled when omitted. */
  available?: number | null;
  /** Waitlist line ("Waitlist 4 of 10"), shown only when waitCapacity > 0. */
  waitCount?: number | null;
  waitCapacity?: number | null;
  /** "md" (6 px track, cards), "lg" (10 px, detail dialog), "sm" (compact rows: status word only). */
  size?: "sm" | "md" | "lg";
  /** Card index, so the fill follows the card stagger (motion.md §4.9). */
  index?: number;
  className?: string;
};

const STATUS_CLASS: Record<SeatStatus, string | undefined> = {
  open: styles.open,
  low: styles.low,
  full: styles.full,
  unknown: undefined,
};

/**
 * Enrollment meter (spec.md §2.6): a track + fill (aria-hidden) and a text label that carries
 * the meaning ("12 open · 28/40", "Full · 40/40", "Seats unknown"). Color is never the only signal.
 */
export function Meter({
  enrolled,
  capacity,
  available,
  waitCount,
  waitCapacity,
  size = "md",
  index,
  className,
}: MeterProps) {
  const cap = capacity ?? null;
  const taken = enrolled ?? (cap != null && available != null ? cap - available : null);
  const open = available ?? (cap != null && taken != null ? cap - taken : null);
  const status = seatStatus(open, cap);
  const fill = status === "unknown" || cap == null || taken == null ? 0 : Math.min(1, Math.max(0, taken / cap));

  const word = status === "unknown" ? "Seats unknown" : status === "full" ? "Full" : `${open} open`;
  const counts = status === "unknown" ? null : `${taken}/${cap}`;
  const waitFull = waitCapacity != null && waitCount != null && waitCount >= waitCapacity;

  return (
    <div className={cn(styles.root, styles[size], className)}>
      <div className={styles.row}>
        <span className={styles.track} aria-hidden="true">
          {status !== "unknown" ? (
            <span
              className={cn(styles.fill, STATUS_CLASS[status])}
              style={{ "--_fill": fill, "--i": index ?? 0 } as CSSProperties}
            />
          ) : null}
        </span>
        <span className={styles.label}>
          <span className={cn(styles.word, STATUS_CLASS[status])}>{word}</span>
          {counts && size !== "sm" ? <span className={styles.counts}> · {counts}</span> : null}
        </span>
      </div>
      {waitCapacity != null && waitCapacity > 0 && size !== "sm" ? (
        <p className={cn(styles.wait, waitFull && styles.waitFull)}>
          Waitlist {waitCount ?? 0} of {waitCapacity}
        </p>
      ) : null}
    </div>
  );
}
