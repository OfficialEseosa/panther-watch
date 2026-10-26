import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const ingest = vi.hoisted(() => ({ ingestNextTerm: vi.fn() }));

vi.mock("next/headers", async () => (await import("../helpers/session")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  ...(await import("../helpers/session")).nextServerMock,
}));
// Only the network-bound APEX scraper is faked; parsing and storage are real.
vi.mock("@/lib/course-meta", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/course-meta")>()),
  ingestNextTerm: ingest.ingestNextTerm,
}));

// Read lazily by @/lib/env on first use, after tests/setup.ts has reset the env.
process.env.ADMIN_EMAILS = "admin@pantherwatch.test";

import { setDbForTests } from "@/db";
import { emailLog, jobRuns, scheduleEntries, terms, watchedSections, type User } from "@/db/schema";
import { gradeTerms, sectionGrades } from "@/db/schema/course-meta";
import { POST as sendEmailRoute } from "@/app/api/admin/email/route";
import { POST as testAlertRoute } from "@/app/api/admin/email/test-alert/route";
import { DELETE as deleteTermRoute } from "@/app/api/admin/grades/[term]/route";
import { POST as refreshRoute } from "@/app/api/admin/grades/refresh/route";
import { GET as gradeStatusRoute } from "@/app/api/admin/grades/status/route";
import { POST as uploadRoute } from "@/app/api/admin/grades/upload/route";
import { GET as jobsRoute } from "@/app/api/admin/jobs/route";
import { GET as meRoute } from "@/app/api/admin/me/route";
import { GET as statsRoute } from "@/app/api/admin/stats/route";
import { GET as usersRoute } from "@/app/api/admin/users/route";
import { escapeLike } from "@/lib/admin";
import { getCourseGrades, listIngestedTerms, parseTerm } from "@/lib/course-meta";
import { setGoSolarOptionsForTests } from "@/lib/courses";
import { createMemoryTransport, remainingBudget, setDefaultEmailTransport, type MemoryTransport } from "@/lib/email";
import { apiRequest, call, flushAfter, params, afterTasks } from "../helpers/session";
import { createTestDb, seedUser, seedWatchedSection, truncateAll, type TestDatabase } from "../helpers/db";
import { makeSection, startFakeGoSolar, type FakeGoSolar } from "../helpers/fake-gosolar";

const GRADE_DATA = fileURLToPath(new URL("../../data/grade-csv/", import.meta.url));
const summaryCsv = readFileSync(`${GRADE_DATA}202601__summary.csv`, "utf8");
const detailedCsv = readFileSync(`${GRADE_DATA}202601__detailed.csv`, "utf8");

let testDb: TestDatabase;
let admin: User;
let student: User;
let transport: MemoryTransport;

beforeAll(async () => {
  testDb = await createTestDb();
  setDbForTests(testDb.db);
});
afterAll(async () => {
  setDbForTests(undefined);
  setDefaultEmailTransport(null);
  await testDb.close();
});
beforeEach(async () => {
  await truncateAll(testDb.db);
  admin = await seedUser(testDb.db, { email: "Admin@PantherWatch.test", name: "Admin" });
  student = await seedUser(testDb.db, { email: "student@student.gsu.test", name: "Stu Dent" });
  transport = createMemoryTransport();
  setDefaultEmailTransport(transport);
  ingest.ingestNextTerm.mockReset();
  afterTasks.length = 0;
});

async function seedSchedule(userId: string, crn: string) {
  await testDb.db
    .insert(scheduleEntries)
    .values({ userId, term: "202608", crn, subject: "CSC", courseNumber: "1301" });
}

function gradeForm(fields: { term?: string; summary?: string | null; detailed?: string | null }): FormData {
  const form = new FormData();
  if (fields.term !== undefined) form.set("term", fields.term);
  if (fields.summary != null) form.set("summary", new File([fields.summary], "summary.csv", { type: "text/csv" }));
  if (fields.detailed != null) form.set("detailed", new File([fields.detailed], "detailed.csv", { type: "text/csv" }));
  return form;
}

// ---------------------------------------------------------------------------------------------

