import { SEED, expect, fake, freshUser, hydrated, login, resetAll, test } from "./support";

/** /course-search (pages.md §3): terms from the DB cache, subject combobox, submit, recent searches. */

test.beforeEach(async ({ request }) => {
  await resetAll(request);
});

const termCalls = async () => (await fake.requests()).filter((r) => r.path === "/classSearch/getTerms").length;

test("terms come from GoSolar once, then from the database cache", async ({ page }) => {
  await login(page.request, freshUser("search"));
  await page.goto("/course-search");
  const term = page.getByRole("combobox", { name: "Term" });
  await expect(term).toHaveValue(SEED.term);
  await expect(term.locator("option", { hasText: "Spring Semester 2027" })).toHaveCount(1);
  await expect(term.locator("option", { hasText: "(view only)" })).toHaveCount(1);
  expect(await termCalls()).toBe(1);

  await page.reload();
  await expect(term).toHaveValue(SEED.term);
  expect(await termCalls(), "second load is served from the terms table").toBe(1);
});

test("subject combobox, submit, and the recent search chip", async ({ page }) => {
  await login(page.request, freshUser("search"));
  await page.goto("/course-search");

  const subjects = await hydrated(page.getByRole("combobox", { name: "Subjects" }));
  await subjects.click();
  await subjects.pressSequentially("CS");
  const option = page.getByRole("option", { name: /CSC/ });
  await expect(option).toBeVisible();
  // Code prefix ranks first ("Mathematics" also contains "cs", so MATH follows).
  await expect(page.getByRole("listbox", { name: "Subjects" }).getByRole("option").first()).toHaveAccessibleName(/^CSC/);
  await option.click();

  const chips = page.getByRole("list", { name: "Selected subjects" });
  await expect(chips.getByText("CSC", { exact: true })).toBeVisible();
  await expect(chips.getByRole("button", { name: "Remove CSC" })).toBeVisible();
  await expect(subjects).toHaveValue("");

  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page).toHaveURL(/\/course-results\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get("term")).toBe(SEED.term);
  expect(url.searchParams.get("subjects")).toBe("CSC");
  await expect(page.getByRole("heading", { level: 1, name: "CSC · Spring Semester 2027" })).toBeVisible();

  await page.goto("/course-search");
  const recent = page.getByRole("region", { name: "Recent searches" });
  const chip = recent.getByRole("link", { name: /CSC · Spring Semester 2027/ });
  await expect(chip).toBeVisible();
  await expect(chip).toHaveAttribute("href", /^\/course-results\?term=202701&subjects=CSC/);
});

test("submitting without a subject shows the field error", async ({ page }) => {
  await page.goto("/course-search");
  await hydrated(page.getByRole("combobox", { name: "Subjects" }));
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByText("Choose at least one subject.")).toBeVisible();
  await expect(page).toHaveURL(/\/course-search$/);
});
