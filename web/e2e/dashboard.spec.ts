import { APP_URL } from "./env";
import {
  SEED,
  WHATS_NEW_KEY,
  addToSchedule,
  addWatch,
  expect,
  freshUser,
  hydrated,
  login,
  resetAll,
  skipWhatsNew,
  test,
} from "./support";

/**
 * /dashboard (the original Dashboard.jsx): the greeting card with the tracked-classes count, the
 * three feature cards (locked for guests), the guest notice, and the one-time "What's new"
 * showcase for members.
 */

const { csc1301, math2211 } = SEED;
const SHOWCASE = "What's new in PantherWatch";

test.beforeEach(async ({ request }) => {
  await resetAll(request);
});

test("greets the member with their tracked count and links the feature cards", async ({ page }) => {
  await login(page.request, freshUser("dash", "Pat Panther"));
  await addWatch(page.request, { crn: csc1301.open, ...csc1301 });
  await addWatch(page.request, { crn: csc1301.closed, ...csc1301 });
  await addToSchedule(page.request, { crn: math2211.open, ...math2211 });
  await skipWhatsNew(page);

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back, Pat." })).toBeVisible();
  // Read as "Tracked classes 2", not "Tracked classes2".
  await expect(page.getByRole("region", { name: "Welcome back, Pat." })).toContainText("Tracked classes 2");
  await expect(page.getByRole("region", { name: "Guest mode notice" })).toHaveCount(0);

  // Feature cards: icon, title, description, and the action button (plus the count badge).
  const features = page.getByRole("list", { name: "Features" });
  const card = (title: string) => features.getByRole("listitem").filter({ has: page.getByRole("heading", { name: title }) });
  await expect(features.getByRole("listitem")).toHaveCount(3);
  await expect(card("Course search").getByRole("link", { name: "Search courses" })).toHaveAttribute("href", "/course-search");
  await expect(card("Tracked classes")).toContainText("2 active");
  const tracked = card("Tracked classes").getByRole("link", { name: "Manage tracked list" });
  await expect(tracked).toHaveAttribute("href", "/tracked-classes");
  await expect(card("Schedule builder").getByRole("link", { name: "Open schedule builder" })).toHaveAttribute(
    "href",
    "/schedule-builder",
  );

  await (await hydrated(tracked)).click();
  await expect(page).toHaveURL(`${APP_URL}/tracked-classes`);
  await expect(page.getByRole("heading", { level: 1, name: "Tracked classes" })).toBeVisible();
});

test("a member with nothing tracked is invited to start", async ({ page }) => {
  await login(page.request, freshUser("empty-dash", "Sam Panther"));
  await skipWhatsNew(page);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back, Sam." })).toBeVisible();
  await expect(page.getByRole("region", { name: "Welcome back, Sam." })).toContainText("Tracked classes 0");

  const features = page.getByRole("list", { name: "Features" });
  const tracked = features.getByRole("listitem").filter({ has: page.getByRole("heading", { name: "Tracked classes" }) });
  await expect(tracked).toContainText("0 active");
  await expect(tracked.getByRole("link", { name: "Start tracking" })).toHaveAttribute("href", "/tracked-classes");
});

test("guests get the guest notice and locked member features", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome, Panther." })).toBeVisible();
  const notice = page.getByRole("region", { name: "Guest mode notice" });
  await expect(notice).toContainText("You’re browsing as a guest.");
  await expect(notice.getByRole("link", { name: "Log in" })).toHaveAttribute("href", "/api/auth/google/login");

  const features = page.getByRole("list", { name: "Features" });
  const card = (title: string) => features.getByRole("listitem").filter({ has: page.getByRole("heading", { name: title }) });
  const search = card("Course search").getByRole("link", { name: "Search courses" });
  await expect(search).toHaveAttribute("href", "/course-search");
  await expect(card("Tracked classes").getByRole("link", { name: "Sign in to track" })).toHaveAttribute(
    "href",
    "/api/auth/google/login",
  );
  await expect(card("Schedule builder").getByRole("link", { name: "Sign in to plan" })).toHaveAttribute(
    "href",
    "/api/auth/google/login",
  );
  // No tracked count for guests.
  await expect(features).not.toContainText("active");

  // Guests never get the showcase on their own (only through ?whatsnew=1).
  await hydrated(search);
  await page.waitForLoadState("networkidle");
  await expect(page.getByRole("dialog", { name: SHOWCASE })).toHaveCount(0);
});

test("What's new opens once for a member and Skip closes it for good", async ({ page }) => {
  await login(page.request, freshUser("whatsnew"));
  await page.goto("/dashboard");
  const showcase = page.getByRole("dialog", { name: SHOWCASE });
  await expect(showcase).toBeVisible();
  await expect(showcase.getByRole("heading", { name: "Rebuilt from the ground up" })).toBeVisible();
  const skip = showcase.getByRole("button", { name: "Skip" });
  await expect(skip).toBeFocused();
  await skip.click();
  await expect(showcase).toHaveCount(0);
  expect(await page.evaluate((key) => localStorage.getItem(key), WHATS_NEW_KEY)).toBe("1");

  await page.reload();
  await hydrated(page.getByRole("link", { name: "Start tracking" }));
  await page.waitForLoadState("networkidle");
  await expect(showcase).toHaveCount(0);
});

test("?whatsnew=1 replays the showcase; Skip closes it, remembers it and drops the parameter", async ({ page }) => {
  await login(page.request, freshUser("whatsnew-forced"));
  await page.goto("/dashboard?whatsnew=1");
  const showcase = page.getByRole("dialog", { name: SHOWCASE });
  await expect(showcase).toBeVisible();
  await expect(showcase.getByRole("heading", { name: "Rebuilt from the ground up" })).toBeVisible();
  await expect(showcase).toContainText("Faster, steadier, and easier to use");
  expect(await page.evaluate((key) => localStorage.getItem(key), WHATS_NEW_KEY)).toBeNull();

  await showcase.getByRole("button", { name: "Skip" }).click();
  await expect(showcase).toHaveCount(0);
  await expect(page).toHaveURL(`${APP_URL}/dashboard`);
  expect(await page.evaluate((key) => localStorage.getItem(key), WHATS_NEW_KEY)).toBe("1");

  // Seen: a plain visit no longer opens it, but the preview link still does.
  await page.reload();
  await hydrated(page.getByRole("link", { name: "Start tracking" }));
  await page.waitForLoadState("networkidle");
  await expect(showcase).toHaveCount(0);

  await page.goto("/dashboard?whatsnew=1");
  await expect(showcase.getByRole("heading", { name: "Rebuilt from the ground up" })).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(showcase).toHaveCount(0);
});
