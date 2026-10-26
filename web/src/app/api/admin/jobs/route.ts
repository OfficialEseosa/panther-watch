import type { NextRequest } from "next/server";
import { z } from "zod";
import { parseInput } from "@/lib/admin/errors";
import { adminJson, guardAdmin, handleErrors } from "@/lib/admin/route";
import { recentRuns } from "@/lib/jobs/runs";

const querySchema = z.object({
  job: z
    .string()
    .regex(/^[a-z][a-z0-9_-]{0,63}$/, "must be a job name like watcher")
    .default("watcher"),
  n: z.coerce.number().int().min(1).max(100).default(20),
});

/** GET /api/admin/jobs?job=watcher&n=20 -> 200 { job, runs: JobRun[] } (newest first) */
export async function GET(request: NextRequest) {
  return handleErrors(async () => {
    const guard = await guardAdmin(request);
    if (guard.response) return guard.response;
    const params = request.nextUrl.searchParams;
    const { job, n } = parseInput(querySchema, {
      job: params.get("job") ?? undefined,
      n: params.get("n") ?? undefined,
    });
    return adminJson({ job, runs: await recentRuns(job, n) });
  });
}
