"use client";

import { useState } from "react";
import type { AnimationEvent } from "react";
import { cn } from "@/lib/ui/cn";
import { OldIcon } from "./icons";
import styles from "./CourseActions.module.css";

const VIEW_ONLY = "This term is view only. Registration is closed";

/** A brief success pulse when a toggle turns on; cleared on animationend (or a failed toggle). */
function usePulse() {
  const [pulse, setPulse] = useState(false);
  return {
    props: {
      "data-pulse": pulse || undefined,
      onAnimationEnd: (event: AnimationEvent) => {
        if (event.target === event.currentTarget) setPulse(false);
      },
    },
    run: async (turningOn: boolean, toggle: () => Promise<boolean> | void) => {
      if (turningOn) setPulse(true);
      const result = await toggle();
      if (turningOn && result === false) setPulse(false);
    },
  };
}

export type WatchToggleProps = {
  watched: boolean;
  pending?: boolean;
  /** Accessible context, e.g. "CSC 2720 · 003". */
  code: string;
  onToggle: () => Promise<boolean> | void;
  /** View-only term and not watching: shown disabled, as in the original app. */
  disabled?: boolean;
  /** Tooltip for guests ("Sign in to track classes"). */
  hint?: string;
  className?: string;
};

/**
 * The original Watch button: icon + "Watch" / "Watching". aria-pressed carries the state; the
 * accessible name is the visible word plus sr-only context ("Watching CSC 2720 · 003").
 */
export function WatchToggle({ watched, pending = false, code, onToggle, disabled = false, hint, className }: WatchToggleProps) {
  const pulse = usePulse();
  return (
    <button
      type="button"
      className={cn(styles.button, styles.watch, watched && styles.active, className)}
      aria-pressed={watched}
      aria-busy={pending || undefined}
      disabled={disabled}
      title={disabled ? VIEW_ONLY : hint}
      onClick={() => void pulse.run(!watched, onToggle)}
      {...pulse.props}
    >
      <OldIcon key={watched ? "on" : "off"} name={watched ? "watching" : "watch"} className={styles.icon} />
      {watched ? "Watching" : "Watch"}
      <span className="sr-only"> {code}</span>
    </button>
  );
}

export type ScheduleToggleProps = {
  scheduled: boolean;
  pending?: boolean;
  code: string;
  onToggle: () => Promise<boolean> | void;
  /** View-only term: shown disabled with the original tooltip. */
  disabled?: boolean;
  hint?: string;
  className?: string;
};

/** The original calendar icon button: a green check once the section is on the schedule. */
export function ScheduleToggle({ scheduled, pending = false, code, onToggle, disabled = false, hint, className }: ScheduleToggleProps) {
  const pulse = usePulse();
  return (
    <button
      type="button"
      className={cn(styles.button, styles.calendar, scheduled && styles.added, className)}
      aria-pressed={scheduled}
      aria-busy={pending || undefined}
      aria-label={`${scheduled ? "Added" : "Add"} ${code} to schedule`}
      disabled={disabled}
      title={disabled ? VIEW_ONLY : (hint ?? (scheduled ? "On your schedule. Click to remove" : "Add to schedule"))}
      onClick={() => void pulse.run(!scheduled, onToggle)}
      {...pulse.props}
    >
      <OldIcon key={scheduled ? "on" : "off"} name={scheduled ? "check" : "calendar"} className={styles.icon} />
    </button>
  );
}

/** Tracked view: the original red "Remove" button in place of Watch. */
export function RemoveWatchButton({ code, pending = false, onRemove }: { code: string; pending?: boolean; onRemove: () => void }) {
  return (
    <button
      type="button"
      className={cn(styles.button, styles.watch, styles.remove)}
      // Starts with the visible word (WCAG 2.5.3 Label in Name).
      aria-label={`Remove ${code} from tracked classes`}
      aria-busy={pending || undefined}
      disabled={pending}
      onClick={onRemove}
    >
      {pending ? (
        "Saving…"
      ) : (
        <>
          <OldIcon name="remove" /> Remove
        </>
      )}
    </button>
  );
}
