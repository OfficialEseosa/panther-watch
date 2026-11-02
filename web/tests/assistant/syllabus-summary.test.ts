import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/session")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  ...(await import("../helpers/session")).nextServerMock,
}));

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { POST } from "@/app/api/assistant/chat/route";
import { setDbForTests } from "@/db";
import { assistantDaily, assistantUsage, syllabi, syllabusSummaries, terms, type User } from "@/db/schema";
import { easternDay, resetAssistantLimitsForTests } from "@/lib/assistant/budget";
import { setAssistantConfigForTests } from "@/lib/assistant/config";
import { SYSTEM_PROMPT } from "@/lib/assistant/prompt";
import { syllabusUrl } from "@/lib/course-meta";
import type { PdfFetch } from "@/lib/course-meta/pdf-text";
import { setSyllabusSummaryOptionsForTests, summarizeSyllabus, SUMMARY_MODEL } from "@/lib/course-meta/syllabus-summary";
import { setGoSolarOptionsForTests } from "@/lib/courses";
import { SERVER_INSTRUCTIONS } from "@/lib/mcp/tools";
import { resetRateLimits } from "@/lib/oauth/rate-limit";
import { createTestDb, seedUser, truncateAll, type TestDatabase } from "../helpers/db";
import { fakeAnthropic, parseSse, type FakeAnthropic } from "../helpers/fake-anthropic";
import { startFakeGoSolar, type FakeGoSolar } from "../helpers/fake-gosolar";
import { appFetch, connect, MCP_URL, REDIRECT, register } from "../helpers/oauth";
import { makePdf } from "../helpers/pdf";
import { apiRequest, call, flushAfter } from "../helpers/session";

/**
 * Syllabus summaries end to end: a fake GSU file server serving PDFs made by tests/helpers/pdf.ts
 * (real unpdf text extraction), the scripted Claude transport answering the structured-output
 * request, PGlite for the cache and the spend ledger, and the tool through the real MCP handler
 * and the real chat route.
 */

const OPEN = "202701";
const CRN = "19010";
const DUMMY_KEY = "sk-ant-test-dummy-key";
const URL_A = syllabusUrl("0028109491792443249404.pdf");

const SYLLABUS = [
  "CSC 4350 Software Engineering - Spring 2027 Syllabus",
  "Instructor: Dr. Example. Office hours Tuesday 2-4 PM.",
  "Grading: Two midterm exams 40%, final exam 30%, team project 20%, weekly quizzes 10%.",
  "Attendance is required; more than 3 absences lowers the final grade by one letter.",
  "Late work loses 10% per day and is not accepted after 3 days.",
  "Textbook: Software Engineering by Sommerville, 10th edition (required).",
  "Expect weekly readings and about 6 hours of work a week outside class.",
];

/** What Haiku answers (the structured output). */
const SUMMARY = {
  gradingComponents: [
    { name: "Midterm exams (2)", weightPercent: 40 },
    { name: "Final exam", weightPercent: 30 },
    { name: "Team project", weightPercent: 20 },
    { name: "Weekly quizzes", weightPercent: 10 },
  ],
  examCount: 3,
  quizCount: null,
  attendancePolicy: "Required; more than 3 absences lowers the final grade by one letter.",
  latePolicy: "10% off per day; not accepted after 3 days.",
  textbook: { title: "Software Engineering (Sommerville, 10th ed.)", required: true, costNote: null },
  majorProjects: ["Team project"],
  workload: "Weekly readings and quizzes, about 6 hours a week outside class.",
  modalityNotes: null,
  cautions: ["Attendance affects the final grade."],
  termLabel: "Spring 2027",
  confidence: "high",
};

/** 5,000 input + 400 output tokens on Haiku 5.5: 0.1 * 5000 + 0.5 * 400 = 700 micro-dollars. */
const USAGE = { input: 5000, output: 400 };
const COST = 700;

let testDb: TestDatabase;
let gs: FakeGoSolar;
let claude: FakeAnthropic;
let alice: User;

/** The fake GSU file server: URL -> PDF bytes, an HTTP status, or a network failure. */
const files = new Map<string, Uint8Array<ArrayBuffer> | number | "network">();
const pdfRequests: Array<{ url: string; redirect: string }> = [];
const pdfFetch: PdfFetch = async (url, init) => {
  pdfRequests.push({ url, redirect: init.redirect });
  const file = files.get(url);
  if (file === "network") throw new TypeError("fetch failed");
  if (file === undefined) return new Response("Not Found", { status: 404 });
  if (typeof file === "number") return new Response("", { status: file, headers: file === 302 ? { location: "https://evil.example/" } : {} });
  return new Response(file, { status: 200, headers: { "content-type": "application/pdf" } });
};

