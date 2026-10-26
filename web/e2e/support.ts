/**
 * Shared helpers for the specs: the e2e-only API (/api/test/*), the fake GoSolar/Resend
 * control endpoints, and the seed data the fake serves. New page specs should import `test`
 * and `expect` from here and call `resetAll()` in `beforeEach`.
 */
import { expect, test as base, type APIRequestContext, type BrowserContext, type Locator, type Page } from "@playwright/test";
import { APP_URL, CRON_SECRET, E2E_TEST_SECRET, FAKE_URL } from "./env";

/** What e2e/fake-gosolar-server.ts seeds (and restores on reset). */
export const SEED = {
  term: "202701",
  termName: "Spring Semester 2027",
  viewOnlyTerm: "202608",
  /** 80001 meets Mon/Wed 9:00-9:50 AM; 80002 Mon/Wed 11:00 AM-12:15 PM. */
  csc1301: { subject: "CSC", courseNumber: "1301", open: "80001", closed: "80002", title: "Principles of Computer Science I" },
  /** 80003 meets Mon/Wed 9:30-10:20 AM: overlaps CSC 1301 80001. */
  csc1302: { subject: "CSC", courseNumber: "1302", open: "80003", title: "Principles of Computer Science II" },
  /** 80010 meets Tue/Thu 10:00-10:50 AM. */
  math2211: { subject: "MATH", courseNumber: "2211", open: "80010", title: "Calculus of One Variable I" },
} as const;

let emailSeq = 0;
/** A fresh member for one test: "<prefix>-<n>-<time>@e2e.test" with a two-word name. */
export function freshUser(prefix = "member", name = "Pat Panther"): { email: string; name: string } {
  return { email: `${prefix}-${++emailSeq}-${Date.now()}@e2e.test`, name };
}

export const STUDENT = { email: "student@e2e.test", name: "E2E Student" } as const;

const secretHeaders = { "x-e2e-secret": E2E_TEST_SECRET };
/** Cookie-authenticated mutations need a same-origin Origin header (src/lib/http.ts assertSameOrigin). */
export const SAME_ORIGIN = { Origin: APP_URL } as const;

async function ok<T>(response: { ok(): boolean; status(): number; text(): Promise<string>; json(): Promise<T> }, what: string): Promise<T> {
  if (!response.ok()) throw new Error(`${what} -> ${response.status()}: ${await response.text()}`);
  return response.json();
}

async function fakeCall<T = unknown>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const response = await fetch(`${FAKE_URL}${path}`, {
    method: init?.method ?? "GET",
    headers: init?.body === undefined ? undefined : { "Content-Type": "application/json" },
    body: init?.body === undefined ? undefined : JSON.stringify(init.body),
  });
  if (!response.ok) throw new Error(`fake ${path} -> ${response.status}: ${await response.text()}`);
  return (await response.json()) as T;
}

/** The fake GoSolar/Resend process. */
export const fake = {
  reset: () => fakeCall("/__control/reset", { method: "POST" }),
  setSeats: (section: { term?: string; subject: string; courseNumber: string; crn: string; seatsAvailable?: number; waitCount?: number }) =>
    fakeCall("/__control/sections", { method: "POST", body: { term: SEED.term, ...section } }),
  emails: async () =>
    (await fakeCall<{ emails: { id: string; body: { to: string | string[]; subject: string; html: string } }[] }>("/__control/emails"))
      .emails,
  /** The next `count` GoSolar section searches fail ("affinity": success:true with data:null). */
  failSearches: (failure: { kind: "affinity" } | { kind: "http"; status?: number }, count = 1) =>
    fakeCall("/__control/fail-searches", { method: "POST", body: { ...failure, count } }),
  requests: async () =>
    (await fakeCall<{ requests: { method: string; path: string; query: Record<string, string>; status: number }[] }>("/__control/requests"))
      .requests,
};

/** Empties the app database and restores the fake's seed data. */
export async function resetAll(request: APIRequestContext): Promise<void> {
  await ok(await request.post("/api/test/reset", { headers: secretHeaders }), "POST /api/test/reset");
  await fake.reset();
}

export interface LoginResult {
  userId: string;
  email: string;
  isAdmin: boolean;
}

/**
 * Signs in through POST /api/test/login. Pass a browser context's `request` (`page.request`)
 * to sign the browser in: it shares the context's cookie jar.
 */
export async function login(
  request: APIRequestContext,
  user: { email: string; name?: string; admin?: boolean } = STUDENT,
): Promise<LoginResult> {
  return ok(
    await request.post("/api/test/login", { data: { secret: E2E_TEST_SECRET, ...user } }),
    "POST /api/test/login",
  );
}

export async function sessionCookie(context: BrowserContext) {
  return (await context.cookies(APP_URL)).find((cookie) => cookie.name === "pw_session");
}

type SectionRef = { crn: string; subject: string; courseNumber: string; title?: string };

/** Watches a seeded section through the real API (pass `page.request` for a signed-in browser). */
export async function addWatch(request: APIRequestContext, section: SectionRef, term: string = SEED.term) {
  return ok(
    await request.post("/api/watches", {
      headers: SAME_ORIGIN,
      data: { term, crn: section.crn, subject: section.subject, courseNumber: section.courseNumber, courseTitle: section.title },
    }),
    `POST /api/watches ${section.crn}`,
  );
}

