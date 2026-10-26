import { eq, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getDb } from "@/db";
import { users, type User } from "@/db/schema";
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

const NO_STORE = { "Cache-Control": "no-store" } as const;

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

  const response = NextResponse.json({ userId: user.id, email: user.email, isAdmin }, { headers: NO_STORE });
  setSessionCookie(response, await signUserSession(user));
  return response;
}

const querySchema = z.object({
  email: z.email(),
  name: z.string().trim().min(1).max(200).optional(),
  admin: z
    .enum(["1", "0", "true", "false"])
    .optional()
    .transform((v) => v === "1" || v === "true"),
});

/**
 * GET /api/test/login?secret=&email=&name=&admin=  (local dev only, same guard as POST)
 *
 * One-click sign-in link for `npm run dev:local` (scripts/dev-local.ts prints ready-made
 * links). Finds the user by google_sub `local:<email>`, else by email (any existing row, e.g.
 * one created by a real Google sign-in), else creates it with google_sub `local:<email>`;
 * then sets the session cookie and 303-redirects to /dashboard.
 *
 * A missing or wrong secret answers 404, exactly like the route being disabled, so a guessed
 * link reveals nothing. 400 bad query (or `admin=1` for an email not in ADMIN_EMAILS).
 */
export async function GET(request: Request): Promise<Response> {
  if (!testRoutesEnabled()) return notFound();
  const params = new URL(request.url).searchParams;
  if (!secretMatches(params.get("secret") ?? "")) return notFound();

  const parsed = querySchema.safeParse({
    email: params.get("email") ?? undefined,
    name: params.get("name") || undefined,
    admin: params.get("admin") || undefined,
  });
  if (!parsed.success) {
    return Response.json({ error: `bad query: ${parsed.error.message}` }, { status: 400, headers: NO_STORE });
  }
  const query = parsed.data;
  const email = query.email.toLowerCase();
  if (query.admin && !isAdminEmail(email)) {
    return Response.json({ error: `${email} is not listed in ADMIN_EMAILS` }, { status: 400, headers: NO_STORE });
  }

  const db = getDb();
  const googleSub = `local:${email}`;
  const [bySub] = await db.select().from(users).where(eq(users.googleSub, googleSub)).limit(1);
  const [existing] = bySub
    ? [bySub]
    : await db.select().from(users).where(sql`lower(${users.email}) = ${email}`).limit(1);
  const [user] = existing
    ? query.name && query.name !== existing.name
      ? await db.update(users).set({ name: query.name }).where(eq(users.id, existing.id)).returning()
      : [existing]
    : await db
        .insert(users)
        .values({ email, name: query.name ?? null, pictureUrl: null, googleSub })
        .returning();

  const response = NextResponse.redirect(new URL("/dashboard", request.url), {
    status: 303,
    // The secret is in this URL: keep it out of caches and out of the next page's Referer.
    headers: { ...NO_STORE, "Referrer-Policy": "no-referrer" },
  });
  setSessionCookie(response, await signUserSession(user));
  return response;
}

function signUserSession(user: User): Promise<string> {
  return signSession({ sub: user.id, email: user.email, name: user.name, picture: user.pictureUrl });
}
