/**
 * localStorage that never throws (private mode, blocked storage, SSR). Values are strings;
 * JSON helpers parse defensively and fall back on any error.
 */

export function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    /* storage unavailable: the preference just won't persist */
  }
}

export function readJson<T>(key: string, fallback: T, guard: (value: unknown) => value is T): T {
  const raw = readStorage(key);
  if (raw === null) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    return guard(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

/** localStorage keys used by the UI layer. Keep the old app's names so preferences carry over. */
export const STORAGE_KEYS = {
  theme: "pantherwatch.theme",
  dismissedAnnouncements: "pantherwatch.dismissedAnnouncements",
} as const;
