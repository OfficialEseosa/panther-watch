import { expect, hydrated, test } from "./support";

test.use({ colorScheme: "light" });

test("landing page renders for a signed-out visitor", async ({ page }) => {
  const response = await page.goto("/");
  expect(response?.status()).toBe(200);
  await expect(page).toHaveTitle(/PantherWatch/);
  await expect(page.getByRole("heading", { level: 1, name: /Track seats/ })).toBeVisible();
  await expect(page.locator('a[href="/api/auth/google/login"]').first()).toBeVisible();
});

test("theme toggle switches data-theme and the choice survives a reload", async ({ page }) => {
  await page.goto("/");
  const html = page.locator("html");
  await expect(html).toHaveAttribute("data-theme", "light");

  const toDark = page.getByRole("button", { name: "Switch to dark theme" }).filter({ visible: true }).first();
  await (await hydrated(toDark)).click();
  await expect(html).toHaveAttribute("data-theme", "dark");
  expect(await page.evaluate(() => localStorage.getItem("pantherwatch.theme"))).toBe("dark");

  await page.reload();
  await expect(html).toHaveAttribute("data-theme", "dark");
  const toLight = page.getByRole("button", { name: "Switch to light theme" }).filter({ visible: true }).first();
  await expect(toLight).toBeVisible();
  await (await hydrated(toLight)).click();
  await expect(html).toHaveAttribute("data-theme", "light");
});

for (const { path, title } of [
  { path: "/privacy", title: "Privacy Policy" },
  { path: "/terms", title: "Terms of Service" },
]) {
  test(`${path} renders`, async ({ page }) => {
    const response = await page.goto(path);
    expect(response?.status()).toBe(200);
    await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  });
}

test("unknown URLs get the 404 page", async ({ page }) => {
  const response = await page.goto("/this-page-does-not-exist");
  expect(response?.status()).toBe(404);
  await expect(page.getByRole("heading", { level: 1, name: "Page not found" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Go to dashboard" })).toBeVisible();
});