describe("access control", () => {
  type Case = [string, (as?: User, origin?: string | null) => Promise<Response>];
  const cases: Case[] = [
    ["GET stats", async (as) => call(statsRoute, await apiRequest("/api/admin/stats", { as }))],
    ["GET users", async (as) => call(usersRoute, await apiRequest("/api/admin/users", { as }))],
    ["GET jobs", async (as) => call(jobsRoute, await apiRequest("/api/admin/jobs", { as }))],
    [
      "GET grades/status",
      async (as) => call(gradeStatusRoute, await apiRequest("/api/admin/grades/status", { as })),
    ],
    [
      "POST email",
      async (as, origin) =>
        call(
          sendEmailRoute,
          await apiRequest("/api/admin/email", {
            method: "POST",
            as,
            origin,
            body: { to: "x@example.test", subject: "Hi", htmlBody: "<p>Hi</p>" },
          }),
        ),
    ],
    [
      "POST email/test-alert",
      async (as, origin) =>
        call(testAlertRoute, await apiRequest("/api/admin/email/test-alert", { method: "POST", as, origin, body: {} })),
    ],
    [
      "POST grades/refresh",
      async (as, origin) =>
        call(refreshRoute, await apiRequest("/api/admin/grades/refresh?sync=1", { method: "POST", as, origin })),
    ],
    [
      "POST grades/upload",
      async (as, origin) =>
        call(
          uploadRoute,
          await apiRequest("/api/admin/grades/upload", {
            method: "POST",
            as,
            origin,
            body: gradeForm({ term: "202601", summary: summaryCsv, detailed: detailedCsv }),
          }),
        ),
    ],
    [
      "DELETE grades/:term",
      async (as, origin) =>
        call(
          deleteTermRoute,
          await apiRequest("/api/admin/grades/202601", { method: "DELETE", as, origin }),
          params({ term: "202601" }),
        ),
    ],
  ];

  it.each(cases)("%s: 401 signed out, 404 for a non-admin", async (_name, hit) => {
    const signedOut = await hit(undefined);
    expect(signedOut.status).toBe(401);
    expect((await signedOut.json()).error.code).toBe("unauthorized");

    const nonAdmin = await hit(student);
    expect(nonAdmin.status).toBe(404);
    expect(await nonAdmin.json()).toEqual({ error: { code: "not_found", message: "Not found" } });
  });

  it("non-admin calls had no side effects", async () => {
    for (const [, hit] of cases) await hit(student);
    expect(transport.sent).toHaveLength(0);
    expect(ingest.ingestNextTerm).not.toHaveBeenCalled();
    expect(await testDb.db.select().from(gradeTerms)).toHaveLength(0);
    expect(await testDb.db.select().from(jobRuns)).toHaveLength(0);
  });

  it("POST routes without Origin -> 403 for the admin", async () => {
    for (const [name, hit] of cases.filter(([n]) => !n.startsWith("GET"))) {
      const response = await hit(admin, null);
      expect(response.status, name).toBe(403);
      expect((await response.json()).error.code, name).toBe("forbidden");
    }
    expect(transport.sent).toHaveLength(0);
    expect(await testDb.db.select().from(gradeTerms)).toHaveLength(0);
  });

  it("a session for a deleted user is signed out", async () => {
    const ghost = { ...student, id: "00000000-0000-4000-8000-000000000000" };
    expect((await call(statsRoute, await apiRequest("/api/admin/stats", { as: ghost }))).status).toBe(401);
  });
});

describe("GET /api/admin/me", () => {
  it("401 signed out, true for an admin (case-insensitive), false otherwise", async () => {
    expect((await call(meRoute, await apiRequest("/api/admin/me"))).status).toBe(401);

    const yes = await call(meRoute, await apiRequest("/api/admin/me", { as: admin }));
    expect(yes.status).toBe(200);
    expect(await yes.json()).toEqual({ isAdmin: true });

    const no = await call(meRoute, await apiRequest("/api/admin/me", { as: student }));
    expect(no.status).toBe(200);
    expect(await no.json()).toEqual({ isAdmin: false });
  });
});

