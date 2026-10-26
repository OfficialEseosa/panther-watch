"use client";

import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { playExit } from "@/lib/ui/motion";
import { IconButton } from "./IconButton";
import { XIcon } from "./icons";
import styles from "./Dialog.module.css";

export type DialogProps = {
  open: boolean;
  /** Called for every close request: X, Esc, backdrop click, sheet drag-down. */
  onClose: () => void;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Extra header controls, placed before the close button. */
  actions?: ReactNode;
  /** Sticky footer, actions right-aligned (primary last). */
  footer?: ReactNode;
  /** Modal width at >= 640 px: sm 440 (confirmations), md 640, lg 960 (course detail). */
  size?: "sm" | "md" | "lg";
  /** Keep the panel at full height at >= 640 px so tab switches never resize it. */
  fixedHeight?: boolean;
  /**
   * Initial focus. Default: the first element marked `data-autofocus`, else the first control in
   * the body, else the heading. "heading" focuses the title (content-heavy dialogs).
   */
  initialFocus?: "auto" | "heading";
  /** view-transition-name for the panel, for the card -> dialog morph (motion.md §4.4). */
  viewTransitionName?: string;
  /** Accessible name of the close button. */
  closeLabel?: string;
  className?: string;
  bodyClassName?: string;
  children?: ReactNode;
};

const FOCUSABLE = 'input:not([type="hidden"]):not(:disabled), select:not(:disabled), textarea:not(:disabled), button:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])';
const DRAG_DISMISS_PX = 80;
const FLING_PX_PER_MS = 0.5;

/**
 * One dialog for everything (spec.md §2.7): native <dialog> + showModal() (top layer, inert
 * page, Esc, focus return). Centered modal at >= 640 px, bottom sheet below with a drag handle.
 * Exit animations are JS-driven via data-closing (motion.md §4.8).
 *
 * Mark the element that should receive focus with `data-autofocus` (React's autoFocus runs
 * before the dialog is shown, so it can't be used here).
 */
