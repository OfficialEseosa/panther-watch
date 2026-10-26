"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState } from "react";
import type { ComponentProps, KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./Menu.module.css";

type MenuContextValue = { close: (returnFocus?: boolean) => void };
const MenuContext = createContext<MenuContextValue | null>(null);

export type MenuProps = {
  /** Content of the trigger button (e.g. an Avatar, or an avatar + name row). */
  trigger: ReactNode;
  /** Accessible name of the trigger button (e.g. "Account: Jane Doe"). */
  triggerLabel: string;
  triggerClassName?: string;
  /** Accessible name of the menu. */
  label: string;
  /** Non-menu content above the items (e.g. account summary, theme control). */
  header?: ReactNode;
  /** MenuItem / MenuSeparator elements. */
  children: ReactNode;
  /** Horizontal alignment relative to the trigger. Default "end". */
  align?: "start" | "end";
  /** Prefer opening above the trigger (e.g. sidebar footer). Flips automatically near edges. */
  side?: "below" | "above";
  className?: string;
};

const ITEM_SELECTOR = '[role="menu"] [role="menuitem"]:not([aria-disabled="true"])';

/**
 * Menu (spec.md §2.21): a trigger button plus a `popover="auto"` panel (light dismiss, top
 * layer) positioned at the trigger. role="menu" with ↓/↑ (wrapping), Home/End, type-ahead, Esc
 * back to the trigger, Tab closes and moves on. Enter/Space/↓ on the trigger opens on the first
 * item, ↑ on the last.
 */
export function Menu({
  trigger,
  triggerLabel,
  triggerClassName,
  label,
  header,
  children,
  align = "end",
  side = "below",
  className,
}: MenuProps) {
  const baseId = useId();
  const menuId = `${baseId}-menu`;
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [isOpen, setIsOpen] = useState(false);

  const items = () => Array.from(popRef.current?.querySelectorAll<HTMLElement>(ITEM_SELECTOR) ?? []);

  const position = useCallback(() => {
    const pop = popRef.current;
    const anchor = triggerRef.current;
    if (!pop || !anchor) return;
    const a = anchor.getBoundingClientRect();
    const p = pop.getBoundingClientRect();
    const gap = 4;
    const roomBelow = window.innerHeight - a.bottom;
    const above = side === "above" ? a.top > p.height + gap : roomBelow < p.height + gap && a.top > roomBelow;
    const top = above ? a.top - p.height - gap : a.bottom + gap;
    let left = align === "end" ? a.right - p.width : a.left;
    left = Math.min(Math.max(8, left), window.innerWidth - p.width - 8);
    pop.style.top = `${Math.max(8, top)}px`;
    pop.style.left = `${Math.max(8, left)}px`;
    pop.dataset.side = above ? "above" : "below";
  }, [align, side]);

  // Follow the trigger while open: page or container scroll, and viewport resize.
  useEffect(() => {
    if (!isOpen) return;
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(position);
    };
    window.addEventListener("scroll", update, { capture: true, passive: true });
    window.addEventListener("resize", update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
    };
  }, [isOpen, position]);

  const open = (focus: "first" | "last") => {
    const pop = popRef.current;
    if (!pop) return;
    if (!pop.matches(":popover-open")) pop.showPopover();
    position();
    const list = items();
    (focus === "first" ? list[0] : list[list.length - 1])?.focus();
  };

  const close = useCallback((returnFocus = true) => {
    const pop = popRef.current;
    if (pop?.matches(":popover-open")) pop.hidePopover();
    if (returnFocus) triggerRef.current?.focus();
  }, []);

  const onMenuKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const list = items();
    const index = list.indexOf(document.activeElement as HTMLElement);
    let next: HTMLElement | undefined;
    if (event.key === "ArrowDown") next = list[(index + 1) % list.length];
    else if (event.key === "ArrowUp") next = list[(index - 1 + list.length) % list.length];
    else if (event.key === "Home") next = list[0];
    else if (event.key === "End") next = list[list.length - 1];
    else if (event.key === "Escape") {
      event.preventDefault();
      close(true);
      return;
    } else if (event.key === "Tab") {
      close(false);
      return;
    } else if (event.key.length === 1 && /\S/.test(event.key)) {
      const key = event.key.toLowerCase();
      const ordered = [...list.slice(index + 1), ...list.slice(0, index + 1)];
      next = ordered.find((item) => item.textContent?.trim().toLowerCase().startsWith(key));
    }
    if (next) {
      event.preventDefault();
      next.focus();
    }
  };

  const contextValue = useMemo(() => ({ close }), [close]);

  return (
    <MenuContext value={contextValue}>
      <button
        ref={triggerRef}
        type="button"
        className={triggerClassName}
        aria-label={triggerLabel}
        aria-haspopup="menu"
        aria-expanded={isOpen}
        aria-controls={menuId}
        onClick={() => {
          if (popRef.current?.matches(":popover-open")) close(false);
          else open("first");
        }}
        onKeyDown={(event) => {
          if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            open(event.key === "ArrowDown" ? "first" : "last");
          }
        }}
      >
        {trigger}
      </button>
      <div
        ref={popRef}
        popover="auto"
        className={cn(styles.popover, className)}
        onToggle={(event) => setIsOpen(event.newState === "open")}
      >
        {header ? <div className={styles.header}>{header}</div> : null}
        <div id={menuId} role="menu" aria-label={label} className={styles.list} onKeyDown={onMenuKeyDown}>
          {children}
        </div>
      </div>
    </MenuContext>
  );
}

type ItemBase = {
  icon?: ReactNode;
  tone?: "default" | "danger";
  children: ReactNode;
  className?: string;
};

export type MenuItemProps = ItemBase &
  (
    | ({ href: string; onSelect?: never } & Omit<ComponentProps<typeof Link>, "href" | "children" | "className">)
    | { href?: never; onSelect: () => void; disabled?: boolean }
  );

/** A menu row: a link (`href`) or an action (`onSelect`). Closes the menu when chosen. */
export function MenuItem(props: MenuItemProps) {
  const menu = useContext(MenuContext);
  const { icon, tone = "default", children, className } = props;
  const classes = cn(styles.item, tone === "danger" && styles.danger, className);
  const content = (
    <>
      {icon ? <span className={styles.itemIcon}>{icon}</span> : null}
      <span className={styles.itemLabel}>{children}</span>
    </>
  );

  if (props.href !== undefined) {
    const { href, icon: _i, tone: _t, children: _c, className: _cl, onSelect: _s, ...linkProps } = props;
    void [_i, _t, _c, _cl, _s];
    return (
      <Link
        {...linkProps}
        href={href}
        role="menuitem"
        tabIndex={-1}
        className={classes}
        onClick={() => menu?.close(false)}
      >
        {content}
      </Link>
    );
  }
  return (
    <button
      type="button"
      role="menuitem"
      tabIndex={-1}
      className={classes}
      aria-disabled={props.disabled || undefined}
      onClick={() => {
        if (props.disabled) return;
        menu?.close(false);
        props.onSelect();
      }}
    >
      {content}
    </button>
  );
}

export function MenuSeparator() {
  return <div role="separator" className={styles.separator} />;
}
