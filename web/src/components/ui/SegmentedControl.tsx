"use client";

import { useId } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./SegmentedControl.module.css";

export type SegmentedOption<T extends string> = {
  value: T;
  label: ReactNode;
  /** 16 px icon before the label. */
  icon?: ReactNode;
};

export type SegmentedControlProps<T extends string> = {
  /** Accessible name of the group, e.g. "Theme". */
  label: string;
  options: SegmentedOption<T>[];
  value: T;
  onChange: (value: T) => void;
  /** Stretch options to fill the width. */
  fullWidth?: boolean;
  className?: string;
};

/**
 * 2–4 mutually exclusive options (spec.md §2.9): a radiogroup of native radios, so arrow keys
 * move and select natively.
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  fullWidth = false,
  className,
}: SegmentedControlProps<T>) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={cn(styles.track, fullWidth && styles.fullWidth, className)}>
      {options.map((option) => (
        <label key={option.value} className={styles.option}>
          <input
            type="radio"
            name={name}
            value={option.value}
            checked={option.value === value}
            onChange={() => onChange(option.value)}
            className={styles.input}
          />
          <span className={styles.face}>
            {option.icon}
            {option.label}
          </span>
        </label>
      ))}
    </div>
  );
}
