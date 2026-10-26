"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { flushSync } from "react-dom";
import { withViewTransition } from "@/lib/ui/motion";
import { readStorage, STORAGE_KEYS, writeStorage } from "@/lib/ui/storage";

export type ThemePreference = "system" | "light" | "dark";
export type ResolvedTheme = "light" | "dark";

type ThemeContextValue = {
  /** What the user picked. "system" follows the OS. */
  preference: ThemePreference;
  /** The theme actually on <html data-theme>. "light" during SSR. */
  resolved: ResolvedTheme;
  setPreference: (next: ThemePreference) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

const DARK_QUERY = "(prefers-color-scheme: dark)";
const CHANGE_EVENT = "pantherwatch:theme";

function readPreference(): ThemePreference {
  const stored = readStorage(STORAGE_KEYS.theme);
  return stored === "light" || stored === "dark" ? stored : "system";
}

function systemTheme(): ResolvedTheme {
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light";
}

function resolve(preference: ThemePreference): ResolvedTheme {
  return preference === "system" ? systemTheme() : preference;
}

function readResolved(): ResolvedTheme {
  return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

function subscribe(onChange: () => void) {
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/** Keeps <meta name="theme-color"> (both media variants) in step with the app's theme. */
function syncThemeColor() {
  const surface = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim();
  if (!surface) return;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((meta) => {
    meta.content = surface;
  });
}

/**
 * Applies a theme to <html data-theme>, crossfading with a View Transition when available
 * (motion.md §4.12). Component transitions are suppressed for two frames so the swap is
 * clean; reduced motion or no VT support is an instant swap.
 */
function applyTheme(next: ResolvedTheme) {
  const root = document.documentElement;
  if (root.dataset.theme === next) return;
  root.dataset.themeSwitching = "";
  const commit = () => {
    root.dataset.theme = next;
    syncThemeColor();
    flushSync(() => {
      window.dispatchEvent(new Event(CHANGE_EVENT));
    });
  };
  void withViewTransition("theme", commit).finally(() => {
    requestAnimationFrame(() => requestAnimationFrame(() => delete root.dataset.themeSwitching));
  });
}

/**
 * Theme state for the whole app. The pre-paint script in app/layout.tsx has already set
 * data-theme before first paint; this provider only reacts to user and OS changes, so it never
 * rewrites the theme during hydration (no flash).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const preference = useSyncExternalStore(subscribe, readPreference, () => "system" as const);
  const resolved = useSyncExternalStore(subscribe, readResolved, () => "light" as const);

  // Follow the OS while the preference is "system"; follow other tabs' changes too.
  useEffect(() => {
    const mql = window.matchMedia(DARK_QUERY);
    const onSystem = () => {
      if (readPreference() === "system") applyTheme(systemTheme());
    };
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEYS.theme) applyTheme(resolve(readPreference()));
    };
    mql.addEventListener("change", onSystem);
    window.addEventListener("storage", onStorage);
    syncThemeColor();
    return () => {
      mql.removeEventListener("change", onSystem);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const setPreference = useCallback((next: ThemePreference) => {
    writeStorage(STORAGE_KEYS.theme, next === "system" ? null : next);
    window.dispatchEvent(new Event(CHANGE_EVENT));
    applyTheme(resolve(next));
  }, []);

  const value = useMemo(() => ({ preference, resolved, setPreference }), [preference, resolved, setPreference]);
  return <ThemeContext value={value}>{children}</ThemeContext>;
}

export function useTheme(): ThemeContextValue {
  const value = useContext(ThemeContext);
  if (!value) throw new Error("useTheme must be used inside <ThemeProvider>");
  return value;
}
