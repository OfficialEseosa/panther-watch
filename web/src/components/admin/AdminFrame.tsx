import type { ReactNode } from "react";
import { PageHeader } from "@/components/shell/PageHeader";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { TabNav, type TabNavItem } from "@/components/ui/TabNav";
import styles from "./admin.module.css";

export const ADMIN_TABS: TabNavItem[] = [
  { href: "/admin", label: "Overview" },
  { href: "/admin/users", label: "Users" },
  { href: "/admin/announcements", label: "Announcements" },
  { href: "/admin/grades", label: "Grade data" },
  { href: "/admin/email", label: "Email" },
  { href: "/admin/jobs", label: "Jobs" },
];

/** Admin chrome: the page's h1 and the route tabs. Rendered only after the admin gate passes. */
export function AdminFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.frame}>
      <PageHeader title="Admin" description="Usage, users, announcements, grade data and background jobs.">
        <TabNav items={ADMIN_TABS} label="Admin sections" className={styles.tabs} />
      </PageHeader>
      {children}
    </div>
  );
}

/**
 * Fallback while the gate checks the session. Deliberately neutral (no "Admin" title or tabs),
 * so a non-admin never sees admin chrome before the 404.
 */
export function AdminGateFallback() {
  return (
    <div className={styles.frame}>
      <SkeletonGroup label="Loading" className={styles.gateSkeleton}>
        <Skeleton width={160} height={32} radius="sm" />
        <Skeleton width="min(420px, 80%)" height={16} />
        <Skeleton width="100%" height={40} radius="sm" style={{ marginTop: "var(--space-4)" }} />
      </SkeletonGroup>
    </div>
  );
}
