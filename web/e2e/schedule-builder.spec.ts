import { readFile } from "node:fs/promises";
import type { Page } from "@playwright/test";
import { SEED, addToSchedule, animationsDone, expect, freshUser, hydrated, login, resetAll, test, toast } from "./support";

/**
 * /schedule-builder, laid out like the original page: the week grid above 768 px, the agenda
 * list at 768 px and below (CSS switches them; there is no view toggle). Seeded meeting times
 * (e2e/fake-gosolar-server.ts): CSC 1301 80001 Mon/Wed 9:00-9:50, MATH 2211 80010 Tue/Thu
 * 10:00-10:50, and CSC 1302 80003 Mon/Wed 9:30-10:20, which overlaps CSC 1301.
 */

const { term, csc1301, csc1302, math2211 } = SEED;

test.beforeEach(async ({ request }) => {
  await resetAll(request);
});

async function seedTwo(page: Page) {
  await login(page.request, freshUser("schedule"));
  await addToSchedule(page.request, { crn: csc1301.open, ...csc1301 });
  await addToSchedule(page.request, { crn: math2211.open, ...math2211 });
}

const visible = (page: Page, name: string) => page.getByRole("button", { name, exact: true }).filter({ visible: true });
const scheduleApi = async (page: Page) =>
  ((await (await page.request.get("/api/schedule")).json()).schedule[term] ?? []) as { crn: string; colorIndex: number }[];
const colorOf = async (page: Page, crn: string) => (await scheduleApi(page)).find((e) => e.crn === crn)?.colorIndex;

test("week grid, class dialog color and remove with Undo", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "The week grid is hidden on phones; the agenda test covers them.");
  await seedTwo(page);
  await page.goto("/schedule-builder");
  await expect(page.getByRole("heading", { level: 1, name: "Schedule Builder" })).toBeVisible();

  const week = page.getByRole("region", { name: "Spring 2027 week" });
  await expect(week).toBeVisible();
  const day = (name: string) => week.getByRole("group", { name });
  await expect(week.getByRole("button")).toHaveCount(4);
  for (const name of ["Monday", "Wednesday"]) {
    await expect(day(name).getByRole("button")).toHaveCount(1);
    await expect(day(name).getByRole("button")).toHaveAccessibleName(new RegExp(`^CSC 1301 · 001\\s*9:00 AM - 9:50 AM.*, ${name}$`));
  }
  for (const name of ["Tuesday", "Thursday"]) {
    await expect(day(name).getByRole("button")).toHaveCount(1);
    await expect(day(name).getByRole("button")).toHaveAccessibleName(new RegExp(`^MATH 2211 · 001\\s*10:00 AM - 10:50 AM.*, ${name}$`));
  }
  await expect(day("Friday").getByRole("button")).toHaveCount(0);
  await expect(page.getByText(/\bconflicts?\b/)).toHaveCount(0);

  // Class dialog: change the color; the PATCH persists across a reload.
  const monday = await hydrated(day("Monday").getByRole("button"));
  await monday.click();
  let dialog = page.getByRole("dialog", { name: "CSC 1301 · 001" });
  await expect(dialog).toBeVisible();
  const before = await colorOf(page, csc1301.open);
  const [target, targetIndex] = before === 4 ? ["Green", 5] : ["Orange", 4];
  await animationsDone(page);
  const saved = page.waitForResponse((r) => r.url().includes("/api/schedule/color") && r.request().method() === "PATCH");
  await dialog.getByRole("radiogroup", { name: "Color for CSC 1301" }).getByRole("radio", { name: target }).check({ force: true });
  expect((await saved).ok()).toBe(true);
  await dialog.getByRole("button", { name: "Done" }).click();
  await expect(dialog).toBeHidden();

  await page.reload();
  await (await hydrated(page.getByRole("region", { name: "Spring 2027 week" }).getByRole("group", { name: "Monday" }).getByRole("button"))).click();
  dialog = page.getByRole("dialog", { name: "CSC 1301 · 001" });
  await expect(dialog.getByRole("radio", { name: target })).toBeChecked();
  expect(await colorOf(page, csc1301.open)).toBe(targetIndex);

  // Remove, then Undo from the toast.
  await dialog.getByRole("button", { name: "Remove from schedule" }).click();
  await expect(dialog).toBeHidden();
  const notice = toast(page, "Removed CSC 1301");
  await expect(notice).toBeVisible();
  await expect(week.getByRole("button")).toHaveCount(2);
  await expect.poll(async () => (await scheduleApi(page)).map((e) => e.crn)).toEqual([math2211.open]);
  await notice.getByRole("button", { name: "Undo" }).click();
  await expect(week.getByRole("button")).toHaveCount(4);
  await expect.poll(async () => (await scheduleApi(page)).map((e) => e.crn).sort()).toEqual([csc1301.open, math2211.open]);
  // Undo keeps the chosen color.
  expect(await colorOf(page, csc1301.open)).toBe(targetIndex);
});

