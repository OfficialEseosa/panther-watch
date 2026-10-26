import type { Metadata } from "next";
import { Suspense } from "react";
import { GradesPanel } from "@/components/admin/GradesPanel";
import { AdminLoading } from "@/components/admin/AdminFrame";
import { LoadError, settle } from "@/components/admin/LoadError";
import { loadGradeStatus } from "@/components/admin/server";

export const metadata: Metadata = { title: "Grade data · Admin" };

export default function AdminGradesPage() {
  return (
    <Suspense fallback={<AdminLoading label="Loading grade data…" />}>
      <Grades />
    </Suspense>
  );
}

async function Grades() {
  const result = await settle(loadGradeStatus());
  if (!result.ok) return <LoadError what="grade data" />;
  return <GradesPanel initial={result.data} />;
}