describe("GET /api/admin/stats", () => {
  it("matches the seeded data", async () => {
    const third = await seedUser(testDb.db);
    await seedWatchedSection(testDb.db, student.id, { crn: "80001" });
    await seedWatchedSection(testDb.db, student.id, { crn: "80002" });
    await seedWatchedSection(testDb.db, third.id, { crn: "80003" });
    await seedSchedule(student.id, "80001");

    const now = new Date();
    const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    const log = (sentAt: Date) => ({ recipient: "x@example.test", type: "welcome" as const, sentAt });
    await testDb.db.insert(emailLog).values([
      log(new Date(dayStart.getTime() + 1000)),
      log(new Date(dayStart.getTime() + 2000)),
      // Earlier this month but before today (on the 1st, put it at the month start itself).
      log(dayStart.getTime() === monthStart.getTime() ? monthStart : new Date(dayStart.getTime() - 1000)),
      log(new Date(monthStart.getTime() - 1000)), // last month: counted nowhere
    ]);
    const expectedToday = dayStart.getTime() === monthStart.getTime() ? 3 : 2;

    await testDb.db.insert(jobRuns).values([
      { job: "watcher", startedAt: new Date(now.getTime() - 120_000), finishedAt: now, ok: true, summary: { n: 1 } },
      { job: "watcher", startedAt: new Date(now.getTime() - 60_000), finishedAt: now, ok: false, summary: { n: 2 } },
      { job: "cleanup", startedAt: now },
    ]);
    await testDb.db.insert(gradeTerms).values([
      { term: "202508", posted: true },
      { term: "202601", posted: true },
      { term: "202605", posted: false },
    ]);

    const response = await call(statsRoute, await apiRequest("/api/admin/stats", { as: admin }));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    const stats = await response.json();
    expect(stats).toMatchObject({
      users: 3,
      watches: 3,
      scheduleEntries: 1,
      emailsToday: expectedToday,
      emailsThisMonth: 3,
      emailBudget: remainingBudget({ sentTodayUtc: expectedToday, sentThisMonthUtc: 3 }),
      gradeTerms: ["202601", "202508"],
    });
    expect(stats.lastWatcherRun).toMatchObject({ job: "watcher", ok: false, summary: { n: 2 } });
  });

  it("is all zeros / null on an empty database (apart from the two seeded users)", async () => {
    const stats = await (await call(statsRoute, await apiRequest("/api/admin/stats", { as: admin }))).json();
    expect(stats).toMatchObject({ users: 2, watches: 0, scheduleEntries: 0, emailsToday: 0, lastWatcherRun: null, gradeTerms: [] });
  });
});

describe("GET /api/admin/users", () => {
  async function list(query = "") {
    const response = await call(usersRoute, await apiRequest(`/api/admin/users${query}`, { as: admin }));
    return { status: response.status, body: await response.json() };
  }

  it("reports watch and schedule counts with LEFT JOIN semantics", async () => {
    await seedWatchedSection(testDb.db, student.id, { crn: "80001" });
    await seedWatchedSection(testDb.db, student.id, { crn: "80002" });
    await seedSchedule(student.id, "80001");
    await seedSchedule(student.id, "80002");
    await seedSchedule(student.id, "80003");

    const { status, body } = await list();
    expect(status).toBe(200);
    expect(body.total).toBe(2);
    const byEmail = Object.fromEntries(body.users.map((u: { email: string }) => [u.email, u]));
    // 2 watches x 3 schedule entries must not multiply into 6.
    expect(byEmail["student@student.gsu.test"]).toMatchObject({ watchCount: 2, scheduleCount: 3, name: "Stu Dent" });
    // Zero watches still listed, with 0.
    expect(byEmail["Admin@PantherWatch.test"]).toMatchObject({ watchCount: 0, scheduleCount: 0 });
    expect(Object.keys(byEmail["Admin@PantherWatch.test"]).sort()).toEqual(
      ["createdAt", "email", "id", "name", "pictureUrl", "scheduleCount", "watchCount"].sort(),
    );
  });

  it("q matches a partial email or name case-insensitively", async () => {
    expect((await list("?q=STUDENT.GSU")).body.users.map((u: { id: string }) => u.id)).toEqual([student.id]);
    expect((await list("?q=pantherwatch")).body.users.map((u: { id: string }) => u.id)).toEqual([admin.id]);
    expect((await list("?q=stu%20dent")).body.users.map((u: { id: string }) => u.id)).toEqual([student.id]);
    expect((await list("?q=nobody")).body).toMatchObject({ users: [], total: 0 });
  });

  it("treats % and _ in q literally", async () => {
    await seedUser(testDb.db, { email: "under_score@example.test", name: null });
    expect((await list(`?q=${encodeURIComponent("%")}`)).body.total).toBe(0);
    expect((await list("?q=_")).body.users.map((u: { email: string }) => u.email)).toEqual(["under_score@example.test"]);
    expect(escapeLike("a%b_c\\d")).toBe("a\\%b\\_c\\\\d");
  });

  it("paginates and validates limit/offset", async () => {
    for (let i = 0; i < 3; i++) await seedUser(testDb.db);
    const page = await list("?limit=2&offset=1");
    expect(page.body).toMatchObject({ total: 5, limit: 2, offset: 1 });
    expect(page.body.users).toHaveLength(2);
    for (const bad of ["?limit=0", "?limit=201", "?limit=abc", "?offset=-1"]) {
      const { status, body } = await list(bad);
      expect(status, bad).toBe(400);
      expect(body.error.code).toBe("invalid_request");
    }
  });
});

