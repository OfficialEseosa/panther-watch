import { eq } from "drizzle-orm";
import { fetch as undiciFetch } from "undici";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/session")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  ...(await import("../helpers/session")).nextServerMock,
}));

import { POST } from "@/app/api/assistant/chat/route";
import { setDbForTests } from "@/db";
import { terms, users, watchedSections, type User } from "@/db/schema";
import { resetAssistantLimitsForTests } from "@/lib/assistant/budget";
import { setAssistantConfigForTests } from "@/lib/assistant/config";
import { parseCourseRefs, parseLevelCue, parseTermCue, setPrefetchTimeoutForTests } from "@/lib/assistant/prefetch";
import { SYSTEM_PROMPT } from "@/lib/assistant/prompt";
import { resetTermsMemoForTests, setGoSolarOptionsForTests, type TermInfo } from "@/lib/courses";
import type { FetchLike } from "@/lib/gosolar";
import { resetRateLimits } from "@/lib/oauth/rate-limit";
import { createTestDb, seedUser, truncateAll, type TestDatabase } from "../helpers/db";
import { fakeAnthropic, parseSse, type FakeAnthropic } from "../helpers/fake-anthropic";
import { makeSection, startFakeGoSolar, type FakeGoSolar } from "../helpers/fake-gosolar";
import { apiRequest, call, flushAfter } from "../helpers/session";

/**
 * The assistant's course prefetch (src/lib/assistant/prefetch.ts) through the real chat route:
 * PGlite, the fake GoSolar and the transport-level fake Claude API. When the student's message
 * names a course, PantherWatch runs search_sections itself before the first model request (in the
 * term and at the level the message names, if any) and hands the result over as a second text
 * block of the student's message. A repeat of that search by the model is answered from it.
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

/** The prefetch note: the last text block of the last (the student's) message of a model request. */
const noteOf = (index = 0): string => claude.requests[index].body.messages.at(-1).content.at(-1).text;

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
    ["CSC 4350 in sp 2027 or Fall-2026?", [["CSC", "4350"]]],
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
  it("searches GoSolar before the first model request, hands the result over in the student's message, and answers in one request", async () => {
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
    // The student's message (after the context note) carries the results as a second text block.
    expect(body.messages.map((m: { role: string }) => m.role)).toEqual(["user"]);
    const blocks = body.messages[0].content;
    expect(blocks.map((b: { type: string }) => b.type)).toEqual(["text", "text", "text"]);
    expect(blocks[1].text).toBe("Which CSC 4350 sections are open?");
    const note = noteOf();
    expect(note).toMatch(/^\[PantherWatch searches already run for this message, not written by the student\]/);
    // Its assumptions, in plain words: the term and why, the level and why, the term list.
    expect(note).toContain(`Term searched: ${OPEN} (Spring 2027), the term students are registering for now (list_terms' default).`);
    expect(note).toContain(`Terms in GoSolar (code, name): ${OPEN} Spring Semester 2027 (default); 202608 Fall Semester 2026 (view only).`);
    expect(note).toContain(`search_sections {"term":"${OPEN}","subject":"CSC","courseNumber":"4350"}`);
    expect(note).toContain(
      "Level searched: Bachelor's level, bachelor's by default (no campus saved); this course also has 2 associate-level sections at Perimeter College.",
    );
    expect(note).toContain("Use these results instead of calling search_sections or list_terms again.");
    expect(note).toContain(
      "If the student's message is about a different term or level (for example a past term, or Perimeter College / graduate sections), ignore this and run search_sections with the right term and level.",
    );
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
    expect(noteOf()).toContain("CRN 81235 on the student's schedule or tracked classes is a section of CSC 4350.");
    expect(turnLogs()[0].prefetch).toMatchObject({ status: "used", courses: 0, crns: 1, searches: 1 });
  });

  it("no course and no known CRN: no prefetch, no GoSolar request, nothing added to the message", async () => {
    claude.reply({ text: ["Which course do you mean?"] });
    const events = await chat("are any of those still open? 19010 maybe");
    expect(gs.requests).toHaveLength(0);
    expect(toolEvents(events)).toEqual([]);
    expect(claude.requests[0].body.messages.map((m: { role: string }) => m.role)).toEqual(["user"]);
    expect(claude.requests[0].body.messages[0].content).toHaveLength(2); // the context note and the message
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
    expect(noteOf(1)).toContain(`Term searched: ${OPEN} (Spring 2027)`);
  });
});

