import { fetch as undiciFetch } from "undici";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/session")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  ...(await import("../helpers/session")).nextServerMock,
}));

import { POST } from "@/app/api/assistant/chat/route";
import { setDbForTests } from "@/db";
import { terms, watchedSections, type User } from "@/db/schema";
import { resetAssistantLimitsForTests } from "@/lib/assistant/budget";
import { setAssistantConfigForTests } from "@/lib/assistant/config";
import { parseCourseRefs, setPrefetchTimeoutForTests } from "@/lib/assistant/prefetch";
import { SYSTEM_PROMPT } from "@/lib/assistant/prompt";
import { resetTermsMemoForTests, setGoSolarOptionsForTests } from "@/lib/courses";
import type { FetchLike } from "@/lib/gosolar";
import { resetRateLimits } from "@/lib/oauth/rate-limit";
import { createTestDb, seedUser, truncateAll, type TestDatabase } from "../helpers/db";
import { fakeAnthropic, parseSse, type FakeAnthropic } from "../helpers/fake-anthropic";
import { makeSection, startFakeGoSolar, type FakeGoSolar } from "../helpers/fake-gosolar";
import { apiRequest, call, flushAfter } from "../helpers/session";

/**
 * The assistant's course prefetch (src/lib/assistant/prefetch.ts) through the real chat route:
 * PGlite, the fake GoSolar and the transport-level fake Claude API. When the student's message
 * names a course, PantherWatch runs search_sections itself before the first model request and
 * hands the result over in a mid-conversation system message.
 */

const OPEN = "202701";
const DUMMY_KEY = "sk-ant-test-dummy-key";

let testDb: TestDatabase;
let gs: FakeGoSolar;
let claude: FakeAnthropic;
let alice: User;
/** GoSolar requests seen when the first model request went out, per turn. */
let gosolarAtFirstModelRequest: number | null;
let info: MockInstance<typeof console.info>;

beforeAll(async () => {
  testDb = await createTestDb();
  setDbForTests(testDb.db);
  gs = await startFakeGoSolar();
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
  resetTermsMemoForTests();
  setPrefetchTimeoutForTests(undefined);
  setGoSolarOptionsForTests({ baseUrl: gs.url });
  gosolarAtFirstModelRequest = null;
  const recording = (async (...args: Parameters<typeof fetch>) => {
    gosolarAtFirstModelRequest ??= gs.requests.length;
    return claude.fetch(...args);
  }) as typeof fetch;
  setAssistantConfigForTests({ apiKey: DUMMY_KEY, fetch: recording, prefetch: true });
  await testDb.db.insert(terms).values([
    { code: OPEN, description: "Spring Semester 2027", viewOnly: false },
    { code: "202608", description: "Fall Semester 2026 (View Only)", viewOnly: true },
  ]);
  alice = await seedUser(testDb.db, { name: "Alice Panther" });
  gs.setSections(OPEN, "CSC", "4350", [
    makeSection({ term: OPEN, subject: "CSC", courseNumber: "4350", courseReferenceNumber: "81234", courseTitle: "SOFTWARE ENGINEERING", seatsAvailable: 4 }),
    makeSection({ term: OPEN, subject: "CSC", courseNumber: "4350", courseReferenceNumber: "81235", courseTitle: "SOFTWARE ENGINEERING", seatsAvailable: 0 }),
  ]);
  info = vi.spyOn(console, "info").mockImplementation(() => {});
});
afterEach(async () => {
  await flushAfter();
  info.mockRestore();
});

async function chat(content: string) {
  const request = await apiRequest("/api/assistant/chat", { method: "POST", as: alice, body: { messages: [{ role: "user", content }] } });
  const response = await call(POST, request);
  expect(response.status).toBe(200);
  return parseSse(await response.text());
}

const toolEvents = (events: ReturnType<typeof parseSse>) => events.filter((e) => e.event === "tool").map((e) => e.data);
const searchRequests = () => gs.requests.filter((r) => r.path === "/searchResults/searchResults");

