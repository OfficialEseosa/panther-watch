import { handleCronJob } from "@/lib/jobs/cron-route";
import { runGradesJob } from "@/lib/jobs/course-meta";

export const maxDuration = 300;

/** Ingests one missing grade-distribution term per day (pg_cron, 09:05 UTC). */
export async function POST(request: Request): Promise<Response> {
  return handleCronJob(request, "grades", () => runGradesJob());
}
