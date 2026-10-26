import type { NextRequest } from "next/server";
import { adminJson, guardAdmin, handleErrors, readJson } from "@/lib/admin/route";
import { create, listAll } from "@/lib/announcements";

/** GET /api/admin/announcements -> 200 { announcements: AdminAnnouncement[] } (all, newest first). */
export async function GET(request: NextRequest) {
  return handleErrors(async () => {
    const guard = await guardAdmin(request);
    if (guard.response) return guard.response;
    return adminJson({ announcements: await listAll() });
  });
}

/**
 * POST /api/admin/announcements
 * body { message, level?, startsAt?, expiresAt? } (ISO date-times with offset)
 * -> 201 { announcement: AdminAnnouncement }
 */
export async function POST(request: NextRequest) {
  return handleErrors(async () => {
    const guard = await guardAdmin(request, { mutation: true });
    if (guard.response) return guard.response;
    const announcement = await create(guard.user.id, await readJson(request));
    return adminJson({ announcement }, { status: 201 });
  });
}
