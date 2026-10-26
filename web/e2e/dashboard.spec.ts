import { APP_URL } from "./env";
import { SEED, addToSchedule, addWatch, expect, freshUser, hydrated, login, resetAll, test } from "./support";

/** /dashboard for members (pages.md §2): greeting, stat tiles, feature cards, checklist, What's new. */

const { csc1301, math2211 } = SEED;

test.beforeEach(async ({ request }) => {
  await resetAll(request);
});

test("greets the member and counts their watches and schedule", async ({ page }) => {
  await login(page.request, freshUser("dash", "Pat Panther"));
  await addWatch(page.request, { crn: csc1301.open, ...csc1301 });
  await addWatch(page.request, { crn: csc1301.closed, ...csc1301 });
  await addToSchedule(page.request, { crn: math2211.open, ...math2211 });

  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: "Welcome back, Pat." })).toBeVisible();

  const stats = page.getByRole("region", { name: "At a glance" });
  const stat = (label: string) => stats.getByTestId("stat").filter({ has: page.getByText(label, { exact: true }) });
  await expect(stat("Tracked").locator(".sr-only")).toHaveText("2");
  await expect(stat("Tracked")).toContainText("Sections we’re watching");
  await expect(stat("Seats opened").locator(".sr-only")).toHaveText("0");
  await expect(stat("Scheduled").locator(".sr-only")).toHaveText("1");
  await expect(stat("Scheduled")).toContainText("Class scheduled for Spring 2027");

  // Feature cards: whole-card links to the member routes, with the counts as badges.
  const features = page.getByRole("region", { name: "Jump back in" });
  await expect(features.getByRole("link", { name: "Course search" })).toHaveAttribute("href", "/course-search");
  await expect(features.getByRole("link", { name: "Tracked classes" })).toHaveAttribute("href", "/tracked-classes");
  await expect(features.getByRole("link", { name: "Schedule builder" })).toHaveAttribute("href", "/schedule-builder");
  await expect(features).toContainText("2 sections watched");
  await expect(features).toContainText("1 class · Spring 2027");

  // Everything on the checklist is done (searched is implied by watching), so it is hidden.
  await expect(page.getByRole("region", { name: "A closer look at what just changed" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Getting started" })).toHaveCount(0);

  await hydrated(features.getByRole("link", { name: "Tracked classes" }));
  await features.getByRole("link", { name: "Tracked classes" }).click();
  await expect(page).toHaveURL(`${APP_URL}/tracked-classes`);
  await expect(page.getByRole("heading", { level: 1, name: "Tracked classes" })).toBeVisible();
});

test("Getting started reflects progress and stays dismissed", async ({ page }) => {
  await login(page.request, freshUser("checklist"));
  await page.goto("/dashboard");
  const checklist = page.getByRole("region", { name: "Getting started" });
  await expect(checklist).toContainText("0 of 3 done");

  await addWatch(page.request, { crn: csc1301.open, ...csc1301 });
  await page.reload();
  await expect(checklist).toContainText("2 of 3 done");
  await expect(checklist.getByText("Search a course (done)")).toBeAttached();
  await expect(checklist.getByText("Track a class (done)")).toBeAttached();
  await expect(checklist.getByText("Build your schedule (not done yet)")).toBeAttached();
  await expect(checklist.getByRole("link", { name: "Open schedule builder" })).toHaveAttribute("href", "/schedule-builder");

  const dismiss = await hydrated(checklist.getByRole("button", { name: "Dismiss getting started" }));
  await dismiss.click();
  await expect(checklist).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();
  // The What's new card renders after hydration too; once it is there, the checklist would be.
  await expect(page.getByRole("region", { name: "A closer look at what just changed" })).toBeVisible();
  await expect(checklist).toHaveCount(0);
});

test("What's new dismisses for good", async ({ page }) => {
  await login(page.request, freshUser("whatsnew"));
  await page.goto("/dashboard");
  const card = page.getByRole("region", { name: "A closer look at what just changed" });
  await expect(card).toBeVisible();
  await (await hydrated(card.getByRole("button", { name: "Got it" }))).click();
  await expect(card).toHaveCount(0);

  await page.reload();
  await expect(page.getByRole("region", { name: "Getting started" })).toBeVisible();
  await expect(card).toHaveCount(0);
});
