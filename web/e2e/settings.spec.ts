import { APP_URL } from "./env";
import { SEED, addToSchedule, addWatch, db, expect, freshUser, hydrated, login, resetAll, sessionCookie, test } from "./support";

/** /settings (pages.md §7): profile, theme, delete account. */

const { csc1301 } = SEED;

test.beforeEach(async ({ request }) => {
  await resetAll(request);
});

test("profile shows the account; the theme control applies and persists", async ({ page }) => {
  const user = freshUser("settings", "Sam Settings");
  await login(page.request, user);
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/settings");
  await expect(page.getByRole("heading", { level: 1, name: "Settings" })).toBeVisible();
  const main = page.getByRole("main");
  await expect(main.getByText(user.name, { exact: true })).toBeVisible();
  await expect(main.getByText(user.email, { exact: true }).first()).toBeVisible();
  await expect(main.getByText("Signed in with Google.", { exact: false })).toBeVisible();
  await expect(page.getByText(`Seat alerts go to ${user.email}.`)).toBeVisible();

  const theme = main.getByRole("radiogroup", { name: "Theme" });
  await expect(theme.getByRole("radio", { name: "System" })).toBeChecked();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");

  await (await hydrated(theme.getByRole("radio", { name: "Dark" }))).check({ force: true });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(theme.getByRole("radio", { name: "Dark" })).toBeChecked();

  await theme.getByRole("radio", { name: "Light" }).check({ force: true });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  // The switch crossfades with a view transition, whose overlay takes pointer events meanwhile.
  await expect(page.locator("html")).not.toHaveAttribute("data-theme-switching", /.*/);
  await theme.getByRole("radio", { name: "System" }).check({ force: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
});

test("delete account needs DELETE typed (any case), then signs out and sends the goodbye email", async ({ page, context }) => {
  const user = freshUser("delete-me");
  const { userId } = await login(page.request, user);
  await addWatch(page.request, { crn: csc1301.open, ...csc1301 });
  await addToSchedule(page.request, { crn: csc1301.open, ...csc1301 });
  await page.goto("/settings");

  await (await hydrated(page.getByRole("button", { name: "Delete account" }))).click();
  const dialog = page.getByRole("dialog", { name: "Delete your PantherWatch account?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  const confirm = dialog.getByRole("button", { name: "Delete account" });
  const field = dialog.getByRole("textbox", { name: "Type DELETE to confirm" });
  await expect(confirm).toBeDisabled();
  await field.fill("delete it");
  await expect(confirm).toBeDisabled();
  // Any case works (pages.md §7 says "delete"); the label keeps the capitalized hint.
  await field.fill("delete");
  await expect(confirm).toBeEnabled();
  await field.fill("DELETE");
  await expect(confirm).toBeEnabled();

  await confirm.click();
  await expect(page).toHaveURL(`${APP_URL}/`);
  await expect.poll(() => sessionCookie(context)).toBeUndefined();

  await page.goto("/settings");
  await expect(page).toHaveURL(`${APP_URL}/?next=%2Fsettings`);

  const log = await db.emailLog(page.request);
  expect(log.filter((row) => row.type === "goodbye")).toEqual([
    expect.objectContaining({ type: "goodbye", recipient: user.email }),
  ]);
  expect(await db.watches(page.request, userId)).toEqual([]);
});
