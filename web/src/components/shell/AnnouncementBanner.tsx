"use client";

import { type AnimationEvent, use, useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { AlertCircleIcon, AlertIcon, ChevronLeftIcon, ChevronRightIcon, InfoIcon, XIcon } from "@/components/ui/icons";
import { cn } from "@/lib/ui/cn";
import { prefersReducedMotion } from "@/lib/ui/motion";
import { readJson, STORAGE_KEYS, writeStorage } from "@/lib/ui/storage";
import type { AnnouncementLevel, ShellAnnouncement } from "./types";
import styles from "./AnnouncementBanner.module.css";

const ROTATE_MS = 8000;
/** Exits run --dur (200 ms) at most; past this, finish without waiting for animationend. */
const EXIT_SAFETY_MS = 400;
const MAX_DISMISSED = 50;
const DISMISS_EVENT = "pantherwatch:announcements";

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === "string");

const EMPTY: readonly string[] = [];
let cachedRaw: string[] | null = null;

function readDismissed(): readonly string[] {
  const next = readJson(STORAGE_KEYS.dismissedAnnouncements, [] as string[], isStringArray);
  // Keep the snapshot referentially stable while the content is unchanged.
  if (cachedRaw && cachedRaw.length === next.length && cachedRaw.every((id, i) => id === next[i])) return cachedRaw;
  cachedRaw = next;
  return next;
}

