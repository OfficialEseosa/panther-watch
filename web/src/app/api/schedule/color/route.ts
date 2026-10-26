import type { NextRequest } from "next/server";
import { apiError, guardUser, handleRouteErrors, parseInput, privateJson, readJson } from "@/lib/account/route";
import { setColor, setColorSchema } from "@/lib/schedule";

/**
 * PATCH /api/schedule/color  body { term, crn, color: number | null } (palette index 0-7;
 * null resets to the CRN-derived default) -> 200 { entry } | 404 not_found.
 */
export async function PATCH(request: NextRequest) {
  return handleRouteErrors("PATCH /api/schedule/color", async () => {
    const guard = await guardUser(request, { mutation: true });
    if (guard.response) return guard.response;
    const { term, crn, color } = parseInput(setColorSchema, await readJson(request));
    const entry = await setColor(guard.user.id, term, crn, color);
    if (!entry) return apiError(404, "not_found", "That class is not on your schedule");
    return privateJson({ entry });
  });
}