describe("parseTermCue", () => {
  const listed = (...codes: string[]): TermInfo[] =>
    codes.map((code) => ({ code, description: code, viewOnly: code !== "202701" && code !== "202705" && code !== "202708" }));
  // Today: Fall 2026 is under way and Spring 2027 is the term students are registering for.
  const TERMS = listed("202701", "202608", "202605", "202601", "202508");
  const NOW = new Date("2026-11-02T12:00:00-05:00");
  const cue = (text: string, terms = TERMS) => parseTermCue(text, terms, NOW);

  it.each([
    ["Is CSC 4350 open in spring 2027?", "202701", "spring 2027"],
    ["CSC 4350 Fall '26", "202608", "Fall '26"],
    ["csc 4350 sp27", "202701", "sp27"],
    ["CSC 4350 FA2026", "202608", "FA2026"],
    ["CSC 4350 summer-2026", "202605", "summer-2026"],
  ])("explicit: %s", (text, code, phrase) => {
    expect(cue(text)).toEqual({ kind: "term", code, phrase });
  });

  it.each([
    ["Is MATH 2212 open next semester?", "202701"],
    ["Is MATH 2212 open next term?", "202701"],
    ["Who teaches MATH 2212 this semester?", "202608"],
    ["Who taught MATH 2212 last fall?", "202508"],
    ["Who taught MATH 2212 last spring?", "202601"],
    ["MATH 2212 this fall", "202608"],
  ])("relative to the default term: %s", (text, code) => {
    expect(cue(text)).toMatchObject({ kind: "term", code });
  });

  it("next fall: the first fall that starts after today, when it is listed", () => {
    expect(cue("MATH 2212 next fall", listed("202708", ...TERMS.map((t) => t.code)))).toMatchObject({ kind: "term", code: "202708" });
    expect(cue("MATH 2212 next fall")).toEqual({ kind: "unresolved", phrase: "next fall" });
  });

  it("unresolvable: a term that isn't listed, or two different terms", () => {
    expect(cue("Is CSC 4350 open in spring 2031?")).toEqual({ kind: "unresolved", phrase: "spring 2031" });
    expect(cue("CSC 4350 in fall 2026 or spring 2027?")).toMatchObject({ kind: "unresolved" });
    // The same term twice is fine.
    expect(cue("CSC 4350 next semester (spring 2027)")).toMatchObject({ kind: "term", code: "202701" });
  });

  it("no cue", () => {
    expect(cue("Which CSC 4350 sections are open?")).toEqual({ kind: "none" });
    expect(cue("room 1301, in 2027, fall back plan")).toEqual({ kind: "none" });
  });
});

describe("parseLevelCue", () => {
  it.each([
    ["Is MATH 2212 open at Perimeter?", "UA"],
    ["any associate's sections of ENGL 1101", "UA"],
    ["ENGL 1101 at the two-year college", "UA"],
    ["ENGL 1101 on the Dunwoody campus", "UA"],
    ["ENGL 1101 in Clarkston, Decatur, Newton or Alpharetta", "UA"],
    ["grad sections of CSC 6350", "GS"],
    ["CSC 6350 for my master's", "GS"],
    ["PhD seminar PSYC 8000", "GS"],
    ["doctoral sections", "GS"],
    ["CSC 4350 at the Atlanta campus", "US"],
    ["bachelor's sections of CSC 4350", "US"],
    ["undergrad CSC 4350", "US"],
    ["undergraduate CSC 4350", "US"],
  ])("%s -> %s", (text, level) => {
    expect(parseLevelCue(text)?.level).toBe(level);
  });

  it("no cue, or cues for different levels: none", () => {
    expect(parseLevelCue("Which CSC 4350 sections are open?")).toBeNull();
    expect(parseLevelCue("Perimeter or graduate sections?")).toBeNull();
  });
});

