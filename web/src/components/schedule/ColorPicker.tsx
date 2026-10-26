"use client";

import { useId } from "react";
import { CheckIcon } from "@/components/ui/icons";
import { SCHEDULE_COLORS } from "@/lib/schedule/colors";
import { blockColors } from "./format";
import styles from "./ColorPicker.module.css";

export type ColorPickerProps = {
  /** Accessible name of the group. */
  label: string;
  value: number;
  onChange: (colorIndex: number) => void;
  disabled?: boolean;
};

/**
 * Calendar color: the old round swatches (ExpandedCourseCard .exp-color-swatch), built on
 * native radios so arrow keys and screen readers work.
 */
export function ColorPicker({ label, value, onChange, disabled }: ColorPickerProps) {
  const name = useId();
  return (
    <div role="radiogroup" aria-label={label} className={styles.row}>
      <span className={styles.label} aria-hidden="true">
        Calendar color
      </span>
      {SCHEDULE_COLORS.map((color, index) => (
        <label key={color.id} className={styles.option} title={color.label}>
          <input
            type="radio"
            name={name}
            value={index}
            checked={index === value}
            disabled={disabled}
            onChange={() => onChange(index)}
            className={styles.input}
          />
          <span className={styles.swatch} style={blockColors(index)} aria-hidden="true">
            {index === value ? <CheckIcon size={12} strokeWidth={3} /> : null}
          </span>
          <span className="sr-only">{color.label}</span>
        </label>
      ))}
    </div>
  );
}
