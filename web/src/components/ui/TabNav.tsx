"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import { useScrollEdges } from "@/lib/ui/hooks";
import styles from "./Tabs.module.css";

export type TabNavItem = {
  href: string;
  label: ReactNode;
  /** Match nested routes too (default: exact match only). */
  matchPrefix?: boolean;
};

/**
 * Route tabs (spec.md §2.8, e.g. Admin sections): links with aria-current, no tab roles. On
 * narrow screens the row scrolls sideways (snapping to tabs) with an edge fade where more tabs
 * hide, and the current tab is scrolled into view.
 */
export function TabNav({ items, label, className }: { items: TabNavItem[]; label: string; className?: string }) {
  const pathname = usePathname();
  const [scrollRef, edges] = useScrollEdges();
  const navRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current) return;
    const outer = nav.getBoundingClientRect();
    const inner = current.getBoundingClientRect();
    if (inner.left < outer.left || inner.right > outer.right) nav.scrollLeft += inner.left - outer.left - 32;
  }, [pathname]);

  return (
    <nav
      ref={(element) => {
        navRef.current = element;
        scrollRef(element);
      }}
      aria-label={label}
      className={cn(styles.nav, "edge-fade", className)}
      data-fade={edges.fade}
    >
      {items.map((item) => {
        const active = item.matchPrefix ? pathname.startsWith(item.href) : pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={styles.navLink}
            aria-current={active ? "page" : undefined}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