/** Adds a seeded section to the schedule through the real API. */
export async function addToSchedule(request: APIRequestContext, section: SectionRef, term: string = SEED.term) {
  return ok(
    await request.post("/api/schedule", {
      headers: SAME_ORIGIN,
      data: { term, crn: section.crn, subject: section.subject, courseNumber: section.courseNumber, courseTitle: section.title },
    }),
    `POST /api/schedule ${section.crn}`,
  );
}

/** POST /api/cron/watch?sync=1: one watcher pass inside the request; returns its summary. */
export async function runWatcher(request: APIRequestContext): Promise<Record<string, number | string[] | undefined>> {
  return ok(
    await request.post("/api/cron/watch?sync=1", { headers: { Authorization: `Bearer ${CRON_SECRET}` } }),
    "POST /api/cron/watch?sync=1",
  );
}

/** Read-only views of the database through the e2e routes. */
export const db = {
  emailLog: async (request: APIRequestContext) =>
    (await ok<{ emails: Record<string, unknown>[] }>(await request.get("/api/test/email-log", { headers: secretHeaders }), "email-log"))
      .emails,
  jobRuns: async (request: APIRequestContext, job?: string) =>
    (
      await ok<{ runs: { id: number; job: string; ok: boolean | null; finishedAt: string | null; summary: Record<string, unknown> }[] }>(
        await request.get(`/api/test/job-runs${job ? `?job=${job}` : ""}`, { headers: secretHeaders }),
        "job-runs",
      )
    ).runs,
  watches: async (request: APIRequestContext, userId?: string) =>
    (
      await ok<{ watches: { id: number; crn: string; notifiedAt: string | null; lastClosedAt: string | null }[] }>(
        await request.get(`/api/test/watches${userId ? `?userId=${userId}` : ""}`, { headers: secretHeaders }),
        "watches",
      )
    ).watches,
  patchWatch: async (request: APIRequestContext, patch: { id: number; notifiedAt?: string | null; lastClosedAt?: string | null }) =>
    ok(await request.patch("/api/test/watches", { headers: secretHeaders, data: patch }), "PATCH watches"),
};

/**
 * Waits until React has hydrated `locator`'s element (it carries React's `__reactProps$` key).
 * Clicks on server-rendered markup before hydration are silently lost.
 */
export async function hydrated(locator: Locator): Promise<Locator> {
  await expect
    .poll(() => locator.evaluate((el) => Object.keys(el).some((key) => key.startsWith("__reactProps$"))), {
      message: "element hydrated by React",
    })
    .toBe(true);
  return locator;
}

/** localStorage key of the one-time "What's new" showcase (components/dashboard/WhatsNewLauncher). */
export const WHATS_NEW_KEY = "pantherwatch.whatsNew.v3";

/**
 * Marks the "What's new" showcase as seen before any page script runs, so a member's first
 * /dashboard visit doesn't open the full-screen overlay over what the test is about.
 */
export async function skipWhatsNew(page: Page): Promise<void> {
  await page.addInitScript((key) => window.localStorage.setItem(key, "1"), WHATS_NEW_KEY);
}

/**
 * Waits for every finite CSS animation on the page to finish (dialog/sheet entrances and
 * exits). Use before `force` actions, which skip Playwright's own stability check.
 */
export async function animationsDone(page: Page): Promise<void> {
  await page.evaluate(() =>
    Promise.all(
      document
        .getAnimations()
        .filter((animation) => animation.effect?.getComputedTiming().iterations !== Infinity)
        .map((animation) => animation.finished.catch(() => undefined)),
    ),
  );
}

/**
 * A visible toast by its text. Toasts are list items of the "Notifications" region; their text
 * is announced through the region's persistent sr-only live regions, not by the toast itself.
 */
export function toast(page: Page, text: string | RegExp): Locator {
  return page.getByRole("region", { name: "Notifications" }).getByRole("listitem").filter({ hasText: text });
}

/**
 * HMR messages that make the Next dev client reload or refresh the page. "turbopack-message"
 * carries client code updates; the Turbopack runtime answers a "restart" or "notFound" one with
 * `location.reload()`. Under Cache Components a page served from a stale dev shell gets exactly
 * that for its chunk-list subscription on every load, so the page reloaded in a loop until the
 * test timed out. The specs never need hot updates, so all of them are dropped.
 */
const RELOADING_HMR_MESSAGES = new Set([
  "serverComponentChanges",
  "staticParamsChanged",
  "reloadPage",
  "addedPage",
  "removedPage",
  "turbopack-message",
]);

/**
 * Playwright's `test` with one change: every browser context filters the dev server's HMR
 * socket (`/_next/hmr`), dropping the messages that reload pages. Without it, any file saved
 * while the suite runs (an editor, another agent) reloads pages mid-test. The socket cannot
 * simply be stubbed: the Turbopack dev client does not hydrate until it is connected.
 */
export const test = base.extend({
  context: async ({ context }, provide) => {
    await context.routeWebSocket(/\/_next\/hmr/, (ws) => {
      const server = ws.connectToServer();
      server.onMessage((message) => {
        if (typeof message === "string") {
          try {
            if (RELOADING_HMR_MESSAGES.has((JSON.parse(message) as { type?: string }).type ?? "")) return;
          } catch {
            // not JSON: pass through
          }
        }
        ws.send(message);
      });
    });
    await provide(context);
  },
});
export { expect };