describe("POST /api/admin/email", () => {
  async function send(body: unknown) {
    return call(sendEmailRoute, await apiRequest("/api/admin/email", { method: "POST", as: admin, body }));
  }

  it("sends through the transport and logs a custom email_log row for the admin", async () => {
    const response = await send({
      to: " student@student.gsu.test ",
      subject: "Maintenance tonight",
      htmlBody: "<p>We will be <b>down</b> at 2am.</p>",
      previewText: "Short outage",
    });
    expect(response.status).toBe(200);
    const { email } = await response.json();
    expect(email).toMatchObject({ id: "memory-1", to: "student@student.gsu.test", subject: "Maintenance tonight" });

    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]).toMatchObject({ to: "student@student.gsu.test", subject: "Maintenance tonight" });
    expect(transport.sent[0].html).toContain("<b>down</b>");

    const rows = await testDb.db.select().from(emailLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: email.logId,
      userId: admin.id,
      recipient: "student@student.gsu.test",
      type: "custom",
      subject: "Maintenance tonight",
      providerMessageId: "memory-1",
    });
  });

  it.each([
    ["two recipients", { to: "a@example.test, b@example.test", subject: "S", htmlBody: "B" }],
    ["not an email", { to: "nope", subject: "S", htmlBody: "B" }],
    ["empty subject", { to: "a@example.test", subject: " ", htmlBody: "B" }],
    ["missing body", { to: "a@example.test", subject: "S" }],
    ["old field names", { targetEmail: "a@example.test", subject: "S", message: "B" }],
  ])("400 for %s, nothing sent or logged", async (_label, body) => {
    const response = await send(body);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
    expect(transport.sent).toHaveLength(0);
    expect(await testDb.db.select().from(emailLog)).toHaveLength(0);
  });

  it("502 when the provider refuses, and nothing is logged", async () => {
    transport.failNext("boom", "validation_error");
    const response = await send({ to: "a@example.test", subject: "S", htmlBody: "B" });
    expect(response.status).toBe(502);
    expect((await response.json()).error.code).toBe("email_send_failed");
    expect(await testDb.db.select().from(emailLog)).toHaveLength(0);
  });
});

