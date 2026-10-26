import type { Page } from "@playwright/test";
import { SEED, expect, freshUser, hydrated, login, resetAll, test, toast } from "./support";

/** /course-results: the original cards, the text filter, the URL-addressable dialog, watch/schedule toggles. */

const { term, csc1301 } = SEED;
const RESULTS = `/course-results?term=${term}&subjects=CSC&courseNumber=1301`;
const OPEN = "CSC 1301 · 001";
const CLOSED = "CSC 1301 · 002";
const FILTER = "Filter sections by professor, title or CRN";

test.beforeEach(async ({ request }) => {
  await resetAll(request);
});

const cards = (page: Page) => page.getByRole("list", { name: "Sections" }).getByRole("article");
const card = (page: Page, code: string) => page.getByRole("article", { name: `${code}, ${csc1301.title}` });

test("sections, the filter, and the detail dialog", async ({ page }) => {
  await page.goto(RESULTS);
  await expect(page.getByRole("heading", { level: 1, name: "CSC 1301 · Spring Semester 2027" })).toBeVisible();
  await expect(cards(page)).toHaveCount(2);
  // The full original card: heading, CRN chip, title/section/credits, the five enrollment numbers.
  await expect(card(page, OPEN)).toContainText("Computer Science (CSC 1301)");
  await expect(card(page, OPEN)).toContainText("CRN 80001");
  await expect(card(page, OPEN)).toContainText("Section 001");
  await expect(card(page, OPEN)).toContainText("3 Available");
  await expect(card(page, OPEN)).toContainText("27 Enrolled");
  await expect(card(page, OPEN)).toContainText("30 Capacity");
  await expect(card(page, OPEN)).toContainText("10 Waitlist capacity");
  await expect(card(page, CLOSED)).toContainText("0 Available");
  await expect(page.getByText("Found 2 sections")).toBeVisible();

  const search = await hydrated(page.getByRole("searchbox", { name: FILTER }));
  await search.fill("80002");
  await expect(cards(page)).toHaveCount(1);
  await expect(card(page, CLOSED)).toBeVisible();
  await expect(page.getByText("Showing 1 of 2 sections")).toBeVisible();
  await expect(page).toHaveURL(/[?&]q=80002/);
  await search.fill("");
  await expect(cards(page)).toHaveCount(2);

  // The card's heading link opens the dialog and pushes ?crn=; Back closes it.
  await card(page, OPEN).getByRole("link", { name: "Computer Science (CSC 1301), section 001" }).click();
  const dialog = page.getByRole("dialog", { name: /CSC 1301\), section 001$/ });
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/[?&]crn=80001/);
  await expect(dialog.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true");
  await dialog.getByRole("tab", { name: "Grade history" }).click();
  await expect(dialog.getByRole("tab", { name: "Grade history" })).toHaveAttribute("aria-selected", "true");
  await expect(dialog.getByRole("tabpanel")).toBeVisible();
  await expect(page).toHaveURL(/[?&]tab=grades/);
  await dialog.getByRole("tab", { name: "Professor ratings" }).click();
  await expect(dialog.getByRole("tab", { name: "Professor ratings" })).toHaveAttribute("aria-selected", "true");

  await page.goBack();
  await expect(dialog).toBeHidden();
  expect(new URL(page.url()).searchParams.get("crn")).toBeNull();
  await expect(cards(page)).toHaveCount(2);
});

test("New search keeps the search in the form; Back restores it; the next results start fresh", async ({ page }) => {
  await page.goto(`${RESULTS}&q=80001`);
  const search = await hydrated(page.getByRole("searchbox", { name: FILTER }));
  await expect(search).toHaveValue("80001");
  await expect(cards(page)).toHaveCount(1);

  // "New search" keeps the whole search in the form: term, level, every subject, the number.
  await page.getByRole("link", { name: "New search" }).click();
  await expect(page).toHaveURL(/\/course-search\?term=202701&subjects=CSC&courseNumber=1301/);
  const form = page.getByRole("form", { name: "Search classes" });
  const number = await hydrated(form.getByRole("textbox", { name: "Enter a course number" }));
  await expect(form.getByRole("combobox", { name: "Choose a term" })).toHaveValue(term);
  await expect(form.getByRole("combobox", { name: "Choose a degree" })).toHaveValue("all");
  await expect(number).toHaveValue("1301");
  const chips = form.getByRole("list", { name: "Selected subjects" });
  await expect(chips.getByRole("listitem")).toHaveCount(1);
  await expect(chips.getByText("Computer Science", { exact: true })).toBeVisible();
  await number.fill(SEED.csc1302.courseNumber);
  await form.getByRole("button", { name: "Search Classes" }).click();

  await expect(page.getByRole("heading", { level: 1, name: "CSC 1302 · Spring Semester 2027" })).toBeVisible();
  await expect(page).toHaveURL(/[?&]courseNumber=1302/);
  await expect(page.getByRole("searchbox", { name: FILTER })).toHaveValue("");
  await expect(cards(page)).toHaveCount(1);
  await expect(page.getByRole("article", { name: `CSC 1302 · 001, ${SEED.csc1302.title}` })).toBeVisible();
  expect(new URL(page.url()).searchParams.get("q")).toBeNull();

  // Back returns to the form as it was submitted (number 1302 included).
  await page.goBack();
  await expect(page).toHaveURL(/\/course-search\?/);
  const back = page.getByRole("form", { name: "Search classes" });
  await expect(back.getByRole("textbox", { name: "Enter a course number" })).toHaveValue(SEED.csc1302.courseNumber);
  await expect(back.getByRole("combobox", { name: "Choose a term" })).toHaveValue(term);
  await expect(back.getByRole("list", { name: "Selected subjects" }).getByText("Computer Science", { exact: true })).toBeVisible();
});

