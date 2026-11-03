import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/session")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  ...(await import("../helpers/session")).nextServerMock,
}));

import { POST } from "@/app/api/assistant/chat/route";
import { setDbForTests } from "@/db";
import { terms, users, type User } from "@/db/schema";
import { resetAssistantLimitsForTests } from "@/lib/assistant/budget";
import { setAssistantConfigForTests } from "@/lib/assistant/config";
import { stripCues } from "@/lib/assistant/prefetch";
import { SYSTEM_PROMPT } from "@/lib/assistant/prompt";
import { resetCatalogCacheForTests } from "@/lib/course-meta/catalog-lookup";
import { resetTermsMemoForTests, setGoSolarOptionsForTests } from "@/lib/courses";
import { SERVER_INSTRUCTIONS } from "@/lib/mcp/tools";
import { resetRateLimits } from "@/lib/oauth/rate-limit";
import { seedCatalog } from "../helpers/catalog-fixture";
import { createTestDb, seedUser, truncateAll, type TestDatabase } from "../helpers/db";
import { fakeAnthropic, parseSse, type FakeAnthropic } from "../helpers/fake-anthropic";
import { makeSection, startFakeGoSolar, type FakeGoSolar } from "../helpers/fake-gosolar";
import { apiRequest, call, flushAfter } from "../helpers/session";

/**
 * The course catalog in the on-site assistant, through the real chat route (PGlite, the fake
 * GoSolar, the fake Claude API): a message that names a course without a code is looked up in
 * the catalog before the first model request. A clear match ("calculus 2") is searched like a
 * code and the note names the mapping; an ambiguous one ("physics 1") hands the model the top
 * candidates and searches nothing. The model can also call find_courses itself.
 */

const OPEN = "202701";
const DUMMY_KEY = "sk-ant-test-dummy-key";

