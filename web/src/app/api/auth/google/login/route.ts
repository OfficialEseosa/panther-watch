import { randomBytes } from "node:crypto";
import { connection, NextResponse, type NextRequest } from "next/server";
import { OAUTH_STATE_COOKIE, secureCookies } from "@/lib/auth/constants";
import { buildAuthUrl } from "@/lib/auth/google";
import { AUTH_NEXT_COOKIE, isSafeNext } from "@/lib/auth/next";
import { env } from "@/lib/env";

// Runs on the Node.js runtime (the default; Cache Components forbids a `runtime` export).

export async function GET(request: NextRequest) {
  // Opt out of build-time prerendering: the state must be fresh per request.
  await connection();

  // The state cookie must be set on the origin Google redirects back to (APP_URL). Started
  // from any other host (a preview URL, www vs apex), the callback would never see it.
  const canonical = new URL("/api/auth/google/login", env.APP_URL);
  if (request.nextUrl.origin !== canonical.origin) {
    canonical.search = request.nextUrl.search;
    return NextResponse.redirect(canonical, 302);
  }

  const state = randomBytes(32).toString("base64url");
  const response = NextResponse.redirect(buildAuthUrl(state), 302);
  const cookie = {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  } as const;
  response.cookies.set(OAUTH_STATE_COOKIE, state, cookie);
  // `?next=` (only an app-connection authorize URL, see isSafeNext): the callback returns there
  // instead of /dashboard, so connecting an app survives having to sign in first.
  const next = request.nextUrl.searchParams.get("next");
  if (isSafeNext(next)) response.cookies.set(AUTH_NEXT_COOKIE, next, cookie);
  else response.cookies.set(AUTH_NEXT_COOKIE, "", { ...cookie, maxAge: 0 });
  return response;
}
