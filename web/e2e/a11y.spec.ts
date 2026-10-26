import AxeBuilder from "@axe-core/playwright";
import type { Page } from "@playwright/test";
import { SEED, addToSchedule, addWatch, expect, freshUser, login, resetAll, test } from "./support";

/**
 * axe-core on every page, signed out (public pages and the guest dashboard) and signed in (the
 * member pages, with a watch and two scheduled classes so lists, cards and the week grid render).
 * Fails on serious or critical WCAG 2.x A/AA violations; minor/moderate ones are printed but
 * tolerated. Add new pages to GUEST_PAGES or MEMBER_PAGES.
 */
const GUEST_PAGES = ["/", "/privacy", "/terms", "/dashboard"];

const { term, csc1301, math2211 } = SEED;

/** Member pages, each with what to wait for before scanning (streamed sections, live data). */
const MEMBER_PAGES: { path: string; ready: (page: Page) => Promise<void> }[] = [
  {
    path: "/dashboard",
    ready: (page) => expect(page.getByRole("region", { name: "At a glance" })).toBeVisible(),
  },
  {
    path: "/course-search",
    ready: (page) => expect(page.getByRole("combobox", { name: "Term" })).toHaveValue(term),
  },
  {
    path: `/course-results?term=${term}&subjects=CSC&courseNumber=1301`,
    ready: (page) => expect(page.getByRole("list", { name: "Sections" }).getByRole("article")).toHaveCount(2),
  },
  {
    path: "/tracked-classes",
    ready: (page) => expect(page.getByRole("article")).toHaveCount(1),
  },
  {
    path: "/schedule-builder",
    ready: (page) => expect(page.getByRole("button", { name: /MATH 2211 · 001/ }).first()).toBeVisible(),
  },
  {
    path: "/settings",
    ready: (page) => expect(page.getByRole("button", { name: "Delete account" })).toBeVisible(),
  },
];

test.beforeEach(async ({ request }) => {
  await resetAll(request);
});

async function expectNoSeriousViolations(page: Page, label: string) {
  const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
  const others = results.violations.filter((v) => !blocking.includes(v));
  if (others.length) {
    console.log(`${label} minor/moderate:`, others.map((v) => `${v.id} x${v.nodes.length}`).join(", "));
  }
  const summary = blocking.map((v) => ({
    id: v.id,
    impact: v.impact,
    help: v.help,
    targets: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
  }));
  expect(summary, JSON.stringify(summary, null, 2)).toEqual([]);
}

for (const colorScheme of ["light", "dark"] as const) {
  for (const path of GUEST_PAGES) {
    test(`${path} has no serious accessibility violations (${colorScheme})`, async ({ page }) => {
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto(path);
      await page.waitForLoadState("networkidle");
      await expectNoSeriousViolations(page, `${path} (${colorScheme})`);
    });
  }

  for (const { path, ready } of MEMBER_PAGES) {
    test(`member ${path} has no serious accessibility violations (${colorScheme})`, async ({ page }) => {
      await login(page.request, freshUser("a11y"));
      await addWatch(page.request, { crn: csc1301.open, ...csc1301 });
      await addToSchedule(page.request, { crn: csc1301.open, ...csc1301 });
      await addToSchedule(page.request, { crn: math2211.open, ...math2211 });
      await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
      await page.goto(path);
      await ready(page);
      await page.waitForLoadState("networkidle");
      await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
      await expectNoSeriousViolations(page, `member ${path} (${colorScheme})`);
    });
  }
}
