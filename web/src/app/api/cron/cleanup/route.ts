import { json, requireCronSecret } from "@/lib/http";
import { runCleanupJob } from "@/lib/jobs/cleanup";
import { errorMessage } from "@/lib/jobs/runs";

export const maxDuration = 300;

/**
 * Daily purge: refresh the terms cache, then delete watches for view-only or expired terms,
 * schedule entries for view-only terms only, and old email_log/job_runs rows. Runs inside the request (it takes about a
 * second) and returns the summary.
 *
 * POST is pg_cron's primary trigger. GET is Vercel's backup cron (vercel.json), which sends
 * `Authorization: Bearer <CRON_SECRET>` itself when CRON_SECRET is set. Both check it.
 */
async function handler(request: Request): Promise<Response> {
  const denied = requireCronSecret(request);
  if (denied) return denied;
  try {
    return json(await runCleanupJob());
  } catch (error) {
    console.error("cron cleanup failed", error);
    return json({ error: errorMessage(error) }, { status: 500 });
  }
}

export { handler as GET, handler as POST };
