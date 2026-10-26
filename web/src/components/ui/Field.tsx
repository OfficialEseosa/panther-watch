"use client";

import { createContext, useContext, useId } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { AlertCircleIcon } from "./icons";
import styles from "./Field.module.css";

type FieldContextValue = {
  id: string;
  describedBy: string | undefined;
  invalid: boolean;
  required: boolean;
};

const FieldContext = createContext<FieldContextValue | null>(null);

/**
 * Wiring for a control inside a <Field>: id, aria-describedby, aria-invalid, required.
 * Input/Select/Textarea call this; explicit props on the control win.
 */
export function useFieldControl(props: {
  id?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean | "true" | "false" | "grammar" | "spelling";
  required?: boolean;
  invalid?: boolean;
}) {
  const field = useContext(FieldContext);
  const invalid = props.invalid ?? field?.invalid ?? false;
  return {
    id: props.id ?? field?.id,
    "aria-describedby": cn(field?.describedBy, props["aria-describedby"]) || undefined,
    "aria-invalid": props["aria-invalid"] ?? (invalid || undefined),
    required: props.required ?? (field?.required || undefined),
  };
}

export type FieldProps = {
  label: ReactNode;
  /** Help text under the control. Replaced by `error` when present. */
  hint?: ReactNode;
  /** Error message. Sets aria-invalid on the control and is announced via aria-describedby. */
  error?: ReactNode;
  required?: boolean;
  /** Visually hide the label (it stays the accessible name). */
  hideLabel?: boolean;
  /** Use your own id for the control. */
  id?: string;
  className?: string;
  /** One Input, Select or Textarea (or any control that calls useFieldControl). */
  children: ReactNode;
};

/** Label + control + hint/error (spec.md §2.3). */
export function Field({ label, hint, error, required = false, hideLabel = false, id, className, children }: FieldProps) {
  const autoId = useId();
  const controlId = id ?? `${autoId}-control`;
  const messageId = `${autoId}-message`;
  const hasMessage = Boolean(error || hint);

  return (
    <FieldContext
      value={{
        id: controlId,
        describedBy: hasMessage ? messageId : undefined,
        invalid: Boolean(error),
        required,
      }}
    >
      <div className={cn(styles.field, className)}>
        <label htmlFor={controlId} className={cn(styles.label, hideLabel && "sr-only")}>
          {label}
          {required ? (
            <span className={styles.required} aria-hidden="true">
              {" "}*
            </span>
          ) : null}
        </label>
        {children}
        {error ? (
          <p id={messageId} className={styles.error}>
            <AlertCircleIcon size={16} />
            <span>{error}</span>
          </p>
        ) : hint ? (
          <p id={messageId} className={styles.hint}>
            {hint}
          </p>
        ) : null}
      </div>
    </FieldContext>
  );
}
