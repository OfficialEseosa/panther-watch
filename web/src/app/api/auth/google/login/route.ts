import { randomBytes } from "node:crypto";
import { connection, NextResponse, type NextRequest } from "next/server";
import { OAUTH_STATE_COOKIE, secureCookies } from "@/lib/auth/constants";
import { buildAuthUrl } from "@/lib/auth/google";
import { env } from "@/lib/env";

// Runs on the Node.js runtime (the default; Cache Components forbids a `runtime` export).

export async function GET(request: NextRequest) {
  // Opt out of build-time prerendering: the state must be fresh per request.
  await connection();

  // The state cookie must be set on the origin Google redirects back to (APP_URL). Started
  // from any other host (a preview URL, www vs apex), the callback would never see it.
  const canonical = new URL("/api/auth/google/login", env.APP_URL);
  if (request.nextUrl.origin !== canonical.origin) {
    return NextResponse.redirect(canonical, 302);
  }

  const state = randomBytes(32).toString("base64url");
  const response = NextResponse.redirect(buildAuthUrl(state), 302);
  response.cookies.set(OAUTH_STATE_COOKIE, state, {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 600,
  });
  return response;
}