describe("POST /api/admin/email/test-alert", () => {
  let gs: FakeGoSolar;
  beforeAll(async () => {
    gs = await startFakeGoSolar();
    setGoSolarOptionsForTests({ baseUrl: gs.url });
  });
  afterAll(async () => {
    setGoSolarOptionsForTests(undefined);
    await gs.close();
  });
  beforeEach(() => gs.reset());

  async function sendAlert(body: unknown, as: User = admin) {
    return call(testAlertRoute, await apiRequest("/api/admin/email/test-alert", { method: "POST", as, body }));
  }

  it("sends the sample seat alert to the admin only, [TEST] subject, logged as custom", async () => {
    const watch = await seedWatchedSection(testDb.db, student.id);
    const response = await sendAlert({});
    expect(response.status).toBe(200);
    const { email } = await response.json();
    expect(email).toMatchObject({ id: "memory-1", to: admin.email, live: false });

    expect(transport.sent).toHaveLength(1);
    const message = transport.sent[0];
    expect(message.to).toBe(admin.email);
    expect(message.subject.startsWith("[TEST] Class Spot Available")).toBe(true);
    expect(message.subject).toContain("CSC 1301 (CRN 00000)");
    expect(message.html).toContain("3 open");

    const rows = await testDb.db.select().from(emailLog);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: email.logId,
      userId: admin.id,
      recipient: admin.email,
      type: "custom",
      subject: message.subject,
    });
    // No watch state touched.
    const [after] = await testDb.db.select().from(watchedSections);
    expect(after).toEqual(watch);
    expect(gs.requests).toHaveLength(0);
  });

  it("uses a real section's live numbers when term, subject, number and CRN are given", async () => {
    await testDb.db.insert(terms).values({ code: "202608", description: "Fall Semester 2026", viewOnly: false });
    gs.setSections("202608", "CSC", "1301", [
      makeSection({ term: "202608", courseReferenceNumber: "80001", seatsAvailable: 7, courseTitle: "Principles of CS I" }),
      makeSection({ term: "202608", courseReferenceNumber: "80002", seatsAvailable: 0 }),
    ]);
    const response = await sendAlert({ term: "202608", subject: "csc", courseNumber: "1301", crn: "80001" });
    expect(response.status).toBe(200);
    expect((await response.json()).email.live).toBe(true);
    const message = transport.sent[0];
    expect(message.subject).toBe("[TEST] Class Spot Available: CSC 1301 (CRN 80001)");
    expect(message.html).toContain("7 open");
    expect(message.html).toContain("Fall Semester 2026");
    expect((await testDb.db.select().from(emailLog))[0].type).toBe("custom");
  });

  it("404 when the CRN is not in that course, nothing sent", async () => {
    gs.setSections("202608", "CSC", "1301", [makeSection({ term: "202608", courseReferenceNumber: "80001" })]);
    const response = await sendAlert({ term: "202608", subject: "CSC", courseNumber: "1301", crn: "89999" });
    expect(response.status).toBe(404);
    expect((await response.json()).error.code).toBe("section_not_found");
    expect(transport.sent).toHaveLength(0);
    expect(await testDb.db.select().from(emailLog)).toHaveLength(0);
  });

  it.each([
    ["a partial section", { term: "202608", crn: "80001" }],
    ["a bad CRN", { term: "202608", subject: "CSC", courseNumber: "1301", crn: "8" }],
    ["unknown fields", { to: "someone@example.test" }],
  ])("400 for %s", async (_label, body) => {
    const response = await sendAlert(body);
    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("invalid_request");
    expect(transport.sent).toHaveLength(0);
  });

  it("429 when the daily budget is used up", async () => {
    const now = new Date();
    await testDb.db.insert(emailLog).values(
      Array.from({ length: remainingBudget({ sentTodayUtc: 0, sentThisMonthUtc: 0 }).dailyRemaining }, (_, i) => ({
        userId: student.id,
        recipient: student.email,
        type: "custom" as const,
        subject: `filler ${i}`,
        sentAt: now,
      })),
    );
    const response = await sendAlert({});
    expect(response.status).toBe(429);
    expect((await response.json()).error.code).toBe("email_quota_exceeded");
    expect(transport.sent).toHaveLength(0);
  });

  it("404 for a non-admin, nothing sent", async () => {
    const response = await sendAlert({}, student);
    expect(response.status).toBe(404);
    expect(transport.sent).toHaveLength(0);
    expect(await testDb.db.select().from(emailLog)).toHaveLength(0);
  });
});

describe("GET /api/admin/jobs", () => {
  it("returns the newest n runs of a job", async () => {
    const t = (min: number) => new Date(Date.UTC(2026, 9, 25, 12, min));
    await testDb.db.insert(jobRuns).values([
      { job: "watcher", startedAt: t(1), ok: true },
      { job: "watcher", startedAt: t(2), ok: true },
      { job: "watcher", startedAt: t(3), ok: false },
      { job: "cleanup", startedAt: t(4), ok: true },
    ]);
    const response = await call(jobsRoute, await apiRequest("/api/admin/jobs?job=watcher&n=2", { as: admin }));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.job).toBe("watcher");
    expect(body.runs.map((r: { startedAt: string }) => r.startedAt)).toEqual([t(3).toISOString(), t(2).toISOString()]);

    const defaults = await (await call(jobsRoute, await apiRequest("/api/admin/jobs", { as: admin }))).json();
    expect(defaults.runs).toHaveLength(3);

    for (const bad of ["?job=DROP%20TABLE", "?n=0", "?n=101"]) {
      expect((await call(jobsRoute, await apiRequest(`/api/admin/jobs${bad}`, { as: admin }))).status, bad).toBe(400);
    }
  });
});

