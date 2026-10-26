import { connection } from "next/server";
import { notFound, testRoutesEnabled } from "../_lib/guard";

/** GET /api/test/health -> 200 { ok: true } when the e2e routes are enabled (the rig's readiness probe). */
export async function GET(): Promise<Response> {
  await connection();
  if (!testRoutesEnabled()) return notFound();
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } });
}
