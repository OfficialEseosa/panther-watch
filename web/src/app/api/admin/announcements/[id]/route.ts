import type { NextRequest } from "next/server";
import { adminJson, guardAdmin, handleErrors, notFound, parseId, readJson } from "@/lib/admin/route";
import { remove, update } from "@/lib/announcements";

interface Context {
  params: Promise<{ id: string }>;
}

/**
 * PATCH /api/admin/announcements/:id
 * body: any of { message, level, startsAt, expiresAt (null clears), active }
 * -> 200 { announcement: AdminAnnouncement } | 404
 */
export async function PATCH(request: NextRequest, { params }: Context) {
  return handleErrors(async () => {
    const guard = await guardAdmin(request, { mutation: true });
    if (guard.response) return guard.response;
    const id = parseId((await params).id);
    if (id === null) return notFound();
    const announcement = await update(id, await readJson(request));
    return announcement ? adminJson({ announcement }) : notFound();
  });
}

/** DELETE /api/admin/announcements/:id -> 204 | 404 */
export async function DELETE(request: NextRequest, { params }: Context) {
  return handleErrors(async () => {
    const guard = await guardAdmin(request, { mutation: true });
    if (guard.response) return guard.response;
    const id = parseId((await params).id);
    if (id === null || !(await remove(id))) return notFound();
    return new Response(null, { status: 204 });
  });
}
