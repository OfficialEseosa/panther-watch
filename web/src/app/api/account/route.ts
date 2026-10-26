import { NextResponse, type NextRequest } from "next/server";
import { deleteAccount } from "@/lib/account";
import { NO_STORE, guardUser, handleRouteErrors } from "@/lib/account/route";
import { clearSessionCookie } from "@/lib/auth/session";

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
