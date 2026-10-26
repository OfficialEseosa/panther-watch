"use client";

import type { ComponentProps, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { ChevronDownIcon } from "./icons";
import { useFieldControl } from "./Field";
import styles from "./Input.module.css";

type ControlExtras = {
  /** Error styling without a Field (inside a Field, the Field's `error` sets this). */
  invalid?: boolean;
};

export type InputProps = ComponentProps<"input"> &
  ControlExtras & {
    /** Decorative icon inside the left edge, e.g. `<SearchIcon />`. */
    leadingIcon?: ReactNode;
  };

/** Text-like input (spec.md §2.3). Pass `ref` directly (React 19). */
export function Input({ invalid, leadingIcon, className, id, required, ...rest }: InputProps) {
  const wiring = useFieldControl({
    id,
    required,
    invalid,
    "aria-describedby": rest["aria-describedby"],
    "aria-invalid": rest["aria-invalid"],
  });
  const input = (
    <input {...rest} {...wiring} className={cn(styles.control, leadingIcon ? styles.withIcon : undefined, className)} />
  );
  if (!leadingIcon) return input;
  return (
    <span className={styles.wrap}>
      <span className={styles.leading} aria-hidden="true">
        {leadingIcon}
      </span>
      {input}
    </span>
  );
}

export type SelectProps = ComponentProps<"select"> & ControlExtras;

/** Native <select> with a chevron (keeps native mobile pickers). */
export function Select({ invalid, className, id, required, children, ...rest }: SelectProps) {
  const wiring = useFieldControl({
    id,
    required,
    invalid,
    "aria-describedby": rest["aria-describedby"],
    "aria-invalid": rest["aria-invalid"],
  });
  return (
    <span className={styles.wrap}>
      <select {...rest} {...wiring} className={cn(styles.control, styles.select, className)}>
        {children}
      </select>
      <span className={styles.chevron} aria-hidden="true">
        <ChevronDownIcon size={16} />
      </span>
    </span>
  );
}

export type TextareaProps = ComponentProps<"textarea"> & ControlExtras;

/** Multi-line input: min-height 120, vertical resize. */
export function Textarea({ invalid, className, id, required, ...rest }: TextareaProps) {
  const wiring = useFieldControl({
    id,
    required,
    invalid,
    "aria-describedby": rest["aria-describedby"],
    "aria-invalid": rest["aria-invalid"],
  });
  return <textarea {...rest} {...wiring} className={cn(styles.control, styles.textarea, className)} />;
}
