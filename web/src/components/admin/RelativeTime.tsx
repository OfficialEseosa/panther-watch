"use client";

import { useSyncExternalStore } from "react";
import { formatDateTime, formatDateTimeFull, formatRelative } from "./format";

const MINUTE = 60_000;
let now = Date.now();
const listeners = new Set<() => void>();
let timer: number | undefined;

function subscribe(listener: () => void) {
  listeners.add(listener);
  if (timer === undefined) {
    now = Date.now();
    timer = window.setInterval(() => {
      now = Date.now();
      listeners.forEach((fn) => fn());
    }, MINUTE);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      window.clearInterval(timer);
      timer = undefined;
    }
  };
}

/** A minute-resolution clock shared by every RelativeTime; null during SSR/hydration. */
function useNow(): number | null {
  return useSyncExternalStore(
    subscribe,
    () => now,
    () => null,
  );
}

/**
 * "3 minutes ago" with the full date in a tooltip. Server and hydration render the absolute
 * ET date (deterministic), then the client switches to relative text. The text changes every
 * minute, so never render it inside a live region.
 */
export function RelativeTime({ value, className }: { value: string; className?: string }) {
  const current = useNow();
  const full = formatDateTimeFull(value);
  return (
    <time dateTime={value} title={full} className={className}>
      {current === null ? formatDateTime(value) : formatRelative(value, current)}
    </time>
  );
}
