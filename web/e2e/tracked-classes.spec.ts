import type { Page } from "@playwright/test";
import { SEED, addWatch, expect, fake, freshUser, hydrated, login, resetAll, test, toast } from "./support";

/** /tracked-classes: live seats per watch, remove + Undo, partial GoSolar failure, empty state. */

const { csc1301 } = SEED;
const OPEN = "CSC 1301 · 001";
const CLOSED = "CSC 1301 · 002";

test.beforeEach(async ({ request }) => {
  await resetAll(request);
});

const card = (page: Page, name: string | RegExp) => page.getByRole("article", { name });
const header = (page: Page) => page.getByRole("main").locator("header").first();

async function watchBoth(page: Page) {
  await login(page.request, freshUser("tracked"));
  await addWatch(page.request, { crn: csc1301.open, ...csc1301 });
  await addWatch(page.request, { crn: csc1301.closed, ...csc1301 });
}

test("lists watched sections with live seats; remove sticks after a reload", async ({ page }) => {
  await watchBoth(page);
  await page.goto("/tracked-classes");
  await expect(page.getByRole("heading", { level: 1, name: "Your Tracked Classes" })).toBeVisible();
  await expect(header(page).getByText(/^Tracking\s*2\s*classes$/i)).toBeVisible();
  const list = page.getByRole("list", { name: "Tracked sections" });
  await expect(list.getByRole("article")).toHaveCount(2);

  // Live data from the fake, open sections first; the term shows in each card.
  await expect(list.getByRole("article").first()).toHaveAccessibleName(new RegExp(`^${OPEN}`));
  await expect(card(page, new RegExp(`^${OPEN}`))).toContainText("3 Available");
  await expect(card(page, new RegExp(`^${OPEN}`))).toContainText("Spring Semester 2027");
  await expect(card(page, new RegExp(`^${CLOSED}`))).toContainText("0 Available");
  // The calendar button's name carries its state ("Add" until scheduled, then "Added").
  await expect(card(page, new RegExp(`^${OPEN}`)).getByRole("button", { name: `Add ${OPEN} to schedule` })).toHaveAttribute(
    "aria-pressed",
    "false",
  );

  const remove = await hydrated(card(page, new RegExp(`^${CLOSED}`)).getByRole("button", { name: `Remove ${CLOSED} from tracked classes` }));
  await remove.click();
  await expect(toast(page, `Stopped watching ${CLOSED}`)).toBeVisible();
  await expect(card(page, new RegExp(`^${CLOSED}`))).toHaveCount(0);

  await page.reload();
  await expect(card(page, new RegExp(`^${OPEN}`))).toBeVisible();
  await expect(card(page, new RegExp(`^${CLOSED}`))).toHaveCount(0);
  // The count pill alone: "Tracking 1 class", singular.
  await expect(header(page).getByText(/^Tracking\s*1\s*class$/i)).toBeVisible();
});

test("Undo puts a removed watch back", async ({ page }) => {
  await watchBoth(page);
  await page.goto("/tracked-classes");
  const remove = await hydrated(card(page, new RegExp(`^${OPEN}`)).getByRole("button", { name: `Remove ${OPEN} from tracked classes` }));
  await remove.click();
  const notice = toast(page, `Stopped watching ${OPEN}`);
  await notice.getByRole("button", { name: "Undo" }).click();
  await expect(toast(page, `Watching ${OPEN} again`)).toBeVisible();
  await expect(card(page, new RegExp(`^${OPEN}`))).toBeVisible();
  await expect.poll(async () => (await (await page.request.get("/api/watches")).json()).count).toBe(2);
});

test("a GoSolar affinity failure shows the partial notice instead of crashing", async ({ page }) => {
  await watchBoth(page);
  // Both watches are one (term, subject, course) group: one search, and it comes back data:null.
  await fake.failSearches({ kind: "affinity" });
  await page.goto("/tracked-classes");
  await expect(page.getByRole("heading", { level: 1, name: "Your Tracked Classes" })).toBeVisible();
  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("Couldn’t reach GoSolar for this course.");
  await expect(cards.nth(1)).toContainText("Couldn’t reach GoSolar for this course.");
  // The stored watch still shows; live-only parts (seats) do not.
  await expect(cards.first()).toContainText("CRN 8000");
  await expect(page.getByText("Available", { exact: true })).toHaveCount(0);

  // The failure was one-shot: a reload brings the live data back.
  await page.reload();
  await expect(page.getByText("Couldn’t reach GoSolar for this course.")).toHaveCount(0);
  await expect(page.getByText("Available", { exact: true }).first()).toBeVisible();
});

test("empty state when nothing is watched", async ({ page }) => {
  await login(page.request, freshUser("tracked-empty"));
  await page.goto("/tracked-classes");
  await expect(page.getByText("You have not added any classes yet.")).toBeVisible();
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "Start searching" })).toHaveAttribute("href", "/course-search");
});