export function Dialog({
  open,
  onClose,
  title,
  subtitle,
  actions,
  footer,
  size = "md",
  fixedHeight = false,
  initialFocus = "auto",
  viewTransitionName,
  closeLabel = "Close",
  className,
  bodyClassName,
  children,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const [rendered, setRendered] = useState(open);
  const onCloseRef = useRef(onClose);
  const pressStartedOutside = useRef(false);
  const drag = useRef<{ startY: number; lastY: number; lastT: number; velocity: number; id: number } | null>(null);

  useEffect(() => {
    onCloseRef.current = onClose;
  });

  // Mount content as soon as `open` turns true (adjusting state during render).
  if (open && !rendered) setRendered(true);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && rendered) {
      delete el.dataset.closing;
      if (el.open) return;
      el.showModal();
      const target =
        el.querySelector<HTMLElement>("[data-autofocus]") ??
        (initialFocus === "heading" ? null : bodyRef.current?.querySelector<HTMLElement>(FOCUSABLE)) ??
        headingRef.current;
      target?.focus();
      return;
    }
    if (!open && el.open) {
      // During a card<->dialog View Transition the morph is the exit; close immediately.
      if (document.documentElement.dataset.vt) {
        el.close();
        void Promise.resolve().then(() => setRendered(false));
        return;
      }
      let cancelled = false;
      void playExit(el, { keep: true }).then(() => {
        if (cancelled) return;
        el.close();
        delete el.dataset.closing;
        delete el.dataset.dragDismiss;
        el.style.removeProperty("--from");
        setRendered(false);
      });
      return () => {
        cancelled = true;
      };
    }
  }, [open, rendered, initialFocus]);

  const isOutside = (event: ReactPointerEvent<HTMLDialogElement>) => {
    const el = ref.current;
    if (!el || event.target !== el) return false;
    const r = el.getBoundingClientRect();
    return event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom;
  };

  // ---- Sheet drag (< 640 px), on the handle and header only ----
  const onDragStart = (event: ReactPointerEvent<HTMLElement>) => {
    const el = ref.current;
    if (!el || window.matchMedia("(min-width: 640px)").matches) return;
    if ((event.target as HTMLElement).closest("button, a, input, select, textarea")) return;
    drag.current = { startY: event.clientY, lastY: event.clientY, lastT: event.timeStamp, velocity: 0, id: event.pointerId };
    event.currentTarget.setPointerCapture(event.pointerId);
    el.style.willChange = "transform";
    el.style.transition = "none";
  };

  const onDragMove = (event: ReactPointerEvent<HTMLElement>) => {
    const el = ref.current;
    const state = drag.current;
    if (!el || !state || state.id !== event.pointerId) return;
    const dt = Math.max(1, event.timeStamp - state.lastT);
    state.velocity = (event.clientY - state.lastY) / dt;
    state.lastY = event.clientY;
    state.lastT = event.timeStamp;
    const dy = Math.max(0, event.clientY - state.startY);
    el.style.transform = `translateY(${dy}px)`;
  };

  const onDragEnd = (event: ReactPointerEvent<HTMLElement>) => {
    const el = ref.current;
    const state = drag.current;
    if (!el || !state || state.id !== event.pointerId) return;
    drag.current = null;
    const dy = Math.max(0, event.clientY - state.startY);
    el.style.willChange = "";
    if (dy > DRAG_DISMISS_PX || state.velocity > FLING_PX_PER_MS) {
      el.style.setProperty("--from", `${dy}px`);
      el.dataset.dragDismiss = "";
      el.style.transform = "";
      el.style.transition = "";
      onCloseRef.current();
      return;
    }
    el.style.transition = "transform var(--dur) var(--ease-out)";
    el.style.transform = "";
    const clear = () => {
      el.style.transition = "";
      el.removeEventListener("transitionend", clear);
    };
    el.addEventListener("transitionend", clear);
  };

  const dragHandlers = {
    onPointerDown: onDragStart,
    onPointerMove: onDragMove,
    onPointerUp: onDragEnd,
    onPointerCancel: onDragEnd,
  };

  return (
    <dialog
      ref={ref}
      className={cn(styles.dialog, styles[size], fixedHeight && styles.fixedHeight, className)}
      aria-labelledby={titleId}
      style={viewTransitionName ? ({ viewTransitionName } as CSSProperties) : undefined}
      // React propagates cancel/close through the component tree, so a nested Dialog's Esc or
      // close would also reach this one: only handle events for this <dialog>.
      onCancel={(event) => {
        if (event.target !== event.currentTarget) return;
        event.preventDefault();
        onCloseRef.current();
      }}
      onClose={(event) => {
        if (event.target !== event.currentTarget) return;
        // Closed natively (e.g. <form method="dialog">) while the parent still thinks it's open.
        if (open) onCloseRef.current();
      }}
      onPointerDown={(event) => {
        pressStartedOutside.current = isOutside(event);
      }}
      onPointerUp={(event) => {
        if (pressStartedOutside.current && isOutside(event)) onCloseRef.current();
        pressStartedOutside.current = false;
      }}
    >
      {rendered ? (
        <>
          <div className={styles.handle} aria-hidden="true" {...dragHandlers} />
          <header className={styles.header} {...dragHandlers}>
            <div className={styles.titles}>
              <h2 id={titleId} ref={headingRef} tabIndex={-1} className={styles.title}>
                {title}
              </h2>
              {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
            </div>
            {actions ? <div className={styles.actions}>{actions}</div> : null}
            <IconButton label={closeLabel} icon={<XIcon />} tooltip={false} onClick={() => onCloseRef.current()} />
          </header>
          <div ref={bodyRef} className={cn(styles.body, bodyClassName)}>
            {children}
          </div>
          {footer ? <footer className={styles.footer}>{footer}</footer> : null}
        </>
      ) : null}
    </dialog>
  );
}
