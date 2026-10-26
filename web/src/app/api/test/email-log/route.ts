import { desc } from "drizzle-orm";
import { connection } from "next/server";
import { getDb } from "@/db";
import { emailLog } from "@/db/schema";
import { guarded } from "../_lib/guard";

/** GET /api/test/email-log[?limit=20] (e2e only; header x-e2e-secret) -> { emails: EmailLog[] }, newest first. */
export async function GET(request: Request): Promise<Response> {
  await connection();
  return guarded(request, async () => {
    const limit = Math.min(200, Math.max(1, Number(new URL(request.url).searchParams.get("limit")) || 20));
    const emails = await getDb().select().from(emailLog).orderBy(desc(emailLog.id)).limit(limit);
    return Response.json({ emails });
  });
}
