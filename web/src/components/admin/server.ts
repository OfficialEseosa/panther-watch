import "server-only";
import type { JobRun } from "@/db/schema";
import { getStats, listUsers } from "@/lib/admin";
import { getGradeStatus } from "@/lib/admin/grades";
import { listAll } from "@/lib/announcements";
import { requireAdmin } from "@/lib/auth/session";
import type { AdminAnnouncement, AdminStatsDto, GradeStatusDto, JobRunDto, UserPage } from "@/lib/client/admin";
import { recentRuns } from "@/lib/jobs/runs";

/**
 * Server-side loaders for the admin pages. Each one re-checks admin before touching data:
 * the layout's gate does not re-run on client navigations between admin tabs, so pages must
 * authorize themselves (requireAdmin is memoized per request, so this is cheap). Results are
 * JSON-shaped (Dates -> ISO) so they cross to client islands unchanged.
 */

export function toJobRunDto(run: JobRun): JobRunDto {
  return {
    id: run.id,
    job: run.job,
    startedAt: run.startedAt.toISOString(),
    finishedAt: run.finishedAt?.toISOString() ?? null,
    ok: run.ok ?? null,
    summary: run.summary ?? null,
  };
}

export async function loadStats(): Promise<AdminStatsDto> {
  await requireAdmin();
  const stats = await getStats();
  return { ...stats, lastWatcherRun: stats.lastWatcherRun ? toJobRunDto(stats.lastWatcherRun) : null };
}

export const USERS_PAGE_SIZE = 25;

export async function loadUsers(q: string | undefined): Promise<UserPage> {
  await requireAdmin();
  return listUsers({ q: q?.slice(0, 200), limit: USERS_PAGE_SIZE, offset: 0 });
}

/** All announcements plus the read time, so client grouping matches the server's markup. */
export async function loadAnnouncements(): Promise<{ announcements: AdminAnnouncement[]; renderedAt: number }> {
  await requireAdmin();
  const announcements = await listAll();
  return { announcements, renderedAt: Date.now() };
}

export async function loadGradeStatus(): Promise<GradeStatusDto> {
  await requireAdmin();
  const status = await getGradeStatus();
  return { ...status, lastRun: status.lastRun ? toJobRunDto(status.lastRun) : null };
}

export const JOB_RUNS_N = 20;

export async function loadRuns(job: string): Promise<JobRunDto[]> {
  await requireAdmin();
  return (await recentRuns(job, JOB_RUNS_N)).map(toJobRunDto);
}
