import { handleCronJob } from "@/lib/jobs/cron-route";
import { runSyllabiJob } from "@/lib/jobs/course-meta";

export const maxDuration = 300;

/** Re-syncs syllabi for every non-view-only term (pg_cron, 10:05 UTC). */
export async function POST(request: Request): Promise<Response> {
  return handleCronJob(request, "syllabi", () => runSyllabiJob());
}
