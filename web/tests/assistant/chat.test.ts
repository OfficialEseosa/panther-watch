import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/session")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  ...(await import("../helpers/session")).nextServerMock,
}));

import { POST } from "@/app/api/assistant/chat/route";
import { setDbForTests } from "@/db";
import { assistantDaily, assistantUsage, terms, watchedSections, type User } from "@/db/schema";
import { easternDay, resetAssistantLimitsForTests } from "@/lib/assistant/budget";
import { MAX_TOOL_ROUNDS } from "@/lib/assistant/chat";
import { assistantEnabled, setAssistantConfigForTests } from "@/lib/assistant/config";
import { SYSTEM_PROMPT } from "@/lib/assistant/prompt";
import { resetTermsMemoForTests, setGoSolarOptionsForTests } from "@/lib/courses";
import { resetRateLimits } from "@/lib/oauth/rate-limit";
import { createTestDb, seedUser, truncateAll, type TestDatabase } from "../helpers/db";
import { fakeAnthropic, parseSse, type FakeAnthropic } from "../helpers/fake-anthropic";
import { makeSection, startFakeGoSolar, type FakeGoSolar } from "../helpers/fake-gosolar";
import { apiRequest, call, flushAfter, TEST_ORIGIN } from "../helpers/session";

/**
 * POST /api/assistant/chat end to end: the real route handler, PGlite, fake GoSolar behind the
 * shared tools, and a transport-level fake of the Claude API (tests/helpers/fake-anthropic.ts)
 * that records every request the SDK makes. No key, no network.
 */

/** Open for registration (Spring 2027). */
const OPEN = "202701";
const DUMMY_KEY = "sk-ant-test-dummy-key";

let testDb: TestDatabase;
let gs: FakeGoSolar;
let claude: FakeAnthropic;
let alice: User;

beforeAll(async () => {
  testDb = await createTestDb();
  setDbForTests(testDb.db);
  gs = await startFakeGoSolar();
  setGoSolarOptionsForTests({ baseUrl: gs.url });
  claude = fakeAnthropic();
});
afterAll(async () => {
  setAssistantConfigForTests(undefined);
  setGoSolarOptionsForTests(undefined);
  setDbForTests(undefined);
  await gs.close();
  await testDb.close();
});
beforeEach(async () => {
  await truncateAll(testDb.db);
  gs.reset();
  claude.reset();
  resetRateLimits();
  resetAssistantLimitsForTests();
  resetTermsMemoForTests(); // a test below changes the terms table
  // The model calls every tool itself in these tests; prefetch.test.ts covers the course prefetch.
  setAssistantConfigForTests({ apiKey: DUMMY_KEY, fetch: claude.fetch, prefetch: false });
  await testDb.db.insert(terms).values([
    { code: OPEN, description: "Spring Semester 2027", viewOnly: false },
    { code: "202608", description: "Fall Semester 2026 (View Only)", viewOnly: true },
  ]);
  alice = await seedUser(testDb.db, { name: "Alice Panther" });
});
afterEach(async () => {
  await flushAfter();
});

type Msg = { role: "user" | "assistant"; content: string };

async function chat(messages: Msg[] | string, as: User | null = alice) {
  const body = typeof messages === "string" ? { messages: [{ role: "user", content: messages }] } : { messages };
  const request = await apiRequest("/api/assistant/chat", { method: "POST", as: as ?? undefined, body });
  const response = await call(POST, request);
  const isStream = response.headers.get("content-type")?.startsWith("text/event-stream") ?? false;
  const text = await response.text();
  return { status: response.status, isStream, events: isStream ? parseSse(text) : [], json: isStream ? null : JSON.parse(text) };
}

const textOf = (events: { event: string; data: { delta?: string } }[]) =>
  events.filter((e) => e.event === "text").map((e) => e.data.delta).join("");

async function usageRow(userId = alice.id) {
  const [row] = await testDb.db.select().from(assistantUsage).where(eq(assistantUsage.userId, userId));
  return row;
}

