import { connection, NextResponse, type NextRequest } from "next/server";
import { AUTHORIZE_PATH } from "@/lib/auth/next";
import { getCurrentUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { checkAuthorizeRequest } from "@/lib/oauth";

/**
 * GET /api/oauth/authorize: the OAuth authorization endpoint (code flow, PKCE S256 required).
 *
 * - Not on APP_URL's origin: 302 to the same request there (the session cookie lives there).
 * - A problem with the client or redirect URI: shown on /connect, never redirected.
 * - A problem with the rest of the request: 302 back to the client with `error` (+ state, iss).
 * - Signed out: 302 to `/?next=<this URL>`; signing in from there comes back here.
 * - Signed in: 302 to the consent page `/connect` with the same query.
 */
export async function GET(request: NextRequest) {
  await connection(); // request-time only: reads the session and APP_URL
  const canonical = new URL(AUTHORIZE_PATH, env.APP_URL);
  if (request.nextUrl.origin !== canonical.origin) {
    canonical.search = request.nextUrl.search;
    return NextResponse.redirect(canonical, 302);
  }

  const params = request.nextUrl.searchParams;
  const check = await checkAuthorizeRequest(params);
  if (!check.ok && check.kind === "redirect") return NextResponse.redirect(check.location, 302);

  const query = params.toString();
  if (check.ok && !(await getCurrentUser())) {
    const landing = new URL("/", env.APP_URL);
    landing.searchParams.set("next", `${AUTHORIZE_PATH}?${query}`);
    return NextResponse.redirect(landing, 302);
  }
  return NextResponse.redirect(new URL(`/connect?${query}`, env.APP_URL), 302);
}
