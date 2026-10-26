"use client";

import { useState } from "react";
import type { AnimationEvent } from "react";
import { Button } from "@/components/ui/Button";
import { IconButton } from "@/components/ui/IconButton";
import { CalendarPlusIcon, CheckIcon, EyeIcon, TrashIcon } from "@/components/ui/icons";
import { cn } from "@/lib/ui/cn";
import styles from "./CourseActions.module.css";

/** Plays the success pulse once (motion.md §4.10): set on a user "turn on", cleared on animationend. */
function usePulse() {
  const [pulse, setPulse] = useState(0);
  return {
    pulse: pulse > 0,
    trigger: () => setPulse((n) => n + 1),
    clear: () => setPulse(0),
  };
}

export type WatchToggleProps = {
  watched: boolean;
  pending?: boolean;
  /** Accessible context, e.g. "CSC 2720 · 003". */
  code: string;
  onToggle: () => Promise<boolean> | void;
  /** Icon-only form (narrow cards). */
  compact?: boolean;
  className?: string;
};

/**
 * Watch toggle (spec.md §2.6): Button sm secondary with aria-pressed. The visible label shows the
 * state ("Watch" / "Watching" with a check), and the accessible name is that label plus sr-only
 * context ("Watching CSC 2720 · 003"), so the name always contains the visible text (WCAG 2.5.3).
 * aria-pressed carries the state for screen readers.
 */
export function WatchToggle({ watched, pending = false, code, onToggle, compact = false, className }: WatchToggleProps) {
  const { pulse, trigger, clear } = usePulse();
  const icon = watched ? <CheckIcon key="on" className={styles.icon} /> : <EyeIcon key="off" />;
  const word = watched ? "Watching" : "Watch";
  const handle = async () => {
    const turningOn = !watched;
    if (turningOn) trigger();
    const result = await onToggle();
    if (turningOn && result === false) clear();
  };
  const common = {
    "data-pulse": pulse || undefined,
    onAnimationEnd: (event: AnimationEvent) => {
      if (event.target === event.currentTarget) clear();
    },
  };
  if (compact) {
    return (
      <IconButton
        size="sm"
        variant="outline"
        icon={icon}
        pressed={watched}
        aria-busy={pending || undefined}
        label={`${word} ${code}`}
        className={cn(styles.toggle, className)}
        onClick={handle}
        {...common}
      />
    );
  }
  return (
    <Button
      size="sm"
      variant="secondary"
      aria-pressed={watched}
      aria-busy={pending || undefined}
      leadingIcon={icon}
      className={cn(styles.toggle, className)}
      onClick={handle}
      {...common}
    >
      {word}
      <span className="sr-only"> {code}</span>
    </Button>
  );
}

export type ScheduleToggleProps = {
  scheduled: boolean;
  pending?: boolean;
  code: string;
  onToggle: () => Promise<boolean> | void;
  /** Icon-only form (narrow cards). */
  compact?: boolean;
  className?: string;
};

/**
 * Add to / remove from schedule (spec.md §2.6), toggle form with aria-pressed. The visible label
 * shows the state ("Add" / "Added" with a check); the accessible name is that label plus sr-only
 * context ("Added CSC 2720 · 003 to schedule").
 */
export function ScheduleToggle({ scheduled, pending = false, code, onToggle, compact = false, className }: ScheduleToggleProps) {
  const { pulse, trigger, clear } = usePulse();
  const word = scheduled ? "Added" : "Add";
  const icon = scheduled ? <CheckIcon key="on" className={styles.icon} /> : <CalendarPlusIcon key="off" />;
  const common = {
    "aria-busy": pending || undefined,
    className: cn(styles.toggle, className),
    "data-pulse": pulse || undefined,
    onAnimationEnd: (event: AnimationEvent) => {
      if (event.target === event.currentTarget) clear();
    },
    onClick: async () => {
      const turningOn = !scheduled;
      if (turningOn) trigger();
      const result = await onToggle();
      if (turningOn && result === false) clear();
    },
  };
  if (compact) {
    return <IconButton size="sm" variant="outline" pressed={scheduled} icon={icon} label={`${word} ${code} to schedule`} {...common} />;
  }
  return (
    <Button size="sm" variant="secondary" aria-pressed={scheduled} leadingIcon={icon} {...common}>
      {word}
      <span className="sr-only"> {code} to schedule</span>
    </Button>
  );
}

/** Tracked view: replaces Watch (spec.md §2.6). */
export function RemoveWatchButton({
  code,
  pending = false,
  onRemove,
  compact = false,
}: {
  code: string;
  pending?: boolean;
  onRemove: () => void;
  compact?: boolean;
}) {
  if (compact) {
    return (
      <IconButton
        size="sm"
        variant="danger-ghost"
        icon={<TrashIcon />}
        label={`Remove ${code} from tracked classes`}
        loading={pending}
        onClick={onRemove}
      />
    );
  }
  return (
    <Button
      size="sm"
      variant="danger-ghost"
      leadingIcon={<TrashIcon />}
      loading={pending}
      // Starts with the visible word (WCAG 2.5.3 Label in Name).
      aria-label={`Remove ${code} from tracked classes`}
      onClick={onRemove}
    >
      Remove
    </Button>
  );
}
