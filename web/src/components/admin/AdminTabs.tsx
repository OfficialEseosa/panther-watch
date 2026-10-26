"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import type { ReactNode } from "react";
import { BellIcon, ChartIcon, ClockIcon, DashboardIcon, MailIcon, UsersIcon } from "@/components/ui/icons";
import styles from "./admin.module.css";

const TABS: Array<{ href: string; label: string; icon: ReactNode }> = [
  { href: "/admin", label: "Statistics", icon: <DashboardIcon /> },
  { href: "/admin/users", label: "Users", icon: <UsersIcon /> },
  { href: "/admin/announcements", label: "Announcements", icon: <BellIcon /> },
  { href: "/admin/grades", label: "Grade data", icon: <ChartIcon /> },
  { href: "/admin/email", label: "Email", icon: <MailIcon /> },
  { href: "/admin/jobs", label: "Jobs", icon: <ClockIcon /> },
];

/** The original admin tab bar (old AdminPanel.css .admin-tabs): pill buttons, one per section route. */
export function AdminTabs() {
  const pathname = usePathname();
  const navRef = useRef<HTMLElement>(null);

  // On narrow screens the row scrolls sideways: keep the current tab in view.
  useEffect(() => {
    const nav = navRef.current;
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]');
    if (!nav || !current) return;
    const outer = nav.getBoundingClientRect();
    const inner = current.getBoundingClientRect();
    if (inner.left < outer.left || inner.right > outer.right) nav.scrollLeft += inner.left - outer.left - 16;
  }, [pathname]);

  return (
    <nav ref={navRef} className={styles.tabs} aria-label="Admin sections">
      {TABS.map((tab) => {
        const active = pathname === tab.href;
        return (
          <Link key={tab.href} href={tab.href} className={styles.tab} aria-current={active ? "page" : undefined}>
            {tab.icon}
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
