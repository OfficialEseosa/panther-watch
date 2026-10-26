import type { Metadata } from "next";
import { Suspense } from "react";
import { JobsPanel } from "@/components/admin/JobsPanel";
import { AdminLoading } from "@/components/admin/AdminFrame";
import { LoadError, settle } from "@/components/admin/LoadError";
import { JOB_RUNS_N, loadRuns } from "@/components/admin/server";

export const metadata: Metadata = { title: "Jobs · Admin" };

export default function AdminJobsPage() {
  return (
    <Suspense fallback={<AdminLoading label="Loading job runs…" />}>
      <Jobs />
    </Suspense>
  );
}

async function Jobs() {
  const result = await settle(loadRuns("watcher"));
  if (!result.ok) return <LoadError what="job runs" />;
  return <JobsPanel initialJob="watcher" initialRuns={result.data} n={JOB_RUNS_N} />;
}
