import { asc } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setDbForTests } from "@/db";
import { emailLog, jobRuns, scheduleEntries, terms, watchedSections } from "@/db/schema";
import { runCleanup, runCleanupJob } from "@/lib/jobs/cleanup";
import { recentRuns, startJobRun } from "@/lib/jobs/runs";
import { getTermsCached, isTermExpired, refreshTerms, termExpiryMonth, termLabel } from "@/lib/jobs/terms";
import { createTestDb, seedUser, seedWatchedSection, truncateAll, type TestDatabase } from "../helpers/db";
import { makeTerm, startFakeGoSolar, type FakeGoSolar } from "../helpers/fake-gosolar";

vi.mock("server-only", () => ({}));

describe("term helpers", () => {
  it.each([
    ["202601", { year: 2026, month: 3 }],
    ["202605", { year: 2026, month: 7 }],
    ["202608", { year: 2026, month: 10 }],
    ["202611", { year: 2027, month: 1 }],
    ["202612", { year: 2027, month: 2 }],
  ])("%s expires on the 1st of %o", (code, expected) => {
    expect(termExpiryMonth(code)).toEqual(expected);
  });

  it.each(["", "2026", "2026081", "202600", "202613", "abcdef"])("malformed %j never expires", (code) => {
    expect(termExpiryMonth(code)).toBeNull();
    expect(isTermExpired(code, new Date("2099-01-01T00:00:00Z"))).toBe(false);
  });

  it("expires at midnight America/New_York on the expiry date", () => {
    // 202601 -> 2026-03-01 (EST, UTC-5)
    expect(isTermExpired("202601", new Date("2026-03-01T04:59:59Z"))).toBe(false);
    expect(isTermExpired("202601", new Date("2026-03-01T05:00:00Z"))).toBe(true);
    // 202608 -> 2026-10-01 (EDT, UTC-4)
    expect(isTermExpired("202608", new Date("2026-09-30T23:00:00Z"))).toBe(false);
    expect(isTermExpired("202608", new Date("2026-10-01T04:00:00Z"))).toBe(true);
    // Year rollover: 202611 -> 2027-01-01
    expect(isTermExpired("202611", new Date("2026-12-31T23:00:00Z"))).toBe(false);
    expect(isTermExpired("202611", new Date("2027-01-01T05:00:00Z"))).toBe(true);
    // Long past and not yet started.
    expect(isTermExpired("202208", new Date("2026-10-25T12:00:00Z"))).toBe(true);
    expect(isTermExpired("202701", new Date("2026-10-25T12:00:00Z"))).toBe(false);
  });

  it("labels term codes", () => {
    expect(termLabel("202601")).toBe("Spring 2026");
    expect(termLabel("202605")).toBe("Summer 2026");
    expect(termLabel("202608")).toBe("Fall 2026");
    expect(termLabel("202606")).toBe("202606");
    expect(termLabel("2026")).toBe("2026");
  });
});

