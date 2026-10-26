import type { Metadata } from "next";
import { Suspense } from "react";
import type { ReactNode } from "react";
import { AdminFrame, AdminGateFallback } from "@/components/admin/AdminFrame";
import { requireAdmin } from "@/lib/auth/session";

export const metadata: Metadata = {
  title: "Admin",
  robots: { index: false, follow: false },
};

/**
 * Admin gate (pages.md §8): the session read sits behind <Suspense> (Cache Components), and
 * `requireAdmin()` calls notFound() for guests and non-admins before any admin chrome renders.
 * The fallback is neutral, so there is no "access denied" flash either way.
 *
 * Client navigations between admin tabs don't re-run this layout, so every page's loaders
 * re-check admin as well (components/admin/server.ts).
 */
export default function AdminLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense fallback={<AdminGateFallback />}>
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}

async function AdminGate({ children }: { children: ReactNode }) {
  await requireAdmin();
  return <AdminFrame>{children}</AdminFrame>;
}
