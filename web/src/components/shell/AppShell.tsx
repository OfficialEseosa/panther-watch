import { Suspense } from "react";
import type { ReactNode } from "react";
import { AnnouncementBannerFromPromise } from "./AnnouncementBanner";
import { Header } from "./Header";
import { MobileNav } from "./MobileNav";
import { Sidebar } from "./Sidebar";
import { SkipLink } from "./SkipLink";
import type { ShellAnnouncement, Viewer } from "./types";
import { ViewerProvider } from "./ViewerContext";
import styles from "./AppShell.module.css";

export type AppShellProps = {
  /** Created (not awaited) by the layout; user-dependent bits resolve it behind <Suspense>. */
  viewer: Promise<Viewer>;
  announcements: Promise<ShellAnnouncement[]>;
  children: ReactNode;
};

/**
 * App shell (spec.md §3.1): skip link, announcement banner (normal flow), then a grid of
 * sidebar/rail (>= 900) and the content column (top bar < 900, main), plus the bottom nav
 * (< 900). Server component; rendered once by app/(app)/layout.tsx and kept across navigations.
 */
export function AppShell({ viewer, announcements, children }: AppShellProps) {
  return (
    <ViewerProvider viewer={viewer}>
      <SkipLink />
      <Suspense fallback={null}>
        <AnnouncementBannerFromPromise announcements={announcements} />
      </Suspense>
      <div className={styles.shell}>
        <Sidebar />
        <div className={styles.column}>
          <Header />
          <main id="main" tabIndex={-1} className={styles.main}>
            {children}
          </main>
        </div>
      </div>
      <MobileNav />
    </ViewerProvider>
  );
}
