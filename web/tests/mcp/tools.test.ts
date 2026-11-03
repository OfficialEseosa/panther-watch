import { readFileSync } from "node:fs";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/session")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  ...(await import("../helpers/session")).nextServerMock,
}));

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { setDbForTests } from "@/db";
import { scheduleEntries, terms, users, watchedSections, type User } from "@/db/schema";
import { setGoSolarOptionsForTests } from "@/lib/courses";
import type { CourseData, MeetingTime } from "@/lib/gosolar";
import { disconnectApp } from "@/lib/oauth";
import { resetRateLimits, toolLimiter } from "@/lib/oauth/rate-limit";
import { createTestDb, seedUser, truncateAll, type TestDatabase } from "../helpers/db";
import { makeClosedSection, makeSection, startFakeGoSolar, type FakeGoSolar } from "../helpers/fake-gosolar";
import { appFetch, connect, MCP_URL, REDIRECT, register, type RegisteredClient, type Tokens } from "../helpers/oauth";
import { TEST_ORIGIN } from "../helpers/session";

/** Open for registration and not expired (Spring 2027 alerts run until 2027-03-01). */
const OPEN = "202701";

/** HTML live GoSolar sent for Spring 2027 sections (captured 2026-11-01). */
const fixture = (name: string) => readFileSync(new URL(`../fixtures/gosolar/${name}`, import.meta.url), "utf8");

let testDb: TestDatabase;
let gs: FakeGoSolar;
let alice: User;
let app: RegisteredClient;
let tokens: Tokens;
const clients: Client[] = [];

beforeAll(async () => {
  testDb = await createTestDb();
  setDbForTests(testDb.db);
  gs = await startFakeGoSolar();
  setGoSolarOptionsForTests({ baseUrl: gs.url });
});
afterAll(async () => {
  for (const client of clients) await client.close().catch(() => {});
  setGoSolarOptionsForTests(undefined);
  setDbForTests(undefined);
  await gs.close();
  await testDb.close();
});
beforeEach(async () => {
  await truncateAll(testDb.db);
  gs.reset();
  resetRateLimits();
  await testDb.db.insert(terms).values([
    { code: OPEN, description: "Spring Semester 2027", viewOnly: false },
    { code: "202705", description: "Summer Semester 2027 (View Only)", viewOnly: true },
  ]);
  alice = await seedUser(testDb.db, { name: "Alice" });
  app = await register({ redirect_uris: [REDIRECT], client_name: "Claude" });
  tokens = await connect(alice, app);
});

async function mcp(accessToken = tokens.access_token): Promise<Client> {
  const client = new Client({ name: "pantherwatch-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    fetch: appFetch,
    requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  await client.connect(transport);
  clients.push(client);
  return client;
}

type ToolResult = { isError?: boolean; content: Array<{ type: string; text?: string }> };

async function callTool(client: Client, name: string, args: Record<string, unknown> = {}) {
  const result = (await client.callTool({ name, arguments: args })) as ToolResult;
  const text = result.content.find((c) => c.type === "text")?.text ?? "";
  let data: Record<string, unknown> | null = null;
  try {
    data = JSON.parse(text) as Record<string, unknown>;
  } catch {
    data = null;
  }
  return { isError: result.isError === true, text, data };
}

function meeting(days: Array<keyof MeetingTime>, beginTime: string, endTime: string): CourseData["meetingsFaculty"] {
  const base: MeetingTime = {
    beginTime,
    endTime,
    buildingDescription: "Langdale Hall",
    campusDescription: "Atlanta Campus",
    category: "01",
    startDate: "01/11/2027",
    endDate: "05/04/2027",
    sunday: false,
    monday: false,
    tuesday: false,
    wednesday: false,
    thursday: false,
    friday: false,
    saturday: false,
    hoursWeek: 2.5,
    meetingTypeDescription: "Lecture",
    room: "0410",
  };
  for (const day of days) (base as unknown as Record<string, unknown>)[day] = true;
  return [{ category: "01", meetingTime: base }];
}

describe("authentication", () => {
  it("answers 401 with a WWW-Authenticate challenge naming the protected resource metadata", async () => {
    const initialize = {
      jsonrpc: "2.0",
      id: 1,
      method: "initialize",
      params: { protocolVersion: "2025-06-18", capabilities: {}, clientInfo: { name: "x", version: "1" } },
    };
    for (const authorization of [undefined, "Bearer pwat_bogus", `Basic ${btoa("a:b")}`]) {
      const response = await appFetch(MCP_URL, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          accept: "application/json, text/event-stream",
          ...(authorization ? { authorization } : {}),
        },
        body: JSON.stringify(initialize),
      });
      expect(response.status).toBe(401);
      const challenge = response.headers.get("www-authenticate") ?? "";
      expect(challenge).toMatch(/^Bearer /);
      expect(challenge).toContain(`resource_metadata="${TEST_ORIGIN}/.well-known/oauth-protected-resource/api/mcp"`);
      expect(response.headers.get("access-control-expose-headers")).toContain("WWW-Authenticate");
    }
  });

  it("a disconnected app is refused on its next request", async () => {
    const client = await mcp();
    expect((await callTool(client, "list_watches")).isError).toBe(false);
    await disconnectApp(alice.id, app.client_id);
    await expect(client.callTool({ name: "list_watches", arguments: {} })).rejects.toThrow();
  });
});

