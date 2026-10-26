import type { Metadata } from "next";
import { Suspense } from "react";
import { AnnouncementsPanel } from "@/components/admin/AnnouncementsPanel";
import { AdminLoading } from "@/components/admin/AdminFrame";
import { LoadError, settle } from "@/components/admin/LoadError";
import { loadAnnouncements } from "@/components/admin/server";

export const metadata: Metadata = { title: "Announcements · Admin" };

export default function AdminAnnouncementsPage() {
  return (
    <Suspense fallback={<AdminLoading label="Loading announcements…" />}>
      <Announcements />
    </Suspense>
  );
}

async function Announcements() {
  const result = await settle(loadAnnouncements());
  if (!result.ok) return <LoadError what="announcements" />;
  return <AnnouncementsPanel initial={result.data.announcements} renderedAt={result.data.renderedAt} />;
}
