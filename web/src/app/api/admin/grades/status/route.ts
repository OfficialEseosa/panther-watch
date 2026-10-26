import type { NextRequest } from "next/server";
import { getGradeStatus } from "@/lib/admin/grades";
import { adminJson, guardAdmin, handleErrors } from "@/lib/admin/route";

/** GET /api/admin/grades/status -> 200 { terms: string[], lastRun: JobRun | null, running } */
export async function GET(request: NextRequest) {
  return handleErrors(async () => {
    const guard = await guardAdmin(request);
    if (guard.response) return guard.response;
    return adminJson(await getGradeStatus());
  });
}
