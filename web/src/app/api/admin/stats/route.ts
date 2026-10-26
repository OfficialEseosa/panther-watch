import type { NextRequest } from "next/server";
import { getStats } from "@/lib/admin";
import { adminJson, guardAdmin, handleErrors } from "@/lib/admin/route";

/** GET /api/admin/stats -> 200 AdminStats */
export async function GET(request: NextRequest) {
  return handleErrors(async () => {
    const guard = await guardAdmin(request);
    if (guard.response) return guard.response;
    return adminJson(await getStats());
  });
}