let clock: Date | undefined;
const useOptions = () => setSyllabusSummaryOptionsForTests({ pdf: { fetchImpl: pdfFetch }, now: () => clock ?? new Date() });

beforeAll(async () => {
  testDb = await createTestDb();
  setDbForTests(testDb.db);
  gs = await startFakeGoSolar();
  setGoSolarOptionsForTests({ baseUrl: gs.url });
  claude = fakeAnthropic();
});
afterAll(async () => {
  setSyllabusSummaryOptionsForTests(undefined);
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
  files.clear();
  pdfRequests.length = 0;
  clock = undefined;
  resetRateLimits();
  resetAssistantLimitsForTests();
  setAssistantConfigForTests({ apiKey: DUMMY_KEY, fetch: claude.fetch });
  useOptions();
  await testDb.db.insert(terms).values([{ code: OPEN, description: "Spring Semester 2027", viewOnly: false }]);
  await testDb.db.insert(syllabi).values({ term: OPEN, crn: CRN, path: "0028109491792443249404.pdf" });
  files.set(URL_A, makePdf([SYLLABUS]));
  alice = await seedUser(testDb.db, { name: "Alice Panther" });
});
afterEach(async () => {
  await flushAfter();
});

async function daily() {
  const [row] = await testDb.db.select().from(assistantDaily).where(eq(assistantDaily.day, easternDay()));
  return row;
}

async function stored(url = URL_A) {
  const [row] = await testDb.db.select().from(syllabusSummaries).where(eq(syllabusSummaries.url, url));
  return row;
}