describe("access", () => {
  it("is off without an API key: 503 disabled, before auth and without calling the model", async () => {
    setAssistantConfigForTests({ apiKey: null, fetch: claude.fetch });
    expect(assistantEnabled()).toBe(false);
    const { status, json } = await chat("hi");
    expect(status).toBe(503);
    expect(json).toMatchObject({ code: "disabled" });
    expect(claude.requests).toHaveLength(0);
  });

  it("is on with a key (assistantEnabled for the page)", () => {
    expect(assistantEnabled()).toBe(true);
  });

  it("answers 401 when signed out", async () => {
    const { status, json } = await chat("hi", null);
    expect(status).toBe(401);
    expect(json).toMatchObject({ code: "unauthorized" });
    expect(claude.requests).toHaveLength(0);
  });

  it("refuses cross-origin requests", async () => {
    const request = await apiRequest("/api/assistant/chat", {
      method: "POST",
      as: alice,
      origin: "https://evil.example",
      body: { messages: [{ role: "user", content: "hi" }] },
    });
    expect((await call(POST, request)).status).toBe(403);
    expect(claude.requests).toHaveLength(0);
  });

  it("rejects bad bodies with 400 and no model call", async () => {
    const tooMany = Array.from({ length: 31 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "x" }) as Msg);
    const cases: Msg[][] = [
      tooMany,
      [{ role: "user", content: "x".repeat(4001) }],
      Array.from({ length: 7 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: "y".repeat(3900) }) as Msg),
      [
        { role: "user", content: "hi" },
        { role: "assistant", content: "hello" },
      ],
      [{ role: "user", content: "   " }],
    ];
    for (const messages of cases) {
      const { status, json } = await chat(messages);
      expect(status).toBe(400);
      expect(json.code).toBe("invalid_request");
    }
    const raw = await call(POST, await apiRequest("/api/assistant/chat", { method: "POST", as: alice, body: "{nope" }));
    expect(raw.status).toBe(400);
    expect(claude.requests).toHaveLength(0);
    expect(await usageRow()).toBeUndefined();
  });
});