let testDb: TestDatabase;
let gs: FakeGoSolar;
let claude: FakeAnthropic;
let alice: User;
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
  resetCatalogCacheForTests();
  setGoSolarOptionsForTests({ baseUrl: gs.url });
  setAssistantConfigForTests({ apiKey: DUMMY_KEY, fetch: claude.fetch, prefetch: true });
  await testDb.db.insert(terms).values([
    { code: OPEN, description: "Spring Semester 2027", viewOnly: false },
    { code: "202608", description: "Fall Semester 2026 (View Only)", viewOnly: true },
  ]);
  await seedCatalog(testDb.db);
  alice = await seedUser(testDb.db, { name: "Alice Panther" });
  gs.setSections(OPEN, "MATH", "2212", [
    makeSection({ term: OPEN, subject: "MATH", courseNumber: "2212", courseReferenceNumber: "82212", courseTitle: "CALCULUS OF ONE VARIABLE II" }),
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

/** The note: the last text block of the student's message in the first model request. */
const noteOf = (index = 0): string => claude.requests[index].body.messages.at(-1).content.at(-1).text;
const toolEvents = (events: ReturnType<typeof parseSse>) => events.filter((e) => e.event === "tool").map((e) => e.data);
const searchRequests = () => gs.requests.filter((r) => r.path === "/searchResults/searchResults");

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- JSON log lines, checked field by field
function turnLogs(): Array<Record<string, any>> {
  return info.mock.calls
    .map(([line]) => (typeof line === "string" && line.startsWith("{") ? JSON.parse(line) : null))
    .filter((entry) => entry?.msg === "assistant.turn");
}

describe("stripCues", () => {
  it("drops the term and level words before the catalog lookup", () => {
    expect(stripCues("Is calculus 2 open next semester at Perimeter?")).toBe("Is calculus 2 open at ?");
    expect(stripCues("data structures in spring 2027 for my master's")).toBe("data structures in for my");
  });
});

describe("a message that names a course without a code", () => {
  it('"calculus 2": the catalog match is searched before the first model request and the note says so', async () => {
    claude.reply({ text: ["MATH 2212, Calculus of One Variable II: one section, CRN 82212."] });
    const events = await chat("Can you compare the professors for calculus 2?");

    // The lookup and the search ran before the model was called, which answered in one request.
    expect(claude.requests).toHaveLength(1);
    expect(searchRequests().map((r) => `${r.query.txt_subject} ${r.query.txt_courseNumber} ${r.query.txt_level}`).sort()).toEqual([
      "MATH 2212 UA",
      "MATH 2212 US",
    ]);
    const note = noteOf();
    expect(note).toMatch(/^\[PantherWatch searches already run for this message, not written by the student\]/);
    expect(note).toContain("Catalog match: 'calculus 2' → MATH 2212 Calculus of One Variable II");
    expect(note).toContain(`search_sections {"term":"${OPEN}","subject":"MATH","courseNumber":"2212"}`);
    expect(note).toContain('"crn": "82212"');
    expect(claude.requests[0].body.system).toEqual([{ type: "text", text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" } }]);

    // The UI sees the lookup, then the search.
    expect(toolEvents(events)).toEqual([
      { id: "prefetch_catalog", name: "find_courses", status: "running", label: "Looking up 'calculus 2' in the catalog" },
      { id: "prefetch_catalog", name: "find_courses", status: "done", label: "Looking up 'calculus 2' in the catalog" },
      { id: "prefetch_1", name: "search_sections", status: "running", label: "Searching MATH 2212 in Spring 2027" },
      { id: "prefetch_1", name: "search_sections", status: "done", label: "Searching MATH 2212 in Spring 2027" },
    ]);
    expect(events.at(-1)!.data.timing.tools.map((t: { name: string }) => t.name)).toEqual(["prefetch:find_courses", "prefetch:search_sections"]);
    const [log] = turnLogs();
    expect(log.prefetch).toMatchObject({ status: "used", courses: 0, crns: 0, searches: 1, included: 1, catalog: "high" });
    expect(log.tools[0]).toMatchObject({ name: "find_courses", prefetch: true, error: false, gosolar: { requests: 0, sessions: 0 } });
    expect(JSON.stringify(log)).not.toMatch(/calculus|MATH|2212/);
  });

  it("the level cue and the saved campus choose the catalog level as they do the search's", async () => {
    gs.setSections(OPEN, "CSC", "6350", [makeSection({ term: OPEN, subject: "CSC", courseNumber: "6350", courseReferenceNumber: "86350" })]);
    claude.replyAlways({ text: ["ok"] });
    await chat("Who teaches software engineering for my master's?");
    expect(noteOf(0)).toContain("Catalog match: 'software engineering' → CSC 6350 Software Engineering");
    expect(searchRequests().map((r) => r.query.txt_level)).toEqual(["GS"]);

    gs.requests.length = 0;
    await testDb.db.update(users).set({ levelPreference: "GS" }).where(eq(users.id, alice.id));
    await chat("Who teaches software engineering?");
    expect(noteOf(1)).toContain("→ CSC 6350 Software Engineering");
  });

  it('"physics 1" is ambiguous: no sections searched, the top candidates go to the model to ask about', async () => {
    claude.reply({ text: ["Do you mean PHYS 1111 (algebra-based) or PHYS 2211 (calculus-based)?"] });
    const events = await chat("is physics 1 open?");

    expect(gs.requests).toHaveLength(0);
    expect(claude.requests).toHaveLength(1);
    const note = noteOf();
    expect(note).toMatch(/^\[PantherWatch catalog lookup for this message, not written by the student\]/);
    expect(note).toContain("PantherWatch looked up 'physics 1' in the GoSolar course catalog");
    expect(note).toContain("no sections were searched");
    expect(note).toContain("- PHYS 1111 Introductory Physics I (3 credits, US): Prerequisite: Math 1113.");
    expect(note).toContain("- PHYS 2211 Principles of Physics I (3 credits, US): Prerequisite: Math 2211.");
    expect(note.match(/^- /gm)).toHaveLength(3);
    expect(note).toContain("Ask the student which one they mean");
    expect(toolEvents(events).map((t) => `${t.name}:${t.status}`)).toEqual(["find_courses:running", "find_courses:done"]);
    expect(turnLogs()[0].prefetch).toMatchObject({ status: "ambiguous", searches: 0, catalog: "ambiguous" });
  });

  it("a message that isn't about a course adds nothing: no note, no tool line, no GoSolar", async () => {
    claude.reply({ text: ["Happy to help."] });
    const events = await chat("hi, can you help me plan my week?");
    expect(gs.requests).toHaveLength(0);
    expect(toolEvents(events)).toEqual([]);
    expect(claude.requests[0].body.messages[0].content).toHaveLength(2); // the context note and the message
    expect(turnLogs()[0].prefetch).toMatchObject({ status: "none", catalog: "none" });
  });

  it("a message with a course code keeps the code path (no catalog lookup)", async () => {
    claude.reply({ text: ["ok"] });
    const events = await chat("Is MATH 2212 open?");
    expect(toolEvents(events).map((t) => t.name)).toEqual(["search_sections", "search_sections"]);
    expect(noteOf()).not.toContain("Catalog match");
    expect(turnLogs()[0].prefetch).toMatchObject({ status: "used", courses: 1, catalog: null });
  });
});

describe("find_courses called by the model", () => {
  it("runs in-process and returns the ranked catalog candidates", async () => {
    setAssistantConfigForTests({ apiKey: DUMMY_KEY, fetch: claude.fetch, prefetch: false });
    claude.reply({ tools: [{ id: "toolu_find", name: "find_courses", input: { query: "data structures" } }] });
    claude.reply({ text: ["That's CSC 2720, Data Structures."] });
    const events = await chat("what's the code for data structures?");

    expect(toolEvents(events)).toEqual([
      { id: "toolu_find", name: "find_courses", status: "running", label: "Looking up 'data structures' in the catalog" },
      { id: "toolu_find", name: "find_courses", status: "done", label: "Looking up 'data structures' in the catalog" },
    ]);
    const result = JSON.parse(claude.requests[1].body.messages.at(-1).content[0].content);
    expect(result).toMatchObject({ query: "data structures", level: "US", levelSource: "default", confidence: "high", matched: "data structures" });
    expect(result.candidates[0]).toMatchObject({ subject: "CSC", courseNumber: "2720", title: "Data Structures", credits: "3", level: "US" });
    expect(gs.requests).toHaveLength(0);
    // Offered to the model, with a description that says when to use it.
    const tool = claude.requests[0].body.tools.find((t: { name: string }) => t.name === "find_courses");
    expect(tool.description).toContain("Use it whenever the student names a course without a code");
    expect(tool.input_schema.required).toEqual(["query"]);
  });
});

describe("instructions", () => {
  it("the system prompt maps names with find_courses (or the catalog match), never from memory", () => {
    expect(SYSTEM_PROMPT).toContain("map it with find_courses, or use the catalog match PantherWatch already added to their message");
    expect(SYSTEM_PROMPT).toContain('say the mapping once, as code and title ("MATH 2212, Calculus of One Variable II")');
    expect(SYSTEM_PROMPT).toContain("When it is ambiguous, ask which of the top candidates they mean");
  });

  it("the MCP server instructions mention find_courses", () => {
    expect(SERVER_INSTRUCTIONS).toContain("call find_courses to get its subject and course number");
  });
});
