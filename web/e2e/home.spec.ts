import type { Locator } from "@playwright/test";
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

test("link previews: /opengraph-image is a PNG and / carries og:image and twitter:card", async ({ page, request }, testInfo) => {
  test.skip(testInfo.project.name === "mobile", "viewport-independent; checked once");
  const image = await request.get("/opengraph-image");
  expect(image.status()).toBe(200);
  expect(image.headers()["content-type"]).toBe("image/png");
  expect((await image.body()).subarray(0, 8)).toEqual(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));

  await page.goto("/");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /\/opengraph-image/);
  await expect(page.locator('meta[name="twitter:card"]')).toHaveAttribute("content", "summary_large_image");
  await expect(page.locator('meta[name="twitter:image"]')).toHaveAttribute("content", /\/twitter-image/);
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

test.describe("landing sample card", () => {
  /** The rotation of the card's flipper (the 3D turn), as the first matrix3d/matrix entry. */
  const flipperTurn = (flip: Locator) =>
    flip.evaluate((el) => {
      const flipper = el.querySelector<HTMLElement>("[class*=flipper]");
      return flipper ? getComputedStyle(flipper).transform : "missing";
    });

  test("click flips it to the panther side; Enter flips it back", async ({ page }) => {
    await page.goto("/");
    const flip = await hydrated(page.getByRole("button", { name: "Flip sample card" }));
    await expect(flip).toHaveAttribute("aria-pressed", "false");
    await expect(page.getByText("Georgia State monitoring suite")).toBeAttached();

    // The card floats continuously, so it never counts as "stable" for a normal click.
    await flip.click({ force: true });
    await expect(flip).toHaveAttribute("aria-pressed", "true");
    // The flipper turns 180deg about Y: matrix3d(-1, 0, ...) once the transition settles.
    await expect.poll(() => flipperTurn(flip)).toMatch(/^matrix3d\(-1, /);

    await flip.focus();
    await page.keyboard.press("Enter");
    await expect(flip).toHaveAttribute("aria-pressed", "false");
    await expect.poll(() => flipperTurn(flip)).toMatch(/^(none|matrix\(1, 0, 0, 1, 0, 0\)|matrix3d\(1, )/);
  });

  test("with reduced motion the flip is an instant swap of the two faces", async ({ page }) => {
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/");
    const flip = await hydrated(page.getByRole("button", { name: "Flip sample card" }));
    const back = page.getByText("Georgia State monitoring suite");
    const front = flip.getByText("Alina Nemira");
    await expect(front).toBeVisible();
    await expect(back).toBeHidden();

    await flip.click();
    await expect(flip).toHaveAttribute("aria-pressed", "true");
    await expect(back).toBeVisible();
    await expect(front).toBeHidden();

    await flip.focus();
    await page.keyboard.press("Enter");
    await expect(flip).toHaveAttribute("aria-pressed", "false");
    await expect(front).toBeVisible();
    await expect(back).toBeHidden();
  });
});
