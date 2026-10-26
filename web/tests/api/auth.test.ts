import { eq } from "drizzle-orm";
import { NextRequest, type NextResponse } from "next/server";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setDbForTests } from "@/db";
import { emailLog, users } from "@/db/schema";
import { GET as callback } from "@/app/api/auth/google/callback/route";
import { GET as login } from "@/app/api/auth/google/login/route";
import { POST as logout } from "@/app/api/auth/logout/route";
import { OAUTH_STATE_COOKIE, sessionCookieName } from "@/lib/auth/constants";
import { createMemoryTransport, setDefaultEmailTransport } from "@/lib/email";
import { createTestDb, seedUser, truncateAll, type TestDatabase } from "../helpers/db";
import { callbackRequest as googleCallback, mockGoogle, type MockGoogle } from "../helpers/google";
import { afterTasks, flushAfter } from "../helpers/session";

// `connection()` / `after()` need Next's request store, which only exists inside the server;
// the mocked `after()` queues tasks for `flushAfter()`.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  ...(await import("../helpers/session")).nextServerMock,
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

describe("welcome email: once per user, on first sign-in only (scenario 9)", () => {
  let testDb: TestDatabase;
  let google: MockGoogle;
  const mail = createMemoryTransport();

  beforeAll(async () => {
    testDb = await createTestDb();
    setDbForTests(testDb.db);
    setDefaultEmailTransport(mail);
  });
  afterAll(async () => {
    setDefaultEmailTransport(null);
    setDbForTests(undefined);
    await testDb.close();
  });
  beforeEach(async () => {
    await truncateAll(testDb.db);
    mail.clear();
    afterTasks.length = 0;
    google = mockGoogle();
  });
  afterEach(() => google.restore());

  async function signIn(): Promise<Response> {
    const response = await callback(googleCallback());
    await flushAfter();
    return response;
  }

  const welcomeLogs = () => testDb.db.select().from(emailLog).where(eq(emailLog.type, "welcome"));

  it("first login sends 1 welcome (logged), second login sends 0", async () => {
    google.as({ sub: "g-new-1", email: "fresh@student.gsu.test", name: "Fresh Panther" });

    const first = await signIn();
    expect(first.headers.get("location")).toBe(`${APP}/dashboard`);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe("fresh@student.gsu.test");
    expect(mail.sent[0].tags).toContainEqual({ name: "type", value: "WELCOME" });
    const [user] = await testDb.db.select().from(users).where(eq(users.googleSub, "g-new-1"));
    const logs = await welcomeLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      userId: user.id,
      recipient: "fresh@student.gsu.test",
      type: "welcome",
      subject: mail.sent[0].subject,
      providerMessageId: mail.sent[0].id,
    });

    const second = await signIn();
    expect(second.headers.get("location")).toBe(`${APP}/dashboard`);
    expect(mail.sent).toHaveLength(1);
    expect(await welcomeLogs()).toHaveLength(1);
  });

  it("linking an existing (legacy, no google_sub) row by email sends 0", async () => {
    await seedUser(testDb.db, { email: "legacy@student.gsu.test", googleSub: null });
    google.as({ sub: "g-legacy", email: "legacy@student.gsu.test" });

    const response = await signIn();
    expect(response.headers.get("location")).toBe(`${APP}/dashboard`);
    const [linked] = await testDb.db.select().from(users).where(eq(users.email, "legacy@student.gsu.test"));
    expect(linked.googleSub).toBe("g-legacy");
    expect(mail.sent).toHaveLength(0);
    expect(await welcomeLogs()).toHaveLength(0);
    expect(afterTasks).toHaveLength(0);
  });

  it("a returning user whose Google email changed sends 0", async () => {
    await seedUser(testDb.db, { email: "old@student.gsu.test", googleSub: "g-returning" });
    google.as({ sub: "g-returning", email: "new@student.gsu.test" });
    await signIn();
    expect(mail.sent).toHaveLength(0);
  });

  it("two concurrent first sign-ins for one identity send exactly 1", async () => {
    google.as({ sub: "g-race", email: "race@student.gsu.test" });
    const responses = await Promise.all([callback(googleCallback()), callback(googleCallback())]);
    await flushAfter();
    expect(responses.map((r) => r.headers.get("location"))).toEqual([`${APP}/dashboard`, `${APP}/dashboard`]);
    expect(await testDb.db.select().from(users)).toHaveLength(1);
    expect(mail.sent).toHaveLength(1);
    expect(await welcomeLogs()).toHaveLength(1);
  });

  it("a failed welcome does not block sign-in", async () => {
    google.as({ sub: "g-fail", email: "fail@student.gsu.test" });
    mail.failNext("Resend is down");
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await signIn();
    expect(response.headers.get("location")).toBe(`${APP}/dashboard`);
    expect(mail.sent).toHaveLength(0);
    expect(await welcomeLogs()).toHaveLength(0);
    expect(error).toHaveBeenCalledWith("welcome email failed:", "Resend is down");
  });
});
