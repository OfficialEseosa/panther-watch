import type { ReactNode } from "react";
import { AppShell } from "@/components/shell/AppShell";
import { loadAnnouncements, loadViewer } from "@/components/shell/viewer.server";

/**
 * The app shell layout. Persists across navigations inside (app), so the viewer and
 * announcements are loaded once per document, not per page (audit §1).
 *
 * Both loads start in parallel here but are NOT awaited: under Cache Components a top-level
 * await on the session would hold every page behind the request. The promises go to the shell,
 * whose user-dependent parts resolve them inside their own <Suspense> boundaries, so the rest of
 * the shell (and each page's static parts) prerender. Both loaders never throw: on failure the
 * guest shell renders with no banner.
 */
export default function AppLayout({ children }: { children: ReactNode }) {
  const viewer = loadViewer();
  const announcements = loadAnnouncements();
  return (
    <AppShell viewer={viewer} announcements={announcements}>
      {children}
    </AppShell>
  );
}
