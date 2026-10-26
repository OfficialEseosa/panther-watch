import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { signSession } from "@/lib/auth/jwt";
import { isAdminEmail, setSessionCookie } from "@/lib/auth/session";
import { notFound, secretMatches, testRoutesEnabled } from "../_lib/guard";

const bodySchema = z.object({
  secret: z.string(),
  email: z.email(),
  name: z.string().trim().min(1).max(200).optional(),
  /** Asserts the account is an admin. Admin comes from ADMIN_EMAILS, so the email must be listed there. */
  admin: z.boolean().optional(),
});

/**
 * POST /api/test/login  body { secret, email, name?, admin? }  (e2e only, see ../_lib/guard.ts)
 * -> 200 { userId, email, isAdmin } plus the real session cookie, signed and set by the same
 * helpers the Google callback uses. The user row is upserted with google_sub `e2e:<email>`.
 * 400 bad body (or `admin: true` for an email not in ADMIN_EMAILS); 403 bad secret; 404 disabled.
 */
export async function POST(request: Request): Promise<Response> {
  if (!testRoutesEnabled()) return notFound();
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: `bad body: ${parsed.error.message}` }, { status: 400 });
  const body = parsed.data;
  if (!secretMatches(body.secret)) return Response.json({ error: "bad e2e secret" }, { status: 403 });

  const email = body.email.toLowerCase();
  const isAdmin = isAdminEmail(email);
  if (body.admin === true && !isAdmin) {
    return Response.json({ error: `${email} is not listed in ADMIN_EMAILS` }, { status: 400 });
  }

  const db = getDb();
  const googleSub = `e2e:${email}`;
  const [existing] = await db.select().from(users).where(eq(users.googleSub, googleSub)).limit(1);
  const [user] = existing
    ? await db
        .update(users)
        .set({ name: body.name ?? existing.name })
        .where(eq(users.id, existing.id))
        .returning()
    : await db
        .insert(users)
        .values({ email, name: body.name ?? null, pictureUrl: null, googleSub })
        .returning();

  const token = await signSession({ sub: user.id, email: user.email, name: user.name, picture: user.pictureUrl });
  const response = NextResponse.json(
    { userId: user.id, email: user.email, isAdmin },
    { headers: { "Cache-Control": "no-store" } },
  );
  setSessionCookie(response, token);
  return response;
}
