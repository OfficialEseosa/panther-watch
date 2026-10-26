import type { Locator, Page } from "@playwright/test";
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

test("the active nav item's icon plays its animation after Dashboard → Course search", async ({ page }) => {
  await page.goto("/dashboard");
  // Sidebar on desktop, bottom bar on phones: whichever primary nav is showing.
  const link = page.locator('nav[aria-label="Primary"] a[href="/course-search"]').filter({ visible: true });
  await hydrated(link);
  await expect(link).not.toHaveAttribute("aria-current", "page");
  await expect(link).toHaveAttribute("data-anim-host");

  // The route play is brief (data-playing comes off at animationend), so record it as it happens.
  // The link outlives the navigation; its icon wrapper is remounted, hence the subtree observer.
  await link.evaluate((el) => {
    const w = window as unknown as { __iconPlayed?: string | null };
    w.__iconPlayed = null;
    new MutationObserver(() => {
      const playing = el.querySelector("[data-playing] > svg[data-icon]");
      if (playing && !w.__iconPlayed) w.__iconPlayed = playing.getAttribute("data-icon");
    }).observe(el, { subtree: true, childList: true, attributes: true, attributeFilter: ["data-playing"] });
  });
  await link.click();
  await expect(page).toHaveURL(/\/course-search$/);
  await expect(link).toHaveAttribute("aria-current", "page");
  await expect.poll(() => page.evaluate(() => (window as unknown as { __iconPlayed?: string | null }).__iconPlayed)).toBe("search");
  // It plays once: the attribute comes off when the animation ends (so hover can replay it).
  await expect(link.locator("[data-playing]")).toHaveCount(0);
});

test("the showcase finale fades out (headline, then overlay) instead of vanishing", async ({ page }) => {
  // The story runs ~16.4 s before the finale: drive its timers with the fake clock. CSS transitions
  // and Web Animations still run in real time, which is what this test watches.
  await page.clock.install();
  await login(page.request, freshUser("whatsnew-finale"));
  await page.goto("/dashboard?whatsnew=1");
  const showcase = page.getByRole("dialog", { name: SHOWCASE });
  await expect(showcase.getByRole("heading", { name: "Rebuilt from the ground up" })).toBeVisible();
  const headline = showcase.getByText("Welcome to PantherWatch", { exact: true });
  // Each scene's timer is armed once the previous scene has rendered, so step in small slices.
  for (let i = 0; i < 90 && !(await headline.isVisible()); i++) await page.clock.runFor(250);
  await expect(headline).toBeVisible();
  // Let its entrance animation settle (real time) before the fade is due.
  await expect
    .poll(() => headline.evaluate((el) => el.getAnimations().every((a) => a.playState === "finished")))
    .toBe(true);

  // When the headline's class flips, the fade must be an opacity transition that ends at 0 with
  // the headline (and the showcase) still on screen.
  // (Both watchers go in now: the fake clock also keeps flowing in real time, so the overlay's
  // fade can land while the headline's transition is still playing.)
  const headlineFade = watchFade(headline, "__headlineFade");
  const overlayFade = watchFade(showcase, "__overlayFade");
  // Advance to the fade (~3.4 s into the finale), then stop: the finale holds 400 ms past it
  // before the overlay fades (0.5 s).
  await runClockUntil(page, "__headlineFade");
  const text = await headlineFade;
  expect(text.duration, "headline opacity transition (ms)").toBeGreaterThan(0);
  expect(Number(text.from)).toBeGreaterThan(0.9);
  expect(Number(text.to)).toBe(0);
  expect(text.connected).toBe(true);
  await expect(showcase).toBeVisible();

  // Then the whole overlay fades (not a cut) before it unmounts.
  await runClockUntil(page, "__overlayFade");
  const overlay = await overlayFade;
  expect(overlay.duration, "overlay opacity transition (ms)").toBeGreaterThan(0);
  expect(Number(overlay.from)).toBeGreaterThan(0.9);
  for (let i = 0; i < 12 && (await showcase.count()) > 0; i++) await page.clock.runFor(250);
  await expect(showcase).toHaveCount(0);
});

/**
 * Resolves once the element's next class change has played out: the opacity transition it
 * started (duration in ms, or null when there was none, i.e. a cut), the opacity before and after,
 * and whether the element was still mounted at the end (an element removed as its fade ends
 * reports its last opacity and connected: false). Sets window[flag] when the class flips.
 */
function watchFade(locator: Locator, flag: string) {
  return locator.evaluate(
    (el, flag) =>
      new Promise<{ duration: number | null; from: string; to: string; connected: boolean }>((resolve) => {
        const observer = new MutationObserver(async () => {
          observer.disconnect();
          (window as unknown as Record<string, boolean>)[flag] = true;
          const from = getComputedStyle(el).opacity; // flushes style: the transition starts here
          const transition = el
            .getAnimations()
            .find((a): a is CSSTransition => a instanceof CSSTransition && a.transitionProperty === "opacity");
          // An element that unmounts as its fade ends cancels the transition: settle either way.
          if (transition) await transition.finished.catch(() => undefined);
          const duration = transition ? Number(transition.effect?.getComputedTiming().duration ?? 0) : null;
          resolve({ duration, from, to: getComputedStyle(el).opacity, connected: el.isConnected });
        });
        observer.observe(el, { attributes: true, attributeFilter: ["class"] });
      }),
    flag,
  );
}

/** Steps the fake clock in 200 ms slices until window[flag] is set (by watchFade). */
async function runClockUntil(page: Page, flag: string) {
  for (let i = 0; i < 30; i++) {
    if (await page.evaluate((flag) => (window as unknown as Record<string, boolean>)[flag] === true, flag)) return;
    await page.clock.runFor(200);
  }
  throw new Error(`${flag} never flipped`);
}
