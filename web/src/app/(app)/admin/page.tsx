import type { Metadata } from "next";
import { Suspense } from "react";
import { Overview, OverviewSkeleton } from "@/components/admin/Overview";

export const metadata: Metadata = { title: "Admin" };

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<OverviewSkeleton />}>
      <Overview />
    </Suspense>
  );
}
