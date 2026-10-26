import type { Metadata } from "next";
import { Suspense } from "react";
import { GradesPanel } from "@/components/admin/GradesPanel";
import { ListSkeleton } from "@/components/admin/ListSkeleton";
import { LoadError, settle } from "@/components/admin/LoadError";
import { loadGradeStatus } from "@/components/admin/server";

export const metadata: Metadata = { title: "Grade data · Admin" };

export default function AdminGradesPage() {
  return (
    <Suspense fallback={<ListSkeleton label="Loading grade data" rows={4} />}>
      <Grades />
    </Suspense>
  );
}

async function Grades() {
  const result = await settle(loadGradeStatus());
  if (!result.ok) return <LoadError what="grade data" />;
  return <GradesPanel initial={result.data} />;
}
