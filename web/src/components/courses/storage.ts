"use client";

import { useSyncExternalStore } from "react";
import { readStorage, writeStorage } from "@/lib/ui/storage";
import { resultsHref } from "./params";

/** localStorage keys owned by the course pages. */
export const COURSE_STORAGE_KEYS = {
  preferredTerm: "pantherwatch.preferredTerm",
  preferredLevel: "pantherwatch.preferredLevel",
  recentSearches: "pantherwatch.recentSearches",
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

export type RecentSearch = {
  term: string;
  termLabel: string;
  subjects: string[];
  courseNumber: string | null;
  level: string | null;
};

const RECENT_MAX = 5;

export function isRecentSearch(value: unknown): value is RecentSearch {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.term === "string" &&
    typeof v.termLabel === "string" &&
    Array.isArray(v.subjects) &&
    v.subjects.every((s) => typeof s === "string") &&
    (v.courseNumber === null || typeof v.courseNumber === "string") &&
    (v.level === null || typeof v.level === "string")
  );
}

export function parseRecent(raw: string | null): RecentSearch[] {
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(isRecentSearch).slice(0, RECENT_MAX) : [];
  } catch {
    return [];
  }
}

/** Puts `search` first, drops duplicates, keeps 5. */
export function rememberSearch(search: RecentSearch): void {
  const href = resultsHref(search);
  const list = parseRecent(readStorage(COURSE_STORAGE_KEYS.recentSearches)).filter((item) => resultsHref(item) !== href);
  writeStored(COURSE_STORAGE_KEYS.recentSearches, JSON.stringify([search, ...list].slice(0, RECENT_MAX)));
}
