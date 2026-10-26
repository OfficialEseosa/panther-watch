import { APP_URL, E2E_TEST_SECRET } from "./env";
import { SAME_ORIGIN, STUDENT, expect, login, resetAll, sessionCookie, test } from "./support";

test.beforeEach(async ({ request }) => {
  await resetAll(request);
});

test("members-only pages send signed-out visitors to the landing page", async ({ page }) => {
  await page.goto("/settings");
  await expect(page).toHaveURL(`${APP_URL}/?next=%2Fsettings`);
  await expect(page.getByText("Sign in to continue.")).toBeVisible();
});

test("test login sets the session cookie and the shell shows the account", async ({ page, context }) => {
  const { userId } = await login(page.request);
  expect(userId).toMatch(/^[0-9a-f-]{36}$/);

  const cookie = await sessionCookie(context);
  expect(cookie, "pw_session cookie").toBeDefined();
  expect(cookie?.httpOnly).toBe(true);
  expect(cookie?.sameSite).toBe("Lax");

  // "/" sends members to the dashboard (src/proxy.ts).
  await page.goto("/");
  await expect(page).toHaveURL(`${APP_URL}/dashboard`);
  await expect(
    page.getByRole("button", { name: `Account: ${STUDENT.name}` }).filter({ visible: true }).first(),
  ).toBeVisible();
});

test("logout clears the session and members-only pages redirect again", async ({ page, context }) => {
  await login(page.request);
  await page.goto("/dashboard");

  const logout = await page.request.post("/api/auth/logout", { headers: SAME_ORIGIN, maxRedirects: 0 });
  expect(logout.status()).toBe(303);
  expect(await sessionCookie(context)).toBeUndefined();

  await page.goto("/settings");
  await expect(page).toHaveURL(`${APP_URL}/?next=%2Fsettings`);
});

test("logout without a same-origin Origin is refused (CSRF)", async ({ page, context }) => {
  await login(page.request);
  const response = await page.request.post("/api/auth/logout", {
    headers: { Origin: "https://evil.example" },
    maxRedirects: 0,
  });
  expect(response.status()).toBe(403);
  expect(await sessionCookie(context)).toBeDefined();
});

test("Google sign-in redirects to accounts.google.com with our callback", async ({ request }) => {
  const response = await request.get("/api/auth/google/login", { maxRedirects: 0 });
  expect(response.status()).toBe(302);
  const location = new URL(response.headers()["location"]);
  expect(location.origin).toBe("https://accounts.google.com");
  expect(location.searchParams.get("redirect_uri")).toBe(`${APP_URL}/api/auth/google/callback`);
  expect(location.searchParams.get("client_id")).toBe("e2e-google-client-id.apps.googleusercontent.com");
  expect(location.searchParams.get("response_type")).toBe("code");

  const state = location.searchParams.get("state");
  expect(state).toBeTruthy();
  const setCookie = response.headersArray().find((h) => h.name.toLowerCase() === "set-cookie" && h.value.startsWith("pw_oauth_state="));
  expect(setCookie?.value).toContain(`pw_oauth_state=${state}`);
});

test("the test login route rejects a wrong secret", async ({ request }) => {
  const response = await request.post("/api/test/login", { data: { secret: `${E2E_TEST_SECRET}x`, email: STUDENT.email } });
  expect(response.status()).toBe(403);
});
