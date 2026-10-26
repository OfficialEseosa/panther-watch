import type { NextRequest } from "next/server";
import { sendSampleSeatAlert } from "@/lib/admin";
import { adminJson, guardAdmin, handleErrors, readJson } from "@/lib/admin/route";

/** A live GoSolar lookup when a section is named; leaves room for its timeout. */
export const maxDuration = 30;

/**
 * POST /api/admin/email/test-alert
 * body { term?, subject?, courseNumber?, crn? } (all four for a real section, or none for a sample)
 * Sends the seat-alert email, subject "[TEST] ...", to the signed-in admin only.
 * -> 200 { email: { id, to, subject, logId, live } } | 400 | 404 section_not_found
 *    | 429 (budget or provider quota) | 502 (GoSolar or provider)
 */
export async function POST(request: NextRequest) {
  return handleErrors(async () => {
    const guard = await guardAdmin(request, { mutation: true });
    if (guard.response) return guard.response;
    const email = await sendSampleSeatAlert(guard.user, await readJson(request));
    return adminJson({ email });
  });
}
