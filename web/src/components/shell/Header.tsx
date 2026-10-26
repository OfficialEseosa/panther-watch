"use client";

import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { AccountMenu, AccountMenuFallback } from "./AccountMenu";
import { Brand } from "./Brand";
import { titleFor } from "./nav";
import styles from "./Header.module.css";

/**
 * Top bar for < 900 px (spec.md §2.15): panther + current page title, theme toggle, and the
 * account menu (or "Sign in"). Sticky; replaced by the rail/sidebar at >= 900 px. No hamburger:
 * navigation lives in the bottom nav.
 */
export function Header() {
  const pathname = usePathname();
  return (
    <header className={styles.bar}>
      <div className={styles.left}>
        <Brand href="/dashboard" size={28} showName={false} />
        {/* The page's own h1 carries the title for assistive tech. */}
        <span className={styles.title} aria-hidden="true">
          {titleFor(pathname)}
        </span>
      </div>
      <div className={styles.right}>
        <ThemeToggle />
        <Suspense fallback={<AccountMenuFallback placement="topbar" />}>
          <AccountMenu placement="topbar" />
        </Suspense>
      </div>
    </header>
  );
}
