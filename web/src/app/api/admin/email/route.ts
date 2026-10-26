import type { NextRequest } from "next/server";
import { sendAdminEmail } from "@/lib/admin";
import { adminJson, guardAdmin, handleErrors, readJson } from "@/lib/admin/route";

/**
 * POST /api/admin/email (replaces POST /api/admin/email/send)
 * body { to, subject, htmlBody, previewText? }
 * -> 200 { email: { id, to, subject, logId } } | 400 | 429 (provider quota) | 502
 */
export async function POST(request: NextRequest) {
  return handleErrors(async () => {
    const guard = await guardAdmin(request, { mutation: true });
    if (guard.response) return guard.response;
    const email = await sendAdminEmail(guard.user.id, await readJson(request));
    return adminJson({ email });
  });
}