describe("a turn", () => {
  it("streams text deltas then done, with a cache-friendly request", async () => {
    claude.reply({ text: ["Hi Alice! ", "I can help with GSU classes."], usage: { input: 1200, output: 20, cacheRead: 3000, cacheWrite: 0 } });
    const { status, isStream, events } = await chat("hello");
    expect(status).toBe(200);
    expect(isStream).toBe(true);
    expect(events.map((e) => e.event)).toEqual(["text", "text", "done"]);
    expect(textOf(events)).toBe("Hi Alice! I can help with GSU classes.");
    expect(events.at(-1)!.data).toEqual({
      usage: { input: 1200, output: 20, cacheRead: 3000, cacheWrite: 0 },
      remaining: { today: 39 },
      timing: { total: expect.any(Number), firstText: expect.any(Number), modelRequests: [expect.any(Number)], tools: [] },
    });

    expect(claude.requests).toHaveLength(1);
    const { body, headers, url } = claude.requests[0];
    expect(headers.get("authorization")).toBe(`Bearer ${DUMMY_KEY}`);
    expect(url).toContain("/v1/messages");
    expect(body).toMatchObject({ model: "claude-haiku-5-5", max_tokens: 4096, stream: true, output_config: { effort: "low" } });
    expect(body).not.toHaveProperty("thinking");
    expect(body).not.toHaveProperty("temperature");
    expect(body).not.toHaveProperty("tool_choice");
    // Haiku has no server-side refusal fallback.
    expect(body).not.toHaveProperty("fallbacks");
    expect(headers.get("anthropic-beta") ?? "").not.toContain("server-side-fallback");
    // Cache: frozen system prompt + last tool marked, automatic caching for the conversation.
    expect(body.system).toEqual([{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]);
    expect(body.cache_control).toEqual({ type: "ephemeral" });
    expect(body.tools).toHaveLength(14);
    expect(body.tools.at(-1).cache_control).toEqual({ type: "ephemeral" });
    expect(body.tools.slice(0, -1).every((t: { cache_control?: unknown }) => !t.cache_control)).toBe(true);
    for (const tool of body.tools) {
      expect(tool.strict).toBe(true);
      expect(tool.input_schema).toMatchObject({ type: "object", additionalProperties: false });
      expect(JSON.stringify(tool.input_schema)).not.toMatch(/"(maxLength|minimum|maximum|pattern|default|\$schema)"/);
    }
    // The date and the student's name go in the first user turn, never in the cached prefix.
    expect(SYSTEM_PROMPT).not.toMatch(/Alice|Today is|2026/);
    expect(body.messages).toHaveLength(1);
    expect(body.messages[0].role).toBe("user");
    expect(body.messages[0].content[0].text).toMatch(/^\[PantherWatch context, not written by the student\] Today is \w+day, /);
    expect(body.messages[0].content[0].text).toContain("first name is Alice.");
    expect(body.messages[0].content[1]).toEqual({ type: "text", text: "hello" });
  });

  it("sends earlier turns as text and keeps the context note on the first user message", async () => {
    claude.reply({ text: ["Sure."] });
    await chat([
      { role: "assistant", content: "Hi! Ask me about classes." },
      { role: "user", content: "first" },
      { role: "assistant", content: "answer one" },
      { role: "user", content: "second" },
    ]);
    const { messages } = claude.requests[0].body;
    expect(messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(messages[0].content[1].text).toBe("first");
    expect(messages[1]).toEqual({ role: "assistant", content: "answer one" });
    expect(messages[2]).toEqual({ role: "user", content: "second" });
  });

  it("on Sonnet/Opus: low effort and the server-side refusal fallback", async () => {
    setAssistantConfigForTests({ apiKey: DUMMY_KEY, fetch: claude.fetch, model: "claude-sonnet-5-5" });
    claude.reply({ text: ["ok"] });
    await chat("hi");
    const { body, headers } = claude.requests[0];
    expect(body).toMatchObject({ model: "claude-sonnet-5-5", output_config: { effort: "low" }, fallbacks: "default" });
    expect(headers.get("anthropic-beta")).toContain("server-side-fallback-2026-07-01");
  });

  it("ASSISTANT_EFFORT overrides the effort", async () => {
    setAssistantConfigForTests({ apiKey: DUMMY_KEY, fetch: claude.fetch, effort: "high" });
    claude.reply({ text: ["ok"] });
    await chat("hi");
    expect(claude.requests[0].body).toMatchObject({ model: "claude-haiku-5-5", output_config: { effort: "high" } });
  });
});

describe("tools", () => {
  it("runs search_sections against GoSolar and feeds the result back; tool events bracket the work", async () => {
    gs.setSections(OPEN, "CSC", "4350", [
      makeSection({ term: OPEN, subject: "CSC", courseNumber: "4350", courseReferenceNumber: "81234", courseTitle: "SOFTWARE ENGINEERING", seatsAvailable: 4 }),
    ]);
    claude.reply({
      text: ["Let me check."],
      tools: [{ id: "toolu_1", name: "search_sections", input: { term: OPEN, subject: "csc", courseNumber: "4350" } }],
      usage: { input: 1000, output: 50, cacheRead: 0, cacheWrite: 4000 },
    });
    claude.reply({ text: ["CRN 81234 has 4 open seats."], usage: { input: 300, output: 30, cacheRead: 5000 } });

    const { events } = await chat("Is CSC 4350 open in spring?");
    expect(events.map((e) => `${e.event}${e.data.status ? `:${e.data.status}` : ""}`)).toEqual([
      "text",
      "tool:running",
      "tool:done",
      "text",
      "done",
    ]);
    const tool = events[1].data;
    expect(tool).toEqual({ id: "toolu_1", name: "search_sections", status: "running", label: "Searching CSC 4350 in Spring 2027" });
    expect(events[2].data).toMatchObject({ id: "toolu_1", status: "done" });
    // A new round's text starts a new paragraph.
    expect(textOf(events)).toBe("Let me check.\n\nCRN 81234 has 4 open seats.");
    // No level from the model and none saved: the tool searches bachelor's level (US), not every level,
    // then counts the same course at the associate level once.
    const searches = gs.requests.filter((r) => r.path === "/searchResults/searchResults");
    expect(searches.map((r) => `${r.query.txt_level}:${r.query.pageMaxSize}`).sort()).toEqual(["UA:1", "US:500"]);

    expect(claude.requests).toHaveLength(2);
    const second = claude.requests[1].body.messages;
    expect(second).toHaveLength(3);
    expect(second[1].role).toBe("assistant");
    expect(second[1].content.find((b: { type: string }) => b.type === "tool_use")).toMatchObject({ id: "toolu_1", name: "search_sections" });
    expect(second[2].role).toBe("user");
    expect(second[2].content).toHaveLength(1);
    const result = second[2].content[0];
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "toolu_1" });
    expect(result.is_error).toBeUndefined();
    const data = JSON.parse(result.content);
    expect(data).toMatchObject({
      level: "US",
      levelName: "Bachelor's level",
      levelSource: "default",
      alsoAtAssociateLevel: 1,
      total: 1,
      sections: [{ crn: "81234", seatsAvailable: 4, open: true }],
    });
    expect(data.resultsUrl).toBe(`${TEST_ORIGIN}/course-results?term=${OPEN}&subjects=CSC&courseNumber=4350&level=US`);

    // Usage: both model requests, summed and priced (Haiku 5.5: $0.10 in, $0.50 out, $0.01 read, $0.125 write per MTok).
    const row = await usageRow();
    expect(row).toMatchObject({ messages: 1, inputTokens: 1300, outputTokens: 80, cacheReadTokens: 5000, cacheWriteTokens: 4000 });
    const cost = Math.ceil(0.1 * 1000 + 0.5 * 50 + 0.125 * 4000) + Math.ceil(0.1 * 300 + 0.5 * 30 + 0.01 * 5000);
    expect(row.costMicroUsd).toBe(cost);
    const [daily] = await testDb.db.select().from(assistantDaily);
    expect(daily).toMatchObject({ day: easternDay(), messages: 1, inputTokens: 1300, outputTokens: 80, costMicroUsd: cost });
    expect(events.at(-1)!.data.usage).toEqual({ input: 1300, output: 80, cacheRead: 5000, cacheWrite: 4000 });
  });

  it("search_sections searches the level asked for (UA: Perimeter College) and says so", async () => {
    gs.setSections(OPEN, "POLS", "2401", [makeSection({ term: OPEN, subject: "POLS", courseNumber: "2401", courseReferenceNumber: "82001" })]);
    claude.reply({ tools: [{ id: "toolu_ua", name: "search_sections", input: { term: OPEN, subject: "POLS", courseNumber: "2401", level: "UA" } }] });
    claude.reply({ text: ["One associate-level section."] });
    await chat("Any Perimeter sections of POLS 2401?");
    const searches = gs.requests.filter((r) => r.path === "/searchResults/searchResults");
    expect(searches.length).toBeGreaterThan(0);
    expect(searches.every((r) => r.query.txt_level === "UA")).toBe(true);
    const result = claude.requests[1].body.messages[2].content[0];
    expect(result.is_error).toBeUndefined();
    const data = JSON.parse(result.content);
    expect(data).toMatchObject({ level: "UA", levelName: "Associate level (Perimeter College)", total: 1 });
    expect(data.resultsUrl).toBe(`${TEST_ORIGIN}/course-results?term=${OPEN}&subjects=POLS&courseNumber=2401&level=UA`);
  });

  it("search_sections' strict schema: level is an optional US/UA/GS enum; the fallback is resolved server side", async () => {
    claude.reply({ text: ["ok"] });
    await chat("hi");
    const tool = claude.requests[0].body.tools.find((t: { name: string }) => t.name === "search_sections");
    const { input_schema: schema } = tool;
    expect(schema.properties.level).toMatchObject({ type: "string", enum: ["US", "UA", "GS"] });
    expect(schema.properties.level.description).toMatch(/^US = bachelor's level .*Omit it to use the student's saved campus/);
    expect(schema.properties.level.description).not.toContain("Default:");
    // Strict tool use allows optional properties: `level` stays out of required.
    expect(schema.required).toEqual(["term", "subject"]);
    expect(SYSTEM_PROMPT).toContain("search_sections searches one level");
  });

  it("list_terms marks the term students are registering for as default, not the semester under way", async () => {
    // Nov 1 2026, like the live run: Fall 2026 is under way and (here) still not view-only; Spring 2027 is registering.
    vi.useFakeTimers({ toFake: ["Date"], now: new Date("2026-11-01T16:00:00Z") });
    try {
      await testDb.db.update(terms).set({ viewOnly: false }).where(eq(terms.code, "202608"));
      claude.reply({ tools: [{ id: "toolu_t", name: "list_terms", input: {} }] });
      claude.reply({ text: ["Spring 2027."] });
      await chat("Which CSC 4350 sections are open?");
      const result = claude.requests[1].body.messages[2].content[0];
      expect(result).toMatchObject({ type: "tool_result", tool_use_id: "toolu_t" });
      expect(JSON.parse(result.content)).toEqual({
        terms: [
          { code: OPEN, name: "Spring Semester 2027", registrationOpen: true, status: "upcoming", default: true },
          { code: "202608", name: "Fall Semester 2026", registrationOpen: true, status: "in_progress" },
        ],
      });
      expect(SYSTEM_PROMPT).toContain("use the term marked default");
    } finally {
      vi.useRealTimers();
    }
  });

  it("runs get_course_requirements against GoSolar and feeds the compact requirements back", async () => {
    const fixture = (name: string) => readFileSync(new URL(`../fixtures/gosolar/${name}`, import.meta.url), "utf8");
    gs.setSubjects(OPEN, [
      { code: "CSC", description: "COMPUTER SCIENCE" },
      { code: "MATH", description: "MATHEMATICS" },
    ]);
    gs.setRequirements(OPEN, "19010", {
      prerequisites: fixture("prerequisites-csc1301.html"),
      corequisites: fixture("corequisites-csc1301.html"),
      restrictions: fixture("restrictions-csc4870-honors.html"),
      description: fixture("description-csc1301.html"),
    });
    claude.reply({ tools: [{ id: "toolu_r", name: "get_course_requirements", input: { term: OPEN, crn: "19010" } }] });
    claude.reply({ text: ["You need MATH 1111 or 1113 (C or better), which you can take at the same time."] });

    const { events } = await chat("Can I take CRN 19010 in spring?");
    expect(events.map((e) => `${e.event}${e.data.status ? `:${e.data.status}` : ""}`)).toEqual([
      "tool:running",
      "tool:done",
      "text",
      "done",
    ]);
    expect(events[0].data).toEqual({ id: "toolu_r", name: "get_course_requirements", status: "running", label: "Checking requirements for CRN 19010" });
    expect(gs.requests.filter((r) => r.path.startsWith("/searchResults/get"))).toHaveLength(4);

    const second = claude.requests[1].body.messages;
    expect(second[1].content.find((b: { type: string }) => b.type === "tool_use")).toMatchObject({ id: "toolu_r", name: "get_course_requirements" });
    const result = second[2].content[0];
    expect(result).toMatchObject({ type: "tool_result", tool_use_id: "toolu_r" });
    expect(result.is_error).toBeUndefined();
    const data = JSON.parse(result.content);
    expect(data.prerequisites.items[0]).toEqual({ subject: "MATH", courseNumber: "1111", courseNumberTo: "1113", minimumGrade: "C", concurrent: true });
    expect(data.prerequisites).not.toHaveProperty("tree");
    expect(data.corequisites).toEqual([{ subject: "CSC", courseNumber: "1301L", title: "Principles Computer Sci Lab I" }]);
    expect(data.restrictions.specialApprovals).toEqual(["Honors College Restricts"]);
    expect(data).not.toHaveProperty("sectionUrl"); // no subject given and not saved by the user
  });

  it("runs parallel tool calls concurrently and returns every result in one user message", async () => {
    await testDb.db.insert(watchedSections).values({ userId: alice.id, term: OPEN, crn: "80001", subject: "CSC", courseNumber: "1301" });
    claude.reply({
      tools: [
        { id: "toolu_a", name: "list_watches", input: {} },
        { id: "toolu_b", name: "list_schedule", input: { term: OPEN } },
      ],
    });
    claude.reply({ text: ["You track CSC 1301 and have nothing scheduled."] });
    const { events } = await chat("what am I tracking and what's on my schedule?");
    const toolEvents = events.filter((e) => e.event === "tool");
    expect(toolEvents.slice(0, 2).map((e) => [e.data.id, e.data.status])).toEqual([
      ["toolu_a", "running"],
      ["toolu_b", "running"],
    ]);
    expect(toolEvents.slice(2).map((e) => e.data.status)).toEqual(["done", "done"]);
    expect(toolEvents[0].data.label).toBe("Checking your tracked classes");

    const second = claude.requests[1].body.messages;
    expect(second).toHaveLength(3);
    const results = second[2].content;
    expect(results.map((r: { tool_use_id: string }) => r.tool_use_id)).toEqual(["toolu_a", "toolu_b"]);
    expect(JSON.parse(results[0].content)).toMatchObject({
      watches: [{ crn: "80001" }],
      trackedClassesUrl: `${TEST_ORIGIN}/tracked-classes`,
    });
    expect(JSON.parse(results[1].content)).toEqual({ terms: [] });
  });

  it("writes as the user: add_watch creates the watch", async () => {
    gs.setSections(OPEN, "CSC", "1301", [makeSection({ term: OPEN, courseReferenceNumber: "80005", seatsAvailable: 0, waitCount: 0 })]);
    claude.reply({ tools: [{ id: "toolu_w", name: "add_watch", input: { term: OPEN, crn: "80005", subject: "CSC", courseNumber: "1301" } }] });
    claude.reply({ text: ["Tracking CRN 80005."] });
    const { events } = await chat("track CRN 80005 for CSC 1301");
    expect(events.find((e) => e.event === "tool")!.data.label).toBe("Tracking CSC 1301 (CRN 80005)");
    const rows = await testDb.db.select().from(watchedSections).where(eq(watchedSections.userId, alice.id));
    expect(rows.map((r) => r.crn)).toEqual(["80005"]);
  });

  it("invalid tool input is a tool error the model sees, not a crash", async () => {
    claude.reply({ tools: [{ id: "toolu_bad", name: "add_watch", input: { term: "2027", crn: "1" } }] });
    claude.reply({ text: ["Sorry, let me fix that."] });
    const { events } = await chat("track something");
    expect(events.filter((e) => e.event === "tool").map((e) => e.data.status)).toEqual(["running", "error"]);
    const result = claude.requests[1].body.messages[2].content[0];
    expect(result).toMatchObject({ tool_use_id: "toolu_bad", is_error: true });
    expect(result.content).toContain("Invalid arguments for add_watch");
    expect(await testDb.db.select().from(watchedSections)).toHaveLength(0);
    expect(events.at(-1)!.event).toBe("done");
  });

  it(`stops after ${MAX_TOOL_ROUNDS} tool rounds: the next request forbids tools and the turn ends with an answer`, async () => {
    claude.replyAlways({ tools: [{ name: "list_terms", input: {} }], usage: { input: 10, output: 5 } });
    // The final, tool-less request still gets the always-reply; the route must not run its tools.
    const { events } = await chat("loop forever");
    expect(claude.requests).toHaveLength(MAX_TOOL_ROUNDS + 1);
    for (const r of claude.requests.slice(0, MAX_TOOL_ROUNDS)) expect(r.body).not.toHaveProperty("tool_choice");
    expect(claude.requests.at(-1)!.body.tool_choice).toEqual({ type: "none" });
    expect(events.filter((e) => e.event === "tool")).toHaveLength(MAX_TOOL_ROUNDS * 2);
    expect(events.at(-1)!.event).toBe("done");
    expect((await usageRow()).inputTokens).toBe(10 * (MAX_TOOL_ROUNDS + 1));
  });
});