/** The parsed `assistant.turn` log lines. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON log lines, checked field by field
function turnLogs(): Array<Record<string, any>> {
  return info.mock.calls
    .map(([line]) => (typeof line === "string" && line.startsWith("{") ? JSON.parse(line) : null))
    .filter((entry) => entry?.msg === "assistant.turn");
}

describe("parseCourseRefs", () => {
  it.each([
    ["Which CSC 4350 sections are open?", [["CSC", "4350"]]],
    ["is csc4350 full", [["CSC", "4350"]]],
    ["MATH-1113 or Math 1113?", [["MATH", "1113"]]],
    ["the lab, CSC 1301L", [["CSC", "1301L"]]],
    ["CSC 4350 and csc4350 again, then ENGL 1101", [["CSC", "4350"], ["ENGL", "1101"]]],
    ["CSC 1301, CSC 1302, MATH 1113 and ENGL 1101", [["CSC", "1301"], ["CSC", "1302"], ["MATH", "1113"]]],
    ["anything in fall 2026 or spring 2027? room 1301, in 2027", []],
    ["CSC 1301Lab", []],
    ["what about the second one?", []],
  ])("%s", (text, courses) => {
    expect(parseCourseRefs(text).courses.map((c) => [c.subject, c.courseNumber])).toEqual(courses);
  });

  it("finds CRNs (5 digits), deduplicated, never inside a longer number or a course number", () => {
    expect(parseCourseRefs("Is CRN 19010 open? And 19010, 80005 or 123456?").crns).toEqual(["19010", "80005"]);
    expect(parseCourseRefs("CSC 4350").crns).toEqual([]);
    expect(parseCourseRefs("CSC 4350 CRN 81234")).toEqual({ courses: [{ subject: "CSC", courseNumber: "4350" }], crns: ["81234"] });
  });
});

describe("a turn that names a course", () => {
  it("searches GoSolar before the first model request, hands the result over in a system message, and answers in one request", async () => {
    claude.reply({ text: ["CRN 81234 has 4 open seats; 81235 is full."], usage: { input: 900, output: 20, cacheRead: 5000 } });
    const events = await chat("Which CSC 4350 sections are open?");

    // The search (bachelor's + the Perimeter count) ran before the model was called.
    expect(searchRequests().map((r) => `${r.query.txt_level}:${r.query.pageMaxSize}`).sort()).toEqual(["UA:1", "US:500"]);
    expect(gosolarAtFirstModelRequest).toBe(gs.requests.length);
    expect(gosolarAtFirstModelRequest).toBeGreaterThan(0);

    // One model request, no tool calls by the model.
    expect(claude.requests).toHaveLength(1);
    const { body } = claude.requests[0];
    expect(body.system).toEqual([{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]);
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(["user", "system"]);
    const note: string = body.messages[1].content;
    expect(note).toContain("PantherWatch already ran these searches");
    expect(note).toContain(`Term: ${OPEN} (Spring 2027)`);
    expect(note).toContain(`search_sections {"term":"${OPEN}","subject":"CSC","courseNumber":"4350"}`);
    expect(note).toContain("Use them instead of calling search_sections or list_terms again");
    const json = JSON.parse(note.slice(note.indexOf("\n{") + 1, note.lastIndexOf("}") + 1));
    expect(json).toMatchObject({
      level: "US",
      levelSource: "default",
      alsoAtAssociateLevel: 2,
      total: 2,
      sections: [{ crn: "81234", seatsAvailable: 4, open: true }, { crn: "81235" }],
    });

    // The UI sees the search as a tool pair, then the answer.
    expect(events.map((e) => `${e.event}${e.data.status ? `:${e.data.status}` : ""}`)).toEqual(["tool:running", "tool:done", "text", "done"]);
    const [running, finished] = toolEvents(events);
    expect(running).toEqual({ id: expect.stringMatching(/^prefetch_\d+$/), name: "search_sections", status: "running", label: "Searching CSC 4350 in Spring 2027" });
    expect(finished).toEqual({ ...running, status: "done" });

    // Timing in `done` and one log line without user content.
    const done = events.at(-1)!.data;
    expect(done.timing).toEqual({
      total: expect.any(Number),
      firstText: expect.any(Number),
      modelRequests: [expect.any(Number)],
      tools: [{ name: "prefetch:search_sections", ms: expect.any(Number) }],
    });
    const [log] = turnLogs();
    expect(log).toMatchObject({
      outcome: "done",
      model: "claude-haiku-5-5",
      cold: expect.any(Boolean),
      modelRequests: [{ ms: expect.any(Number), input: 900, output: 20, cacheRead: 5000, stop: "end_turn" }],
      tools: [{ name: "search_sections", prefetch: true, error: false, gosolar: { requests: 4, sessions: 2, ms: expect.any(Number) } }],
      prefetch: { status: "used", courses: 1, crns: 0, searches: 1, included: 1 },
      gosolar: { requests: 4, sessions: 2 },
    });
    expect(JSON.stringify(log)).not.toMatch(/CSC|4350|open\?/);
  });

  it("a CRN on the student's tracked list is resolved to its course and that course is searched", async () => {
    await testDb.db.insert(watchedSections).values({ userId: alice.id, term: OPEN, crn: "81235", subject: "CSC", courseNumber: "4350" });
    claude.reply({ text: ["Still full."] });
    await chat("did CRN 81235 open up yet?");
    expect(claude.requests).toHaveLength(1);
    const note: string = claude.requests[0].body.messages[1].content;
    expect(note).toContain("CRN 81235 on the student's schedule or tracked classes is a section of CSC 4350.");
    expect(turnLogs()[0].prefetch).toMatchObject({ status: "used", courses: 0, crns: 1, searches: 1 });
  });

  it("no course and no known CRN: no prefetch, no GoSolar request, no system message", async () => {
    claude.reply({ text: ["Which course do you mean?"] });
    const events = await chat("are any of those still open? 19010 maybe");
    expect(gs.requests).toHaveLength(0);
    expect(toolEvents(events)).toEqual([]);
    expect(claude.requests[0].body.messages.map((m: { role: string }) => m.role)).toEqual(["user"]);
    expect(events.at(-1)!.data.timing.tools).toEqual([]);
    expect(turnLogs()[0].prefetch).toMatchObject({ status: "none", crns: 1, searches: 0 });
  });

  it("ASSISTANT_PREFETCH=off: the model calls the tool itself", async () => {
    setAssistantConfigForTests({ apiKey: DUMMY_KEY, fetch: claude.fetch, prefetch: false });
    claude.reply({ text: ["ok"] });
    await chat("Which CSC 4350 sections are open?");
    expect(gs.requests).toHaveLength(0);
    expect(turnLogs()[0].prefetch.status).toBe("off");
  });

  it("a failed prefetch search is left out (tool event error) and the model can still call the tool", async () => {
    gs.failNextSearches({ kind: "http", status: 500 }, 1, "US");
    claude.reply({ tools: [{ id: "toolu_1", name: "search_sections", input: { term: OPEN, subject: "CSC", courseNumber: "4350" } }] });
    claude.reply({ text: ["CRN 81234 is open."] });
    const events = await chat("Which CSC 4350 sections are open?");

    expect(claude.requests[0].body.messages.map((m: { role: string }) => m.role)).toEqual(["user"]);
    expect(toolEvents(events).map((t) => `${t.id.startsWith("prefetch_") ? "prefetch" : t.id}:${t.status}`)).toEqual([
      "prefetch:running",
      "prefetch:error",
      "toolu_1:running",
      "toolu_1:done",
    ]);
    expect(claude.requests).toHaveLength(2);
    expect(JSON.parse(claude.requests[1].body.messages[2].content[0].content)).toMatchObject({ total: 2 });
    expect(events.at(-1)!.event).toBe("done");
    expect(turnLogs()[0].prefetch).toMatchObject({ status: "failed", searches: 1, included: 0 });
  });

  it("a prefetch past the time cap is dropped: the first request goes out without it and the model calls the tool", async () => {
    setPrefetchTimeoutForTests(150);
    // GoSolar answers searches only after 600 ms.
    const slow: FetchLike = async (url, init) => {
      if (url.includes("/searchResults/searchResults")) await new Promise((resolve) => setTimeout(resolve, 600));
      return undiciFetch(url, init) as unknown as ReturnType<FetchLike>;
    };
    setGoSolarOptionsForTests({ baseUrl: gs.url, fetchImpl: slow });
    claude.reply({ tools: [{ id: "toolu_1", name: "search_sections", input: { term: OPEN, subject: "CSC", courseNumber: "4350" } }] });
    claude.reply({ text: ["CRN 81234 is open."] });

    const started = Date.now();
    const events = await chat("Which CSC 4350 sections are open?");
    expect(claude.requests[0].body.messages.map((m: { role: string }) => m.role)).toEqual(["user"]);
    expect(toolEvents(events).slice(0, 2).map((t) => t.status)).toEqual(["running", "error"]);
    expect(events.at(-1)!.event).toBe("done");
    expect(claude.requests).toHaveLength(2);
    const log = turnLogs()[0];
    expect(log.prefetch).toMatchObject({ status: "timeout", included: 0 });
    expect(log.prefetch.ms).toBeLessThan(600);
    expect(Date.now() - started).toBeGreaterThanOrEqual(600); // the model's own search waited for GoSolar
  });
});

describe("terms", () => {
  it("are served from memory: the second turn reads neither GoSolar's term list nor the terms table", async () => {
    claude.replyAlways({ text: ["ok"] });
    await chat("Which CSC 4350 sections are open?");
    // Without the in-process copy, the next turn would find no rows and ask GoSolar (which has none).
    await testDb.db.delete(terms);
    gs.requests.length = 0;
    const events = await chat("and CSC 4350 again?");
    expect(gs.requests.filter((r) => r.path === "/classSearch/getTerms")).toHaveLength(0);
    expect(toolEvents(events)[0].label).toBe("Searching CSC 4350 in Spring 2027");
    expect(claude.requests[1].body.messages[1].content).toContain(`Term: ${OPEN} (Spring 2027)`);
  });
});
