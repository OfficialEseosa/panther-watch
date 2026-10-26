import type { Page } from "@playwright/test";
import { SEED, addWatch, expect, fake, freshUser, hydrated, login, resetAll, test, toast } from "./support";

/** /tracked-classes (pages.md §5): live seats per watch, remove + Undo, partial GoSolar failure, empty state. */

const { csc1301 } = SEED;
const OPEN = "CSC 1301 · 001";
const CLOSED = "CSC 1301 · 002";

test.beforeEach(async ({ request }) => {
  await resetAll(request);
});

const card = (page: Page, name: string | RegExp) => page.getByRole("article", { name });

async function watchBoth(page: Page) {
  await login(page.request, freshUser("tracked"));
  await addWatch(page.request, { crn: csc1301.open, ...csc1301 });
  await addWatch(page.request, { crn: csc1301.closed, ...csc1301 });
}

test("lists watched sections with live seats; remove sticks after a refresh", async ({ page }) => {
  await watchBoth(page);
  await page.goto("/tracked-classes");
  await expect(page.getByRole("heading", { level: 1, name: "Tracked classes" })).toBeVisible();
  await expect(page.getByText("2 sections · We email you when a seat opens.")).toBeVisible();
  const term = page.getByRole("region", { name: /Spring Semester 2027/ });
  await expect(term.getByRole("article")).toHaveCount(2);

  // Live data from the fake, open sections first.
  await expect(term.getByRole("article").first()).toHaveAccessibleName(new RegExp(`^${OPEN}`));
  await expect(card(page, new RegExp(`^${OPEN}`))).toContainText("3 open");
  await expect(card(page, new RegExp(`^${OPEN}`))).toContainText("Seats open now");
  await expect(card(page, new RegExp(`^${CLOSED}`))).toContainText("Full");
  // The schedule toggle's visible label shows its state ("Add" until scheduled, then "Added").
  await expect(card(page, new RegExp(`^${OPEN}`)).getByRole("button", { name: `Add ${OPEN} to schedule` })).toHaveAttribute(
    "aria-pressed",
    "false",
  );
  const show = page.getByRole("radiogroup", { name: "Show" });
  await expect(show.getByRole("radio", { name: "All 2" })).toBeChecked();
  await expect(show.getByRole("radio", { name: "Open 1" })).toBeVisible();
  await expect(show.getByRole("radio", { name: "Full 1" })).toBeVisible();

  const remove = await hydrated(card(page, new RegExp(`^${CLOSED}`)).getByRole("button", { name: `Remove ${CLOSED} from tracked classes` }));
  await remove.click();
  await expect(toast(page, `Stopped watching ${CLOSED}`)).toBeVisible();
  await expect(card(page, new RegExp(`^${CLOSED}`))).toHaveCount(0);

  await page.reload();
  await expect(card(page, new RegExp(`^${OPEN}`))).toBeVisible();
  await expect(card(page, new RegExp(`^${CLOSED}`))).toHaveCount(0);
  await expect(page.getByText("1 section · We email you when a seat opens.")).toBeVisible();
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

test("a GoSolar affinity failure shows the partial banner instead of crashing", async ({ page }) => {
  await watchBoth(page);
  // Both watches are one (term, subject, course) group: one search, and it comes back data:null.
  await fake.failSearches({ kind: "affinity" });
  await page.goto("/tracked-classes");
  await expect(page.getByRole("heading", { level: 1, name: "Tracked classes" })).toBeVisible();
  const cards = page.getByRole("article");
  await expect(cards).toHaveCount(2);
  await expect(cards.first()).toContainText("Couldn’t reach GoSolar for this course.");
  await expect(cards.nth(1)).toContainText("Couldn’t reach GoSolar for this course.");
  // The stored watch still shows; live-only parts (seats) do not.
  await expect(cards.first()).toContainText("CRN 8000");
  await expect(page.getByText("Seats open now")).toHaveCount(0);

  // The failure was one-shot: Refresh brings the live data back.
  await (await hydrated(page.getByRole("button", { name: "Refresh" }))).click();
  await expect(page.getByText("Couldn’t reach GoSolar for this course.")).toHaveCount(0);
  await expect(page.getByText("Seats open now")).toBeVisible();
});

test("empty state when nothing is watched", async ({ page }) => {
  await login(page.request, freshUser("tracked-empty"));
  await page.goto("/tracked-classes");
  await expect(page.getByRole("heading", { name: "You're not watching any sections." })).toBeVisible();
  const main = page.getByRole("main");
  await expect(main.getByRole("link", { name: "Search classes" }).first()).toHaveAttribute("href", "/course-search");
});
