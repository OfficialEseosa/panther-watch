import { NextResponse, type NextRequest } from "next/server";
import { deleteAccount, setLevelPreference } from "@/lib/account";
import { accountPatchSchema, isLevelPreference } from "@/lib/account/levels";
import { NO_STORE, apiError, guardUser, handleRouteErrors, parseInput, privateJson, readJson } from "@/lib/account/route";
import { clearSessionCookie } from "@/lib/auth/session";

/**
 * GET /api/account -> 200 { email, name, levelPreference }: the signed-in user's account
 * settings. `levelPreference` is the saved campus (GoSolar level US, UA or GS), null when not
 * chosen. 401 when signed out.
 */
export async function GET(request: NextRequest) {
  return handleRouteErrors("GET /api/account", async () => {
    const guard = await guardUser(request);
    if (guard.response) return guard.response;
    const { email, name, levelPreference } = guard.user;
    return privateJson({ email, name, levelPreference: isLevelPreference(levelPreference) ? levelPreference : null });
  });
}

/**
 * PATCH /api/account { levelPreference: "US" | "UA" | "GS" | null } -> 200 { levelPreference }.
 * Saves (or clears) the campus that the course search form and the assistant default to.
 * 400 for any other body, 401 when signed out, 403 cross-origin.
 */
export async function PATCH(request: NextRequest) {
  return handleRouteErrors("PATCH /api/account", async () => {
    const guard = await guardUser(request, { mutation: true });
    if (guard.response) return guard.response;
    const { levelPreference } = parseInput(accountPatchSchema, await readJson(request));
    if (!(await setLevelPreference(guard.user.id, levelPreference))) {
      return apiError(401, "unauthorized", "Sign in required");
    }
    return privateJson({ levelPreference });
  });
}

/**
 * DELETE /api/account -> 200 { deleted: true } and the session cookie cleared. Deletes the
 * user with their watches and schedule (cascade), then sends the goodbye email (a mail
 * failure does not fail the request). 401 when signed out, 403 cross-origin.
 */
export async function DELETE(request: NextRequest) {
  return handleRouteErrors("DELETE /api/account", async () => {
    const guard = await guardUser(request, { mutation: true });
    if (guard.response) return guard.response;
    await deleteAccount(guard.user.id);
    const response = NextResponse.json({ deleted: true }, { headers: NO_STORE });
    clearSessionCookie(response);
    return response;
  });
}