describe("summarizeSyllabus", () => {
  it("first call: downloads, extracts, summarizes with Haiku (structured output), stores it and records the cost", async () => {
    claude.reply({ json: SUMMARY, usage: USAGE });
    const result = await summarizeSyllabus(URL_A);

    expect(result).toMatchObject({ status: "ok", url: URL_A, cached: false, summary: SUMMARY });
    expect(pdfRequests).toEqual([{ url: URL_A, redirect: "manual" }]);

    expect(claude.requests).toHaveLength(1);
    const { body } = claude.requests[0];
    expect(body).toMatchObject({ model: SUMMARY_MODEL, output_config: { effort: "low", format: { type: "json_schema" } } });
    expect(body.max_tokens).toBeLessThanOrEqual(4000);
    expect(body).not.toHaveProperty("stream");
    expect(body).not.toHaveProperty("thinking");
    expect(body.output_config.format.schema.properties).toHaveProperty("gradingComponents");
    expect(body.system).toMatch(/Never infer, estimate or invent/);
    const prompt = body.messages[0].content as string;
    expect(prompt).toContain("Two midterm exams 40%, final exam 30%");
    expect(prompt).toMatch(/<syllabus>[\s\S]*<\/syllabus>/);

    const row = await stored();
    expect(row).toMatchObject({ status: "ok", model: SUMMARY_MODEL, inputTokens: 5000, outputTokens: 400, costMicroUsd: COST, error: null });
    expect(row.textSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(row.summary).toEqual(SUMMARY);
    // Site-wide spend, not anyone's message count.
    expect(await daily()).toMatchObject({ messages: 0, inputTokens: 5000, outputTokens: 400, costMicroUsd: COST });
  });

  it("unchanged text: re-reads the PDF but reuses the stored summary with no model call", async () => {
    claude.reply({ json: SUMMARY, usage: USAGE });
    const first = await summarizeSyllabus(URL_A);
    const second = await summarizeSyllabus(URL_A);

    expect(pdfRequests).toHaveLength(2);
    expect(claude.requests).toHaveLength(1);
    expect(second).toMatchObject({ status: "ok", cached: true, summary: SUMMARY });
    if (first.status !== "ok" || second.status !== "ok") throw new Error("expected summaries");
    expect(second.summarizedAt).toEqual(first.summarizedAt);
    expect(second.textUnchangedSince).toEqual(first.textUnchangedSince);
    expect(second.checkedAt.getTime()).toBeGreaterThanOrEqual(first.checkedAt.getTime());
    expect((await daily()).costMicroUsd).toBe(COST);
  });

  it("changed text: summarizes again, overwrites the row and records a second cost", async () => {
    clock = new Date("2026-10-01T12:00:00Z");
    claude.reply({ json: SUMMARY, usage: USAGE });
    await summarizeSyllabus(URL_A);
    const before = await stored();

    clock = new Date();
    files.set(URL_A, makePdf([[...SYLLABUS.slice(0, 2), "Grading: Three exams 60%, homework 40%.", ...SYLLABUS.slice(3)]]));
    const changed = { ...SUMMARY, examCount: 3, gradingComponents: [{ name: "Exams (3)", weightPercent: 60 }, { name: "Homework", weightPercent: 40 }] };
    claude.reply({ json: changed, usage: { input: 6000, output: 500 } });
    const result = await summarizeSyllabus(URL_A);

    expect(claude.requests).toHaveLength(2);
    expect(claude.requests[1].body.messages[0].content).toContain("Three exams 60%");
    expect(result).toMatchObject({ status: "ok", cached: false, summary: changed });
    const after = await stored();
    expect(after.textSha256).not.toBe(before.textSha256);
    expect(after.createdAt.getTime()).toBeGreaterThan(before.createdAt.getTime());
    expect(after.costMicroUsd).toBe(850); // 0.1 * 6000 + 0.5 * 500
    // Both generations count toward today's spend only when both happened today; the first was dated October 1.
    const [oct] = await testDb.db.select().from(assistantDaily).where(eq(assistantDaily.day, "2026-10-01"));
    expect(oct.costMicroUsd).toBe(COST);
    expect((await daily()).costMicroUsd).toBe(850);
  });

  it("fetch failure with a stored summary: returns it flagged stale, without a model call", async () => {
    claude.reply({ json: SUMMARY, usage: USAGE });
    await summarizeSyllabus(URL_A);

    files.set(URL_A, "network");
    const recent = await summarizeSyllabus(URL_A);
    expect(recent).toMatchObject({ status: "ok", cached: true, summary: SUMMARY, stale: { reason: "fetch_failed" } });
    if (recent.status !== "ok") throw new Error("expected a summary");
    expect(recent.stale!.message).toMatch(/Couldn't download[\s\S]*stored earlier/);

    files.set(URL_A, 503);
    clock = new Date(Date.now() + 31 * 24 * 60 * 60 * 1000);
    const old = await summarizeSyllabus(URL_A);
    expect(old).toMatchObject({ status: "ok", stale: { reason: "fetch_failed" } });
    if (old.status !== "ok") throw new Error("expected a summary");
    expect(old.stale!.message).toMatch(/HTTP 503[\s\S]*over 30 days ago/);
    expect(claude.requests).toHaveLength(1);
  });

  it("fetch failure without a stored summary: unavailable, and nothing is stored (it may work later)", async () => {
    files.set(URL_A, "network");
    expect(await summarizeSyllabus(URL_A)).toMatchObject({ status: "unavailable", reason: "fetch_failed" });
    files.set(URL_A, 302); // redirects are never followed
    expect(await summarizeSyllabus(URL_A)).toMatchObject({ status: "unavailable", reason: "fetch_failed" });
    expect(await stored()).toBeUndefined();
    expect(claude.requests).toHaveLength(0);
  });

  it("parallel calls for one URL share one download and one model call", async () => {
    claude.reply({ json: SUMMARY, usage: USAGE });
    const results = await Promise.all([summarizeSyllabus(URL_A), summarizeSyllabus(URL_A), summarizeSyllabus(URL_A)]);
    expect(results.every((r) => r.status === "ok")).toBe(true);
    expect(pdfRequests).toHaveLength(1);
    expect(claude.requests).toHaveLength(1);
    expect((await daily()).costMicroUsd).toBe(COST);
  });

  it("only fetches from https://cdn.gsu.edu/", async () => {
    for (const url of [
      "https://evil.example/static/syllabi-public/files/1.pdf",
      "http://cdn.gsu.edu/static/syllabi-public/files/1.pdf",
      "https://cdn.gsu.edu.evil.example/files/1.pdf",
      "https://cdn.gsu.edu:8443/files/1.pdf",
      "https://user@cdn.gsu.edu/files/1.pdf",
      "file:///etc/passwd",
    ]) {
      expect(await summarizeSyllabus(url)).toMatchObject({ status: "unavailable", reason: "not_allowed" });
    }
    expect(pdfRequests).toHaveLength(0);
    expect(claude.requests).toHaveLength(0);
  });

  it("at the site-wide spend cap: no model call (unavailable budget, or the stored summary flagged stale)", async () => {
    setAssistantConfigForTests({ apiKey: DUMMY_KEY, fetch: claude.fetch, globalDailyUsd: 1 });
    await testDb.db.insert(assistantDaily).values({ day: easternDay(), costMicroUsd: 1_000_000 });
    expect(await summarizeSyllabus(URL_A)).toMatchObject({ status: "unavailable", reason: "budget" });
    expect(claude.requests).toHaveLength(0);
    expect(await stored()).toBeUndefined();

    // A summary stored for older text is still served, flagged stale.
    await testDb.db.insert(syllabusSummaries).values({ url: URL_A, status: "ok", textSha256: "0".repeat(64), summary: SUMMARY });
    expect(await summarizeSyllabus(URL_A)).toMatchObject({ status: "ok", summary: SUMMARY, stale: { reason: "budget" } });
    expect(claude.requests).toHaveLength(0);
  });

  it("without ANTHROPIC_API_KEY: unavailable disabled, no model call", async () => {
    setAssistantConfigForTests({ apiKey: null, fetch: claude.fetch });
    expect(await summarizeSyllabus(URL_A)).toMatchObject({ status: "unavailable", reason: "disabled" });
    expect(claude.requests).toHaveLength(0);
  });

  it("a non-PDF or a scan (no text) is unavailable without a model call", async () => {
    files.set(URL_A, new TextEncoder().encode("<html>Syllabus moved</html>"));
    expect(await summarizeSyllabus(URL_A)).toMatchObject({ status: "unavailable", reason: "not_pdf" });
    files.set(URL_A, makePdf([["Scan"]]));
    expect(await summarizeSyllabus(URL_A)).toMatchObject({ status: "unavailable", reason: "no_text" });
    expect(claude.requests).toHaveLength(0);
    expect(await stored()).toMatchObject({ status: "unavailable", error: "no_text" });
  });

  it("a refusal is recorded against the text hash, so the same text isn't paid for twice", async () => {
    claude.reply({ stopReason: "refusal", usage: { input: 5000, output: 0 } });
    expect(await summarizeSyllabus(URL_A)).toMatchObject({ status: "unavailable", reason: "summary_failed" });
    expect(await summarizeSyllabus(URL_A)).toMatchObject({ status: "unavailable", reason: "summary_failed" });
    expect(claude.requests).toHaveLength(1);
    expect(await stored()).toMatchObject({ status: "unavailable", error: "summary_failed", costMicroUsd: 500 });
    expect((await daily()).costMicroUsd).toBe(500);
  });
});

// ------------------------------------------------------------------------------------------

describe("get_syllabus_summary over MCP", () => {
  async function mcpClient(): Promise<Client> {
    const app = await register({ redirect_uris: [REDIRECT], client_name: "Claude" });
    const tokens = await connect(alice, app);
    const client = new Client({ name: "pantherwatch-test", version: "1.0.0" });
    await client.connect(
      new StreamableHTTPClientTransport(new URL(MCP_URL), {
        fetch: appFetch,
        requestInit: { headers: { Authorization: `Bearer ${tokens.access_token}` } },
      }),
    );
    return client;
  }

  async function tool(client: Client, name: string, args: Record<string, unknown>) {
    const result = (await client.callTool({ name, arguments: args })) as { isError?: boolean; content: Array<{ type: string; text?: string }> };
    return { isError: result.isError === true, data: JSON.parse(result.content[0].text ?? "null") };
  }

  it("summarizes the section's syllabus, then serves it from the cache; get_section_details shows the hint", async () => {
    const client = await mcpClient();
    try {
      const details = (args: Record<string, unknown>) => tool(client, "get_section_details", args);
      const sectionArgs = { term: OPEN, subject: "CSC", courseNumber: "4350", crn: CRN, instructor: "Staff" };
      expect((await details(sectionArgs)).data).toMatchObject({ syllabusUrl: URL_A, syllabusSummaryCached: false });

      claude.reply({ json: SUMMARY, usage: USAGE });
      const first = await tool(client, "get_syllabus_summary", { term: OPEN, crn: CRN, subject: "CSC", courseNumber: "4350" });
      expect(first.isError).toBe(false);
      const { termLabel, ...rest } = SUMMARY;
      expect(first.data).toMatchObject({ term: OPEN, crn: CRN, syllabusUrl: URL_A, termLabel, summary: rest });
      expect(first.data.summary).not.toHaveProperty("termLabel");
      expect(first.data.summarizedAt).toMatch(/^\d{4}-\d\d-\d\dT/);
      expect(first.data.textUnchangedSince).toBe(first.data.summarizedAt);
      expect(first.data).not.toHaveProperty("stale");
      expect(first.data.sectionUrl).toContain(`crn=${CRN}`);

      const second = await tool(client, "get_syllabus_summary", { term: OPEN, crn: CRN });
      expect(second.data.summary).toEqual(rest);
      expect(second.data).not.toHaveProperty("sectionUrl");
      expect(claude.requests).toHaveLength(1);
      expect(pdfRequests).toHaveLength(2);

      expect((await details(sectionArgs)).data).toMatchObject({ syllabusSummaryCached: true });
    } finally {
      await client.close();
    }
  });

  it("no syllabus posted: unavailable no_syllabus, nothing fetched", async () => {
    const client = await mcpClient();
    try {
      const { isError, data } = await tool(client, "get_syllabus_summary", { term: OPEN, crn: "19999" });
      expect(isError).toBe(false);
      expect(data).toMatchObject({ syllabusUrl: null, unavailable: "no_syllabus", message: "No syllabus is posted for CRN 19999 in Spring 2027." });
      expect(pdfRequests).toHaveLength(0);
      expect(claude.requests).toHaveLength(0);
    } finally {
      await client.close();
    }
  });

  it("MCP instructions and the assistant prompt carry the syllabus and registration-advice guidance", () => {
    for (const text of [SERVER_INSTRUCTIONS, SYSTEM_PROMPT]) {
      expect(text).toContain("get_syllabus_summary");
      expect(text).toMatch(/Registration advice/);
      expect(text).toMatch(/degree audit/);
      expect(text).toMatch(/academic advisor are the authority/);
      expect(text).toMatch(/registration happens in GoSolar/);
    }
  });
});

// ------------------------------------------------------------------------------------------

describe("get_syllabus_summary in the on-site chat", () => {
  it("runs as a tool (running/done events with its label); the summary's cost is site-wide spend, not the user's", async () => {
    claude.reply({
      tools: [{ id: "toolu_s", name: "get_syllabus_summary", input: { term: OPEN, crn: CRN, subject: "CSC", courseNumber: "4350" } }],
      usage: { input: 1000, output: 50 },
    });
    claude.reply({ json: SUMMARY, usage: USAGE }); // the summary request, made by the tool
    claude.reply({ text: ["It has three exams."], usage: { input: 1200, output: 20 } });

    const request = await apiRequest("/api/assistant/chat", {
      method: "POST",
      as: alice,
      body: { messages: [{ role: "user", content: "How is CSC 4350 CRN 19010 graded?" }] },
    });
    const response = await call(POST, request);
    const events = parseSse(await response.text());

    const toolEvents = events.filter((e) => e.event === "tool").map((e) => e.data);
    expect(toolEvents).toEqual([
      { id: "toolu_s", name: "get_syllabus_summary", status: "running", label: "Reading the syllabus for CSC 4350 (CRN 19010)" },
      { id: "toolu_s", name: "get_syllabus_summary", status: "done", label: "Reading the syllabus for CSC 4350 (CRN 19010)" },
    ]);
    expect(events.at(-1)!.event).toBe("done");

    expect(claude.requests).toHaveLength(3);
    expect(claude.requests[1].body.model).toBe(SUMMARY_MODEL);
    const result = claude.requests[2].body.messages[2].content[0];
    expect(result.is_error).toBeUndefined();
    expect(JSON.parse(result.content)).toMatchObject({ termLabel: "Spring 2027", summary: { examCount: 3 } });

    await flushAfter();
    // Chat turn: 0.1 * (1000 + 1200) + 0.5 * (50 + 20) = 255; summary: 700.
    const [usage] = await testDb.db.select().from(assistantUsage).where(eq(assistantUsage.userId, alice.id));
    expect(usage).toMatchObject({ messages: 1, costMicroUsd: 255 });
    expect(await daily()).toMatchObject({ messages: 1, costMicroUsd: 255 + COST });
  });
});
