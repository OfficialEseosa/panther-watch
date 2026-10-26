"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { isDialogTab, type DialogTab } from "./params";

export type { DialogTab };

/** The dialog's URL params (addressed by CRN; plus the term where it varies). */
export const DIALOG_PARAM = "crn";
export const TAB_PARAM = "tab";
export const TERM_PARAM = "term";

/** Current URL with `changes` applied (null deletes). Keeps every other param. */
export function urlWith(changes: Record<string, string | null>): string {
  const url = new URL(window.location.href);
  for (const [key, value] of Object.entries(changes)) {
    if (value === null) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Open/close state for the course detail dialog, mirrored to `?crn=` (and `?tab=`) with the
 * native History API, which Next.js integrates without refetching the page. Opening pushes an
 * entry, so the browser Back button closes the dialog; a deep link opens it on load.
 *
 * The dialog animates itself (a short fade + scale); the card is never involved. (A shared-
 * element View Transition used to morph the card into the dialog, but the dialog's own entrance
 * replayed after the morph, so it flashed twice, and the hovered card's lift was baked into the
 * snapshot.)
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
  const pushed = useRef(false);
  const resolveRef = useRef(resolve);
  const openKeyRef = useRef(openKey);

  useEffect(() => {
    resolveRef.current = resolve;
    openKeyRef.current = openKey;
  });

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
        setOpenKey(null);
      }
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  /** `_source` (the clicked card) is accepted for API compatibility; it is not animated. */
  const open = useCallback(
    (key: string, crn: string, _source?: HTMLElement | null, term?: string | null) => {
      setTabState("overview");
      setOpenKey(key);
      const url = urlWith({ [DIALOG_PARAM]: crn, [TAB_PARAM]: null, ...(termParam ? { [TERM_PARAM]: term ?? null } : {}) });
      if (openKeyRef.current && pushed.current) {
        window.history.replaceState(null, "", url);
      } else {
        window.history.pushState(null, "", url);
        pushed.current = true;
      }
    },
    [termParam],
  );

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
    setOpenKey(null);
  }, [termParam]);

  const setTab = useCallback((next: DialogTab) => {
    setTabState(next);
    window.history.replaceState(null, "", urlWith({ [TAB_PARAM]: next === "overview" ? null : next }));
  }, []);

  /** Drop the dialog without touching history (e.g. its section disappeared). */
  const forget = useCallback(() => {
    setOpenKey(null);
  }, []);

  return { openKey, tab, open, close, setTab, forget };
}
