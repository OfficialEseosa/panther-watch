import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./Skeleton.module.css";

export type SkeletonProps = {
  /** CSS length or a number of px. Default 100%. */
  width?: number | string;
  /** CSS length or a number of px. Default 12 (a text line). */
  height?: number | string;
  /** Radius token name. Default "xs". */
  radius?: "xs" | "sm" | "md" | "lg" | "full";
  className?: string;
  style?: CSSProperties;
};

const px = (value: number | string) => (typeof value === "number" ? `${value}px` : value);

/** One placeholder bar (spec.md §2.12). Put bars inside a SkeletonGroup for the shimmer. */
export function Skeleton({ width = "100%", height = 12, radius = "xs", className, style }: SkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={cn(styles.bar, className)}
      style={{ width: px(width), height: px(height), borderRadius: `var(--radius-${radius})`, ...style }}
    />
  );
}

export type SkeletonGroupProps = {
  /** Announced once to screen readers, e.g. "Loading tracked classes". */
  label: string;
  className?: string;
  children: ReactNode;
};

/**
 * The shimmer unit (motion.md §4.7): one card, one stat or one row. Hidden for the first
 * 150 ms so fast responses never flash it. Sets aria-busy and an sr-only "Loading…" label.
 */
export function SkeletonGroup({ label, className, children }: SkeletonGroupProps) {
  return (
    <div className={cn(styles.group, className)} aria-busy="true">
      <span className="sr-only">{label}…</span>
      {children}
    </div>
  );
}
