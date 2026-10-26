"use client";

import { useCallback, useId, useLayoutEffect, useRef, useState } from "react";
import type { KeyboardEvent, ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import styles from "./Tabs.module.css";

export type TabItem = {
  id: string;
  label: ReactNode;
  /** 16 px icon, shown only at >= 640 px. */
  icon?: ReactNode;
  /** Panel content. Only the selected panel is mounted. */
  panel: ReactNode;
};

export type TabsProps = {
  tabs: TabItem[];
  /** Accessible name of the tablist. */
  label: string;
  /** Controlled selected id. */
  value?: string;
  /** Uncontrolled initial id. Defaults to the first tab. */
  defaultValue?: string;
  onValueChange?: (id: string) => void;
  className?: string;
  panelClassName?: string;
};

/**
 * WAI-ARIA tabs (spec.md §2.8) with automatic activation, roving tabindex, ←/→ (wrapping),
 * Home/End, and a sliding indicator (motion.md §4.5). Inactive panels are unmounted.
 */
export function Tabs({ tabs, label, value, defaultValue, onValueChange, className, panelClassName }: TabsProps) {
  const baseId = useId();
  const [internal, setInternal] = useState(defaultValue ?? tabs[0]?.id ?? "");
  const selectedId = value ?? internal;
  const selected = tabs.find((tab) => tab.id === selectedId) ?? tabs[0];
  const listRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const select = useCallback(
    (id: string) => {
      if (value === undefined) setInternal(id);
      onValueChange?.(id);
    },
    [value, onValueChange],
  );

  // Indicator position: set --x / --w on the tablist from the selected tab's box.
  useLayoutEffect(() => {
    const list = listRef.current;
    const tab = selected ? tabRefs.current.get(selected.id) : undefined;
    if (!list || !tab) return;
    const measure = () => {
      list.style.setProperty("--x", String(tab.offsetLeft));
      list.style.setProperty("--w", String(tab.offsetWidth));
    };
    measure();
    const frame = requestAnimationFrame(() => {
      list.dataset.ready = "";
    });
    const observer = new ResizeObserver(measure);
    observer.observe(list);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [selected]);

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const index = tabs.findIndex((tab) => tab.id === selected?.id);
    let next = -1;
    if (event.key === "ArrowRight") next = (index + 1) % tabs.length;
    else if (event.key === "ArrowLeft") next = (index - 1 + tabs.length) % tabs.length;
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = tabs.length - 1;
    if (next < 0) return;
    event.preventDefault();
    const target = tabs[next];
    if (!target) return;
    select(target.id);
    tabRefs.current.get(target.id)?.focus();
  };

  return (
    <div className={className}>
      <div ref={listRef} role="tablist" aria-label={label} className={styles.list} onKeyDown={onKeyDown}>
        {tabs.map((tab) => {
          const isSelected = tab.id === selected?.id;
          return (
            <button
              key={tab.id}
              ref={(node) => {
                if (node) tabRefs.current.set(tab.id, node);
                else tabRefs.current.delete(tab.id);
              }}
              type="button"
              role="tab"
              id={`${baseId}-tab-${tab.id}`}
              aria-selected={isSelected}
              aria-controls={`${baseId}-panel-${tab.id}`}
              tabIndex={isSelected ? 0 : -1}
              className={styles.tab}
              onClick={() => select(tab.id)}
            >
              {tab.icon ? <span className={styles.icon}>{tab.icon}</span> : null}
              {tab.label}
            </button>
          );
        })}
        <span className={styles.indicator} aria-hidden="true" />
      </div>
      {selected ? (
        <div
          key={selected.id}
          role="tabpanel"
          id={`${baseId}-panel-${selected.id}`}
          aria-labelledby={`${baseId}-tab-${selected.id}`}
          tabIndex={0}
          className={cn(styles.panel, panelClassName)}
        >
          {selected.panel}
        </div>
      ) : null}
    </div>
  );
}
