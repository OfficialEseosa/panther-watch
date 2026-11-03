import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

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
import { SYSTEM_PROMPT } from "@/lib/assistant/prompt";
import { setGoSolarOptionsForTests } from "@/lib/courses";
import { SERVER_INSTRUCTIONS } from "@/lib/mcp/tools";
import { resetRateLimits } from "@/lib/oauth/rate-limit";
import { SCOPES } from "@/lib/oauth/scopes";
import { callTool, type ToolAuth } from "@/lib/tools/registry";
import { createTestDb, seedUser, truncateAll, type TestDatabase } from "../helpers/db";
import { fakeAnthropic, parseSse, type FakeAnthropic } from "../helpers/fake-anthropic";
import { makeSection, startFakeGoSolar, type FakeGoSolar } from "../helpers/fake-gosolar";
import { apiRequest, call, flushAfter } from "../helpers/session";

/**
 * Campus (degree level) resolution in search_sections, the "also at Perimeter" count, and the
 * chat-only set_level_preference tool: the shared registry as the on-site assistant calls it,
 * PGlite, and the fake GoSolar, which serves sections per `txt_level` and records each search.
 */

const OPEN = "202701";

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
  setAssistantConfigForTests({ apiKey: "sk-ant-test-dummy-key", fetch: claude.fetch });
  await testDb.db.insert(terms).values({ code: OPEN, description: "Spring Semester 2027", viewOnly: false });
  alice = await seedUser(testDb.db, { name: "Alice Panther" });

  // ENGL 1101 runs at both levels: 2 bachelor's sections (Atlanta), 3 associate (Perimeter).
  gs.setSections(OPEN, "ENGL", "1101", [section("81001"), section("81002")], "US");
  gs.setSections(OPEN, "ENGL", "1101", [section("82001"), section("82002"), section("82003")], "UA");
  // ENGL 1102: bachelor's only. POLS 1101: Perimeter only.
  gs.setSections(OPEN, "ENGL", "1102", [section("81101")], "US");
  gs.setSections(OPEN, "POLS", "1101", [section("82101", "POLS", "1101")], "UA");
});
afterEach(async () => {
  await flushAfter();
});

function section(crn: string, subject = "ENGL", courseNumber = crn.startsWith("811") ? "1102" : "1101") {
  return makeSection({ term: OPEN, subject, courseNumber, courseReferenceNumber: crn });
}

/** The on-site assistant's auth: every scope plus `site`. */
const site = (): ToolAuth => ({ userId: alice.id, scopes: SCOPES, site: true });

async function search(input: Record<string, unknown>, auth: ToolAuth = site()) {
  const result = await callTool(auth, "search_sections", { term: OPEN, ...input });
  expect(result.isError).toBeFalsy();
  const text = result.content.find((c) => c.type === "text");
  return JSON.parse(text && "text" in text ? text.text : "{}") as Record<string, unknown> & { sections: Array<{ crn: string }> };
}

/** The GoSolar searches made since the last reset: txt_level and page size (1 = a count). */
const searches = () =>
  gs.requests
    .filter((r) => r.path === "/searchResults/searchResults")
    .map((r) => ({ level: r.query.txt_level, course: `${r.query.txt_subject} ${r.query.txt_courseNumber}`, pageMaxSize: r.query.pageMaxSize }));

const savedLevel = async () =>
  (await testDb.db.select({ level: users.levelPreference }).from(users).where(eq(users.id, alice.id)))[0]?.level;

describe("search_sections level resolution: input > saved campus > bachelor's", () => {
  it("default: searches bachelor's and counts the same course at Perimeter (one extra count search, run alongside)", async () => {
    const data = await search({ subject: "ENGL", courseNumber: "1101" });
    expect(data).toMatchObject({ level: "US", levelName: "Bachelor's level", levelSource: "default", alsoAtAssociateLevel: 3, total: 2 });
    expect(data).not.toHaveProperty("alsoAtGraduateLevel");
    expect(data.sections.map((s) => s.crn)).toEqual(["81001", "81002"]);
    // Two GoSolar sessions in parallel, so the arrival order isn't fixed.
    expect(searches()).toHaveLength(2);
    expect(searches()).toEqual(
      expect.arrayContaining([
        { level: "US", course: "ENGL 1101", pageMaxSize: "500" },
        { level: "UA", course: "ENGL 1101", pageMaxSize: "1" },
      ]),
    );
  });

  it("default: alsoAtAssociateLevel is 0 when Perimeter doesn't offer the course", async () => {
    const data = await search({ subject: "ENGL", courseNumber: "1102" });
    expect(data).toMatchObject({ levelSource: "default", alsoAtAssociateLevel: 0, total: 1 });
    expect(data).not.toHaveProperty("alsoAtGraduateLevel");
  });

  it("default with nothing at bachelor's: counts both the associate and graduate levels", async () => {
    const data = await search({ subject: "POLS", courseNumber: "1101" });
    expect(data).toMatchObject({ level: "US", levelSource: "default", total: 0, alsoAtAssociateLevel: 1, alsoAtGraduateLevel: 0 });
    expect(searches().map((s) => `${s.level}:${s.pageMaxSize}`).sort()).toEqual(["GS:1", "UA:1", "US:500"]);
  });

  it("a saved campus is used when no level is given, with no extra searches", async () => {
    await testDb.db.update(users).set({ levelPreference: "UA" }).where(eq(users.id, alice.id));
    const data = await search({ subject: "ENGL", courseNumber: "1101" });
    expect(data).toMatchObject({ level: "UA", levelName: "Associate level (Perimeter College)", levelSource: "preference", total: 3 });
    expect(data).not.toHaveProperty("alsoAtAssociateLevel");
    expect(data.resultsUrl).toMatch(/[?&]level=UA$/);
    expect(searches()).toEqual([{ level: "UA", course: "ENGL 1101", pageMaxSize: "500" }]);
  });

  it("an explicit level beats the saved campus, with no extra searches", async () => {
    await testDb.db.update(users).set({ levelPreference: "UA" }).where(eq(users.id, alice.id));
    const data = await search({ subject: "ENGL", courseNumber: "1101", level: "US" });
    expect(data).toMatchObject({ level: "US", levelSource: "input", total: 2 });
    expect(data).not.toHaveProperty("alsoAtAssociateLevel");
    expect(searches()).toEqual([{ level: "US", course: "ENGL 1101", pageMaxSize: "500" }]);
  });

  it("an explicit level with nothing saved is still `input`, never counted elsewhere", async () => {
    const data = await search({ subject: "POLS", courseNumber: "1101", level: "GS" });
    expect(data).toMatchObject({ level: "GS", levelSource: "input", total: 0 });
    expect(data).not.toHaveProperty("alsoAtAssociateLevel");
    expect(data).not.toHaveProperty("alsoAtGraduateLevel");
    expect(searches()).toHaveLength(1);
  });

  it("a failed Perimeter count is swallowed: the bachelor's results come back without the hint", async () => {
    gs.failNextSearches({ kind: "http", status: 500 }, 1, "UA");
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const data = await search({ subject: "ENGL", courseNumber: "1101" });
      expect(data).toMatchObject({ level: "US", levelSource: "default", total: 2 });
      expect(data).not.toHaveProperty("alsoAtAssociateLevel");
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("GoSolar UA count failed"), expect.anything());
    } finally {
      warn.mockRestore();
    }
    expect(searches().map((s) => s.level).sort()).toEqual(["UA", "US"]);
  });
});