test("the dialog's URL follows its animations: ?crn= after the open, gone after the close", async ({ page }) => {
  await page.goto(RESULTS);
  const link = await hydrated(card(page, OPEN).getByRole("link", { name: "Computer Science (CSC 1301), section 001" }));
  await link.click();
  const dialog = page.getByRole("dialog", { name: /CSC 1301\), section 001$/ });
  await expect(dialog).toBeVisible();
  // Pushed once the open morph has played.
  await expect(page).toHaveURL(/[?&]crn=80001/, { timeout: 5_000 });
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  // The history entry is left once the close has played; the page underneath is the results.
  await expect.poll(() => new URL(page.url()).searchParams.get("crn"), { timeout: 5_000 }).toBeNull();
  await expect(page).toHaveURL(/[?&]courseNumber=1301/);
  await expect(cards(page)).toHaveCount(2);

  // Escape works the same way, and a fresh open pushes again.
  await link.click();
  await expect(dialog).toBeVisible();
  await expect(page).toHaveURL(/[?&]crn=80001/, { timeout: 5_000 });
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect.poll(() => new URL(page.url()).searchParams.get("crn"), { timeout: 5_000 }).toBeNull();

  // A tab picked before the entry is pushed lands on the dialog's entry, not the page's.
  await link.click();
  // dispatchEvent: no waiting for the morph to settle, so this lands before the push.
  await dialog.getByRole("tab", { name: "Grade history" }).dispatchEvent("click");
  await expect(dialog.getByRole("tab", { name: "Grade history" })).toHaveAttribute("aria-selected", "true");
  await expect(page).toHaveURL(/[?&]crn=80001.*[?&]tab=grades|[?&]tab=grades.*[?&]crn=80001/, { timeout: 5_000 });
  await page.goBack();
  await expect(dialog).toBeHidden();
  await expect.poll(() => [...new URL(page.url()).searchParams.keys()].sort().join()).toBe("courseNumber,subjects,term");
});

test("a deep link opens the dialog", async ({ page }) => {
  await page.goto(`${RESULTS}&crn=${csc1301.closed}`);
  await expect(page.getByRole("dialog", { name: /CSC 1301\), section 002$/ })).toBeVisible();
});

test("members can watch and schedule from a card", async ({ page }) => {
  await login(page.request, freshUser("results"));
  await page.goto(RESULTS);
  const open = card(page, OPEN);

  const watch = await hydrated(open.getByRole("button", { name: new RegExp(`^Watch(ing)? ${OPEN}$`) }));
  await expect(watch).toHaveAccessibleName(`Watch ${OPEN}`);
  await watch.click();
  await expect(toast(page, `Watching ${OPEN}`)).toBeVisible();
  // The visible label shows the state ("Watching"), the name follows it, aria-pressed carries it.
  await expect(watch).toHaveAttribute("aria-pressed", "true");
  await expect(watch).toHaveAccessibleName(`Watching ${OPEN}`);
  let watches = (await (await page.request.get("/api/watches")).json()).watches as { crn: string; term: string }[];
  expect(watches.map((w) => [w.term, w.crn])).toEqual([[term, csc1301.open]]);

  await watch.click();
  await expect(watch).toHaveAttribute("aria-pressed", "false");
  await expect(watch).toHaveAccessibleName(`Watch ${OPEN}`);
  await expect(toast(page, `Stopped watching ${OPEN}`)).toBeVisible();
  await expect.poll(async () => (await (await page.request.get("/api/watches")).json()).count).toBe(0);

  // The original calendar icon button: its name carries the state ("Add" / "Added").
  const scheduleName = new RegExp(`^Add(ed)? ${OPEN} to schedule$`);
  const schedule = open.getByRole("button", { name: scheduleName });
  await expect(schedule).toHaveAccessibleName(`Add ${OPEN} to schedule`);
  await schedule.click();
  await expect(toast(page, `Added ${OPEN} to your schedule`)).toBeVisible();
  await expect(schedule).toHaveAttribute("aria-pressed", "true");
  await expect(schedule).toHaveAccessibleName(`Added ${OPEN} to schedule`);
  const saved = (await (await page.request.get("/api/schedule")).json()).schedule;
  expect(saved[term].map((e: { crn: string }) => e.crn)).toEqual([csc1301.open]);

  // The state is server-side: a reload still shows it.
  await page.reload();
  await expect(card(page, OPEN).getByRole("button", { name: `Added ${OPEN} to schedule` })).toHaveAttribute("aria-pressed", "true");
  watches = (await (await page.request.get("/api/watches")).json()).watches;
  expect(watches).toEqual([]);
});

test("guests get a sign-in prompt instead of watching", async ({ page }) => {
  await page.goto(RESULTS);
  const watch = await hydrated(card(page, OPEN).getByRole("button", { name: `Watch ${OPEN}` }));
  await watch.click();
  const notice = toast(page, "Sign in to track classes");
  await expect(notice).toBeVisible();
  await expect(notice.getByRole("button", { name: "Sign in" })).toBeVisible();
  await expect(watch).toHaveAttribute("aria-pressed", "false");
});
