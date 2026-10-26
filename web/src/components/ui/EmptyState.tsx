import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { AlertCircleIcon } from "./icons";
import styles from "./EmptyState.module.css";

export type EmptyStateProps = {
  /** "first-use" (no data yet), "no-results" (filters exclude everything), "error". */
  variant?: "first-use" | "no-results" | "error";
  /** 24 px icon. Defaults to an alert icon for the error variant. */
  icon?: ReactNode;
  title: ReactNode;
  /** At most two sentences. */
  children?: ReactNode;
  /** At most two buttons, primary first. */
  actions?: ReactNode;
  /** Error code / digest shown in a <details> disclosure (error variant). Never an Error object. */
  details?: string;
  /** Heading level. Default h2 (h1 when the empty state is the whole page). */
  headingAs?: "h1" | "h2" | "h3";
  className?: string;
};

/** Centered empty / error placeholder (spec.md §2.13). error.tsx boundaries render this. */
export function EmptyState({
  variant = "first-use",
  icon,
  title,
  children,
  actions,
  details,
  headingAs: Heading = "h2",
  className,
}: EmptyStateProps) {
  const glyph = icon ?? (variant === "error" ? <AlertCircleIcon size={24} /> : null);
  return (
    <div className={cn(styles.root, className)} data-variant={variant}>
      {glyph ? (
        <span className={cn(styles.icon, variant === "error" && styles.iconError)} aria-hidden="true">
          {glyph}
        </span>
      ) : null}
      <Heading className={styles.title}>{title}</Heading>
      {children ? <div className={styles.body}>{children}</div> : null}
      {actions ? <div className={styles.actions}>{actions}</div> : null}
      {details ? (
        <details className={styles.details}>
          <summary>Details</summary>
          <code>{details}</code>
        </details>
      ) : null}
    </div>
  );
}
