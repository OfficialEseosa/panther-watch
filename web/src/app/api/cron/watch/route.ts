import { handleCronJob } from "@/lib/jobs/cron-route";
import { runWatcher } from "@/lib/watcher/run";

// Hobby + Fluid compute maximum. The watcher stops starting GoSolar searches after 25 s;
// the rest of the budget covers email sends already in flight.
export const maxDuration = 300;

/** Seat watcher, triggered every 3 minutes by pg_cron (docs/runbooks/supabase-cron.sql). */
export async function POST(request: Request): Promise<Response> {
  return handleCronJob(request, "watch", () => runWatcher());
}
