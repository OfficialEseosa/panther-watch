import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { AlertCircleIcon, AlertIcon, CheckCircleIcon, InfoIcon } from "./icons";
import styles from "./Banner.module.css";

export type BannerTone = "info" | "success" | "warning" | "danger";

export type BannerProps = {
  tone?: BannerTone;
  /** Optional bold lead-in. */
  title?: ReactNode;
  children?: ReactNode;
  /** One Button `sm` at the end. */
  action?: ReactNode;
  /** Override the tone icon. */
  icon?: ReactNode;
  /** role="alert" for errors that appear after an action. Default: no live region. */
  role?: "alert" | "status";
  className?: string;
};

const TONE_ICON: Record<BannerTone, ReactNode> = {
  info: <InfoIcon />,
  success: <CheckCircleIcon />,
  warning: <AlertIcon />,
  danger: <AlertCircleIcon />,
};

/** Inline page notice (spec.md §2.14): guest mode, view-only term, partial outage, errors. */
export function Banner({ tone = "info", title, children, action, icon, role, className }: BannerProps) {
  return (
    <div className={cn(styles.banner, styles[tone], className)} role={role}>
      <span className={styles.icon} aria-hidden="true">
        {icon ?? TONE_ICON[tone]}
      </span>
      <div className={styles.content}>
        {title ? <p className={styles.title}>{title}</p> : null}
        {children ? <div className={styles.body}>{children}</div> : null}
      </div>
      {action ? <div className={styles.action}>{action}</div> : null}
    </div>
  );
}