describe("set_level_preference (on-site assistant only)", () => {
  it("is refused without the on-site flag (an OAuth caller with every scope), and nothing is stored", async () => {
    const result = await callTool({ userId: alice.id, scopes: SCOPES }, "set_level_preference", { level: "UA" });
    expect(result.isError).toBe(true);
    expect(JSON.stringify(result.content)).toContain("Settings → Campus");
    expect(await savedLevel()).toBeNull();
  });

  it("rejects a level outside US, UA, GS", async () => {
    const result = await callTool(site(), "set_level_preference", { level: "LW" });
    expect(result.isError).toBe(true);
    expect(await savedLevel()).toBeNull();
  });

  it("in a chat: saves the answer (label \"Saving your campus\"), and the next search uses it without counting again", async () => {
    claude.reply({ tools: [{ id: "toolu_set", name: "set_level_preference", input: { level: "UA" } }] });
    claude.reply({ tools: [{ id: "toolu_s", name: "search_sections", input: { term: OPEN, subject: "ENGL", courseNumber: "1101" } }] });
    claude.reply({ text: ["Three Perimeter sections of ENGL 1101."] });

    const request = await apiRequest("/api/assistant/chat", {
      method: "POST",
      as: alice,
      body: {
        messages: [
          { role: "user", content: "Which ENGL 1101 should I take?" },
          { role: "assistant", content: "Are you at the Atlanta campus or online (bachelor's), or at Perimeter College (associate)?" },
          { role: "user", content: "Perimeter, Clarkston campus" },
        ],
      },
    });
    const response = await call(POST, request);
    expect(response.status).toBe(200);
    const events = parseSse(await response.text());
    const tools = events.filter((e) => e.event === "tool" && e.data.status === "running").map((e) => e.data.label);
    expect(tools).toEqual(["Saving your campus", "Searching ENGL 1101 in Spring 2027"]);
    expect(events.filter((e) => e.event === "tool" && e.data.status === "error")).toEqual([]);

    expect(await savedLevel()).toBe("UA");
    const saved = JSON.parse(claude.requests[1].body.messages.at(-1).content[0].content);
    expect(saved).toMatchObject({ saved: true, level: "UA", levelName: "Associate level (Perimeter College)" });
    const found = JSON.parse(claude.requests[2].body.messages.at(-1).content[0].content);
    expect(found).toMatchObject({ level: "UA", levelSource: "preference", total: 3 });
    expect(found).not.toHaveProperty("alsoAtAssociateLevel");
    expect(searches()).toEqual([{ level: "UA", course: "ENGL 1101", pageMaxSize: "500" }]);

    // The chat offers the tool to the model; it is the only on-site-only tool.
    const offered = claude.requests[0].body.tools.map((t: { name: string }) => t.name);
    expect(offered).toContain("set_level_preference");
  });
});

describe("instructions", () => {
  it("the system prompt asks once when the course also runs at Perimeter, then saves the answer", () => {
    expect(SYSTEM_PROMPT).toContain(
      'ask the student once: "Are you at the Atlanta campus or online (bachelor\'s), or at Perimeter College (associate)?"',
    );
    expect(SYSTEM_PROMPT).toContain("When levelSource is default and alsoAtAssociateLevel is more than 0");
    expect(SYSTEM_PROMPT).toContain("call set_level_preference with that level so they aren't asked again");
    expect(SYSTEM_PROMPT).toContain("When levelSource is preference, use the results without comment");
    expect(SYSTEM_PROMPT).not.toContain("Search at the bachelor's level unless");
  });

  it("the MCP instructions ask once too, but point to Settings → Campus instead of the chat-only tool", () => {
    expect(SERVER_INSTRUCTIONS).toContain("`alsoAtAssociateLevel` is more than 0, ask the student once");
    expect(SERVER_INSTRUCTIONS).toContain("Settings → Campus on PantherWatch");
    expect(SERVER_INSTRUCTIONS).not.toContain("set_level_preference");
  });
});
