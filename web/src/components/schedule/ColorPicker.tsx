"use client";

import { useId } from "react";
import type { CSSProperties } from "react";
import { CheckIcon } from "@/components/ui/icons";
import { SCHEDULE_COLORS } from "@/lib/schedule/colors";
import styles from "./ColorPicker.module.css";

export type ColorPickerProps = {
  /** Accessible name of the group. */
  label: string;
  value: number;
  onChange: (colorIndex: number) => void;
  disabled?: boolean;
};

/** Schedule color: a radiogroup of the 8 palette swatches (native radios, arrow keys). */
export function ColorPicker({ label, value, onChange, disabled }: ColorPickerProps) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={styles.group}>
      {SCHEDULE_COLORS.map((color, index) => (
        <label key={color.id} className={styles.option} style={{ "--_swatch": `var(--sched-${color.id})` } as CSSProperties}>
          <input
            type="radio"
            name={name}
            value={index}
            checked={index === value}
            disabled={disabled}
            onChange={() => onChange(index)}
            className={styles.input}
          />
          <span className={styles.swatch} aria-hidden="true">
            {index === value ? <CheckIcon size={16} strokeWidth={2.5} /> : null}
          </span>
          <span className="sr-only">{color.label}</span>
        </label>
      ))}
    </div>
  );
}
