import "server-only";
import { eq } from "drizzle-orm";
import { cookies } from "next/headers";
import { notFound, redirect } from "next/navigation";
import type { NextResponse } from "next/server";
import { cache } from "react";
import { getDb } from "@/db";
import { users, type User } from "@/db/schema";
import { env } from "@/lib/env";
import {
  SESSION_COOKIE,
  SESSION_MAX_AGE_S,
  secureCookies,
  sessionCookieName,
} from "./constants";
import { verifySession, type SessionClaims } from "./jwt";

/** Attributes of the session cookie. `__Host-` (production) also requires path "/" and no domain. */
export const sessionCookieOptions = {
  httpOnly: true,
  secure: secureCookies(),
  sameSite: "lax",
  path: "/",
  maxAge: SESSION_MAX_AGE_S,
} as const;

/** Sets the session cookie (under this environment's name) on `response`. */
export function setSessionCookie(response: NextResponse, token: string): void {
  response.cookies.set(sessionCookieName(), token, sessionCookieOptions);
}

/**
 * Expires the session cookie on `response`. Use this for logout and account deletion rather
 * than hard-coding a name. In production it also expires the pre-`__Host-` `pw_session` name.
 */
export function clearSessionCookie(response: NextResponse): void {
  response.cookies.set(sessionCookieName(), "", { ...sessionCookieOptions, maxAge: 0 });
  if (sessionCookieName() !== SESSION_COOKIE) {
    response.cookies.set(SESSION_COOKIE, "", { ...sessionCookieOptions, maxAge: 0 });
  }
}

/**
 * Verified JWT claims from the session cookie, or null. CHEAP BUT NOT AUTHORITATIVE: a token
 * stays valid for 30 days even after the account is deleted, and its email/name are a
 * snapshot from sign-in. Use it only for display hints. Authorization (anything that reads or
 * writes user data, or checks admin) must use `getCurrentUser()` / `requireUser()` /
 * `requireAdmin()`, which load the user row.
 */
export async function getSession(): Promise<SessionClaims | null> {
  const token = (await cookies()).get(sessionCookieName())?.value;
  return token ? verifySession(token) : null;
}

/** Claims, or a redirect to `/` when signed out. Same caveat as `getSession()`. */
export async function requireSession(): Promise<SessionClaims> {
  const session = await getSession();
  if (!session) redirect("/");
  return session;
}

export interface CurrentUser extends User {
  /** `email` is listed in ADMIN_EMAILS. Uses the row's current email, not the JWT's. */
  isAdmin: boolean;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The signed-in user, loaded from the database: verifies the JWT, then reads the `users` row
 * by id. Returns null when there is no valid token OR the row no longer exists (deleted
 * account), so deleting a user revokes every outstanding session. Treat null as signed out.
 * Memoized per request with React `cache()`, so layouts and pages can all call it.
 */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const claims = await getSession();
  if (!claims || !UUID.test(claims.sub)) return null;
  const [user] = await getDb().select().from(users).where(eq(users.id, claims.sub)).limit(1);
  return user ? { ...user, isAdmin: isAdminEmail(user.email) } : null;
});

/** The signed-in user, or a redirect to `/`. For pages and server actions. */
export async function requireUser(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user) redirect("/");
  return user;
}

/** The signed-in admin, or a 404 (signed out or not an admin), so admin pages stay hidden. */
export async function requireAdmin(): Promise<CurrentUser> {
  const user = await getCurrentUser();
  if (!user?.isAdmin) notFound();
  return user;
}

export function isAdminEmail(email: string | null | undefined): boolean {
  return !!email && env.ADMIN_EMAILS.has(email.trim().toLowerCase());
}
