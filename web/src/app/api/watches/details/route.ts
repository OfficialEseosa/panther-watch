import type { NextRequest } from "next/server";
import { guardUser, handleRouteErrors, privateJson } from "@/lib/account/route";
import { listWatchesWithDetails } from "@/lib/watches";

/** The details fan-out has a 20 s deadline; leave headroom for the DB and serialization. */
export const maxDuration = 30;

/**
 * GET /api/watches/details
 * -> 200 { items: Array<{ watch: Watch, section: CourseData | null, partial: boolean }> }
 *    partial: true = GoSolar failed or timed out for that course (show the stored watch, retry);
 *    section null with partial false = GoSolar no longer lists the CRN.
 */
export async function GET(request: NextRequest) {
  return handleRouteErrors("GET /api/watches/details", async () => {
    const guard = await guardUser(request);
    if (guard.response) return guard.response;
    return privateJson(await listWatchesWithDetails(guard.user.id));
  });
}
