"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useMediaQuery } from "@/lib/ui/hooks";
import { readStorage, writeStorage } from "@/lib/ui/storage";

export type ScheduleView = "week" | "agenda";

/** pages.md §6: the user's Week/Agenda choice, remembered per browser. */
export const SCHEDULE_VIEW_KEY = "pantherwatch.scheduleView";

const listeners = new Set<() => void>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  const onStorage = (event: StorageEvent) => {
    if (event.key === SCHEDULE_VIEW_KEY) onChange();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onStorage);
  };
}

function readView(): ScheduleView | null {
  const value = readStorage(SCHEDULE_VIEW_KEY);
  return value === "week" || value === "agenda" ? value : null;
}

/**
 * Week is the default at >= 640 px and Agenda below; an explicit choice wins and is stored.
 * During SSR and hydration the server value ("week") is used so the markup matches.
 */
export function useScheduleView(): [ScheduleView, (view: ScheduleView) => void] {
  const wide = useMediaQuery("(min-width: 640px)", true);
  const stored = useSyncExternalStore(subscribe, readView, () => null);
  const setView = useCallback((view: ScheduleView) => {
    writeStorage(SCHEDULE_VIEW_KEY, view);
    for (const listener of listeners) listener();
  }, []);
  return [stored ?? (wide ? "week" : "agenda"), setView];
}
