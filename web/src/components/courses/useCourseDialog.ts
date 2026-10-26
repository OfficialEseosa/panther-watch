"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { MORPH_MS } from "./dialogMotion";
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
 * Opening from a card records it in `origin`; SectionDialog then morphs the dialog out of that
 * card (a FLIP animation it fully controls, dialogMotion.ts) and back into it on close. Without
 * a card (deep link, Back/Forward) it fades.
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
  /** The card the dialog opens from (consumed by SectionDialog on open). */
  const origin = useRef<HTMLElement | null>(null);
  /** Our own deferred history.back() (see close): its popstate is not a user navigation. */
  const ignorePop = useRef(false);
  /** The deferred pushState of an opening dialog (see open), and the URL it will push. */
  const pendingPush = useRef<number | undefined>(undefined);
  const pendingUrl = useRef("");
  const resolveRef = useRef(resolve);
  const openKeyRef = useRef(openKey);

  useEffect(() => {
    resolveRef.current = resolve;
    openKeyRef.current = openKey;
  });

  // Back / Forward: the URL is the source of truth for whether the dialog is open.
  useEffect(() => {
    const onPop = () => {
      if (ignorePop.current) {
        ignorePop.current = false;
        return;
      }
      const params = new URL(window.location.href).searchParams;
      const crn = params.get(DIALOG_PARAM);
      const key = crn ? resolveRef.current(crn, params.get(TERM_PARAM)) : null;
      if (key) {
        const nextTab = params.get(TAB_PARAM);
        setTabState(isDialogTab(nextTab) ? nextTab : "overview");
        origin.current = null;
        setOpenKey(key);
        pushed.current = false;
      } else if (openKeyRef.current) {
        pushed.current = false;
        setOpenKey(null);
      }
    };
    window.addEventListener("popstate", onPop);
    const pending = pendingPush;
    return () => {
      window.removeEventListener("popstate", onPop);
      window.clearTimeout(pending.current);
    };
  }, []);

  const open = useCallback(
    (key: string, crn: string, source?: HTMLElement | null, term?: string | null) => {
      origin.current = source ?? null;
      setTabState("overview");
      setOpenKey(key);
      const url = urlWith({ [DIALOG_PARAM]: crn, [TAB_PARAM]: null, ...(termParam ? { [TERM_PARAM]: term ?? null } : {}) });
      if (openKeyRef.current && pushed.current) {
        if (pendingPush.current !== undefined) pendingUrl.current = url;
        else window.history.replaceState(null, "", url);
        return;
      }
      // The history entry is added once the morph has played: the Next.js router re-renders on
      // pushState, which would otherwise land in the middle of the animation as dropped frames.
      // (pushed is set now, so a close before then cancels the push instead of going Back.)
      pushed.current = true;
      pendingUrl.current = url;
      window.clearTimeout(pendingPush.current);
      pendingPush.current = window.setTimeout(() => {
        pendingPush.current = undefined;
        window.history.pushState(null, "", pendingUrl.current);
      }, MORPH_MS + 20);
    },
    [termParam],
  );

  const close = useCallback(() => {
    if (pushed.current && pendingPush.current !== undefined) {
      // Closed before its history entry was added: just don't add it.
      window.clearTimeout(pendingPush.current);
      pendingPush.current = undefined;
      pushed.current = false;
      setOpenKey(null);
      return;
    }
    if (pushed.current) {
      // Close now, and leave the dialog's history entry only once the exit has played: Back
      // makes the Next.js router re-render the page, which would land mid-animation as jank.
      pushed.current = false;
      setOpenKey(null);
      const url = window.location.href;
      window.setTimeout(() => {
        if (window.location.href !== url) return;
        ignorePop.current = true;
        window.history.back();
      }, MORPH_MS + 60);
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
    const value = next === "overview" ? null : next;
    if (pendingPush.current !== undefined) {
      // Not pushed yet: the tab belongs to the dialog's entry, not the page underneath.
      const url = new URL(pendingUrl.current, window.location.origin);
      if (value === null) url.searchParams.delete(TAB_PARAM);
      else url.searchParams.set(TAB_PARAM, value);
      pendingUrl.current = `${url.pathname}${url.search}${url.hash}`;
      return;
    }
    window.history.replaceState(null, "", urlWith({ [TAB_PARAM]: value }));
  }, []);

  /** Drop the dialog without touching history (e.g. its section disappeared). */
  const forget = useCallback(() => {
    setOpenKey(null);
  }, []);

  return { openKey, tab, open, close, setTab, forget, origin };
}
