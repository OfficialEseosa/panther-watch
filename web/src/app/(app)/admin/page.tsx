import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminLoading } from "@/components/admin/AdminFrame";
import { Overview } from "@/components/admin/Overview";

export const metadata: Metadata = { title: "Admin" };

export default function AdminOverviewPage() {
  return (
    <Suspense fallback={<AdminLoading label="Loading statistics…" />}>
      <Overview />
    </Suspense>
  );
}
