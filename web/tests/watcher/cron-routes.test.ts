import { NextRequest } from "next/server";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setDbForTests } from "@/db";
import { jobRuns, terms } from "@/db/schema";
import { createMemoryTransport, setDefaultEmailTransport } from "@/lib/email";
import { setJobsGoSolarOptionsForTests } from "@/lib/jobs/gosolar-options";
import { recentRuns } from "@/lib/jobs/runs";
import { createTestDb, seedUser, seedWatchedSection, truncateAll, type TestDatabase } from "../helpers/db";
import { makeSection, makeTerm, startFakeGoSolar, type FakeGoSolar } from "../helpers/fake-gosolar";

// `after()` needs Next's request scope, which a direct handler call does not have. Queue the
// callbacks instead so the test can run them, as Next would once the response is sent.
const afterQueue = vi.hoisted(() => [] as Array<() => unknown>);
vi.mock("server-only", () => ({}));
vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  return {
    ...actual,
    after: (task: (() => unknown) | Promise<unknown>) => {
      afterQueue.push(typeof task === "function" ? task : () => task);
    },
  };
});

const SECRET = "test-cron-secret-0123456789abcdef";
const TEST_ENV = {
  DATABASE_URL: "postgres://unused@localhost:5432/never",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-client-secret",
  JWT_SECRET: "x".repeat(40),
  RESEND_API_KEY: "re_test",
  CRON_SECRET: SECRET,
  APP_URL: "http://localhost:3000",
};

const watchRoute = await import("@/app/api/cron/watch/route");
const cleanupRoute = await import("@/app/api/cron/cleanup/route");
const gradesRoute = await import("@/app/api/cron/grades/route");
const syllabiRoute = await import("@/app/api/cron/syllabi/route");

function request(path: string, { method = "POST", secret = SECRET as string | null } = {}): NextRequest {
  const headers: Record<string, string> = {};
  if (secret !== null) headers.authorization = `Bearer ${secret}`;
  return new NextRequest(`http://localhost:3000${path}`, { method, headers });
}

async function drainAfter(): Promise<void> {
  while (afterQueue.length > 0) await afterQueue.shift()?.();
}

