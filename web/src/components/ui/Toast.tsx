"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { AlertCircleIcon, AlertIcon, CheckCircleIcon, InfoIcon, XIcon } from "./icons";
import { Button } from "./Button";
import { IconButton } from "./IconButton";
import styles from "./Toast.module.css";

export type ToastTone = "info" | "success" | "warning" | "error";

export type ToastOptions = {
  title: string;
  body?: ReactNode;
  tone?: ToastTone;
  /** One action, e.g. Undo. Clicking it runs `onClick` and dismisses the toast. */
  action?: { label: string; onClick: () => void };
  /** ms before auto-dismiss. Defaults: 5 s (success/info), 8 s (warning/error or with action). */
  duration?: number;
};

type ToastRecord = ToastOptions & { id: string; closing: boolean };

export type ToastApi = {
  /** Shows a toast; returns its id. */
  show: (options: ToastOptions) => string;
  success: (title: string, options?: Omit<ToastOptions, "title" | "tone">) => string;
  info: (title: string, options?: Omit<ToastOptions, "title" | "tone">) => string;
  warning: (title: string, options?: Omit<ToastOptions, "title" | "tone">) => string;
  error: (title: string, options?: Omit<ToastOptions, "title" | "tone">) => string;
  dismiss: (id: string) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

/** "Title. Body" for screen readers (a non-text body is left to the visible toast). */
function spokenText(toast: ToastOptions): string {
  const body = typeof toast.body === "string" || typeof toast.body === "number" ? String(toast.body) : "";
  const title = toast.title.trim();
  return body ? `${title}${/[.!?]$/.test(title) ? "" : "."} ${body}` : title;
}
const MAX_VISIBLE = 3;

const TONE_ICON: Record<ToastTone, ReactNode> = {
  success: <CheckCircleIcon />,
  info: <InfoIcon />,
  warning: <AlertIcon />,
  error: <AlertCircleIcon />,
};

/**
 * Toast region + API (spec.md §2.11). Mounted once in the root layout. The region is a
 * `popover="manual"` element so toasts sit above open dialogs (re-shown on every add to move it
 * to the top of the top layer). Max 3 visible; timers pause on hover and focus; never steals focus.
 *
 * Announcements: the popover stays open for the page's lifetime (empty, it is invisible and
 * click-through), and holds two persistent sr-only live regions, polite and assertive (errors).
 * A toast's text is added to one of them as a new node, which screen readers announce; a live
 * region created together with its text (as each toast's own role="status" was, inside a
 * popover that had just switched from display:none) is often not announced at all.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastRecord[]>([]);
  const regionRef = useRef<HTMLElement>(null);
  const counter = useRef(0);

  const dismiss = useCallback((id: string) => {
    setToasts((list) => list.map((t) => (t.id === id ? { ...t, closing: true } : t)));
  }, []);

  const remove = useCallback((id: string) => {
    setToasts((list) => list.filter((t) => t.id !== id));
  }, []);

  const show = useCallback((options: ToastOptions) => {
    counter.current += 1;
    const id = `toast-${counter.current}`;
    setToasts((list) => {
      const next = [...list, { ...options, id, closing: false }];
      const open = next.filter((t) => !t.closing);
      const excess = open.length - MAX_VISIBLE;
      if (excess <= 0) return next;
      const drop = new Set(open.slice(0, excess).map((t) => t.id));
      return next.map((t) => (drop.has(t.id) ? { ...t, closing: true } : t));
    });
    // Move the region to the top of the top layer (above any open dialog).
    const region = regionRef.current;
    if (region) {
      if (region.matches(":popover-open")) region.hidePopover();
      region.showPopover();
    }
    return id;
  }, []);

  const api = useMemo<ToastApi>(
    () => ({
      show,
      dismiss,
      success: (title, options) => show({ ...options, title, tone: "success" }),
      info: (title, options) => show({ ...options, title, tone: "info" }),
      warning: (title, options) => show({ ...options, title, tone: "warning" }),
      error: (title, options) => show({ ...options, title, tone: "error" }),
    }),
    [show, dismiss],
  );

  // Open once, for good: the live regions inside must exist before any text arrives.
  useEffect(() => {
    const region = regionRef.current;
    if (region && !region.matches(":popover-open")) region.showPopover();
  }, []);

  const live = toasts.filter((t) => !t.closing);

  return (
    <ToastContext value={api}>
      {children}
      <section ref={regionRef} aria-label="Notifications" popover="manual" className={styles.region}>
        <ol className={styles.stack}>
          {toasts.map((toast) => (
            <ToastItem key={toast.id} toast={toast} onDismiss={dismiss} onRemoved={remove} />
          ))}
        </ol>
        <div className="sr-only" role="status" aria-live="polite">
          {live.filter((t) => t.tone !== "error").map((t) => (
            <p key={t.id}>{spokenText(t)}</p>
          ))}
        </div>
        <div className="sr-only" role="alert" aria-live="assertive">
          {live.filter((t) => t.tone === "error").map((t) => (
            <p key={t.id}>{spokenText(t)}</p>
          ))}
        </div>
      </section>
    </ToastContext>
  );
}

function ToastItem({
  toast,
  onDismiss,
  onRemoved,
}: {
  toast: ToastRecord;
  onDismiss: (id: string) => void;
  onRemoved: (id: string) => void;
}) {
  const slotRef = useRef<HTMLLIElement>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const [paused, setPaused] = useState(false);
  const tone = toast.tone ?? "info";
  const duration = toast.duration ?? (toast.action || tone === "warning" || tone === "error" ? 8000 : 5000);
  const { id, closing } = toast;

  // Auto-dismiss, paused while hovered or focused.
  useEffect(() => {
    if (paused || closing) return;
    const timer = window.setTimeout(() => onDismiss(id), duration);
    return () => window.clearTimeout(timer);
  }, [paused, closing, duration, id, onDismiss]);

  // Exit: sink-out + collapse the slot, then remove (300 ms safety timeout).
  useEffect(() => {
    if (!closing) return;
    const slot = slotRef.current;
    const box = boxRef.current;
    if (!slot || !box) {
      onRemoved(id);
      return;
    }
    slot.dataset.closing = "";
    const done = () => onRemoved(id);
    const onEnd = (event: AnimationEvent) => {
      if (event.target === box) done();
    };
    box.addEventListener("animationend", onEnd);
    const timer = window.setTimeout(done, 300);
    return () => {
      box.removeEventListener("animationend", onEnd);
      window.clearTimeout(timer);
    };
  }, [closing, id, onRemoved]);

  return (
    <li
      ref={slotRef}
      className={styles.slot}
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setPaused(false);
      }}
    >
      {/* Not a live region itself: the provider announces the text (see ToastProvider). */}
      <div ref={boxRef} className={cn(styles.toast, styles[tone])}>
        <span className={styles.icon} aria-hidden="true">
          {TONE_ICON[tone]}
        </span>
        <div className={styles.text}>
          <p className={styles.title}>{toast.title}</p>
          {toast.body ? <div className={styles.body}>{toast.body}</div> : null}
        </div>
        {toast.action ? (
          <Button
            size="sm"
            variant="ghost"
            className={styles.action}
            onClick={() => {
              toast.action?.onClick();
              onDismiss(id);
            }}
          >
            {toast.action.label}
          </Button>
        ) : null}
        <IconButton
          size="sm"
          label="Dismiss notification"
          icon={<XIcon />}
          tooltip={false}
          onClick={() => onDismiss(id)}
        />
      </div>
    </li>
  );
}

/** Toast API. Must be used under <ToastProvider> (mounted in the root layout). */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}
