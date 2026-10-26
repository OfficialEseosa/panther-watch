import type { NextRequest } from "next/server";
import { listUsers } from "@/lib/admin";
import { adminJson, guardAdmin, handleErrors } from "@/lib/admin/route";

/**
 * GET /api/admin/users?q&limit&offset
 * q: case-insensitive substring of name or email; limit 1-200 (default 50); offset >= 0.
 * -> 200 { users: AdminUser[], total, limit, offset }
 * Replaces both GET /api/admin/users and POST /api/admin/users/search.
 */
export async function GET(request: NextRequest) {
  return handleErrors(async () => {
    const guard = await guardAdmin(request);
    if (guard.response) return guard.response;
    const params = request.nextUrl.searchParams;
    return adminJson(
      await listUsers({
        q: params.get("q") ?? undefined,
        limit: params.get("limit") ?? undefined,
        offset: params.get("offset") ?? undefined,
      }),
    );
  });
}
