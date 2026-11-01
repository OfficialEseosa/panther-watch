import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "@/lib/account/route";
import { AUTHORIZE_PATH } from "@/lib/auth/next";
import { getCurrentUser } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/lib/http";
import { checkAuthorizeRequest, codeRedirect, errorRedirect, grantedScopes, issueAuthorizationCode } from "@/lib/oauth";

const MAX_BODY_BYTES = 16 * 1024;

/**
 * POST /api/oauth/authorize/decision: the consent form on /connect (a plain form post, so it
 * works before hydration). Fields: `request` (the authorize query string, re-validated here),
 * `decision` (`allow` | `deny`), `scope` (each ticked write scope; `read` is always granted).
 *
 * Same-origin only (403 otherwise). Answers 303: Allow -> the client's redirect URI with a
 * 10-minute `code`, `state` and `iss`; Deny -> the redirect URI with `error=access_denied`;
 * signed out -> sign in again; a request that no longer validates -> /connect shows why.
 */
export async function POST(request: NextRequest) {
  const denied = assertSameOrigin(request);
  if (denied) return apiError(403, "forbidden", "Cross-origin request refused");

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return apiError(400, "invalid_request", "request body is too large");
  const form = new URLSearchParams(text);
  const query = form.get("request") ?? "";
  const params = new URLSearchParams(query);
  const see = (location: string) => NextResponse.redirect(location, 303);

  const user = await getCurrentUser();
  if (!user) {
    const landing = new URL("/", env.APP_URL);
    landing.searchParams.set("next", `${AUTHORIZE_PATH}?${params.toString()}`);
    return see(landing.toString());
  }

  const check = await checkAuthorizeRequest(params);
  if (!check.ok) {
    return see(check.kind === "redirect" ? check.location : new URL(`/connect?${params.toString()}`, env.APP_URL).toString());
  }
  const { request: authorization } = check;
  if (form.get("decision") !== "allow") {
    return see(errorRedirect(authorization.redirectUri, "access_denied", "The user did not allow access.", authorization.state));
  }
  const scopes = grantedScopes(authorization.scopes, form.getAll("scope"));
  const code = await issueAuthorizationCode(user.id, authorization, scopes);
  return see(codeRedirect(authorization.redirectUri, code, authorization.state));
}
