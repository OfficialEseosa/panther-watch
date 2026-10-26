import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { setDbForTests } from "@/db";
import { emailLog, jobRuns, terms, watchedSections, type WatchedSection } from "@/db/schema";
import { createMemoryTransport } from "@/lib/email";
import { recentRuns } from "@/lib/jobs/runs";
import { runWatcher, type RunWatcherOptions, type RunWatcherResult, type WatcherSummary } from "@/lib/watcher/run";
import { createTestDb, seedUser, seedWatchedSection, truncateAll, type TestDatabase } from "../helpers/db";
import { makeClosedSection, makeSection, startFakeGoSolar, type FakeGoSolar } from "../helpers/fake-gosolar";

vi.mock("server-only", () => ({}));

const T0 = new Date("2026-08-20T14:00:00Z");
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

describe("runWatcher (PGlite + fake GoSolar + memory email)", () => {
  let testDb: TestDatabase;
  let gs: FakeGoSolar;
  const mail = createMemoryTransport();

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
    mail.clear();
  });

  async function run(now: Date, extra: RunWatcherOptions = {}): Promise<WatcherSummary> {
    const result = await runWatcher({
      now,
      gosolar: { baseUrl: gs.url },
      transport: mail,
      appUrl: "https://pantherwatch.test",
      sendSpacingMs: 0,
      ...extra,
    });
    return ran(result);
  }

  function ran(result: RunWatcherResult): WatcherSummary {
    if (result.skipped) throw new Error("watcher run was skipped");
    return result;
  }

  async function row(id: number): Promise<WatchedSection> {
    const [found] = await testDb.db.select().from(watchedSections).where(eq(watchedSections.id, id));
    return found;
  }

  const searches = () => gs.requests.filter((r) => r.path === "/searchResults/searchResults").length;
  const setCsc1301 = (...sections: ReturnType<typeof makeSection>[]) => gs.setSections("202608", "CSC", "1301", sections);

  it("full lifecycle: closed, open (one email), still open, closed twice (re-arm), open again (second email)", async () => {
    const user = await seedUser(testDb.db);
    const watch = await seedWatchedSection(testDb.db, user.id, { crn: "80001" });

    // Closed: nothing happens.
    setCsc1301(makeClosedSection({ courseReferenceNumber: "80001" }));
    let summary = await run(at(0));
    expect(summary).toMatchObject({ watches: 1, groups: 1, sectionsChecked: 1, emailsSent: 0, errors: [] });
    expect(mail.sent).toHaveLength(0);
    expect(await row(watch.id)).toMatchObject({ notifiedAt: null, lastClosedAt: null });

    // Opens: exactly one email, claim recorded, email_log row written.
    setCsc1301(makeSection({ courseReferenceNumber: "80001", seatsAvailable: 2 }));
    summary = await run(at(3));
    expect(summary.emailsSent).toBe(1);
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].to).toBe(user.email);
    expect(mail.sent[0].subject).toContain("CRN 80001");
    expect(mail.sent[0].text).toContain("Fall 2026");
    expect(await row(watch.id)).toMatchObject({ notifiedAt: at(3), lastClosedAt: null });
    const logs = await testDb.db.select().from(emailLog);
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      type: "class_availability",
      term: "202608",
      crn: "80001",
      recipient: user.email,
      userId: user.id,
      subject: mail.sent[0].subject,
      providerMessageId: mail.sent[0].id,
    });

    // Still open: no second email.
    summary = await run(at(6));
    expect(summary.emailsSent).toBe(0);
    expect(mail.sent).toHaveLength(1);

    // Closed once: debounce starts, still notified.
    setCsc1301(makeClosedSection({ courseReferenceNumber: "80001" }));
    summary = await run(at(9));
    expect(summary.markedClosed).toBe(1);
    expect(await row(watch.id)).toMatchObject({ notifiedAt: at(3), lastClosedAt: at(9) });

    // Closed on the next run (4 min later): re-armed.
    summary = await run(at(13));
    expect(summary.rearmed).toBe(1);
    expect(await row(watch.id)).toMatchObject({ notifiedAt: null, lastClosedAt: null });

    // Reopens 13 minutes after the first alert: the old 6 h email-log cooldown swallowed this.
    setCsc1301(makeSection({ courseReferenceNumber: "80001" }));
    summary = await run(at(16));
    expect(summary.emailsSent).toBe(1);
    expect(mail.sent).toHaveLength(2);
    expect(await row(watch.id)).toMatchObject({ notifiedAt: at(16) });
    expect(await testDb.db.select().from(emailLog)).toHaveLength(2);
  });

  it("a single closed blip clears the debounce and sends nothing", async () => {
    const user = await seedUser(testDb.db);
    const watch = await seedWatchedSection(testDb.db, user.id, { crn: "80001" });

    setCsc1301(makeSection({ courseReferenceNumber: "80001" }));
    await run(at(0));
    setCsc1301(makeClosedSection({ courseReferenceNumber: "80001" }));
    await run(at(3));
    expect(await row(watch.id)).toMatchObject({ notifiedAt: at(0), lastClosedAt: at(3) });

    setCsc1301(makeSection({ courseReferenceNumber: "80001" }));
    const summary = await run(at(6));
    expect(summary).toMatchObject({ debounceCleared: 1, emailsSent: 0, rearmed: 0 });
    expect(await row(watch.id)).toMatchObject({ notifiedAt: at(0), lastClosedAt: null });
    expect(mail.sent).toHaveLength(1);

    // The next closed reading is a fresh first observation, not a re-arm.
    setCsc1301(makeClosedSection({ courseReferenceNumber: "80001" }));
    await run(at(9));
    expect(await row(watch.id)).toMatchObject({ notifiedAt: at(0), lastClosedAt: at(9) });
  });

  it("a waitlisted section with free seats is not open", async () => {
    const user = await seedUser(testDb.db);
    const watch = await seedWatchedSection(testDb.db, user.id, { crn: "80001" });
    setCsc1301(makeSection({ courseReferenceNumber: "80001", seatsAvailable: 4, waitCount: 2 }));
    await run(at(0));
    expect(mail.sent).toHaveLength(0);
    expect((await row(watch.id)).notifiedAt).toBeNull();
  });

  it("a failed group search changes nothing for that group and the other groups still run", async () => {
    const user = await seedUser(testDb.db);
    const csc = await seedWatchedSection(testDb.db, user.id, { crn: "80001" });
    const math = await seedWatchedSection(testDb.db, user.id, { crn: "80002", subject: "MATH", courseNumber: "2211" });
    setCsc1301(makeSection({ courseReferenceNumber: "80001" }));
    gs.setSections("202608", "MATH", "2211", [makeSection({ courseReferenceNumber: "80002", subject: "MATH", courseNumber: "2211" })]);
    gs.failNextSearches({ kind: "http", status: 503 });

    const summary = await run(at(0));
    expect(summary.groups).toBe(2);
    expect(summary.emailsSent).toBe(1);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]).toMatch(/^search (CSC 1301|MATH 2211) \(202608\): .*503/);

    const failedCsc = summary.errors[0].includes("CSC 1301");
    expect((await row(csc.id)).notifiedAt).toEqual(failedCsc ? null : at(0));
    expect((await row(math.id)).notifiedAt).toEqual(failedCsc ? at(0) : null);

    const [last] = await recentRuns("watcher", 1);
    expect(last).toMatchObject({ ok: false, summary: { emailsSent: 1 } });
  });

  it("an affinity failure (data:null) is also unknown, not closed", async () => {
    const user = await seedUser(testDb.db);
    const watch = await seedWatchedSection(testDb.db, user.id, {
      crn: "80001",
      notifiedAt: at(-30),
      lastClosedAt: at(-10),
    });
    setCsc1301(makeClosedSection({ courseReferenceNumber: "80001" }));
    gs.failNextSearches({ kind: "affinity" });
    const summary = await run(at(0));
    expect(summary.errors).toHaveLength(1);
    expect(summary.rearmed).toBe(0);
    expect(await row(watch.id)).toMatchObject({ notifiedAt: at(-30), lastClosedAt: at(-10) });
  });

  it("a watched section missing from the results is left untouched", async () => {
    const user = await seedUser(testDb.db);
    const armed = await seedWatchedSection(testDb.db, user.id, { crn: "80008" });
    const debouncing = await seedWatchedSection(testDb.db, user.id, {
      crn: "80009",
      notifiedAt: at(-30),
      lastClosedAt: at(-10),
    });
    setCsc1301(makeSection({ courseReferenceNumber: "80001" }));

    const summary = await run(at(0));
    expect(summary).toMatchObject({ sectionsChecked: 0, emailsSent: 0, rearmed: 0, errors: [] });
    expect(await row(armed.id)).toMatchObject({ notifiedAt: null, lastClosedAt: null });
    expect(await row(debouncing.id)).toMatchObject({ notifiedAt: at(-30), lastClosedAt: at(-10) });
  });

  it("two users watching the same CRN both get an email from one search", async () => {
    const a = await seedUser(testDb.db);
    const b = await seedUser(testDb.db);
    await seedWatchedSection(testDb.db, a.id, { crn: "80001" });
    await seedWatchedSection(testDb.db, b.id, { crn: "80001" });
    setCsc1301(makeSection({ courseReferenceNumber: "80001" }));

    const summary = await run(at(0));
    expect(summary).toMatchObject({ groups: 1, sectionsChecked: 1, emailsSent: 2 });
    expect(searches()).toBe(1);
    expect(mail.sent.map((m) => m.to).sort()).toEqual([a.email, b.email].sort());
  });

  it("one user watching two CRNs of the same course: one search, two emails", async () => {
    const user = await seedUser(testDb.db);
    await seedWatchedSection(testDb.db, user.id, { crn: "80001" });
    await seedWatchedSection(testDb.db, user.id, { crn: "80002" });
    setCsc1301(
      makeSection({ courseReferenceNumber: "80001" }),
      makeSection({ courseReferenceNumber: "80002" }),
      makeSection({ courseReferenceNumber: "80003" }),
    );

    const summary = await run(at(0));
    expect(summary).toMatchObject({ groups: 1, sectionsChecked: 2, emailsSent: 2 });
    expect(searches()).toBe(1);
    expect(mail.sent.map((m) => m.subject).sort()).toEqual([
      expect.stringContaining("CRN 80001"),
      expect.stringContaining("CRN 80002"),
    ]);
  });

  it("a failed send releases the claim and the next run retries", async () => {
    const user = await seedUser(testDb.db);
    const watch = await seedWatchedSection(testDb.db, user.id, { crn: "80001" });
    setCsc1301(makeSection({ courseReferenceNumber: "80001" }));
    mail.failNext("Resend is down");

    let summary = await run(at(0));
    expect(summary).toMatchObject({ emailsSent: 0, emailsFailed: 1 });
    expect(summary.errors[0]).toMatch(/CRN 80001 notify: Resend is down/);
    expect(await row(watch.id)).toMatchObject({ notifiedAt: null });
    expect(await testDb.db.select().from(emailLog)).toHaveLength(0);

    summary = await run(at(3));
    expect(summary).toMatchObject({ emailsSent: 1, emailsFailed: 0, errors: [] });
    expect(mail.sent).toHaveLength(1);
    expect(await row(watch.id)).toMatchObject({ notifiedAt: at(3) });
  });

  it("does not claim or send when the email budget is spent", async () => {
    const user = await seedUser(testDb.db);
    const watch = await seedWatchedSection(testDb.db, user.id, { crn: "80001" });
    await testDb.db.insert(emailLog).values(
      Array.from({ length: 95 }, () => ({ recipient: "someone@student.gsu.test", type: "welcome" as const, sentAt: at(-60) })),
    );
    setCsc1301(makeSection({ courseReferenceNumber: "80001" }));

    const summary = await run(at(0));
    expect(summary).toMatchObject({ budgetAtStart: 0, emailsSent: 0, skippedBudget: 1 });
    expect(mail.sent).toHaveLength(0);
    expect((await row(watch.id)).notifiedAt).toBeNull();

    // Yesterday's emails do not count against today.
    const summaryTomorrow = await run(at(24 * 60));
    expect(summaryTomorrow).toMatchObject({ budgetAtStart: 90, emailsSent: 1 });
  });

  it("stops at the budget mid-run", async () => {
    const user = await seedUser(testDb.db);
    for (const crn of ["80001", "80002", "80003"]) await seedWatchedSection(testDb.db, user.id, { crn });
    await testDb.db.insert(emailLog).values(
      Array.from({ length: 88 }, () => ({ recipient: "someone@student.gsu.test", type: "welcome" as const, sentAt: at(-60) })),
    );
    setCsc1301(...["80001", "80002", "80003"].map((crn) => makeSection({ courseReferenceNumber: crn })));

    const summary = await run(at(0));
    expect(summary).toMatchObject({ budgetAtStart: 2, emailsSent: 2, skippedBudget: 1 });
  });

  it("skips view-only and expired terms without searching", async () => {
    const user = await seedUser(testDb.db);
    await testDb.db.insert(terms).values({ code: "202608", description: "Fall Semester 2026 (View only)", viewOnly: true });
    await seedWatchedSection(testDb.db, user.id, { crn: "80001" });
    await seedWatchedSection(testDb.db, user.id, { crn: "80002", term: "202601" }); // expired 2026-03-01
    setCsc1301(makeSection({ courseReferenceNumber: "80001" }));
    gs.setSections("202601", "CSC", "1301", [makeSection({ courseReferenceNumber: "80002", term: "202601" })]);

    const summary = await run(at(0));
    expect(summary).toMatchObject({ watches: 0, groups: 0, skippedTerms: 2, emailsSent: 0 });
    expect(searches()).toBe(0);
  });

  it("uses the cached term description in the email", async () => {
    const user = await seedUser(testDb.db);
    await testDb.db.insert(terms).values({ code: "202608", description: "Fall Semester 2026", viewOnly: false });
    await seedWatchedSection(testDb.db, user.id, { crn: "80001" });
    setCsc1301(makeSection({ courseReferenceNumber: "80001" }));
    await run(at(0));
    expect(mail.sent[0].text).toContain("Fall Semester 2026");
  });

  it("with deadlineMs: 0 starts no group and carries every group over", async () => {
    const user = await seedUser(testDb.db);
    await seedWatchedSection(testDb.db, user.id, { crn: "80001" });
    await seedWatchedSection(testDb.db, user.id, { crn: "80002", subject: "MATH", courseNumber: "2211" });
    await seedWatchedSection(testDb.db, user.id, { crn: "80003", subject: "ENGL", courseNumber: "1101" });

    const summary = await run(at(0), { deadlineMs: 0 });
    expect(summary).toMatchObject({ groups: 3, carriedOver: 3, sectionsChecked: 0, emailsSent: 0 });
    expect(searches()).toBe(0);
  });

  it("returns skipped while another run is active, and ignores a stale crashed run", async () => {
    const user = await seedUser(testDb.db);
    await seedWatchedSection(testDb.db, user.id, { crn: "80001" });
    setCsc1301(makeSection({ courseReferenceNumber: "80001" }));

    const [active] = await testDb.db.insert(jobRuns).values({ job: "watcher" }).returning();
    expect(await runWatcher({ now: at(0), gosolar: { baseUrl: gs.url }, transport: mail })).toEqual({ skipped: "locked" });
    expect(searches()).toBe(0);

    // The same row, started 10 minutes ago and never finished, no longer blocks.
    await testDb.db
      .update(jobRuns)
      .set({ startedAt: new Date(Date.now() - 10 * 60_000) })
      .where(eq(jobRuns.id, active.id));
    const summary = await run(at(0));
    expect(summary.emailsSent).toBe(1);

    const [latest] = await recentRuns("watcher", 1);
    expect(latest.id).toBe(summary.jobRunId);
    expect(latest.finishedAt).toBeInstanceOf(Date);
    expect(latest.ok).toBe(true);
    expect(latest.summary).toMatchObject({
      groups: 1,
      sectionsChecked: 1,
      emailsSent: 1,
      rearmed: 0,
      skippedBudget: 0,
      carriedOver: 0,
      errors: [],
    });
    // Counts only: no recipient addresses in the summary.
    expect(JSON.stringify(latest.summary)).not.toContain(user.email);
  });
});
