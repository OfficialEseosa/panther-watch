import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/session")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  ...(await import("../helpers/session")).nextServerMock,
}));

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { setDbForTests } from "@/db";
import { scheduleEntries, terms, watchedSections, type User } from "@/db/schema";
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
        "get_section_details",
        "list_schedule",
        "list_terms",
        "list_watches",
        "remove_from_schedule",
        "remove_watch",
        "search_sections",
        "search_subjects",
      ].sort(),
    );
    for (const tool of tools) {
      expect(tool.description?.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("list_terms: registrable terms first, from the terms cache", async () => {
    const { data } = await callTool(await mcp(), "list_terms");
    expect(data).toEqual({
      terms: [
        { code: OPEN, name: "Spring Semester 2027", registrationOpen: true },
        { code: "202705", name: "Summer Semester 2027", registrationOpen: false },
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
    expect(data).toMatchObject({ total: 3, returned: 3, truncated: false });
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
