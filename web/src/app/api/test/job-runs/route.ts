import { desc, eq } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db";
import { jobRuns } from "@/db/schema";
import { guarded } from "../_lib/guard";

/** GET /api/test/job-runs[?job=watcher][&limit=20] (e2e only; header x-e2e-secret) -> { runs: JobRun[] }, newest first. */
export async function GET(request: Request): Promise<Response> {
  await connection();
  return guarded(request, async () => {
    const params = new URL(request.url).searchParams;
    const job = params.get("job");
    const limit = Math.min(200, Math.max(1, Number(params.get("limit")) || 20));
    const runs = await getDb()
      .select()
      .from(jobRuns)
      .where(job ? eq(jobRuns.job, job) : undefined)
      .orderBy(desc(jobRuns.id))
      .limit(limit);
    return Response.json({ runs });
  });
}
