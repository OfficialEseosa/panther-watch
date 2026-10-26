import Link from "next/link";
import type { ReactNode } from "react";
import { AdminIcon, StarIcon } from "@/components/ui/icons";
import { AdminTabs } from "./AdminTabs";
import styles from "./admin.module.css";

/**
 * Admin chrome, as the original AdminPanel.jsx: the header card (icon, title, description and
 * the What's New preview) above the pill tab bar. Rendered only after the admin gate passes.
 */
export function AdminFrame({ children }: { children: ReactNode }) {
  return (
    <div className={styles.panel}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <AdminIcon size={28} className={styles.headingIcon} />
          <div>
            <h1>Admin panel</h1>
            <p>Manage users, insights, announcements, grade data and outbound messaging.</p>
          </div>
        </div>
        <Link href="/dashboard?whatsnew=1" prefetch={false} className={styles.tab}>
          <StarIcon />
          Preview What&rsquo;s New
        </Link>
      </header>
      <AdminTabs />
      <div className={styles.content}>{children}</div>
    </div>
  );
}

/**
 * Fallback while the gate checks the session (the old "Checking admin access..." card). It shows
 * no admin chrome, so a non-admin never sees any before the 404.
 */
export function AdminGateFallback() {
  return (
    <div className={styles.gate} role="status" aria-live="polite">
      <div className={styles.gateCard}>
        <div className={styles.spinner} aria-hidden="true" />
        <p>Checking admin access…</p>
      </div>
    </div>
  );
}

/** Loading state inside a tab (the old "Loading announcements..." line). */
export function AdminLoading({ label }: { label: string }) {
  return (
    <section className={styles.section}>
      <p className={styles.loading} role="status">
        {label}
      </p>
    </section>
  );
}
