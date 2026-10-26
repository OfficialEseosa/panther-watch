import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./PageHeader.module.css";

export type PageHeaderProps = {
  /** The page's one h1. */
  title: ReactNode;
  /** One line under the title (max 60ch). */
  description?: ReactNode;
  /** At most two Buttons (md), primary rightmost. Wrap below the text at < 640 px. */
  actions?: ReactNode;
  /** Inline Banner, TabNav or filter bar under the header. */
  children?: ReactNode;
  className?: string;
};

/** Page header (spec.md §3.3). Gap to content is built in (--space-6). */
export function PageHeader({ title, description, actions, children, className }: PageHeaderProps) {
  return (
    <header className={cn(styles.header, className)}>
      <div className={styles.top}>
        <div className={styles.text}>
          <h1 className={styles.title}>{title}</h1>
          {description ? <p className={styles.description}>{description}</p> : null}
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {children ? <div className={styles.extra}>{children}</div> : null}
    </header>
  );
}