test("adding an overlapping section warns, outlines the conflict, and exports .ics", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "Desktop layout (week grid).");
  await seedTwo(page);
  await page.goto("/schedule-builder");
  const week = page.getByRole("region", { name: "Spring 2027 week" });
  await expect(week.getByRole("button")).toHaveCount(4);

  await (await hydrated(visible(page, "Add classes"))).click();
  const dialog = page.getByRole("dialog", { name: "Add Classes" });
  // The original modal opens on the tracked tab.
  await expect(dialog.getByRole("tab", { name: "From tracked classes" })).toHaveAttribute("aria-selected", "true");
  await dialog.getByRole("tab", { name: "Search catalog" }).click();
  await dialog.getByRole("combobox", { name: "Subject" }).fill("CSC");
  await dialog.getByRole("option", { name: /^CSC/ }).click();
  await dialog.getByRole("textbox", { name: "Course number" }).fill(csc1302.courseNumber);
  await dialog.getByRole("button", { name: "Search classes" }).click();
  await expect(dialog.getByText("1 section for CSC 1302")).toBeVisible();
  await expect(dialog.getByText("overlaps CSC 1301")).toBeVisible();
  await dialog.getByRole("button", { name: "Add CSC 1302 · 001" }).click();

  await expect(toast(page, /Added CSC 1302 · 001 · overlaps CSC 1301/)).toBeVisible();
  const added = dialog.getByRole("button", { name: "Added CSC 1302 · 001" });
  await expect(added).toHaveAttribute("aria-pressed", "true");
  await expect(added).toHaveText(/^Added\b/);
  // Record whether the new blocks get the one-shot `data-fresh` highlight after the dialog closes.
  await week.evaluate((el) => {
    (window as unknown as { __sawFresh: boolean }).__sawFresh = false;
    new MutationObserver(() => {
      if (el.querySelector("[data-fresh]")) (window as unknown as { __sawFresh: boolean }).__sawFresh = true;
    }).observe(el, { subtree: true, attributes: true, attributeFilter: ["data-fresh"], childList: true });
  });
  await dialog.getByRole("button", { name: "Close" }).click();
  await expect(dialog).toBeHidden();
  // The highlight plays once and clears (its animationend, or the safety timer).
  await expect.poll(() => page.evaluate(() => (window as unknown as { __sawFresh: boolean }).__sawFresh)).toBe(true);
  await expect(week.locator("[data-fresh]")).toHaveCount(0);

  // Conflict notice + conflict outline on the four overlapping blocks (Mon and Wed).
  await expect(page.getByText(/^1 conflict: CSC 1301 and CSC 1302 overlap/)).toBeVisible();
  await expect(week.getByRole("button")).toHaveCount(6);
  await expect(week.locator("[data-conflict]")).toHaveCount(4);
  await expect(
    week.getByRole("group", { name: "Monday" }).getByRole("button", { name: /^CSC 1302\b.*, Monday, conflicts with CSC 1301$/ }),
  ).toBeVisible();
  await expect(week.getByRole("group", { name: "Tuesday" }).locator("[data-conflict]")).toHaveCount(0);
  await expect.poll(async () => (await scheduleApi(page)).length).toBe(3);

  // Export: one VEVENT per timed section.
  const download = page.waitForEvent("download");
  await visible(page, "Export to calendar").click();
  const file = await download;
  expect(file.suggestedFilename()).toBe("pantherwatch-spring-2027.ics");
  const ics = await readFile((await file.path())!, "utf8");
  expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(3);
  expect(ics).toContain("BYDAY=MO,WE");
  expect(ics).toContain("BYDAY=TU,TH");
  await expect(toast(page, "Calendar file downloaded")).toBeVisible();
});

test("a phone-width screen shows the agenda list instead of the grid", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await seedTwo(page);
  await page.goto("/schedule-builder");
  await expect(page.getByRole("region", { name: "Spring 2027 week" })).toHaveCount(0);
  const monday = page.getByRole("region", { name: "Monday" }).getByRole("button");
  await expect(monday).toHaveAccessibleName(/^9:00 AM\s*9:50 AM\s*CSC 1301 · 001.*, Monday$/);
  await expect(page.getByRole("region", { name: "Tuesday" }).getByRole("button")).toHaveAccessibleName(
    /^10:00 AM\s*10:50 AM\s*MATH 2211 · 001.*, Tuesday$/,
  );
  // The header actions stay as buttons on phones.
  await expect(visible(page, "Export to calendar")).toHaveCount(1);
  await expect(visible(page, "Add classes")).toHaveCount(1);

  // An agenda row opens the same class dialog.
  await (await hydrated(monday)).click();
  const dialog = page.getByRole("dialog", { name: "CSC 1301 · 001" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("radiogroup", { name: "Color for CSC 1301" })).toBeVisible();
});
