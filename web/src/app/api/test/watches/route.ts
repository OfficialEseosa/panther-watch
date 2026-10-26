import { eq } from "drizzle-orm";
import { connection } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { watchedSections } from "@/db/schema";
import { guarded } from "../_lib/guard";

/**
 * GET /api/test/watches[?userId=] (e2e only; header x-e2e-secret) -> { watches: WatchedSection[] }:
 * raw rows, including `lastClosedAt`, which the public API does not expose.
 */
export async function GET(request: Request): Promise<Response> {
  await connection();
  return guarded(request, async () => {
    const userId = new URL(request.url).searchParams.get("userId");
    const watches = await getDb()
      .select()
      .from(watchedSections)
      .where(userId ? eq(watchedSections.userId, userId) : undefined)
      .orderBy(watchedSections.id);
    return Response.json({ watches });
  });
}

const timestamp = z.iso.datetime({ offset: true }).nullable().optional();
const patchSchema = z.object({ id: z.number().int().positive(), notifiedAt: timestamp, lastClosedAt: timestamp });

/**
 * PATCH /api/test/watches  body { id, notifiedAt?, lastClosedAt? } (ISO strings or null)
 * -> { watch }. Back-dates watcher state, e.g. so a re-arm can be tested without waiting
 * REARM_AFTER_MS between runs. 404 when there is no such watch.
 */
export async function PATCH(request: Request): Promise<Response> {
  return guarded(request, async () => {
    const parsed = patchSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return Response.json({ error: parsed.error.message }, { status: 400 });
    const { id, notifiedAt, lastClosedAt } = parsed.data;
    const toDate = (value: string | null) => (value === null ? null : new Date(value));
    const [watch] = await getDb()
      .update(watchedSections)
      .set({
        ...(notifiedAt !== undefined ? { notifiedAt: toDate(notifiedAt) } : {}),
        ...(lastClosedAt !== undefined ? { lastClosedAt: toDate(lastClosedAt) } : {}),
      })
      .where(eq(watchedSections.id, id))
      .returning();
    if (!watch) return Response.json({ error: "no such watch" }, { status: 404 });
    return Response.json({ watch });
  });
}
