import path from "node:path";
import AxeBuilder from "@axe-core/playwright";
import type { Page, Route } from "@playwright/test";
import { APP_URL } from "./env";
import { expect, freshUser, hydrated, login, resetAll, test } from "./support";

/**
 * The on-page assistant at the top of /assistant (components/assistant/AssistantChat.tsx).
 * POST /api/assistant/chat is mocked with `page.route` and a scripted `text/event-stream` body
 * (the real route needs Anthropic), so these cover the UI's handling of the contract: streamed
 * text, tool status lines, the "messages left" hint, error codes, Stop, and sessionStorage.
 *
 * Set ASSISTANT_SHOTS=<dir> to also save screenshots of a streamed conversation (light + dark).
 */

const ENDPOINT = "**/api/assistant/chat";
const QUESTION = "Which CSC 4350 sections are open?";
const LABEL = "Searching CSC 4350 in Spring 2027";
const RESULTS_URL = "https://www.pantherwatch.app/course-results?term=202701&subjects=CSC&courseNumber=4350";

type Sse = { event: string; data: unknown };
const sse = (events: Sse[]) => events.map(({ event, data }) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`).join("");

const REPLY: Sse[] = [
  { event: "tool", data: { id: "toolu_1", name: "search_sections", status: "running", label: LABEL } },
  { event: "tool", data: { id: "toolu_1", name: "search_sections", status: "done", label: LABEL } },
  { event: "text", data: { delta: "\n\nTwo sections of CSC 4350 have open seats:\n" } },
  { event: "text", data: { delta: "• CRN 80001, Mon/Wed 9:00 AM, 4 seats\n" } },
  { event: "text", data: { delta: "• CRN 80002, online, 12 seats\n\n" } },
  { event: "text", data: { delta: `See them all: ${RESULTS_URL}. Want me to track one?` } },
  // This deployment's own origin (http://localhost in e2e) links in-app too; other sites open in a new tab.
  { event: "text", data: { delta: `
Your list: ${APP_URL}/tracked-classes (GoSolar: https://registration.gosolar.gsu.edu).` } },
  { event: "done", data: { usage: { input: 900, output: 80, cacheRead: 0, cacheWrite: 0 }, remaining: { today: 7 } } },
];

function fulfillSse(route: Route, events: Sse[]) {
  return route.fulfill({ status: 200, headers: { "Content-Type": "text/event-stream" }, body: sse(events) });
}

async function openChat(page: Page) {
  await login(page.request, freshUser("chat"));
  await page.goto("/assistant");
  const input = page.getByRole("textbox", { name: "Message the PantherWatch Assistant" });
  await hydrated(input);
  return { input, log: page.getByRole("log", { name: "Conversation" }) };
}

test.beforeEach(async ({ request }) => {
  await resetAll(request);
});

test("streams a reply with a tool step, links in-app, counts down and survives a reload", async ({ page }, testInfo) => {
  const bodies: unknown[] = [];
  await page.route(ENDPOINT, (route) => {
    bodies.push(route.request().postDataJSON());
    return fulfillSse(route, REPLY);
  });
  const { input, log } = await openChat(page);

  // Empty: suggestion chips, no hint about remaining messages yet.
  await expect(page.getByRole("button", { name: QUESTION })).toBeVisible();
  await expect(page.getByText(/messages? left today/)).toHaveCount(0);

  await input.fill(QUESTION);
  await input.press("Enter");

  await expect(log.getByText(QUESTION)).toBeVisible();
  await expect(log).toContainText("Two sections of CSC 4350 have open seats:");
  await expect(log).toContainText("CRN 80002, online, 12 seats");
  // The settled reply folds its steps behind "Worked for Ns"; opened, a finished step is a muted
  // past-tense line.
  const worked = log.getByRole("button", { name: /^Worked for \d+s$/ });
  await expect(worked).toHaveAttribute("aria-expanded", "false");
  await expect(log.getByText("Searched CSC 4350 in Spring 2027", { exact: true })).toBeHidden();
  await worked.click();
  await expect(log.getByText("Searched CSC 4350 in Spring 2027", { exact: true })).toBeVisible();
  await expect(log.getByText(`${LABEL}…`)).toHaveCount(0);
  // A PantherWatch URL becomes an in-app link named after the page, not the raw URL.
  const link = log.getByRole("link", { name: "Open CSC 4350 in course search" });
  await expect(link).toHaveAttribute("href", "/course-results?term=202701&subjects=CSC&courseNumber=4350");
  await expect(link).not.toHaveAttribute("target", /.*/);
  await expect(log.getByRole("link", { name: "Tracked classes" })).toHaveAttribute("href", "/tracked-classes");
  const external = log.getByRole("link", { name: "https://registration.gosolar.gsu.edu" });
  await expect(external).toHaveAttribute("target", "_blank");
  await expect(external).toHaveAttribute("rel", "noopener noreferrer");
  await expect(page.getByText("7 messages left today")).toBeVisible();
  await expect(input).toBeEnabled();
  expect(bodies[0]).toEqual({ messages: [{ role: "user", content: QUESTION }] });

  // Shift+Enter is a new line; Enter sends, with the whole conversation so far.
  await input.press("Shift+Enter");
  await expect(input).toHaveValue("\n");
  await input.fill("Track the online one");
  await input.press("Enter");
  await expect(log.getByText("Track the online one")).toBeVisible();
  await expect.poll(() => bodies.length).toBe(2);
  const second = bodies[1] as { messages: { role: string; content: string }[] };
  expect(second.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
  expect(second.messages[1].content).toContain("Two sections of CSC 4350 have open seats:");
  await expect(log.getByText("Searched CSC 4350 in Spring 2027", { exact: true })).toHaveCount(2);

  // A streamed conversation passes axe in both themes; screenshots on request.
  for (const colorScheme of ["light", "dark"] as const) {
    await page.emulateMedia({ colorScheme, reducedMotion: "reduce" });
    await expect(page.locator("html")).toHaveAttribute("data-theme", colorScheme);
    const results = await new AxeBuilder({ page })
      .include("section[aria-labelledby='assistant-chat-title']")
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();
    const blocking = results.violations.filter((v) => v.impact === "serious" || v.impact === "critical");
    expect(blocking.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`)).toEqual([]);
    if (process.env.ASSISTANT_SHOTS) {
      await page.getByRole("heading", { name: "PantherWatch Assistant" }).scrollIntoViewIfNeeded();
      await page.screenshot({
        path: path.join(process.env.ASSISTANT_SHOTS, `chat-${testInfo.project.name}-${colorScheme}.png`),
      });
    }
  }

  // The conversation lives in sessionStorage: a reload keeps it, New chat clears it.
  await page.reload();
  await expect(log.getByText("Track the online one")).toBeVisible();
  await expect(log.getByRole("link", { name: "Open CSC 4350 in course search" }).first()).toBeVisible();
  await (await hydrated(page.getByRole("button", { name: "New chat" }))).click();
  await expect(page.getByRole("button", { name: QUESTION })).toBeVisible();
  await expect(log.getByText("Track the online one")).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole("button", { name: QUESTION })).toBeVisible();
});

test("a tool step shows its label while it runs, then collapses", async ({ page }) => {
  // page.route can't hold a body open mid-stream, so this one feeds the stream from the page.
  await page.addInitScript(() => {
    const encoder = new TextEncoder();
    let push: (chunk: string | null) => void = () => {};
    const original = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
      if (!url.includes("/api/assistant/chat")) return original(input, init);
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          push = (chunk) => (chunk === null ? controller.close() : controller.enqueue(encoder.encode(chunk)));
        },
      });
      return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
    };
    (window as unknown as { __sse: (chunk: string | null) => void }).__sse = (chunk) => push(chunk);
  });
  const { input, log } = await openChat(page);
  const feed = (events: Sse[] | null) =>
    page.evaluate((chunk) => (window as unknown as { __sse: (c: string | null) => void }).__sse(chunk), events && sse(events));

  await input.fill(QUESTION);
  await input.press("Enter");
  await expect(log.getByText("Thinking…")).toBeVisible();
  await expect(input).toBeDisabled();
  // One header line with a live timer (seconds hidden from screen readers: no announcement per tick).
  const header = log.locator("[data-status='running']").filter({ hasText: "Thinking…" });
  await expect(header).toHaveText(/^Thinking…\s*[1-9]\d*s$/);
  await expect(header.locator("[aria-hidden='true']").filter({ hasText: /^\d+s$/ })).toHaveCount(1);
  // The composer stays put from here to the end of the reply (the list scrolls inside the card).
  const composer = page.locator("form").filter({ has: input });
  const composerY = async () => (await composer.boundingBox())!.y;
  const startY = await composerY();
  const pageScroll = await page.evaluate(() => window.scrollY);
  await feed([REPLY[0]]);
  // A running tool takes over the header, timer and all.
  await expect(log.getByText(`${LABEL}…`)).toHaveCount(1);
  await expect(log.locator("[data-status='running']").filter({ hasText: LABEL })).toHaveText(
    new RegExp(`^${LABEL}…\\s*[1-9]\\d*s$`),
  );
  // Announced once through the status region, not through every delta of the log.
  await expect(page.getByRole("status").filter({ hasText: LABEL })).toHaveCount(1);
  await feed([REPLY[1]]);
  // The finished step sits under the header while the reply is still working.
  await expect(log.getByText("Searched CSC 4350 in Spring 2027", { exact: true })).toBeVisible();
  await expect(log.getByText(`${LABEL}…`)).toHaveCount(0);
  await feed(REPLY.slice(2, 4));
  await expect(log).toContainText("CRN 80001, Mon/Wed 9:00 AM, 4 seats");
  await expect(page.getByRole("button", { name: "Stop" })).toBeVisible();
  expect(await composerY()).toBe(startY);

  // Long enough to overflow the list: it scrolls inside the card, and only while the student is at
  // the bottom. Scrolled up to read, the next words leave the scroll position alone.
  const lines = Array.from({ length: 40 }, (_, i) => ({ event: "text", data: { delta: `\nLine ${i + 1} of the long answer.` } }));
  await feed(lines.slice(0, 20));
  await expect(log).toContainText("Line 20 of the long answer.");
  const atBottom = () => log.evaluate((el) => el.scrollHeight - el.scrollTop - el.clientHeight < 4);
  await expect.poll(atBottom).toBe(true);
  expect(await log.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  expect(await composerY()).toBe(startY);
  await log.evaluate((el) => {
    el.scrollTop = 0;
    el.dispatchEvent(new Event("scroll"));
  });
  await feed(lines.slice(20));
  await expect(log).toContainText("Line 40 of the long answer.");
  expect(await log.evaluate((el) => el.scrollTop)).toBe(0);
  expect(await composerY()).toBe(startY);

  await feed(REPLY.slice(4));
  await feed(null);
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  await expect(input).toBeEnabled();
  expect(await composerY()).toBe(startY);
  expect(await page.evaluate(() => window.scrollY)).toBe(pageScroll);

  // Settled: "Worked for Ns", steps folded behind it; the header toggles them.
  await expect(log.locator("[data-status='running']")).toHaveCount(0);
  const worked = log.getByRole("button", { name: /^Worked for [1-9]\d*s$/ });
  await expect(worked).toHaveAttribute("aria-expanded", "false");
  const step = log.getByText("Searched CSC 4350 in Spring 2027", { exact: true });
  await expect(step).toBeHidden();
  await worked.click();
  await expect(worked).toHaveAttribute("aria-expanded", "true");
  await expect(step).toBeVisible();
  await worked.click();
  await expect(worked).toHaveAttribute("aria-expanded", "false");
  await expect(step).toBeHidden();
});

test("a quick reply has no working line; Copy copies it, and replies have no Regenerate", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin: APP_URL });
  const answers = ["CRN 80001 and CRN 80002 both have open seats.", "You are tracking CSC 4350, CRN 80001."];
  const bodies: { messages: { role: string; content: string }[] }[] = [];
  await page.route(ENDPOINT, (route) => {
    bodies.push(route.request().postDataJSON());
    const text = answers[bodies.length - 1] ?? "Again.";
    return fulfillSse(route, [
      { event: "text", data: { delta: text } },
      { event: "done", data: { usage: { input: 10, output: 5, cacheRead: 0, cacheWrite: 0 }, remaining: { today: 20 } } },
    ]);
  });
  const { input, log } = await openChat(page);

  await input.fill(QUESTION);
  await input.press("Enter");
  await expect(log).toContainText(answers[0]);
  // No tools and well under 2 s: no "Thinking…"/"Worked for" line left behind.
  await expect(log.getByText(/^Worked/)).toHaveCount(0);
  await expect(log.getByText("Thinking…")).toHaveCount(0);

  // Copy: the reply's plain text, then "Copied" for a moment.
  const copy = log.getByRole("button", { name: "Copy" });
  await expect(copy).toHaveCount(1);
  await copy.click();
  await expect(log.getByRole("button", { name: "Copied" })).toBeVisible();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(answers[0]);
  await expect(log.getByRole("button", { name: "Copy" })).toBeVisible({ timeout: 4000 });

  await input.fill("What am I tracking?");
  await input.press("Enter");
  await expect(log).toContainText(answers[1]);
  // Copy on every settled reply, and no Regenerate (removed: it could be spammed to re-run tools).
  await expect(log.getByRole("button", { name: "Copy" })).toHaveCount(2);
  await expect(log.getByRole("button", { name: "Regenerate" })).toHaveCount(0);
  expect(bodies).toHaveLength(2);
  expect(bodies[1].messages).toEqual([
    { role: "user", content: QUESTION },
    { role: "assistant", content: answers[0] },
    { role: "user", content: "What am I tracking?" },
  ]);
  await expect(log.locator("ol > li")).toHaveCount(4);
});

test("Stop aborts the reply in flight", async ({ page }) => {
  // Never answered: the request stays open until the page aborts it.
  let requested = false;
  await page.route(ENDPOINT, () => {
    requested = true;
  });
  const { input, log } = await openChat(page);
  // The suggestion chips send right away.
  await (await hydrated(page.getByRole("button", { name: "What am I tracking?" }))).click();
  await expect(log.getByText("What am I tracking?")).toBeVisible();
  await expect(log.getByText("Thinking…")).toBeVisible();
  await expect(input).toBeDisabled();
  await page.getByRole("button", { name: "Stop" }).click();
  await expect(log.getByText("Stopped", { exact: true })).toBeVisible();
  await expect(log.getByText("Thinking…")).toHaveCount(0);
  await expect(input).toBeEnabled();
  await expect(page.getByRole("button", { name: "Send" })).toBeVisible();
  expect(requested).toBe(true);
});

test("the daily limit (429 budget) shows the route's message and stops sending", async ({ page }) => {
  const message = "You’ve used your 40 messages for today. They reset at midnight Eastern time.";
  await page.route(ENDPOINT, (route) =>
    route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ code: "budget", message }) }),
  );
  const { input, log } = await openChat(page);
  await input.fill(QUESTION);
  await input.press("Enter");
  await expect(log.getByText(message)).toBeVisible();
  await expect(log.getByRole("button", { name: "Retry" })).toHaveCount(0);
  await expect(page.getByText("0 messages left today")).toBeVisible();
  await expect(input).toBeDisabled();
  // The hint under the composer uses the route's words too.
  const composer = page.locator("form").filter({ has: input });
  await expect(composer.getByText(message)).toBeVisible();

  // A new chat always re-enables the composer; the route refuses again if the cap still holds.
  await page.getByRole("button", { name: "New chat" }).click();
  await expect(input).toBeEnabled();
  await expect(page.getByText("0 messages left today")).toHaveCount(0);
});

test("the site-wide cap shows its own words under the composer, not the per-student ones", async ({ page }) => {
  const message = "The assistant has reached its daily limit for everyone. It resets at midnight Eastern time.";
  await page.route(ENDPOINT, (route) =>
    route.fulfill({ status: 429, contentType: "application/json", body: JSON.stringify({ code: "budget", message }) }),
  );
  const { input, log } = await openChat(page);
  await input.fill(QUESTION);
  await input.press("Enter");
  await expect(log.getByText(message)).toBeVisible();
  await expect(input).toBeDisabled();
  const composer = page.locator("form").filter({ has: input });
  await expect(composer.getByText(message)).toBeVisible();
  await expect(page.getByText(/used today.s messages/)).toHaveCount(0);
  // Still blocked after a reload on the same (Eastern) day.
  await page.reload();
  await expect(log.getByText(message)).toBeVisible();
  await expect(input).toBeDisabled();
});

test("a block recorded on an earlier Eastern day is dropped on reload", async ({ page }) => {
  await page.route(ENDPOINT, (route) =>
    route.fulfill({
      status: 429,
      contentType: "application/json",
      body: JSON.stringify({ code: "budget", message: "You’ve used all of today’s assistant messages." }),
    }),
  );
  const { input, log } = await openChat(page);
  await input.fill(QUESTION);
  await input.press("Enter");
  await expect(page.getByText("0 messages left today")).toBeVisible();
  await expect(input).toBeDisabled();

  // The caps reset at midnight Eastern: pretend the block was stored yesterday.
  await page.evaluate(() => {
    for (let i = 0; i < sessionStorage.length; i++) {
      const key = sessionStorage.key(i)!;
      if (!key.startsWith("pantherwatch.assistant.")) continue;
      const state = JSON.parse(sessionStorage.getItem(key)!) as { day?: string };
      if (!state.day) throw new Error("no day stored with the count");
      const [y, m, d] = state.day.split("-").map(Number);
      state.day = new Date(Date.UTC(y, m - 1, d - 1)).toISOString().slice(0, 10);
      sessionStorage.setItem(key, JSON.stringify(state));
    }
  });
  await page.reload();
  // The conversation is still there, but the stale count no longer blocks sending.
  await expect(log.getByText(QUESTION)).toBeVisible();
  await expect(await hydrated(input)).toBeEnabled();
  await input.fill("Try again");
  await expect(page.getByText("0 messages left today")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Send" })).toBeEnabled();
});

test("an error event can be retried; a disabled assistant says so", async ({ page }) => {
  let calls = 0;
  await page.route(ENDPOINT, (route) => {
    calls += 1;
    if (calls === 1) {
      return fulfillSse(route, [
        { event: "text", data: { delta: "Let me check" } },
        { event: "error", data: { code: "upstream", message: "The assistant had trouble answering. Try again." } },
      ]);
    }
    return route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ code: "disabled" }) });
  });
  const { input, log } = await openChat(page);
  await input.fill(QUESTION);
  await input.press("Enter");
  await expect(log.getByText("The assistant had trouble answering. Try again.")).toBeVisible();
  await log.getByRole("button", { name: "Retry" }).click();
  await expect(page.getByText(/The assistant isn.t available right now\. You can still connect/)).toBeVisible();
  await expect(input).toBeDisabled();
  expect(calls).toBe(2);
});

test("guests get a sign-in prompt instead of the chat", async ({ page }) => {
  // Guests open on the Connect tab (assistant-connect.spec.ts); the Chat tab holds the prompt.
  await page.goto("/assistant?tab=chat");
  await expect(page.getByRole("tab", { name: "Chat", exact: true })).toHaveAttribute("aria-selected", "true");
  const card = page.getByRole("region", { name: "PantherWatch Assistant" });
  await expect(card.getByText(/Sign in to chat with the PantherWatch Assistant/)).toBeVisible();
  await expect(card.getByRole("link", { name: "Sign in with Google" })).toHaveAttribute("href", "/api/auth/google/login");
  await expect(page.getByRole("textbox", { name: "Message the PantherWatch Assistant" })).toHaveCount(0);
});
