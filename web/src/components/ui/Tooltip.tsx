"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./Tooltip.module.css";

export type TooltipPlacement = "top" | "bottom" | "right";

export type TooltipProps = {
  content: ReactNode;
  /** Preferred side. "top" flips to "bottom" when there is less than 40 px above. */
  placement?: TooltipPlacement;
  /** Id for the tooltip element, so the trigger can reference it with aria-describedby. */
  id?: string;
  /** The trigger. Wrapped in an inline-flex span that listens for hover and focus. */
  children: ReactNode;
  /** Only show while this media query matches, e.g. "not all and (min-width: 1200px)" for rail labels. */
  showWhen?: string;
  className?: string;
};

const SHOW_DELAY_MS = 400;
const GAP_PX = 6;

/**
 * Tooltip (spec.md §2.20) for icon-only controls and rail labels. Never the only carrier of
 * essential information. Shows after 400 ms of hover or immediately on keyboard focus; hides on
 * leave, blur, Esc or scroll. Not shown on coarse pointers. Rendered in a `popover="manual"`
 * element so it escapes overflow clipping.
 *
 * The trigger keeps its own accessible name (aria-label). Only reference the tooltip with
 * aria-describedby when its text differs from that name.
 */
export function Tooltip({ content, placement = "top", id, children, showWhen, className }: TooltipProps) {
  const autoId = useId();
  const tipId = id ?? autoId;
  const anchorRef = useRef<HTMLSpanElement>(null);
  const tipRef = useRef<HTMLSpanElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const [open, setOpen] = useState(false);

  const hide = useCallback(() => {
    window.clearTimeout(timer.current);
    setOpen(false);
  }, []);

  const show = useCallback((delay: number) => {
    if (window.matchMedia("(pointer: coarse)").matches) return;
    if (showWhen && !window.matchMedia(showWhen).matches) return;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => setOpen(true), delay);
  }, [showWhen]);

  useEffect(() => () => window.clearTimeout(timer.current), []);

  useEffect(() => {
    const tip = tipRef.current;
    const anchor = anchorRef.current;
    if (!tip || !anchor) return;
    if (!open) {
      if (tip.matches(":popover-open")) tip.hidePopover();
      return;
    }
    tip.showPopover();
    const a = anchor.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    let side = placement;
    if (side === "top" && a.top - t.height - GAP_PX < 40) side = "bottom";
    let top: number;
    let left: number;
    if (side === "right") {
      top = a.top + a.height / 2 - t.height / 2;
      left = a.right + GAP_PX;
    } else {
      top = side === "top" ? a.top - t.height - GAP_PX : a.bottom + GAP_PX;
      left = a.left + a.width / 2 - t.width / 2;
    }
    const maxLeft = Math.max(8, window.innerWidth - t.width - 8);
    tip.style.top = `${Math.max(8, top)}px`;
    tip.style.left = `${Math.min(Math.max(8, left), maxLeft)}px`;

    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") hide();
    };
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", hide, { capture: true, passive: true });
    return () => {
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", hide, { capture: true });
    };
  }, [open, placement, hide]);

  return (
    <span
      ref={anchorRef}
      className={cn(styles.anchor, className)}
      onPointerEnter={(event) => {
        if (event.pointerType === "mouse") show(SHOW_DELAY_MS);
      }}
      onPointerLeave={hide}
      onPointerDown={hide}
      onFocus={(event) => {
        if (event.target.matches(":focus-visible")) show(0);
      }}
      onBlur={hide}
    >
      {children}
      <span ref={tipRef} id={tipId} role="tooltip" popover="manual" className={styles.tip}>
        {content}
      </span>
    </span>
  );
}