describe("terms cache, cleanup and job runs (PGlite + fake GoSolar)", () => {
  let testDb: TestDatabase;
  let gs: FakeGoSolar;
  const NOW = new Date("2026-10-25T12:00:00Z");
  const daysAgo = (days: number) => new Date(NOW.getTime() - days * 24 * 60 * 60_000);

  beforeAll(async () => {
    testDb = await createTestDb();
    setDbForTests(testDb.db);
    gs = await startFakeGoSolar();
  });
  afterAll(async () => {
    setDbForTests(undefined);
    await gs.close();
    await testDb.close();
  });
  beforeEach(async () => {
    await truncateAll(testDb.db);
    gs.reset();
  });

  const getTermsRequests = () => gs.requests.filter((r) => r.path === "/classSearch/getTerms").length;

  it("refreshTerms upserts GoSolar's list with view-only flags", async () => {
    gs.setTerms([makeTerm("202701", "Spring Semester 2027"), makeTerm("202608", "Fall Semester 2026 (View Only)")]);
    await refreshTerms({ gosolar: { baseUrl: gs.url } });
    gs.setTerms([makeTerm("202701", "Spring Semester 2027 (View only)")]);
    await refreshTerms({ gosolar: { baseUrl: gs.url } });

    const rows = await testDb.db.select().from(terms).orderBy(asc(terms.code));
    expect(rows.map(({ code, description, viewOnly }) => ({ code, description, viewOnly }))).toEqual([
      { code: "202608", description: "Fall Semester 2026 (View Only)", viewOnly: true },
      { code: "202701", description: "Spring Semester 2027 (View only)", viewOnly: true },
    ]);
  });

  it("refreshTerms refuses an empty list and leaves the cache alone", async () => {
    await testDb.db.insert(terms).values({ code: "202701", description: "Spring Semester 2027", viewOnly: false });
    gs.setTerms([]);
    await expect(refreshTerms({ gosolar: { baseUrl: gs.url } })).rejects.toThrow(/no terms/);
    expect(await testDb.db.select().from(terms)).toHaveLength(1);
  });

  it("getTermsCached refreshes only when empty or stale", async () => {
    gs.setTerms([makeTerm("202701", "Spring Semester 2027")]);
    const first = await getTermsCached(60, { gosolar: { baseUrl: gs.url } });
    expect(first.map((t) => t.code)).toEqual(["202701"]);
    expect(getTermsRequests()).toBe(1);

    gs.setTerms([makeTerm("202705", "Summer Semester 2027"), makeTerm("202701", "Spring Semester 2027")]);
    expect((await getTermsCached(60, { gosolar: { baseUrl: gs.url } })).map((t) => t.code)).toEqual(["202701"]);
    expect(getTermsRequests()).toBe(1);

    const later = new Date(Date.now() + 61 * 60_000);
    const refreshed = await getTermsCached(60, { now: later, gosolar: { baseUrl: gs.url } });
    expect(refreshed.map((t) => t.code)).toEqual(["202705", "202701"]);
    expect(getTermsRequests()).toBe(2);

    // A failed refresh falls back to the stale rows.
    gs.setTerms([]);
    expect(await getTermsCached(60, { now: new Date(Date.now() + 120 * 60_000), gosolar: { baseUrl: gs.url } })).toHaveLength(2);
  });

  async function seedAcrossTerms() {
    const user = await seedUser(testDb.db);
    await testDb.db.insert(terms).values([
      { code: "202701", description: "Spring Semester 2027", viewOnly: false },
      { code: "202705", description: "Summer Semester 2027 (View only)", viewOnly: true },
      { code: "202608", description: "Fall Semester 2026", viewOnly: false },
    ]);
    // 202701 current, 202705 view-only, 202608 expired (2026-10-01), 202208 expired and not in `terms`.
    const codes = ["202701", "202705", "202608", "202208"];
    for (const [i, term] of codes.entries()) {
      await seedWatchedSection(testDb.db, user.id, { term, crn: String(81000 + i) });
      await testDb.db.insert(scheduleEntries).values({
        userId: user.id,
        term,
        crn: String(82000 + i),
        subject: "CSC",
        courseNumber: "1301",
      });
    }
    await testDb.db.insert(emailLog).values([
      { recipient: "a@student.gsu.test", type: "welcome", sentAt: daysAgo(91) },
      { recipient: "b@student.gsu.test", type: "welcome", sentAt: daysAgo(89) },
    ]);
    await testDb.db.insert(jobRuns).values([
      { job: "watcher", startedAt: daysAgo(31), finishedAt: daysAgo(31), ok: true },
      { job: "watcher", startedAt: daysAgo(29), finishedAt: daysAgo(29), ok: true },
    ]);
    return user;
  }

  it("deletes watches for view-only and expired terms, schedule entries only for view-only terms, and old logs", async () => {
    await seedAcrossTerms();

    const result = await runCleanup({ now: NOW });
    if (result.skipped) throw new Error("skipped");
    expect(result).toMatchObject({
      purgedTerms: ["202208", "202608", "202705"],
      purgedScheduleTerms: ["202705"],
      watchedSectionsDeleted: 3,
      scheduleEntriesDeleted: 1,
      emailLogDeleted: 1,
      jobRunsDeleted: 1,
    });

    expect((await testDb.db.select().from(watchedSections)).map((w) => w.term)).toEqual(["202701"]);
    // Expired but not view-only (202608 still open, 202208 no longer listed): the schedule
    // entries survive, students use them for the semester in progress.
    expect((await testDb.db.select().from(scheduleEntries)).map((e) => e.term).sort()).toEqual([
      "202208",
      "202608",
      "202701",
    ]);
    expect((await testDb.db.select().from(emailLog)).map((e) => e.recipient)).toEqual(["b@student.gsu.test"]);

    const [run] = await recentRuns("cleanup", 1);
    expect(run).toMatchObject({ ok: true, summary: { watchedSectionsDeleted: 3, scheduleEntriesDeleted: 1 } });
    expect(run.finishedAt).toBeInstanceOf(Date);

    // Idempotent.
    const again = await runCleanup({ now: NOW });
    expect(again).toMatchObject({ watchedSectionsDeleted: 0, scheduleEntriesDeleted: 0, emailLogDeleted: 0 });
  });

  it("an expired-but-open term: the watch is deleted, the schedule entry survives until the term goes view-only", async () => {
    const user = await seedUser(testDb.db);
    await testDb.db.insert(terms).values({ code: "202608", description: "Fall Semester 2026", viewOnly: false });
    await seedWatchedSection(testDb.db, user.id, { term: "202608", crn: "81000" });
    await testDb.db
      .insert(scheduleEntries)
      .values({ userId: user.id, term: "202608", crn: "82486", subject: "NUTR", courseNumber: "3100" });

    expect(await runCleanup({ now: NOW })).toMatchObject({
      purgedTerms: ["202608"],
      purgedScheduleTerms: [],
      watchedSectionsDeleted: 1,
      scheduleEntriesDeleted: 0,
    });
    expect(await testDb.db.select().from(watchedSections)).toHaveLength(0);
    expect((await testDb.db.select().from(scheduleEntries)).map((e) => e.crn)).toEqual(["82486"]);

    // Registration closes in GoSolar: now the schedule entry goes too.
    await testDb.db.update(terms).set({ viewOnly: true, description: "Fall Semester 2026 (View only)" });
    expect(await runCleanup({ now: NOW })).toMatchObject({
      purgedTerms: [],
      purgedScheduleTerms: ["202608"],
      scheduleEntriesDeleted: 1,
    });
    expect(await testDb.db.select().from(scheduleEntries)).toHaveLength(0);
  });

  it("runCleanupJob refreshes view-only flags first and still purges when the refresh fails", async () => {
    await seedAcrossTerms();
    // GoSolar now says 202701 is view-only too.
    gs.setTerms([makeTerm("202701", "Spring Semester 2027 (View only)")]);
    const result = await runCleanupJob({ now: NOW, gosolar: { baseUrl: gs.url } });
    expect(result).toMatchObject({
      termsRefresh: { ok: true, terms: 1 },
      watchedSectionsDeleted: 4,
      purgedScheduleTerms: ["202701", "202705"],
      scheduleEntriesDeleted: 2,
    });

    await truncateAll(testDb.db);
    await seedAcrossTerms();
    gs.setTerms([]);
    const failed = await runCleanupJob({ now: NOW, gosolar: { baseUrl: gs.url } });
    expect(failed).toMatchObject({ termsRefresh: { ok: false }, watchedSectionsDeleted: 3, scheduleEntriesDeleted: 1 });
    const [run] = await recentRuns("cleanup", 1);
    expect(run.ok).toBe(false);
  });

  it("startJobRun is exclusive per job until finished", async () => {
    const first = await startJobRun("cleanup");
    expect(first).not.toBeNull();
    expect(await startJobRun("cleanup")).toBeNull();
    expect(await startJobRun("watcher")).not.toBeNull();
    expect(await runCleanup({ now: NOW })).toEqual({ skipped: "locked" });
  });
});
