"use client";

import { useSyncExternalStore } from "react";
import { readStorage, writeStorage } from "@/lib/ui/storage";

/** localStorage keys owned by the course pages. */
export const COURSE_STORAGE_KEYS = {
  preferredTerm: "pantherwatch.preferredTerm",
  preferredLevel: "pantherwatch.preferredLevel",
} as const;

const LOCAL_EVENT = "pantherwatch:storage";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(LOCAL_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(LOCAL_EVENT, onChange);
  };
}

/**
 * A localStorage value as external state: null during SSR and hydration (so markup never
 * depends on it on first paint), then the stored string. Updates across tabs and after
 * `writeStored` in this tab.
 */
export function useStoredValue(key: string): string | null {
  return useSyncExternalStore(
    subscribe,
    () => readStorage(key),
    () => null,
  );
}

/** Writes a value and notifies `useStoredValue` readers in this tab. */
export function writeStored(key: string, value: string | null): void {
  writeStorage(key, value);
  window.dispatchEvent(new Event(LOCAL_EVENT));
}
