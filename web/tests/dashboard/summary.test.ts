import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setDbForTests } from "@/db";
import { scheduleEntries, terms } from "@/db/schema";
import { loadDashboardSummary } from "@/components/dashboard/summary.server";
import { createTestDb, seedUser, seedWatchedSection, truncateAll, type TestDatabase } from "../helpers/db";

vi.mock("server-only", () => ({}));

let testDb: TestDatabase;
beforeAll(async () => {
  testDb = await createTestDb();
  setDbForTests(testDb.db);
});
afterAll(async () => {
  setDbForTests(undefined);
  await testDb.close();
});
beforeEach(() => truncateAll(testDb.db));

async function schedule(userId: string, term: string, crns: string[]) {
  await testDb.db
    .insert(scheduleEntries)
    .values(crns.map((crn) => ({ userId, term, crn, subject: "CSC", courseNumber: "1301" })));
}

describe("loadDashboardSummary: active schedule term", () => {
  it("picks the newest term that is not view-only, even when it has expired by date", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-26T16:00:00Z"), toFake: ["Date"] });
    try {
      const user = await seedUser(testDb.db);
      // 202608 (Fall 2026) is past its 2-month expiry on this date but is the semester in progress.
      await schedule(user.id, "202601", ["10001"]);
      await schedule(user.id, "202608", ["20001", "20002"]);
      await schedule(user.id, "202701", ["30001"]);
      await testDb.db.insert(terms).values([
        { code: "202701", description: "Spring Semester 2027 (View only)", viewOnly: true },
        { code: "202608", description: "Fall Semester 2026", viewOnly: false },
      ]);
      const summary = await loadDashboardSummary(user.id);
      expect(summary.scheduled).toEqual({ count: 2, termCode: "202608", termLabel: "Fall 2026" });
      expect(summary.hasSchedule).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it("treats every term as open when the terms cache is empty", async () => {
    const user = await seedUser(testDb.db);
    await schedule(user.id, "202601", ["10001"]);
    await schedule(user.id, "202608", ["20001"]);
    const summary = await loadDashboardSummary(user.id);
    expect(summary.scheduled.termCode).toBe("202608");
    expect(summary.scheduled.count).toBe(1);
  });

  it("is empty when every scheduled term is view-only", async () => {
    const user = await seedUser(testDb.db);
    await schedule(user.id, "202608", ["20001"]);
    await testDb.db.insert(terms).values({ code: "202608", description: "Fall Semester 2026 (View only)", viewOnly: true });
    const summary = await loadDashboardSummary(user.id);
    expect(summary.scheduled).toEqual({ count: 0, termCode: null, termLabel: null });
    expect(summary.hasSchedule).toBe(true);
  });

  it("keeps the tracked count on non-expired watches", async () => {
    vi.useFakeTimers({ now: new Date("2026-10-26T16:00:00Z"), toFake: ["Date"] });
    try {
      const user = await seedUser(testDb.db);
      await seedWatchedSection(testDb.db, user.id, { term: "202608" });
      await seedWatchedSection(testDb.db, user.id, { term: "202701" });
      expect((await loadDashboardSummary(user.id)).tracked).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