describe("budget", () => {
  it("refuses with 429 budget once the user's daily messages are used, before any model call", async () => {
    setAssistantConfigForTests({ apiKey: DUMMY_KEY, fetch: claude.fetch, userDailyMessages: 2 });
    claude.replyAlways({ text: ["ok"] });
    expect((await chat("one")).events.at(-1)!.data.remaining).toEqual({ today: 1 });
    expect((await chat("two")).events.at(-1)!.data.remaining).toEqual({ today: 0 });
    const third = await chat("three");
    expect(third.status).toBe(429);
    expect(third.json.code).toBe("budget");
    expect(third.json.message).toContain("midnight Eastern");
    expect(claude.requests).toHaveLength(2);
    expect((await usageRow()).messages).toBe(2);

    // Another student still has their own allowance.
    const bob = await seedUser(testDb.db, { name: "Bob" });
    expect((await chat("hi", bob)).status).toBe(200);
  });

  it("stops everyone once today's spend reaches the global USD cap", async () => {
    // $0.001 cap = 1000 micro-dollars; one Haiku turn of 10,000 input tokens costs exactly that.
    setAssistantConfigForTests({ apiKey: DUMMY_KEY, fetch: claude.fetch, globalDailyUsd: 0.001 });
    claude.reply({ text: ["expensive"], usage: { input: 10_000, output: 0 } });
    expect((await chat("first")).status).toBe(200);
    const [daily] = await testDb.db.select().from(assistantDaily);
    expect(daily.costMicroUsd).toBe(1000);

    const bob = await seedUser(testDb.db, { name: "Bob" });
    const blocked = await chat("second", bob);
    expect(blocked.status).toBe(429);
    expect(blocked.json).toMatchObject({ code: "budget" });
    expect(blocked.json.message).toContain("everyone");
    expect(claude.requests).toHaveLength(1);
    // The refused reservation left no trace.
    expect(await usageRow(bob.id)).toBeUndefined();
    expect((await testDb.db.select().from(assistantDaily))[0].messages).toBe(1);
  });

  it("caps messages site-wide", async () => {
    setAssistantConfigForTests({ apiKey: DUMMY_KEY, fetch: claude.fetch, globalDailyMessages: 1 });
    claude.replyAlways({ text: ["ok"] });
    expect((await chat("a")).status).toBe(200);
    const bob = await seedUser(testDb.db, { name: "Bob" });
    expect((await chat("b", bob)).json).toMatchObject({ code: "budget" });
    expect(claude.requests).toHaveLength(1);
  });
});

