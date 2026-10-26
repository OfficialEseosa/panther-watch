import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { CheckIcon, XIcon } from "./icons";
import styles from "./Chip.module.css";

type ChipBase = {
  icon?: ReactNode;
  className?: string;
  children: ReactNode;
};

export type ChipProps = ChipBase & Omit<ComponentProps<"button">, "children"> & {
  /** Toggle chip (filters): sets aria-pressed; pressed shows a leading check. */
  pressed?: boolean;
};

/** Interactive pill (spec.md §2.10). Toggle form when `pressed` is a boolean. */
export function Chip({ pressed, icon, className, children, type = "button", ...rest }: ChipProps) {
  return (
    <button type={type} aria-pressed={pressed} className={cn(styles.chip, className)} {...rest}>
      {pressed ? <CheckIcon size={16} /> : icon}
      <span className={styles.label}>{children}</span>
    </button>
  );
}

export type ChipLinkProps = ChipBase & Omit<ComponentProps<typeof Link>, "children">;

/** A chip that navigates (e.g. recent searches). */
export function ChipLink({ icon, className, children, ...rest }: ChipLinkProps) {
  return (
    <Link className={cn(styles.chip, className)} {...rest}>
      {icon}
      <span className={styles.label}>{children}</span>
    </Link>
  );
}

export type RemovableChipProps = ChipBase & {
  /** Accessible name for the remove button, e.g. "Remove CSC". */
  removeLabel: string;
  onRemove: () => void;
  disabled?: boolean;
};

/** Selected value with a trailing remove button (e.g. chosen subjects). */
export function RemovableChip({ icon, className, children, removeLabel, onRemove, disabled }: RemovableChipProps) {
  return (
    <span className={cn(styles.chip, styles.removable, className)}>
      {icon}
      <span className={styles.label}>{children}</span>
      <button
        type="button"
        className={styles.remove}
        aria-label={removeLabel}
        onClick={onRemove}
        disabled={disabled}
      >
        <XIcon size={16} />
      </button>
    </span>
  );
}
