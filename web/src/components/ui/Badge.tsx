import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./Badge.module.css";

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger";

export type BadgeProps = ComponentProps<"span"> & {
  tone?: Tone;
  /** 12 px leading icon, e.g. `<AlertIcon />`. */
  icon?: ReactNode;
};

/** Non-interactive status label (spec.md §2.10). Tabular numerals. */
export function Badge({ tone = "neutral", icon, className, children, ...rest }: BadgeProps) {
  return (
    <span className={cn(styles.badge, styles[tone], className)} {...rest}>
      {icon}
      {children}
    </span>
  );
}
