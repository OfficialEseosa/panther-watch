import path from "node:path";
import type { Page } from "@playwright/test";
import { ADMIN_EMAIL } from "./env";
import { SEED, addWatch, db, expect, fake, freshUser, hydrated, login, resetAll, runWatcher, test, toast } from "./support";

/** /admin/* (pages.md §8). Desktop project only (playwright.config.ts). */

const ADMIN = { email: ADMIN_EMAIL, name: "Ada Admin", admin: true } as const;
const GRADES = path.join(__dirname, "..", "data", "grade-csv");
const SUMMARY_CSV = path.join(GRADES, "202601__summary.csv");
const DETAILED_CSV = path.join(GRADES, "202601__detailed.csv");

test.beforeEach(async ({ request }) => {
  await resetAll(request);
});

const stat = (page: Page, label: string) =>
  page.getByTestId("stat").filter({ has: page.getByText(label, { exact: true }) }).locator(".sr-only");

test("non-admins get the not-found page", async ({ page }) => {
  await login(page.request, freshUser("not-admin"));
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Admin sections" })).toHaveCount(0);
});

test("overview tiles and the users search", async ({ page }) => {
  const member = freshUser("findme", "Morgan Member");
  await login(page.request, member);
  await addWatch(page.request, { crn: SEED.csc1301.open, ...SEED.csc1301 });
  await login(page.request, ADMIN);

  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Admin" })).toBeVisible();
  await expect(stat(page, "Users")).toHaveText("2");
  await expect(stat(page, "Watched sections")).toHaveText("1");
  await expect(stat(page, "Schedule entries")).toHaveText("0");

  await page.getByRole("navigation", { name: "Admin sections" }).getByRole("link", { name: "Users" }).click();
  await expect(page).toHaveURL(/\/admin\/users/);
  const search = await hydrated(page.getByRole("searchbox", { name: "Search users by name or email" }));
  await search.fill("findme");
  const list = page.getByRole("list", { name: "Users" });
  await expect(list.getByRole("listitem")).toHaveCount(1);
  await expect(list).toContainText(member.email);
  await expect(list).toContainText("Morgan Member");
  await expect(list).toContainText("1 tracked");
  await expect(page).toHaveURL(/[?&]q=findme/);
  await search.fill("nobody-matches-this");
  await expect(page.getByText("No users match “nobody-matches-this”.")).toBeVisible();
});

test("announcements: publish shows the banner to members, pause hides it", async ({ page }) => {
  const message = `E2E maintenance window ${Date.now()}`;
  const member = freshUser("banner-viewer");
  await login(page.request, ADMIN);
  await page.goto("/admin/announcements");
  await (await hydrated(page.getByRole("button", { name: "New announcement" }).first())).click();
  const editor = page.getByRole("dialog", { name: "New announcement" });
  await editor.getByRole("textbox", { name: "Message" }).fill(message);
  await editor.getByRole("button", { name: "Publish" }).click();
  await expect(toast(page, "Announcement published")).toBeVisible();
  await expect(page.getByRole("region", { name: /^Live/ }).getByText(message)).toBeVisible();

  await login(page.request, member);
  await page.goto("/dashboard");
  await expect(page.getByRole("region", { name: "Announcements" }).getByText(message)).toBeVisible();

  await login(page.request, ADMIN);
  await page.goto("/admin/announcements");
  const row = page.getByRole("listitem").filter({ hasText: message });
  await (await hydrated(row.getByRole("button", { name: "Pause" }))).click();
  await expect(toast(page, "Announcement paused")).toBeVisible();
  await expect(row.getByRole("button", { name: "Resume" })).toBeVisible();

  await login(page.request, member);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();
  await expect(page.getByText(message)).toHaveCount(0);
});