describe("grade data", () => {
  async function upload(form: FormData) {
    const response = await call(
      uploadRoute,
      await apiRequest("/api/admin/grades/upload", { method: "POST", as: admin, body: form }),
    );
    return { status: response.status, body: await response.json() };
  }

  it("upload stores the term from the two real APEX CSVs", async () => {
    const expectedRows = parseTerm(summaryCsv, detailedCsv, "202601").length;
    expect(expectedRows).toBeGreaterThan(1000);

    const { status, body } = await upload(gradeForm({ term: "202601", summary: summaryCsv, detailed: detailedCsv }));
    expect(status).toBe(200);
    expect(body).toEqual({ term: "202601", rows: expectedRows, posted: true });

    expect(await listIngestedTerms()).toEqual(["202601"]);
    const [{ n }] = await testDb.db.select({ n: count() }).from(sectionGrades).where(eq(sectionGrades.term, "202601"));
    expect(n).toBe(expectedRows);

    const grades = await getCourseGrades({ subject: "CSC", courseNumber: "1301" });
    expect(grades.hasData).toBe(true);
    expect(grades.termsIncluded).toEqual(["202601"]);
    expect(grades.overall?.total).toBeGreaterThan(0);
    expect(grades.overall?.gpa).toBeGreaterThan(0);
    expect(grades.professors.length).toBeGreaterThan(0);

    // Re-uploading replaces rather than duplicates.
    expect((await upload(gradeForm({ term: "202601", summary: summaryCsv, detailed: detailedCsv }))).body.rows).toBe(expectedRows);
    const [{ again }] = await testDb.db.select({ again: count() }).from(sectionGrades);
    expect(again).toBe(expectedRows);

    const status2 = await (await call(gradeStatusRoute, await apiRequest("/api/admin/grades/status", { as: admin }))).json();
    expect(status2).toMatchObject({ terms: ["202601"], lastRun: null, running: false });
  });

  it.each([
    ["swapped files", { term: "202601", summary: detailedCsv, detailed: summaryCsv }, /^summary: this is the detailed export/],
    ["HTML error page as summary", { term: "202601", summary: "<html>Just a moment...</html>", detailed: detailedCsv }, /^summary: not an APEX/],
    ["random CSV as detailed", { term: "202601", summary: summaryCsv, detailed: "a,b\n1,2\n" }, /^detailed: not an APEX/],
    ["missing detailed file", { term: "202601", summary: summaryCsv, detailed: null }, /^detailed: a CSV file is required/],
    ["empty summary file", { term: "202601", summary: "", detailed: detailedCsv }, /^summary: (the file is empty|a CSV file is required)/],
    ["bad term", { term: "2026", summary: summaryCsv, detailed: detailedCsv }, /^term: must be a 6-digit/],
    ["missing term", { summary: summaryCsv, detailed: detailedCsv }, /^term: required/],
    ["header only", { term: "202601", summary: summaryCsv.split("\n")[0], detailed: detailedCsv }, /^summary: no section rows/],
  ])("400 for %s, with a message naming the problem", async (_label, fields, message) => {
    const { status, body } = await upload(gradeForm(fields));
    expect(status).toBe(400);
    expect(body.error.code).toBe("invalid_request");
    expect(body.error.message).toMatch(message);
    expect(await testDb.db.select().from(gradeTerms)).toHaveLength(0);
  });

  it("400 for a non-multipart body", async () => {
    const response = await call(
      uploadRoute,
      await apiRequest("/api/admin/grades/upload", { method: "POST", as: admin, body: { term: "202601" } }),
    );
    expect(response.status).toBe(400);
  });

  it("a term without CRS AVG yet is recorded as unposted and not stored", async () => {
    // Blank out the CRS AVG column (index 12 in the summary header).
    const lines = summaryCsv.split(/\r?\n/).slice(0, 50);
    const unposted = [lines[0], ...lines.slice(1).map((line) => line.replace(/,(\d+\.\d+),(\d+),(\d+),(\w*)$/, ",,$2,$3,$4"))].join("\n");
    const { status, body } = await upload(gradeForm({ term: "202605", summary: unposted, detailed: detailedCsv }));
    expect(status).toBe(200);
    expect(body).toEqual({ term: "202605", rows: 0, posted: false });
    expect(await listIngestedTerms()).toEqual([]);
    expect(await testDb.db.select().from(gradeTerms)).toEqual([expect.objectContaining({ term: "202605", posted: false })]);
  });

  it("DELETE removes a term and its sections; 404 when absent", async () => {
    await upload(gradeForm({ term: "202601", summary: summaryCsv, detailed: detailedCsv }));
    const first = await call(
      deleteTermRoute,
      await apiRequest("/api/admin/grades/202601", { method: "DELETE", as: admin }),
      params({ term: "202601" }),
    );
    expect(first.status).toBe(204);
    expect(await listIngestedTerms()).toEqual([]);
    expect(await testDb.db.select().from(sectionGrades)).toHaveLength(0);
    const second = await call(
      deleteTermRoute,
      await apiRequest("/api/admin/grades/202601", { method: "DELETE", as: admin }),
      params({ term: "202601" }),
    );
    expect(second.status).toBe(404);
    const bad = await call(
      deleteTermRoute,
      await apiRequest("/api/admin/grades/x", { method: "DELETE", as: admin }),
      params({ term: "x" }),
    );
    expect(bad.status).toBe(404);
  });

  it("refresh ?sync=1 runs the (secondary) scraper under a grades job run", async () => {
    ingest.ingestNextTerm.mockResolvedValueOnce({ term: "202601", rows: 10, posted: true });
    const response = await call(
      refreshRoute,
      await apiRequest("/api/admin/grades/refresh?sync=1", { method: "POST", as: admin }),
    );
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.result).toEqual({ term: "202601", rows: 10, posted: true });
    const [run] = await testDb.db.select().from(jobRuns);
    expect(run).toMatchObject({ id: body.runId, job: "grades", ok: true, summary: { trigger: "admin", term: "202601" } });
    expect(run.finishedAt).toBeInstanceOf(Date);
  });

  it("refresh ?sync=1 reports a scraper failure (e.g. the Cloudflare challenge) as 502", async () => {
    ingest.ingestNextTerm.mockRejectedValueOnce(new Error("APEX returned a Cloudflare challenge"));
    vi.spyOn(console, "error").mockImplementationOnce(() => {});
    const response = await call(refreshRoute, await apiRequest("/api/admin/grades/refresh?sync=1", { method: "POST", as: admin }));
    expect(response.status).toBe(502);
    const [run] = await testDb.db.select().from(jobRuns);
    expect(run).toMatchObject({ ok: false, summary: { fatal: "APEX returned a Cloudflare challenge" } });
  });

  it("refresh without sync answers 202, runs in after(), and 409s while running", async () => {
    ingest.ingestNextTerm.mockResolvedValueOnce({ done: true });
    const response = await call(refreshRoute, await apiRequest("/api/admin/grades/refresh", { method: "POST", as: admin }));
    expect(response.status).toBe(202);
    expect(await response.json()).toMatchObject({ started: true });
    expect(ingest.ingestNextTerm).not.toHaveBeenCalled();

    const busy = await call(refreshRoute, await apiRequest("/api/admin/grades/refresh", { method: "POST", as: admin }));
    expect(busy.status).toBe(409);
    const during = await (await call(gradeStatusRoute, await apiRequest("/api/admin/grades/status", { as: admin }))).json();
    expect(during.running).toBe(true);

    await flushAfter();
    expect(ingest.ingestNextTerm).toHaveBeenCalledTimes(1);
    const after = await (await call(gradeStatusRoute, await apiRequest("/api/admin/grades/status", { as: admin }))).json();
    expect(after).toMatchObject({ running: false, lastRun: { job: "grades", ok: true, summary: { done: true } } });
  });
});