describe("cron routes", () => {
  let testDb: TestDatabase;
  let gs: FakeGoSolar;
  const mail = createMemoryTransport();

  beforeAll(async () => {
    for (const [key, value] of Object.entries(TEST_ENV)) vi.stubEnv(key, value);
    testDb = await createTestDb();
    setDbForTests(testDb.db);
    gs = await startFakeGoSolar();
    setJobsGoSolarOptionsForTests({ baseUrl: gs.url });
    setDefaultEmailTransport(mail);
  });
  afterAll(async () => {
    setDefaultEmailTransport(null);
    setJobsGoSolarOptionsForTests(undefined);
    setDbForTests(undefined);
    vi.unstubAllEnvs();
    await gs.close();
    await testDb.close();
  });
  beforeEach(async () => {
    await truncateAll(testDb.db);
    gs.reset();
    mail.clear();
    afterQueue.length = 0;
  });

  it("exports maxDuration = 300 on every cron route", () => {
    for (const route of [watchRoute, cleanupRoute, gradesRoute, syllabiRoute]) expect(route.maxDuration).toBe(300);
  });

  describe("POST /api/cron/watch", () => {
    // 202701 so the real clock (the routes take no `now`) does not treat the term as expired.
    async function seedOpenWatch() {
      const user = await seedUser(testDb.db);
      await seedWatchedSection(testDb.db, user.id, { term: "202701", crn: "80001" });
      gs.setSections("202701", "CSC", "1301", [makeSection({ term: "202701", courseReferenceNumber: "80001" })]);
      return user;
    }

    it("rejects a missing or wrong secret with 401 and runs nothing", async () => {
      expect((await watchRoute.POST(request("/api/cron/watch", { secret: null }))).status).toBe(401);
      expect((await watchRoute.POST(request("/api/cron/watch", { secret: "wrong" }))).status).toBe(401);
      expect((await watchRoute.POST(request("/api/cron/watch?sync=1", { secret: "wrong" }))).status).toBe(401);
      expect(afterQueue).toHaveLength(0);
      expect(await recentRuns("watcher")).toHaveLength(0);
    });

    it("answers 202 at once and runs the watcher in after()", async () => {
      const user = await seedOpenWatch();
      const response = await watchRoute.POST(request("/api/cron/watch"));
      expect(response.status).toBe(202);
      expect(await response.json()).toEqual({ accepted: true });
      expect(mail.sent).toHaveLength(0);

      expect(afterQueue).toHaveLength(1);
      await drainAfter();
      expect(mail.sent.map((m) => m.to)).toEqual([user.email]);
      const [run] = await recentRuns("watcher", 1);
      expect(run).toMatchObject({ ok: true, summary: { emailsSent: 1 } });
    });

    it("?sync=1 awaits the run and returns its summary", async () => {
      await seedOpenWatch();
      const response = await watchRoute.POST(request("/api/cron/watch?sync=1"));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        groups: 1,
        sectionsChecked: 1,
        emailsSent: 1,
        rearmed: 0,
        skippedBudget: 0,
        carriedOver: 0,
        errors: [],
      });
      expect(afterQueue).toHaveLength(0);
      expect(mail.sent[0].subject).toContain("CRN 80001");
      expect(mail.sent[0].html).toContain("http://localhost:3000");
    });

    it("?sync=1 reports skipped while another run holds the lock", async () => {
      await testDb.db.insert(jobRuns).values({ job: "watcher" });
      const response = await watchRoute.POST(request("/api/cron/watch?sync=1"));
      expect(await response.json()).toEqual({ skipped: "locked" });
    });
  });

  describe("/api/cron/cleanup", () => {
    async function seed() {
      const user = await seedUser(testDb.db);
      await seedWatchedSection(testDb.db, user.id, { term: "202208", crn: "81001" }); // long expired
      await seedWatchedSection(testDb.db, user.id, { term: "202701", crn: "81002" });
      gs.setTerms([makeTerm("202701", "Spring Semester 2027")]);
    }

    it("GET (Vercel's backup cron) refreshes terms, purges and returns the summary", async () => {
      await seed();
      const response = await cleanupRoute.GET(request("/api/cron/cleanup", { method: "GET" }));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        purgedTerms: ["202208"],
        watchedSectionsDeleted: 1,
        termsRefresh: { ok: true, terms: 1 },
      });
      expect(await testDb.db.select().from(terms)).toHaveLength(1);
    });

    it("POST (pg_cron) does the same", async () => {
      await seed();
      const response = await cleanupRoute.POST(request("/api/cron/cleanup"));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ watchedSectionsDeleted: 1 });
    });

    it("rejects a wrong secret on GET and POST", async () => {
      await seed();
      expect((await cleanupRoute.GET(request("/api/cron/cleanup", { method: "GET", secret: "nope" }))).status).toBe(401);
      expect((await cleanupRoute.POST(request("/api/cron/cleanup", { secret: null }))).status).toBe(401);
      expect(await recentRuns("cleanup")).toHaveLength(0);
    });
  });

  describe("/api/cron/grades and /api/cron/syllabi", () => {
    it("reject a wrong secret", async () => {
      expect((await gradesRoute.POST(request("/api/cron/grades", { secret: "nope" }))).status).toBe(401);
      expect((await syllabiRoute.POST(request("/api/cron/syllabi", { secret: null }))).status).toBe(401);
    });

    it("grades answers 202 and defers the ingest to after()", async () => {
      const response = await gradesRoute.POST(request("/api/cron/grades"));
      expect(response.status).toBe(202);
      // Not drained: the ingest would call GSU's APEX server.
      expect(afterQueue).toHaveLength(1);
    });

    it("syllabi ?sync=1 skips view-only terms and records a job run", async () => {
      await testDb.db.insert(terms).values({ code: "202608", description: "Fall Semester 2026 (View only)", viewOnly: true });
      const response = await syllabiRoute.POST(request("/api/cron/syllabi?sync=1"));
      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({ terms: [], errors: [] });
      const [run] = await recentRuns("syllabi", 1);
      expect(run).toMatchObject({ ok: true });
    });
  });
});