test("announcements: dismissing the only announcement persists across a reload", async ({ page }) => {
  const message = `E2E dismiss me ${Date.now()}`;
  await login(page.request, ADMIN);
  await page.goto("/admin/announcements");
  await (await hydrated(page.getByRole("button", { name: "New announcement" }).first())).click();
  const editor = page.getByRole("dialog", { name: "New announcement" });
  await editor.getByRole("textbox", { name: "Message" }).fill(message);
  await editor.getByRole("button", { name: "Publish" }).click();
  await expect(toast(page, "Announcement published")).toBeVisible();

  await login(page.request, freshUser("banner-dismisser"));
  await page.goto("/dashboard");
  const banner = page.getByRole("region", { name: "Announcements" });
  await expect(banner.getByText(message)).toBeVisible();
  // The banner collapses, then unmounts and saves the dismissal (needs the collapse animation's
  // animationend, or its safety timeout).
  await (await hydrated(banner.getByRole("button", { name: "Dismiss announcement" }))).click();
  await expect(banner).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem("pantherwatch.dismissedAnnouncements")))
    .toMatch(/^\["[^"]+"\]$/);

  await page.reload();
  // Hydrated shell: the client has applied the stored dismissal by now.
  await hydrated(page.getByRole("button", { name: /^Account: / }).filter({ visible: true }).first());
  await expect(page.getByRole("heading", { level: 1, name: /Welcome back/ })).toBeVisible();
  await expect(page.getByText(message)).toHaveCount(0);
});

test("grades: the two real CSVs upload; swapped files are flagged", async ({ page }) => {
  await login(page.request, ADMIN);
  await page.goto("/admin/grades");
  const form = page.locator("form").filter({ has: page.getByRole("textbox", { name: "Term code" }) });
  await hydrated(form.getByRole("textbox", { name: "Term code" }));

  // Swapped: the detailed export in the summary slot and vice versa.
  await form.getByLabel("Summary export").setInputFiles(DETAILED_CSV);
  await form.getByLabel("Detailed export").setInputFiles(SUMMARY_CSV);
  await expect(form.getByText("The files look swapped")).toBeVisible();
  await form.getByRole("button", { name: "Swap files" }).click();
  await expect(form.getByText("The files look swapped")).toHaveCount(0);
  await expect(form.getByText("Looks right")).toHaveCount(2);

  await form.getByRole("textbox", { name: "Term code" }).fill("202601");
  await form.getByRole("button", { name: "Upload" }).click();
  await expect(toast(page, "Spring 2026 uploaded")).toBeVisible({ timeout: 45_000 });
  await expect(page.getByRole("region", { name: /Terms on file|Stored terms|Grade terms/ }).getByText("Spring 2026")).toBeVisible();
});

test("email: a one-off send reaches the fake Resend and is logged", async ({ page }) => {
  await login(page.request, ADMIN);
  await page.goto("/admin/email");
  const to = await hydrated(page.getByRole("textbox", { name: "To" }));
  await to.fill("someone@e2e.test");
  await page.getByRole("textbox", { name: "Subject" }).fill("E2E hello");
  await page.getByRole("textbox", { name: "Message (HTML)" }).fill("<p>Hello from the e2e suite.</p>");
  await page.getByRole("button", { name: "Send email" }).click();
  const confirm = page.getByRole("dialog", { name: "Send this email?" });
  await confirm.getByRole("button", { name: "Send email" }).click();

  const notice = toast(page, "Email sent to someone@e2e.test");
  await expect(notice).toBeVisible();
  const log = await db.emailLog(page.request);
  const row = log.find((r) => r.recipient === "someone@e2e.test");
  expect(row).toBeDefined();
  await expect(notice).toContainText(`Logged as #${row!.id}.`);
  const sent = await fake.emails();
  expect(sent.map((e) => e.body.to)).toContainEqual("someone@e2e.test");
  expect(sent.find((e) => e.body.subject === "E2E hello")).toBeDefined();
});

test("jobs: the watcher run shows up", async ({ page }) => {
  await login(page.request, ADMIN);
  const summary = await runWatcher(page.request);
  await page.goto("/admin/jobs");
  const runs = page.getByRole("region", { name: "Watcher runs" });
  await expect(runs.getByRole("listitem")).toHaveCount(1);
  await expect(runs).toContainText(`#${summary.jobRunId}`);
});
