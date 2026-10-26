"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { flushSync } from "react-dom";
import { prefersReducedMotion, withViewTransition } from "@/lib/ui/motion";

import { isDialogTab, type DialogTab } from "./params";

export type { DialogTab };

/** The dialog's URL params (spec.md §2.7, addressed by CRN; plus the term where it varies). */
export const DIALOG_PARAM = "crn";
export const TAB_PARAM = "tab";
export const TERM_PARAM = "term";

const VT_NAME = "course-detail";

/** Current URL with `changes` applied (null deletes). Keeps every other param. */
export function urlWith(changes: Record<string, string | null>): string {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

function inViewport(el: Element): boolean {
  const r = el.getBoundingClientRect();
  return r.bottom > 0 && r.right > 0 && r.top < window.innerHeight && r.left < window.innerWidth;
}

function canMorph(): boolean {
  return (
    typeof document !== "undefined" &&
    typeof document.startViewTransition === "function" &&
    !prefersReducedMotion() &&
    window.matchMedia("(min-width: 640px)").matches
  );
}

/**
 * Open/close state for the course detail dialog, mirrored to `?crn=` (and `?tab=`) with the
 * native History API, which Next.js integrates without refetching the page. Opening pushes an
 * entry, so the browser Back button closes the dialog; a deep link opens it on load. At >= 640
 * px the source card morphs into the dialog with a shared view transition (motion.md §4.4).
 *
 * `resolve(crn, term)` maps the URL's CRN (and term, when present) to the page's section key, or
 * null. CRNs repeat across terms, so pages that list several terms pass `termParam`: opening
 * then also writes `?term=` and closing removes it. (The results page shows one term, already
 * in its URL, so it leaves `term` alone.)
 */
export function useCourseDialog({
  initialKey,
  initialTab,
  resolve,
  termParam = false,
}: {
  initialKey: string | null;
  initialTab: DialogTab;
  resolve: (crn: string, term: string | null) => string | null;
  termParam?: boolean;
}) {
  const [openKey, setOpenKey] = useState<string | null>(initialKey);
  const [tab, setTabState] = useState<DialogTab>(initialTab);
  const source = useRef<HTMLElement | null>(null);
  const pushed = useRef(false);
  const resolveRef = useRef(resolve);
  const openKeyRef = useRef(openKey);

  useEffect(() => {
    resolveRef.current = resolve;
    openKeyRef.current = openKey;
  });

  const closeLocal = useCallback(() => {
    const el = source.current;
    source.current = null;
    if (el && el.isConnected && inViewport(el) && canMorph()) {
      void withViewTransition("course", () => {
        flushSync(() => setOpenKey(null));
        el.style.viewTransitionName = VT_NAME;
      }).then(() => {
        el.style.viewTransitionName = "";
      });
      return;
    }
    setOpenKey(null);
  }, []);

  // Back / Forward: the URL is the source of truth for whether the dialog is open.
  useEffect(() => {
    const onPop = () => {
      const params = new URL(window.location.href).searchParams;
      const crn = params.get(DIALOG_PARAM);
      const key = crn ? resolveRef.current(crn, params.get(TERM_PARAM)) : null;
      if (key) {
        const nextTab = params.get(TAB_PARAM);
        setTabState(isDialogTab(nextTab) ? nextTab : "overview");
        setOpenKey(key);
        pushed.current = false;
      } else if (openKeyRef.current) {
        pushed.current = false;
        closeLocal();
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, [closeLocal]);

  const open = useCallback((key: string, crn: string, sourceEl: HTMLElement | null, term?: string | null) => {
    const apply = () => {
      setTabState("overview");
      setOpenKey(key);
    };
    source.current = sourceEl;
    if (sourceEl && canMorph()) {
      sourceEl.style.viewTransitionName = VT_NAME;
      void withViewTransition("course", () => {
        flushSync(apply);
        // Only one element may hold the name in the new state: the dialog panel.
        sourceEl.style.viewTransitionName = "";
      });
    } else {
      apply();
    }
    const url = urlWith({ [DIALOG_PARAM]: crn, [TAB_PARAM]: null, ...(termParam ? { [TERM_PARAM]: term ?? null } : {}) });
    if (openKeyRef.current && pushed.current) {
      window.history.replaceState(null, "", url);
    } else {
      window.history.pushState(null, "", url);
      pushed.current = true;
    }
  }, [termParam]);

  const close = useCallback(() => {
    if (pushed.current) {
      // popstate closes it (and restores the pre-dialog URL).
      window.history.back();
      return;
    }
    window.history.replaceState(
      null,
      "",
      urlWith({ [DIALOG_PARAM]: null, [TAB_PARAM]: null, ...(termParam ? { [TERM_PARAM]: null } : {}) }),
    );
    closeLocal();
  }, [closeLocal, termParam]);

  const setTab = useCallback((next: DialogTab) => {
    setTabState(next);
    window.history.replaceState(null, "", urlWith({ [TAB_PARAM]: next === "overview" ? null : next }));
  }, []);

  /** Drop the dialog without touching history (e.g. its section disappeared). */
  const forget = useCallback(() => {
    source.current = null;
    setOpenKey(null);
  }, []);

  return { openKey, tab, open, close, setTab, forget };
}
