import { handleCronJob } from "@/lib/jobs/cron-route";
import { runCatalogJob } from "@/lib/jobs/course-meta";

/** One catalog run does at most ~45 s of work (DEFAULT_BUDGET_MS) and resumes on the next call. */
export const maxDuration = 60;

/** Refreshes the course catalog for the registrable terms (pg_cron, every 5 min 09:00-09:55 UTC). */
export async function POST(request: Request): Promise<Response> {
  return handleCronJob(request, "catalog", () => runCatalogJob());
}
