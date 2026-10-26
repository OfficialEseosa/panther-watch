import { after, NextResponse, type NextRequest } from "next/server";
import { sendWelcomeEmailOnce } from "@/lib/account";
import { OAUTH_STATE_COOKIE, secureCookies } from "@/lib/auth/constants";
import { exchangeCode, fetchUserInfo } from "@/lib/auth/google";
import { signSession } from "@/lib/auth/jwt";
import { setSessionCookie } from "@/lib/auth/session";
import { AccountConflictError, UnverifiedEmailError, upsertGoogleUser } from "@/lib/auth/users";
import { env } from "@/lib/env";
import { constantTimeEqual } from "@/lib/http";

function redirectTo(path: string): NextResponse {
  const response = NextResponse.redirect(new URL(path, env.APP_URL), 302);
  response.cookies.set(OAUTH_STATE_COOKIE, "", {
    httpOnly: true,
    secure: secureCookies(),
    sameSite: "lax",
    path: "/api/auth/google",
    maxAge: 0,
  });
  return response;
}

function authError(code: string): NextResponse {
  // Google's error codes are short snake_case words; anything else is not echoed back.
  const safe = /^[a-z_]{1,64}$/.test(code) ? code : "oauth_error";
  return redirectTo(`/?auth_error=${safe}`);
}

/** Only the error's class and code: messages and causes may carry tokens, codes or emails. */
function logFailure(cause: unknown): void {
  const name = cause instanceof Error ? cause.name : typeof cause;
  const code =
    cause && typeof cause === "object" && "code" in cause && typeof cause.code === "string"
      ? cause.code
      : "";
  console.error("Google sign-in failed", name, code);
}

export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const error = params.get("error");
  const code = params.get("code");
  const state = params.get("state");
  const expectedState = request.cookies.get(OAUTH_STATE_COOKIE)?.value;

  if (error) return authError(error);
  if (!code || !state || !expectedState || !constantTimeEqual(state, expectedState)) {
    return authError("invalid_state");
  }

  try {
    const tokens = await exchangeCode(code);
    const info = await fetchUserInfo(tokens.access_token);
    const { user, created } = await upsertGoogleUser(info);
    // Brand-new account only (not a returning sign-in, not linking a legacy row). After the
    // response, outside any transaction; it never throws and sends at most once per user.
    if (created) after(() => sendWelcomeEmailOnce(user.id));
    const token = await signSession({
      sub: user.id,
      email: user.email,
      name: user.name,
      picture: user.pictureUrl,
    });

    const response = redirectTo("/dashboard");
    setSessionCookie(response, token);
    return response;
  } catch (cause) {
    if (cause instanceof AccountConflictError) return authError("account_conflict");
    if (cause instanceof UnverifiedEmailError) return authError("unverified_email");
    logFailure(cause);
    return authError("login_failed");
  }
}
