import { after, type NextRequest } from "next/server";
import { startGradeRefresh } from "@/lib/admin/grades";
import { adminJson, apiError, guardAdmin, handleErrors, NO_STORE } from "@/lib/admin/route";

/**
 * POST /api/admin/grades/refresh: SECONDARY / best effort. Tries to scrape the next term from
 * APEX directly (one term per call, like the cron). GSU's APEX is behind a Cloudflare
 * interactive JS challenge for every non-browser client, so from production this is expected
 * to fail (502 with ?sync=1, or a failed `grades` job run). Use POST /api/admin/grades/upload.
 * -> 202 { started: true, runId } and the ingest runs in `after()`
 * -> ?sync=1: 200 { runId, result: IngestResult } once it finishes (502 if it fails)
 * -> 409 when a grades run (cron or admin) is already active
 */
export async function POST(request: NextRequest) {
  return handleErrors(async () => {
    const guard = await guardAdmin(request, { mutation: true });
    if (guard.response) return guard.response;

    const refresh = await startGradeRefresh();
    if (!refresh) {
      return apiError(409, "already_running", "A grade refresh is already running", { headers: NO_STORE });
    }

    if (request.nextUrl.searchParams.get("sync") === "1") {
      try {
        return adminJson({ runId: refresh.runId, result: await refresh.run() });
      } catch (error) {
        console.error("Grade refresh failed", error);
        return apiError(502, "ingest_failed", "Grade ingest failed; see the job run summary", { headers: NO_STORE });
      }
    }

    after(async () => {
      try {
        await refresh.run();
      } catch (error) {
        console.error("Grade refresh failed", error);
      }
    });
    return adminJson({ started: true, runId: refresh.runId }, { status: 202 });
  });
}