function subscribeDismissed(onChange: () => void) {
  window.addEventListener(DISMISS_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(DISMISS_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

function rememberDismissed(id: string) {
  const current = readDismissed().filter((item) => item !== id);
  // Most recent last; keep the newest MAX_DISMISSED so the list can't grow forever.
  const next = [...current, id].slice(-MAX_DISMISSED);
  writeStorage(STORAGE_KEYS.dismissedAnnouncements, JSON.stringify(next));
  window.dispatchEvent(new Event(DISMISS_EVENT));
}

const LEVEL_ICON: Record<AnnouncementLevel, typeof InfoIcon> = {
  info: InfoIcon,
  warning: AlertIcon,
  error: AlertCircleIcon,
};

export type AnnouncementBannerProps = {
  announcements: ShellAnnouncement[];
};

/**
 * Global announcement banner (spec.md §2.14, motion.md §4.13). In normal flow above the shell,
 * so it scrolls away and needs no measured offsets. Rotates every 8 s when there are 2+, pausing
 * on hover, focus and hidden tabs, and stopping for good after manual paging; no rotation under
 * reduced motion. Dismissals are remembered per id (newest 50). The index is always clamped to
 * the visible list, so a shrinking list can never index past the end.
 */
export function AnnouncementBanner({ announcements }: AnnouncementBannerProps) {
  const dismissed = useSyncExternalStore(subscribeDismissed, readDismissed, () => EMPTY);
  const visible = announcements.filter((item) => !dismissed.includes(item.id));
  const [index, setIndex] = useState(0);
  const [leaving, setLeaving] = useState(false);
  const [animateIn, setAnimateIn] = useState(false);
  const [paused, setPaused] = useState(false);
  const [stopped, setStopped] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [overflowing, setOverflowing] = useState(false);
  const [collapsing, setCollapsing] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const messageRef = useRef<HTMLSpanElement>(null);

  const count = visible.length;
  const safeIndex = count === 0 ? 0 : Math.min(index, count - 1);
  const current = visible[safeIndex];

  const go = useCallback(
    (delta: number) => {
      if (count < 2) return;
      setAnimateIn(false);
      setExpanded(false);
      setIndex((i) => (Math.min(i, count - 1) + delta + count) % count);
    },
    [count],
  );

  // Auto-rotate.
  useEffect(() => {
    if (count < 2 || paused || stopped || leaving || prefersReducedMotion()) return;
    const timer = window.setTimeout(() => {
      if (document.visibilityState === "hidden") return;
      setLeaving(true);
    }, ROTATE_MS);
    return () => window.clearTimeout(timer);
  }, [count, paused, stopped, leaving, safeIndex]);

  // Re-arm the timer when the tab becomes visible again.
  useEffect(() => {
    const onVisibility = () => setPaused(document.visibilityState === "hidden");
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, []);

  // Detect a clamped message, to offer "More".
  useLayoutEffect(() => {
    const el = messageRef.current;
    if (!el) return;
    const check = () => setOverflowing(el.scrollHeight > el.clientHeight + 1);
    check();
    const observer = new ResizeObserver(check);
    observer.observe(el);
    return () => observer.disconnect();
  }, [current?.id, expanded]);

  const currentId = current?.id;

  // Finish the rotation when the message's fade-out ends, or after a backstop timeout, so a
  // missing animationend (animations disabled, a renamed keyframe) can't stall rotation.
  const advance = useCallback(() => {
    setLeaving(false);
    setAnimateIn(true);
    setExpanded(false);
    setIndex((i) => (Math.min(i, count - 1) + 1) % count);
  }, [count]);
  useEffect(() => {
    if (!leaving) return;
    const timer = window.setTimeout(advance, EXIT_SAFETY_MS);
    return () => window.clearTimeout(timer);
  }, [leaving, advance]);

  // Same for the dismiss collapse: the dismissal is saved when it ends, or after the backstop.
  const finishDismiss = useCallback(() => {
    setCollapsing(false);
    if (currentId) rememberDismissed(currentId);
  }, [currentId]);
  useEffect(() => {
    if (!collapsing) return;
    const timer = window.setTimeout(finishDismiss, EXIT_SAFETY_MS);
    return () => window.clearTimeout(timer);
  }, [collapsing, finishDismiss]);

  if (!current) return null;

  const Icon = LEVEL_ICON[current.level] ?? InfoIcon;

  const onMessageAnimationEnd = (event: AnimationEvent<HTMLSpanElement>) => {
    if (leaving && event.target === event.currentTarget) advance();
  };

  const dismiss = () => {
    if (count > 1) {
      rememberDismissed(current.id);
      setAnimateIn(false);
      return;
    }
    setCollapsing(true);
  };

  return (
    <div
      ref={rootRef}
      className={cn(styles.wrapper, collapsing && styles.collapsing)}
      onAnimationEnd={(event) => {
        if (collapsing && event.target === rootRef.current) finishDismiss();
      }}
    >
      <div
        role="region"
        aria-label="Announcements"
        className={cn(styles.banner, styles[current.level])}
        onPointerEnter={() => setPaused(true)}
        onPointerLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)}
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
        }}
      >
        <Icon className={styles.icon} />
        <p className={styles.text}>
          <span
            key={current.id}
            ref={messageRef}
            className={cn(styles.message, expanded && styles.expanded, animateIn && styles.enter)}
            data-closing={leaving ? "" : undefined}
            onAnimationEnd={onMessageAnimationEnd}
          >
            {current.message}
          </span>
          {overflowing || expanded ? (
            <button type="button" className={styles.more} aria-expanded={expanded} onClick={() => setExpanded((v) => !v)}>
              {expanded ? "Less" : "More"}
            </button>
          ) : null}
        </p>
        {count > 1 ? (
          <div className={styles.pager}>
            <IconButton
              size="sm"
              label="Previous announcement"
              icon={<ChevronLeftIcon />}
              onClick={() => {
                setStopped(true);
                go(-1);
              }}
            />
            <span className={styles.count} aria-live="off">
              {safeIndex + 1} / {count}
            </span>
            <IconButton
              size="sm"
              label="Next announcement"
              icon={<ChevronRightIcon />}
              onClick={() => {
                setStopped(true);
                go(1);
              }}
            />
          </div>
        ) : null}
        <IconButton size="sm" label="Dismiss announcement" icon={<XIcon />} onClick={dismiss} />
      </div>
    </div>
  );
}

/** Resolves the layout's announcements promise; render inside <Suspense>. */
export function AnnouncementBannerFromPromise({ announcements }: { announcements: Promise<ShellAnnouncement[]> }) {
  return <AnnouncementBanner announcements={use(announcements)} />;
}