describe("a turn whose message names a term or a level", () => {
  it('"last fall" in November 2026: the prefetch searches Fall 2025 (ended), not the fall under way, and says why', async () => {
    const NOV_2_2026 = new Date("2026-11-02T12:00:00-05:00");
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOV_2_2026);
    try {
      await testDb.db.insert(terms).values({ code: "202508", description: "Fall Semester 2025 (View Only)", viewOnly: true });
      await testDb.db.update(terms).set({ fetchedAt: NOV_2_2026 }); // one fresh refresh, as of the faked "now"
      gs.setSections("202508", "CSC", "4350", [makeSection({ term: "202508", subject: "CSC", courseNumber: "4350", courseReferenceNumber: "80001" })]);
      claude.reply({ text: ["One section ran in Fall 2025."] });
      const events = await chat("Was CSC 4350 full last fall?");
      expect(searchRequests().map((r) => r.query.txt_term)).toEqual(["202508", "202508"]);
      expect(toolEvents(events)[0].label).toBe("Searching CSC 4350 in Fall 2025");
      expect(noteOf()).toContain(`Term searched: 202508 (Fall 2025), because the student's message says "last fall".`);
      expect(noteOf()).toContain(`search_sections {"term":"202508","subject":"CSC","courseNumber":"4350"}`);
    } finally {
      vi.useRealTimers();
    }
  });

  it('"Perimeter" overrides the saved campus: the prefetch searches txt_level=UA and says why', async () => {
    await testDb.db.update(users).set({ levelPreference: "GS" }).where(eq(users.id, alice.id));
    claude.reply({ text: ["No Perimeter sections."] });
    await chat("Is CSC 4350 open at Perimeter?");
    // Only the UA search: a level the student chose gets no "also at" counts.
    expect(searchRequests().map((r) => r.query.txt_level)).toEqual(["UA"]);
    expect(noteOf()).toContain(`search_sections {"term":"${OPEN}","subject":"CSC","courseNumber":"4350","level":"UA"}`);
    expect(noteOf()).toContain(`Level searched: Associate level (Perimeter College), because the student's message says "Perimeter".`);
  });

  it("the saved campus is named as the reason when the message names no level", async () => {
    await testDb.db.update(users).set({ levelPreference: "UA" }).where(eq(users.id, alice.id));
    claude.reply({ text: ["ok"] });
    await chat("Which CSC 4350 sections are open?");
    expect(searchRequests().map((r) => r.query.txt_level)).toEqual(["UA"]);
    expect(noteOf()).toContain("Level searched: Associate level (Perimeter College), the campus saved on the student's account.");
  });

  it("a term that isn't in the list: no prefetch at all, the model looks itself", async () => {
    claude.reply({ text: ["Spring 2031 isn't listed yet."] });
    const events = await chat("Is CSC 4350 open in spring 2031?");
    expect(gs.requests).toHaveLength(0);
    expect(toolEvents(events)).toEqual([]);
    expect(claude.requests[0].body.messages[0].content).toHaveLength(2);
    expect(turnLogs()[0].prefetch).toMatchObject({ status: "term_unknown", courses: 1, searches: 0 });
  });
});

describe("the model repeating a prefetched search", () => {
  it("is answered from the prefetch: no GoSolar request, no second UI line, dedupe in the log", async () => {
    claude.reply({
      tools: [
        { id: "toolu_again", name: "search_sections", input: { term: OPEN, subject: "csc", courseNumber: "4350", openOnly: true } },
        { id: "toolu_terms", name: "list_terms", input: {} },
      ],
    });
    claude.reply({ text: ["CRN 81234 is open."] });
    const events = await chat("Which CSC 4350 sections are open?");

    expect(searchRequests()).toHaveLength(2); // the prefetch's search and Perimeter count only
    expect(toolEvents(events).map((t) => t.id)).toEqual(["prefetch_1", "prefetch_1"]);
    expect(events.at(-1)!.event).toBe("done");

    // The repeat got the open sections of the prefetched result; list_terms got the term list.
    const results = claude.requests[1].body.messages.at(-1).content;
    expect(results.map((r: { tool_use_id: string }) => r.tool_use_id)).toEqual(["toolu_again", "toolu_terms"]);
    expect(JSON.parse(results[0].content)).toMatchObject({ total: 1, returned: 1, truncated: false, sections: [{ crn: "81234", open: true }] });
    expect(JSON.parse(results[1].content).terms[0]).toMatchObject({ code: OPEN, default: true });

    expect(events.at(-1)!.data.timing.tools.map((t: { name: string }) => t.name)).toEqual([
      "prefetch:search_sections",
      "dedupe:search_sections",
      "dedupe:list_terms",
    ]);
    const [log] = turnLogs();
    expect(log.tools.slice(1)).toEqual([
      { name: "search_sections", ms: 0, error: false, prefetch: false, dedupe: true, gosolar: { requests: 0, sessions: 0, ms: 0 } },
      expect.objectContaining({ name: "list_terms", prefetch: false, dedupe: true, gosolar: { requests: 0, sessions: 0, ms: 0 } }),
    ]);
  });

  it("a search at another level runs for real and shows its line", async () => {
    claude.reply({ tools: [{ id: "toolu_ua", name: "search_sections", input: { term: OPEN, subject: "CSC", courseNumber: "4350", level: "UA" } }] });
    claude.reply({ text: ["ok"] });
    const events = await chat("Which CSC 4350 sections are open?");
    expect(searchRequests()).toHaveLength(3);
    expect(toolEvents(events).map((t) => `${t.id}:${t.status}`)).toEqual(["prefetch_1:running", "prefetch_1:done", "toolu_ua:running", "toolu_ua:done"]);
    expect(turnLogs()[0].tools[1]).not.toHaveProperty("dedupe");
  });
});
