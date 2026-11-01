"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { FilterIcon } from "@/components/ui/icons";
import { Select } from "@/components/ui/Select";
import { DAY_PATTERNS, type DayPattern, type SectionFilters, type SortKey } from "@/lib/courses/filters";
import styles from "./FiltersPopover.module.css";

const DAY_LABELS: Record<DayPattern, string> = {
  any: "Any",
  MW: "MW",
  TR: "TR",
  MWF: "MWF",
  online: "Online",
  hybrid: "Hybrid",
};
const DAY_NAMES: Partial<Record<DayPattern, string>> = {
  MW: "Monday and Wednesday",
  TR: "Tuesday and Thursday",
  MWF: "Monday, Wednesday and Friday",
};

const SORT_LABELS: Record<SortKey, string> = {
  course: "Course number",
  seats: "Most seats left",
  rating: "Highest rating",
  gpa: "Highest GPA",
  start: "Earliest start time",
};

const RATING_STEPS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];
const GPA_STEPS = [2, 2.5, 3, 3.5, 4];

/** The steps plus `current` when a URL asked for one off the list. */
const withCurrent = (steps: number[], current: number) =>
  current > 0 && !steps.includes(current) ? [...steps, current].sort((a, b) => a - b) : steps;

export type FiltersPopoverProps = {
  filters: SectionFilters;
  onChange: (patch: Partial<SectionFilters>) => void;
  onClear: () => void;
  /** Settings that differ from the defaults (the badge). */
  activeCount: number;
};

/**
 * The results page's "Filters" button and its panel: a `popover="auto"` (top layer, light
 * dismiss, Esc closes and focus returns to the button) holding days/delivery, open seats,
 * honors, minimum rating and GPA, and the sort. Every change applies at once; nothing shows
 * until the button is pressed.
 */
export function FiltersPopover({ filters, onChange, onClear, activeCount }: FiltersPopoverProps) {
  const id = useId();
  const panelId = `${id}-panel`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const position = useCallback(() => {
    const panel = panelRef.current;
    const anchor = triggerRef.current;
    if (!panel || !anchor) return;
    const a = anchor.getBoundingClientRect();
    const p = panel.getBoundingClientRect();
    const gap = 6;
    const roomBelow = window.innerHeight - a.bottom;
    const above = roomBelow < p.height + gap && a.top > roomBelow;
    const top = above ? a.top - p.height - gap : a.bottom + gap;
    const left = Math.min(Math.max(8, a.right - p.width), window.innerWidth - p.width - 8);
    panel.style.top = `${Math.max(8, top)}px`;
    panel.style.left = `${Math.max(8, left)}px`;
    panel.dataset.side = above ? "above" : "below";
  }, []);

  // Follow the button while open (page scroll, resize).
  useEffect(() => {
    if (!isOpen) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(position);
    };
    window.addEventListener("scroll", update, { capture: true, passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
    };
  }, [isOpen, position]);

  const close = () => {
    const panel = panelRef.current;
    if (panel?.matches(":popover-open")) panel.hidePopover();
    triggerRef.current?.focus();
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.trigger}
        popoverTarget={panelId}
        aria-expanded={isOpen}
        aria-controls={panelId}
        aria-label={activeCount > 0 ? `Filters, ${activeCount} active` : "Filters"}
      >
        <FilterIcon size={16} />
        <span>Filters</span>
        {activeCount > 0 ? (
          <span className={styles.badge} aria-hidden="true">
            {activeCount}
          </span>
        ) : null}
      </button>
      <div
        ref={panelRef}
        id={panelId}
        popover="auto"
        role="dialog"
        aria-label="Filters"
        className={styles.panel}
        onToggle={(event) => {
          const open = event.newState === "open";
          setIsOpen(open);
          if (open) {
            position();
            panelRef.current?.querySelector<HTMLElement>("input:checked, input, select, button")?.focus();
          } else if (document.activeElement === document.body || panelRef.current?.contains(document.activeElement)) {
            triggerRef.current?.focus();
          }
        }}
      >
        <fieldset className={styles.group}>
          <legend className={styles.label}>Days</legend>
          <div className={styles.days}>
            {DAY_PATTERNS.map((pattern) => (
              <label key={pattern} className={styles.day}>
                <input
                  type="radio"
                  name={`${id}-days`}
                  value={pattern}
                  checked={filters.days === pattern}
                  onChange={() => onChange({ days: pattern })}
                  className={styles.dayInput}
                />
                <span className={styles.dayFace}>
                  {DAY_LABELS[pattern]}
                  {DAY_NAMES[pattern] ? <span className="sr-only"> ({DAY_NAMES[pattern]})</span> : null}
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        <div className={styles.checks}>
          <label className={styles.check}>
            <input type="checkbox" checked={filters.open} onChange={(event) => onChange({ open: event.target.checked })} />
            Open seats only
          </label>
          <label className={styles.check}>
            <input type="checkbox" checked={filters.honors} onChange={(event) => onChange({ honors: event.target.checked })} />
            Honors only
          </label>
        </div>

        <div className={styles.pair}>
          <div className={styles.field}>
            <label htmlFor={`${id}-rating`} className={styles.label}>
              Minimum rating
            </label>
            <Select
              id={`${id}-rating`}
              value={String(filters.minRating)}
              onChange={(event) => onChange({ minRating: Number(event.target.value) })}
            >
              <option value="0">Any</option>
              {withCurrent(RATING_STEPS, filters.minRating).map((step) => (
                <option key={step} value={String(step)}>
                  {step >= 5 ? "5.0" : `${step.toFixed(1)}+`}
                </option>
              ))}
            </Select>
          </div>
          <div className={styles.field}>
            <label htmlFor={`${id}-gpa`} className={styles.label}>
              Minimum GPA
            </label>
            <Select
              id={`${id}-gpa`}
              value={String(filters.minGpa)}
              onChange={(event) => onChange({ minGpa: Number(event.target.value) })}
            >
              <option value="0">Any</option>
              {withCurrent(GPA_STEPS, filters.minGpa).map((step) => (
                <option key={step} value={String(step)}>
                  {step >= 4 ? "4.0" : `${step.toFixed(1)}+`}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <div className={styles.field}>
          <label htmlFor={`${id}-sort`} className={styles.label}>
            Sort by
          </label>
          <Select id={`${id}-sort`} value={filters.sort} onChange={(event) => onChange({ sort: event.target.value as SortKey })}>
            {(Object.keys(SORT_LABELS) as SortKey[]).map((key) => (
              <option key={key} value={key}>
                {SORT_LABELS[key]}
              </option>
            ))}
          </Select>
        </div>

        <div className={styles.footer}>
          <button type="button" className={styles.clear} onClick={onClear} disabled={activeCount === 0}>
            Clear
          </button>
          <button type="button" className={styles.done} onClick={close}>
            Done
          </button>
        </div>
      </div>
    </>
  );
}