describe("failures", () => {
  it("a refusal ends the stream with error refusal and no done", async () => {
    claude.reply({ stopReason: "refusal", usage: { input: 500, output: 0 } });
    const { events } = await chat("something off-limits");
    expect(events).toEqual([{ event: "error", data: { code: "refusal", message: expect.stringContaining("can't help") } }]);
    expect((await usageRow()).inputTokens).toBe(500);
  });

  it("an API 429 is error rate, and the unused message is given back", async () => {
    claude.reply({ status: 429, errorType: "rate_limit_error", message: "secret internals" });
    const { events } = await chat("hi");
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ event: "error", data: { code: "rate" } });
    expect(JSON.stringify(events)).not.toContain("secret internals");
    expect((await usageRow()).messages).toBe(0);
    expect((await testDb.db.select().from(assistantDaily))[0].messages).toBe(0);
  });

  it("an API 529/500 is error upstream; a 400 is error internal", async () => {
    claude.reply({ status: 529, errorType: "overloaded_error" });
    expect((await chat("hi")).events[0]).toMatchObject({ event: "error", data: { code: "upstream" } });
    claude.reply({ status: 400, errorType: "invalid_request_error", message: "messages.0: bad" });
    const internal = await chat("hi again");
    expect(internal.events[0]).toMatchObject({ event: "error", data: { code: "internal" } });
    expect(JSON.stringify(internal.events)).not.toContain("messages.0");
  });

  it("max_tokens appends a note and still finishes with done", async () => {
    claude.reply({ text: ["A very long answer"], stopReason: "max_tokens", usage: { input: 10, output: 2048 } });
    const { events } = await chat("tell me everything");
    expect(textOf(events)).toMatch(/^A very long answer\n\n\(I ran out of room/);
    expect(events.at(-1)!.event).toBe("done");
  });

  it("a client disconnect aborts the upstream stream, records partial usage and frees the user", async () => {
    claude.reply({ hang: true, text: ["Thinking about "], usage: { input: 700 } });
    const request = await apiRequest("/api/assistant/chat", { method: "POST", as: alice, body: { messages: [{ role: "user", content: "hi" }] } });
    const response = await call(POST, request);
    const reader = response.body!.getReader();
    const first = new TextDecoder().decode((await reader.read()).value);
    expect(first).toContain("event: text");

    // While the turn runs, a second one from the same student is refused.
    const busy = await chat("again");
    expect(busy.status).toBe(429);
    expect(busy.json.code).toBe("rate");

    await reader.cancel();
    await vi.waitFor(() => expect(claude.aborted).toBe(true));
    await flushAfter();
    await vi.waitFor(async () => expect((await usageRow())?.inputTokens).toBe(700));
    expect(claude.requests).toHaveLength(1);

    claude.reply({ text: ["back"] });
    await vi.waitFor(async () => expect((await chat("hello again")).status).toBe(200));
  });

  it("limits turns per minute per user (in memory)", async () => {
    claude.replyAlways({ text: ["ok"] });
    const statuses: number[] = [];
    for (let i = 0; i < 11; i++) statuses.push((await chat(`m${i}`)).status);
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses[10]).toBe(429);
    expect(claude.requests).toHaveLength(10);
  });
});
