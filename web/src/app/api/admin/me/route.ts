import { adminJson, apiError, handleErrors, NO_STORE } from "@/lib/admin/route";
import { getCurrentUser, isAdminEmail } from "@/lib/auth/session";

/**
 * GET /api/admin/me -> 200 { isAdmin: boolean } for any signed-in user, 401 when signed out.
 * Replaces the old GET /api/admin/check. Deliberately not 404 for non-admins: the sidebar
 * asks every signed-in user.
 */
export async function GET() {
  return handleErrors(async () => {
    const user = await getCurrentUser();
    if (!user) return apiError(401, "unauthorized", "Sign in required", { headers: NO_STORE });
    return adminJson({ isAdmin: isAdminEmail(user.email) });
  });
}
