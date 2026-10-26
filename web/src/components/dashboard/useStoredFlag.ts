"use client";

import { useCallback, useSyncExternalStore } from "react";
import { readStorage, writeStorage } from "@/lib/ui/storage";

/** localStorage keys owned by the dashboard. */
export const DASHBOARD_KEYS = {
  whatsNew: (version: string) => `pantherwatch.whatsNew.${version}`,
} as const;

const listeners = new Set<() => void>();
// Used when storage is unavailable (private mode, blocked): the flag still holds for this page.
const memory = new Map<string, boolean>();

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  window.addEventListener("storage", onChange);
  return () => {
    listeners.delete(onChange);
    window.removeEventListener("storage", onChange);
  };
}

/**
 * A boolean stored as "1" in localStorage. Returns null during SSR and hydration (unknown), so
 * anything gated on it renders nothing on the server and appears after hydration instead of
 * flashing. Syncs across tabs via the `storage` event.
 */
export function useStoredFlag(key: string): [boolean | null, (value: boolean) => void] {
  const value = useSyncExternalStore(
    subscribe,
    () => memory.get(key) ?? readStorage(key) === "1",
    () => null,
  );
  const set = useCallback(
    (next: boolean) => {
      memory.set(key, next);
      writeStorage(key, next ? "1" : null);
      for (const listener of listeners) listener();
    },
    [key],
  );
  return [value, set];
}
