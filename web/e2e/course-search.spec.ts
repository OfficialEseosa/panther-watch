import { SEED, expect, fake, freshUser, hydrated, login, resetAll, test } from "./support";

/** /course-search: terms from the DB cache, the subject picker, submit, remembered term. */

test.beforeEach(async ({ request }) => {
  await resetAll(request);
});

const termCalls = async () => (await fake.requests()).filter((r) => r.path === "/classSearch/getTerms").length;

test("terms come from GoSolar once, then from the database cache", async ({ page }) => {
  await login(page.request, freshUser("search"));
  await page.goto("/course-search");
  await expect(page.getByRole("heading", { level: 1, name: "Search for Classes" })).toBeVisible();
  const term = page.getByRole("combobox", { name: "Choose a term" });
  await expect(term).toHaveValue(SEED.term);
  await expect(term.locator("option", { hasText: "Spring Semester 2027" })).toHaveCount(1);
  await expect(term.locator("option", { hasText: "(view only)" })).toHaveCount(1);
  expect(await termCalls()).toBe(1);

  await page.reload();
  await expect(term).toHaveValue(SEED.term);
  expect(await termCalls(), "second load is served from the terms table").toBe(1);
});

test("subject picker and submit", async ({ page }) => {
  await login(page.request, freshUser("search"));
  await page.goto("/course-search");
  // Bachelor's level unless the student picks another: GoSolar mixes Perimeter College sections in otherwise.
  await expect(page.getByRole("combobox", { name: "Choose a degree" })).toHaveValue("US");

  const subjects = await hydrated(page.getByRole("combobox", { name: "Enter subjects" }));
  await subjects.click();
  await subjects.pressSequentially("CS");
  const option = page.getByRole("option", { name: /CSC/ });
  await expect(option).toBeVisible();
  // Code prefix ranks first ("Mathematics" also contains "cs", so MATH follows).
  await expect(page.getByRole("listbox", { name: "Subjects" }).getByRole("option").first()).toHaveAccessibleName(/^CSC/);
  await option.click();

  // The tag shows the subject's name, as in the original app.
  const chips = page.getByRole("list", { name: "Selected subjects" });
  await expect(chips.getByText("Computer Science", { exact: true })).toBeVisible();
  await expect(chips.getByRole("button", { name: "Remove CSC" })).toBeVisible();
  await expect(subjects).toHaveValue("");

  // With a subject chosen the list stays shut (focus, click) until ArrowDown or typing opens it.
  const list = page.getByRole("listbox", { name: "Subjects" });
  await expect(list).toBeHidden();
  await subjects.click();
  await expect(list).toBeHidden();
  await subjects.press("ArrowDown");
  await expect(list).toBeVisible();
  await subjects.press("Escape");
  await expect(list).toBeHidden();
  await subjects.pressSequentially("MATH");
  await page.getByRole("option", { name: /^MATH/ }).click();
  await expect(chips.getByRole("listitem")).toHaveCount(2);
  await expect(list).toBeHidden();
  await chips.getByRole("button", { name: "Remove MATH" }).click();
  await expect(chips.getByRole("listitem")).toHaveCount(1);

  await page.getByRole("button", { name: "Search Classes", exact: true }).click();
  await expect(page).toHaveURL(/\/course-results\?/);
  const url = new URL(page.url());
  expect(url.searchParams.get("term")).toBe(SEED.term);
  expect(url.searchParams.get("subjects")).toBe("CSC");
  expect(url.searchParams.get("level")).toBe("US");
  await expect(page.getByRole("heading", { level: 1, name: "CSC · Spring Semester 2027 · Bachelors", exact: true })).toBeVisible();
});

test("submitting without a subject shows the field error", async ({ page }) => {
  await page.goto("/course-search");
  await hydrated(page.getByRole("combobox", { name: "Enter subjects" }));
  await page.getByRole("button", { name: "Search Classes", exact: true }).click();
  await expect(page.getByText("Choose at least one subject.")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "Enter subjects" })).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(/\/course-search$/);
});

test("several course numbers, comma separated, in one search", async ({ page }) => {
  await page.goto("/course-search");
  const form = page.getByRole("form", { name: "Search classes" });
  const subjects = await hydrated(form.getByRole("combobox", { name: "Enter subjects" }));
  await subjects.click();
  await subjects.pressSequentially("CSC");
  await page.getByRole("option", { name: /^CSC/ }).click();
  const number = form.getByRole("textbox", { name: "Enter a course number" });
  await expect(number).toHaveAccessibleDescription(/One or more, comma separated/);
  await number.fill("1301, 1302 1301");
  await form.getByRole("button", { name: "Search Classes", exact: true }).click();

  await expect(page).toHaveURL(/\/course-results\?/);
  expect(new URL(page.url()).searchParams.get("courseNumber")).toBe("1301,1302");
  await expect(page.getByRole("heading", { level: 1, name: "CSC 1301, 1302 · Spring Semester 2027" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Sections" }).getByRole("article")).toHaveCount(3);

  // New search brings the list back into the field.
  await page.getByRole("link", { name: "New search" }).click();
  await expect(page.getByRole("form", { name: "Search classes" }).getByRole("textbox", { name: "Enter a course number" })).toHaveValue(
    "1301, 1302",
  );
});

test("too many course numbers is a field error", async ({ page }) => {
  await page.goto("/course-search?term=202701&subjects=CSC");
  const number = await hydrated(page.getByRole("textbox", { name: "Enter a course number" }));
  await number.fill("1,2,3,4,5,6,7");
  await page.getByRole("button", { name: "Search Classes", exact: true }).click();
  await expect(page.getByText("Search up to 6 course numbers at a time.")).toBeVisible();
  await expect(number).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(/\/course-search\?/);
});