describe("tools", () => {
  it("lists every tool with an input schema", async () => {
    const { tools } = await (await mcp()).listTools();
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "add_to_schedule",
        "add_watch",
        "check_conflicts",
        "get_course_requirements",
        "get_section_details",
        "get_syllabus_summary",
        "list_schedule",
        "list_terms",
        "list_watches",
        "remove_from_schedule",
        "remove_watch",
        "search_sections",
        "search_subjects",
      ].sort(),
    );
    // The chat-only campus tool (scope "site") is never served over MCP.
    expect(tools.map((t) => t.name)).not.toContain("set_level_preference");
    for (const tool of tools) {
      expect(tool.description?.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("list_terms: registrable terms first, from the terms cache", async () => {
    const { data } = await callTool(await mcp(), "list_terms");
    const status = expect.stringMatching(/^(upcoming|in_progress|past)$/);
    expect(data).toEqual({
      terms: [
        { code: OPEN, name: "Spring Semester 2027", registrationOpen: true, status, default: true },
        { code: "202705", name: "Summer Semester 2027", registrationOpen: false, status },
      ],
    });
  });

  it("search_sections: compact sections with effective seats, meeting days and delivery", async () => {
    gs.setSections(OPEN, "CSC", "1301", [
      makeSection({ term: OPEN, courseReferenceNumber: "80001", courseTitle: "PRINCIPLES OF COMPUTER SCI I" }),
      makeSection({ term: OPEN, courseReferenceNumber: "80002", seatsAvailable: 5, crossList: "XL", crossListAvailable: 0 }),
      makeSection({
        term: OPEN,
        courseReferenceNumber: "80003",
        meetingsFaculty: meeting(["tuesday", "thursday"], "0930", "1045"),
        sectionAttributes: [{ code: "HYB", description: "Hybrid" }],
      }),
    ]);
    const { data } = await callTool(await mcp(), "search_sections", { term: OPEN, subject: "csc", courseNumber: "1301" });
    expect(data).toMatchObject({ level: "US", levelName: "Bachelor's level", levelSource: "default", total: 3, returned: 3, truncated: false });
    // No level given and none saved: bachelor's (US), never GoSolar's every-level default that mixes in Perimeter
    // College sections, plus one count of the same course at the associate level (this fake has no levels: 3),
    // run alongside the search (so in either order).
    const searches = gs.requests.filter((r) => r.path === "/searchResults/searchResults");
    expect(searches.map((r) => `${r.query.txt_level}:${r.query.pageMaxSize}`).sort()).toEqual(["UA:1", "US:500"]);
    expect(data!.alsoAtAssociateLevel).toBe(3);
    expect(data!.resultsUrl).toMatch(/[?&]level=US$/);
    const sections = data!.sections as Array<Record<string, unknown>>;
    expect(sections[0]).toEqual({
      term: OPEN,
      crn: "80001",
      subject: "CSC",
      courseNumber: "1301",
      section: "001",
      title: "Principles of Computer Sci I",
      instructor: "Instructor, Test",
      credits: "4 credits",
      seatsAvailable: 3,
      maximumEnrollment: 30,
      waitCount: 0,
      waitCapacity: 10,
      open: true,
      meetings: [
        {
          days: "MW",
          start: "1100",
          end: "1215",
          building: "Langdale Hall",
          room: "0410",
          type: "Lecture",
          startDate: "08/24/2026",
          endDate: "12/14/2026",
        },
      ],
      delivery: "In person",
      partOfTerm: "Full term",
      campus: "Atlanta Campus",
      scheduleType: "Lecture",
      honors: false,
    });
    // Cross-listed with an empty shared pool: no takeable seat.
    expect(sections[1]).toMatchObject({ crn: "80002", seatsAvailable: 0, open: false });
    expect(sections[2]).toMatchObject({ crn: "80003", delivery: "Hybrid", meetings: [{ days: "TR", start: "0930", end: "1045" }] });

    const open = await callTool(await mcp(), "search_sections", { term: OPEN, subject: "CSC", courseNumber: "1301", openOnly: true, limit: 1 });
    expect(open.data).toMatchObject({ total: 2, returned: 1, truncated: true });
  });

  it("get_course_requirements: GoSolar's prerequisite wording, a flat course list, corequisites and restrictions", async () => {
    gs.setSubjects(OPEN, [
      { code: "CSC", description: "COMPUTER SCIENCE" },
      { code: "DSCI", description: "DATA SCIENCE" },
      { code: "MATH", description: "MATHEMATICS" },
    ]);
    // CSC 2720's nested AND/OR prerequisites, with CSC 1301's corequisite, restrictions and description.
    gs.setRequirements(OPEN, "19633", {
      prerequisites: fixture("prerequisites-csc2720.html"),
      corequisites: fixture("corequisites-csc1301.html"),
      restrictions: fixture("restrictions-csc1301.html"),
      description: fixture("description-csc1301.html"),
    });
    const client = await mcp();
    const { isError, data } = await callTool(client, "get_course_requirements", { term: OPEN, crn: "19633", subject: "csc", courseNumber: "2720" });
    expect(isError).toBe(false);
    expect(data).toMatchObject({ term: OPEN, crn: "19633" });
    expect(data!.sectionUrl).toBe(`${TEST_ORIGIN}/course-results?term=${OPEN}&subjects=CSC&courseNumber=2720&crn=19633`);

    const description = data!.description as string;
    expect(description.startsWith("Principles of Computer Science I.")).toBe(true);
    expect(description).toBe(description.trim());

    const prerequisites = data!.prerequisites as { text: string; rule: string; items: unknown[] };
    expect(Object.keys(prerequisites).sort()).toEqual(["items", "rule", "text"]); // no tree
    expect(prerequisites.rule).toBe("Prereq");
    expect(prerequisites.text).toContain("COMPUTER SCIENCE 1302");
    expect(prerequisites.text).toMatch(/\) and \(/);
    expect(prerequisites.items).toEqual([
      { subject: "CSC", courseNumber: "1302", minimumGrade: "C", concurrent: false },
      { subject: "DSCI", courseNumber: "1302", minimumGrade: "C", concurrent: false },
      { subject: "CSC", courseNumber: "1302L", minimumGrade: "C", concurrent: false },
      { subject: "CSC", courseNumber: "1302K", minimumGrade: "C", concurrent: false },
      { subject: "MATH", courseNumber: "2211", courseNumberTo: "2212", minimumGrade: "C", concurrent: true },
      { subject: "MATH", courseNumber: "2211", courseNumberTo: "2212", minimumGrade: "K", concurrent: false },
      { subject: "MATH", courseNumber: "2201", courseNumberTo: "2202", minimumGrade: "C", concurrent: true },
      { subject: "CSC", courseNumber: "2510", minimumGrade: "C", concurrent: false },
      { subject: "MATH", courseNumber: "2420", minimumGrade: "C", concurrent: false },
    ]);
    expect(data!.corequisites).toEqual([{ subject: "CSC", courseNumber: "1301L", title: "Principles Computer Sci Lab I" }]);
    expect(data!.restrictions).toEqual({
      mustBe: [
        {
          kind: "major",
          label: "Fields of Study (Major, Minor or Concentration)",
          values: expect.arrayContaining(["Computer Science (CSC)", "Data Sci & Geographic Info Sci (DSG)", "Physics (PHY)"]),
        },
      ],
      mustNotBe: [
        { kind: "level", label: "Levels", values: ["Undergrad Associate Semester (UA)"] },
        { kind: "other", label: "Cohorts", values: ["P:Online Only-No Immunizations (OL)"] },
      ],
      specialApprovals: [],
      other: [],
    });
    expect(data).not.toHaveProperty("unparsed");

    // Without subject and course number: sectionUrl comes from the tracked list, or is left out.
    await testDb.db.insert(watchedSections).values({ userId: alice.id, term: OPEN, crn: "19633", subject: "CSC", courseNumber: "2720" });
    const tracked = await callTool(client, "get_course_requirements", { term: OPEN, crn: "19633" });
    expect(tracked.data!.sectionUrl).toBe(data!.sectionUrl);
    const unknown = await callTool(client, "get_course_requirements", { term: OPEN, crn: "19999" });
    expect(unknown.isError).toBe(false);
    expect(unknown.data).toMatchObject({ crn: "19999", description: null, prerequisites: null, corequisites: [] });
    expect(unknown.data).not.toHaveProperty("sectionUrl");
  });

  it("get_course_requirements: a GoSolar error page is a tool error naming GoSolar", async () => {
    gs.failNextRequirements({ kind: "html", body: "<html><body><h1>Service Unavailable</h1></body></html>" }, 4);
    const { isError, text } = await callTool(await mcp(), "get_course_requirements", { term: OPEN, crn: "19010" });
    expect(isError).toBe(true);
    expect(text).toContain("GoSolar");
    expect(text).toContain("not responding");
  });

  it("add_watch: creates the row; an open section reports openNow with the UI's message; re-adding changes nothing", async () => {
    gs.setSections(OPEN, "CSC", "1301", [
      makeSection({ term: OPEN, courseReferenceNumber: "80001" }),
      makeClosedSection({ term: OPEN, courseReferenceNumber: "80002" }),
    ]);
    const client = await mcp();
    const open = await callTool(client, "add_watch", { term: OPEN, crn: "80001", subject: "CSC", courseNumber: "1301" });
    expect(open.data).toMatchObject({
      created: true,
      openNow: true,
      message: "This section has open seats right now; we'll alert you when it fills and reopens.",
    });
    const closed = await callTool(client, "add_watch", { term: OPEN, crn: "80002", subject: "CSC", courseNumber: "1301" });
    expect(closed.data).toMatchObject({ created: true, openNow: false, message: "We'll email you when a seat opens." });

    const rows = await testDb.db.select().from(watchedSections).where(eq(watchedSections.userId, alice.id));
    const byCrn = Object.fromEntries(rows.map((row) => [row.crn, row]));
    expect(byCrn["80001"].notifiedAt).toBeInstanceOf(Date); // tracked while open: no email for this opening
    expect(byCrn["80002"].notifiedAt).toBeNull(); // armed

    const again = await callTool(client, "add_watch", { term: OPEN, crn: "80001", subject: "CSC", courseNumber: "1301" });
    expect(again.data).toMatchObject({ created: false, openNow: false });

    const listed = await callTool(client, "list_watches");
    expect((listed.data!.watches as unknown[]).length).toBe(2);
    const removed = await callTool(client, "remove_watch", { term: OPEN, crn: "80002" });
    expect(removed.data).toMatchObject({ removed: true });
    expect(await testDb.db.select().from(watchedSections)).toHaveLength(1);
  });

  it("add_watch on a view-only term is a tool error with the UI's message", async () => {
    const result = await callTool(await mcp(), "add_watch", { term: "202705", crn: "80001", subject: "CSC", courseNumber: "1301" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Registration for this term is closed");
  });

  it("scope enforcement: a token without watches:write cannot track, and nothing is written", async () => {
    const readOnly = await connect(alice, app, { scopes: ["schedule:write"] });
    const client = await mcp(readOnly.access_token);
    const result = await callTool(client, "add_watch", { term: OPEN, crn: "80001", subject: "CSC", courseNumber: "1301" });
    expect(result.isError).toBe(true);
    expect(result.text).toContain("watches:write");
    expect(await testDb.db.select().from(watchedSections)).toHaveLength(0);
    // Reads and the granted write still work.
    expect((await callTool(client, "list_watches")).isError).toBe(false);
    const added = await callTool(client, "add_to_schedule", { term: OPEN, crn: "80001", subject: "CSC", courseNumber: "1301" });
    expect(added.isError).toBe(false);
  });

  it("check_conflicts: overlapping meetings clash, back-to-back and other days don't", async () => {
    gs.setSections(OPEN, "CSC", "1301", [
      makeSection({ term: OPEN, courseReferenceNumber: "80001", meetingsFaculty: meeting(["monday", "wednesday"], "1100", "1215") }),
      makeSection({ term: OPEN, courseReferenceNumber: "80002", meetingsFaculty: meeting(["tuesday", "thursday"], "1100", "1215") }),
    ]);
    gs.setSections(OPEN, "MATH", "2211", [
      makeSection({
        term: OPEN,
        subject: "MATH",
        courseNumber: "2211",
        courseReferenceNumber: "80010",
        meetingsFaculty: meeting(["wednesday", "friday"], "1130", "1245"),
      }),
      makeSection({
        term: OPEN,
        subject: "MATH",
        courseNumber: "2211",
        courseReferenceNumber: "80011",
        meetingsFaculty: meeting(["monday", "wednesday"], "1245", "1400"),
      }),
    ]);
    // 80001 is on the schedule, so its subject/course is looked up; the others are passed in.
    await testDb.db.insert(scheduleEntries).values({ userId: alice.id, term: OPEN, crn: "80001", subject: "CSC", courseNumber: "1301" });
    const { data } = await callTool(await mcp(), "check_conflicts", {
      term: OPEN,
      crns: ["80001", "80002", "80010", "80011", "89999"],
      sections: [
        { crn: "80002", subject: "CSC", courseNumber: "1301" },
        { crn: "80010", subject: "MATH", courseNumber: "2211" },
        { crn: "80011", subject: "MATH", courseNumber: "2211" },
      ],
    });
    expect(data).toMatchObject({
      conflicts: [{ crns: ["80001", "80010"], courses: ["CSC 1301", "MATH 2211"], when: "Wed 11:30 AM – 12:15 PM" }],
      unresolved: ["89999"],
    });
    expect((data!.checked as string[]).sort()).toEqual(["80001", "80002", "80010", "80011"]);
  });

  it("add_to_schedule: adds even when it clashes and reports the clash; remove_from_schedule removes", async () => {
    gs.setSections(OPEN, "CSC", "1301", [
      makeSection({ term: OPEN, courseReferenceNumber: "80001", meetingsFaculty: meeting(["monday", "wednesday"], "1100", "1215") }),
    ]);
    gs.setSections(OPEN, "MATH", "2211", [
      makeSection({
        term: OPEN,
        subject: "MATH",
        courseNumber: "2211",
        courseReferenceNumber: "80010",
        meetingsFaculty: meeting(["monday"], "1200", "1300"),
      }),
    ]);
    const client = await mcp();
    const first = await callTool(client, "add_to_schedule", { term: OPEN, crn: "80001", subject: "CSC", courseNumber: "1301" });
    expect(first.data).toMatchObject({ created: true, conflicts: [] });
    const second = await callTool(client, "add_to_schedule", { term: OPEN, crn: "80010", subject: "MATH", courseNumber: "2211" });
    expect(second.data).toMatchObject({
      created: true,
      conflicts: [{ crns: ["80010", "80001"], when: "Mon 12:00 PM – 12:15 PM" }],
    });
    expect(await testDb.db.select().from(scheduleEntries)).toHaveLength(2);

    const listed = await callTool(client, "list_schedule", { term: OPEN });
    expect(listed.data).toMatchObject({ terms: [{ term: OPEN, sections: [{ crn: "80001" }, { crn: "80010" }] }] });
    expect((await callTool(client, "remove_from_schedule", { term: OPEN, crn: "80001" })).data).toMatchObject({ removed: true });
    expect(await testDb.db.select().from(scheduleEntries)).toHaveLength(1);
  });

  it("search_sections uses the campus saved on the account (Settings) when no level is given", async () => {
    gs.setSections(OPEN, "ENGL", "1101", [makeSection({ term: OPEN, subject: "ENGL", courseNumber: "1101", courseReferenceNumber: "82001" })], "UA");
    await testDb.db.update(users).set({ levelPreference: "UA" }).where(eq(users.id, alice.id));
    const { data } = await callTool(await mcp(), "search_sections", { term: OPEN, subject: "ENGL", courseNumber: "1101" });
    expect(data).toMatchObject({ level: "UA", levelSource: "preference", total: 1 });
    expect(data).not.toHaveProperty("alsoAtAssociateLevel");
    const searches = gs.requests.filter((r) => r.path === "/searchResults/searchResults");
    expect(searches.map((r) => r.query.txt_level)).toEqual(["UA"]);
  });

  it("set_level_preference can't be called over MCP, even with every scope", async () => {
    await expect(callTool(await mcp(), "set_level_preference", { level: "UA" })).rejects.toThrow(/set_level_preference not found/);
    const [row] = await testDb.db.select({ level: users.levelPreference }).from(users).where(eq(users.id, alice.id));
    expect(row.level).toBeNull();
  });

  it("invalid arguments are rejected before any work", async () => {
    const result = await (await mcp()).callTool({ name: "add_watch", arguments: { term: "2027", crn: "1", subject: "CSC", courseNumber: "1301" } });
    expect((result as ToolResult).isError).toBe(true);
    expect(await testDb.db.select().from(watchedSections)).toHaveLength(0);
  });

  it("rate limits per user (best effort, in memory)", async () => {
    const client = await mcp();
    while (toolLimiter.take(alice.id) === 0) {
      // drain the bucket
    }
    const result = await callTool(client, "list_watches");
    expect(result.isError).toBe(true);
    expect(result.text).toContain("Too many PantherWatch requests");
  });
});
