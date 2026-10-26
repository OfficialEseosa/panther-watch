import { NextRequest, type NextResponse } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GET as callback } from "@/app/api/auth/google/callback/route";
import { GET as login } from "@/app/api/auth/google/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { OAUTH_STATE_COOKIE, sessionCookieName } from "@/lib/auth/constants";

// `connection()` needs Next's request store, which only exists inside the server.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  connection: async () => {},
}));

const APP = "http://localhost:3000";

function callbackRequest(query: string, stateCookie?: string): NextRequest {
  return new NextRequest(`${APP}/api/auth/google/callback?${query}`, {
    headers: stateCookie ? { cookie: `${OAUTH_STATE_COOKIE}=${stateCookie}` } : {},
  });
}

function logoutRequest(headers: Record<string, string>): NextRequest {
  return new NextRequest(`${APP}/api/auth/logout`, {
    method: "POST",
    headers: { cookie: `${sessionCookieName()}=some.jwt.token`, ...headers },
  });
}

afterEach(() => vi.restoreAllMocks());

describe("GET /api/auth/google/login", () => {
  it("bounces a non-canonical origin to APP_URL before setting any state", async () => {
    const response = await login(new NextRequest("https://pantherwatch-git-x.vercel.app/api/auth/google/login"));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${APP}/api/auth/google/login`);
    expect(response.headers.get("set-cookie")).toBeNull();
  });

  it("sets a state cookie and redirects to Google on the canonical origin", async () => {
    const response = await login(new NextRequest(`${APP}/api/auth/google/login`));
    const location = new URL(response.headers.get("location") ?? "");
    expect(location.origin).toBe("https://accounts.google.com");
    const state = response.cookies.get(OAUTH_STATE_COOKIE);
    expect(state).toMatchObject({ httpOnly: true, path: "/api/auth/google", maxAge: 600 });
    expect(location.searchParams.get("state")).toBe(state?.value);
    expect(location.searchParams.get("redirect_uri")).toBe(`${APP}/api/auth/google/callback`);
  });
});

describe("GET /api/auth/google/callback", () => {
  it("rejects a state that does not match the cookie, without calling Google", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const response = await callback(callbackRequest("code=abc&state=attacker", "expected"));
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(`${APP}/?auth_error=invalid_state`);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("rejects a missing state cookie", async () => {
    const response = await callback(callbackRequest("code=abc&state=whatever"));
    expect(response.headers.get("location")).toBe(`${APP}/?auth_error=invalid_state`);
  });

  it("passes Google's error=access_denied through and clears the state cookie", async () => {
    const response = await callback(callbackRequest("error=access_denied&state=s", "s"));
    expect(response.headers.get("location")).toBe(`${APP}/?auth_error=access_denied`);
    expect(response.cookies.get(OAUTH_STATE_COOKIE)).toMatchObject({ value: "", maxAge: 0 });
  });

  it("does not echo an unexpected error value", async () => {
    const response = await callback(callbackRequest(`error=${encodeURIComponent("<script>")}`));
    expect(response.headers.get("location")).toBe(`${APP}/?auth_error=oauth_error`);
  });

  it("logs only the error name and code when the token exchange fails", async () => {
    vi.spyOn(globalThis, "fetch").mockResolvedValue(
      Response.json({ error: "invalid_grant", error_description: "code=abc secret stuff" }, { status: 400 }),
    );
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await callback(callbackRequest("code=abc&state=s", "s"));
    expect(response.headers.get("location")).toBe(`${APP}/?auth_error=login_failed`);
    expect(log).toHaveBeenCalledWith("Google sign-in failed", "GoogleOAuthError", "400:invalid_grant");
    expect(JSON.stringify(log.mock.calls)).not.toContain("abc");
  });
});

describe("POST /api/auth/logout", () => {
  it("refuses a cross-site request (no or foreign Origin)", async () => {
    expect((await logout(logoutRequest({}))).status).toBe(403);
    const foreign = await logout(logoutRequest({ origin: "https://evil.example" }));
    expect(foreign.status).toBe(403);
    expect(foreign.headers.get("set-cookie")).toBeNull();
    expect((await logout(logoutRequest({ "sec-fetch-site": "cross-site" }))).status).toBe(403);
  });

  it("clears the session cookie for a same-origin request", async () => {
    const response = (await logout(logoutRequest({ origin: APP }))) as NextResponse;
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe(`${APP}/`);
    expect(response.cookies.get(sessionCookieName())).toMatchObject({
      value: "",
      maxAge: 0,
      httpOnly: true,
      path: "/",
    });
  });

  it("accepts Sec-Fetch-Site: same-origin without an Origin header", async () => {
    const response = await logout(logoutRequest({ "sec-fetch-site": "same-origin" }));
    expect(response.status).toBe(303);
  });
});
