/**
 * Seat-alert edge cases: every scenario in docs/audit-2026-10/06-seat-alert-edge-cases.md, end
 * to end through the REAL route handlers (track / untrack / account delete / Google sign-in /
 * tracked details) and the REAL `runWatcher` / `runCleanup`, on PGlite + the fake GoSolar +
 * the memory email transport. Each test asserts what was sent (`mail.sent`), what was logged
 * (`email_log`) and the `watched_sections` state.
 *
 * Clock: route handlers run on the real clock (term 202701 is open until 2027-03-01); watcher
 * runs pass `now = at(minutes)` from T0 so re-arm timing is exact.
 */
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/session")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  ...(await import("../helpers/session")).nextServerMock,
}));

import { setDbForTests } from "@/db";
import { emailLog, terms, users, watchedSections, type User, type WatchedSection } from "@/db/schema";
import { DELETE as accountDelete } from "@/app/api/account/route";
import { GET as googleCallback } from "@/app/api/auth/google/callback/route";
import { GET as detailsGet } from "@/app/api/watches/details/route";
import { DELETE as watchesDelete, POST as watchesPost } from "@/app/api/watches/route";
import { setGoSolarOptionsForTests } from "@/lib/courses";
import { createMemoryTransport, setDefaultEmailTransport } from "@/lib/email";
import type { CourseData } from "@/lib/gosolar";
import { runCleanup } from "@/lib/jobs/cleanup";
import { runWatcher, type RunWatcherOptions, type WatcherSummary } from "@/lib/watcher/run";
import { UNLISTED_AFTER_RUNS } from "@/lib/watcher/state";
import type { Watch, WatchDetails } from "@/lib/watches";
import { createTestDb, seedUser, truncateAll, type TestDatabase } from "../helpers/db";
import { makeClosedSection, makeSection, startFakeGoSolar, type FakeGoSolar } from "../helpers/fake-gosolar";
import { callbackRequest, mockGoogle } from "../helpers/google";
import { afterTasks, apiRequest, call, flushAfter, sessionCookie } from "../helpers/session";
import { withFakeNow } from "../helpers/time";

/** Spring 2027: registrable, seat alerts run until 2027-03-01. */
const TERM = "202701";
/** Fall 2027, for the two-terms scenario. */
const TERM_B = "202708";
const T0 = new Date("2026-11-02T14:00:00Z");
/** Watcher clock: T0 + minutes. Runs are 3 minutes apart, like the cron. */
const at = (minutes: number) => new Date(T0.getTime() + minutes * 60_000);

let testDb: TestDatabase;
let gs: FakeGoSolar;
const mail = createMemoryTransport();

beforeAll(async () => {
  testDb = await createTestDb();
  setDbForTests(testDb.db);
  gs = await startFakeGoSolar();
  setGoSolarOptionsForTests({ baseUrl: gs.url });
  setDefaultEmailTransport(mail);
});
afterAll(async () => {
  setDefaultEmailTransport(null);
  setGoSolarOptionsForTests(undefined);
  setDbForTests(undefined);
  await gs.close();
  await testDb.close();
});
beforeEach(async () => {
  await truncateAll(testDb.db);
  gs.reset();
  mail.clear();
  afterTasks.length = 0;
  await testDb.db.insert(terms).values([
    { code: TERM, description: "Spring Semester 2027", viewOnly: false },
    { code: TERM_B, description: "Fall Semester 2027", viewOnly: false },
  ]);
});

// ------------------------------------------------------------------------------ helpers

const open = (crn: string, term = TERM, extra: Partial<CourseData> = {}) =>
  makeSection({ term, courseReferenceNumber: crn, seatsAvailable: 3, waitCount: 0, ...extra });
const closed = (crn: string, term = TERM) => makeClosedSection({ term, courseReferenceNumber: crn });
/** What GoSolar lists for CSC 1301 in `term` from now on. */
const gosolarLists = (term: string, ...sections: CourseData[]) => gs.setSections(term, "CSC", "1301", sections);

const watchBody = (crn: string, term = TERM) => ({
  term,
  crn,
  subject: "CSC",
  courseNumber: "1301",
  courseTitle: "Principles of Computer Science I",
  instructor: "Instructor, Test",
});

/** POST /api/watches as `user` (the Track button). */
async function track(user: User, crn: string, term = TERM) {
  const response = await call(watchesPost, await apiRequest("/api/watches", { method: "POST", as: user, body: watchBody(crn, term) }));
  expect([200, 201]).toContain(response.status);
  return { status: response.status, ...((await response.json()) as { watch: Watch; created: boolean; openNow: boolean }) };
}

/** DELETE /api/watches as `user` (the Remove button). */
async function untrack(user: User, crn: string, term = TERM): Promise<boolean> {
  const response = await call(
    watchesDelete,
    await apiRequest(`/api/watches?term=${term}&crn=${crn}`, { method: "DELETE", as: user }),
  );
  expect(response.status).toBe(200);
  return ((await response.json()) as { removed: boolean }).removed;
}

async function run(minutes: number, extra: RunWatcherOptions = {}): Promise<WatcherSummary> {
  const result = await runWatcher({
    now: at(minutes),
    gosolar: { baseUrl: gs.url },
    transport: mail,
    appUrl: "https://pantherwatch.test",
    sendSpacingMs: 0,
    ...extra,
  });
  if (result.skipped) throw new Error("watcher run was skipped");
  return result;
}

async function watchRow(user: User, crn: string, term = TERM): Promise<WatchedSection | undefined> {
  const rows = await testDb.db.select().from(watchedSections).where(eq(watchedSections.userId, user.id));
  return rows.find((row) => row.crn === crn && row.term === term);
}

const alerts = () => testDb.db.select().from(emailLog).where(eq(emailLog.type, "class_availability"));
const searchCount = () => gs.requests.filter((r) => r.path === "/searchResults/searchResults").length;

// ------------------------------------------------------------------------------ scenarios

describe("seat-alert edge cases (docs/audit-2026-10/06)", () => {
  it("S1: tracking an OPEN section sends nothing; it fills (2 closed runs) and reopens -> exactly 1 email", async () => {
    const user = await seedUser(testDb.db);
    gosolarLists(TERM, open("80001"));

    const added = await track(user, "80001");
    expect(added).toMatchObject({ status: 201, created: true, openNow: true });
    expect((await watchRow(user, "80001"))?.notifiedAt).toBeInstanceOf(Date);

    // Next run: still open, no email.
    expect(await run(0)).toMatchObject({ emailsSent: 0, sectionsChecked: 1 });
    expect(mail.sent).toHaveLength(0);

    // Fills: first closed run marks, second (3 min later) re-arms.
    gosolarLists(TERM, closed("80001"));
    expect(await run(3)).toMatchObject({ markedClosed: 1, emailsSent: 0 });
    expect(await run(6)).toMatchObject({ rearmed: 1, emailsSent: 0 });
    expect(await watchRow(user, "80001")).toMatchObject({ notifiedAt: null, lastClosedAt: null });

    // Reopens: one alert.
    gosolarLists(TERM, open("80001"));
    expect(await run(9)).toMatchObject({ emailsSent: 1 });
    expect(await run(12)).toMatchObject({ emailsSent: 0 });
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0]).toMatchObject({ to: user.email });
    expect(mail.sent[0].subject).toContain("CRN 80001");
    expect(await alerts()).toHaveLength(1);
    expect(await watchRow(user, "80001")).toMatchObject({ notifiedAt: at(9) });
  });

  it("S2: closed -> open (1) -> still open (0) -> one closed blip (0) -> two closed runs re-arm -> open (1): total 2", async () => {
    const user = await seedUser(testDb.db);
    gosolarLists(TERM, closed("80001"));
    expect(await track(user, "80001")).toMatchObject({ created: true, openNow: false, watch: { notifiedAt: null } });

    expect(await run(0)).toMatchObject({ emailsSent: 0 });
    gosolarLists(TERM, open("80001"));
    expect(await run(3)).toMatchObject({ emailsSent: 1 });
    expect(await run(6)).toMatchObject({ emailsSent: 0 });

    // One closed reading, then open again: the blip neither re-arms nor sends.
    gosolarLists(TERM, closed("80001"));
    expect(await run(9)).toMatchObject({ markedClosed: 1, emailsSent: 0 });
    gosolarLists(TERM, open("80001"));
    expect(await run(12)).toMatchObject({ debounceCleared: 1, emailsSent: 0, rearmed: 0 });

    // Two consecutive closed runs: re-armed.
    gosolarLists(TERM, closed("80001"));
    expect(await run(15)).toMatchObject({ markedClosed: 1, emailsSent: 0 });
    expect(await run(18)).toMatchObject({ rearmed: 1, emailsSent: 0 });

    gosolarLists(TERM, open("80001"));
    expect(await run(21)).toMatchObject({ emailsSent: 1 });
    expect(mail.sent).toHaveLength(2);
    expect((await alerts()).map((log) => log.sentAt)).toEqual([at(3), at(21)]);
  });

  it("S2b: a second closed reading less than 2 minutes after the first (manual re-trigger) does not re-arm", async () => {
    const user = await seedUser(testDb.db);
    gosolarLists(TERM, closed("80001"));
    await track(user, "80001");
    gosolarLists(TERM, open("80001"));
    await run(0);
    gosolarLists(TERM, closed("80001"));
    await run(3);
    expect(await run(4)).toMatchObject({ rearmed: 0 });
    gosolarLists(TERM, open("80001"));
    expect(await run(5)).toMatchObject({ emailsSent: 0 });
    expect(mail.sent).toHaveLength(1);
  });

  it("S3: track -> untrack -> track again while open sends nothing; tracked again while closed, then opens -> 1 email", async () => {
    const user = await seedUser(testDb.db);
    gosolarLists(TERM, open("80001"));

    expect(await track(user, "80001")).toMatchObject({ created: true, openNow: true });
    expect(await run(0)).toMatchObject({ emailsSent: 0 });
    expect(await untrack(user, "80001")).toBe(true);

    expect(await track(user, "80001")).toMatchObject({ created: true, openNow: true });
    expect(await run(3)).toMatchObject({ emailsSent: 0 });
    expect(await untrack(user, "80001")).toBe(true);
    expect(mail.sent).toHaveLength(0);

    gosolarLists(TERM, closed("80001"));
    expect(await track(user, "80001")).toMatchObject({ created: true, openNow: false });
    expect(await run(6)).toMatchObject({ emailsSent: 0 });
    gosolarLists(TERM, open("80001"));
    expect(await run(9)).toMatchObject({ emailsSent: 1 });
    expect(mail.sent).toHaveLength(1);
    expect(await testDb.db.select().from(watchedSections)).toHaveLength(1);
  });

  it("S4: untracked after the watcher loaded its rows but before the claim -> no email, nothing logged", async () => {
    const user = await seedUser(testDb.db);
    gosolarLists(TERM, closed("80001"));
    await track(user, "80001");
    gosolarLists(TERM, open("80001"));

    const hook = vi.fn(async () => {
      expect(await untrack(user, "80001")).toBe(true);
    });
    const summary = await run(0, { beforeClaim: hook });
    expect(hook).toHaveBeenCalledTimes(1);
    expect(summary).toMatchObject({ emailsSent: 0, emailsFailed: 0, claimsLost: 1, errors: [] });
    expect(mail.sent).toHaveLength(0);
    expect(await alerts()).toHaveLength(0);
    expect(await testDb.db.select().from(watchedSections)).toHaveLength(0);
  });

  it("S5a: two users tracking the same CRN -> one search, 2 emails (one each)", async () => {
    const a = await seedUser(testDb.db);
    const b = await seedUser(testDb.db);
    gosolarLists(TERM, closed("80001"));
    await track(a, "80001");
    await track(b, "80001");
    gosolarLists(TERM, open("80001"));
    gs.requests.length = 0;

    expect(await run(0)).toMatchObject({ groups: 1, emailsSent: 2 });
    expect(searchCount()).toBe(1);
    expect(mail.sent.map((m) => m.to).sort()).toEqual([a.email, b.email].sort());
    expect((await alerts()).map((log) => log.userId).sort()).toEqual([a.id, b.id].sort());
  });

  it("S5b: one user tracking two CRNs of the same course -> one search, 2 emails", async () => {
    const user = await seedUser(testDb.db);
    gosolarLists(TERM, closed("80001"), closed("80002"), open("80003"));
    await track(user, "80001");
    await track(user, "80002");
    gosolarLists(TERM, open("80001"), open("80002"), open("80003"));
    gs.requests.length = 0;

    expect(await run(0)).toMatchObject({ groups: 1, sectionsChecked: 2, emailsSent: 2 });
    expect(searchCount()).toBe(1);
    expect(mail.sent.map((m) => m.subject).sort()).toEqual([
      expect.stringContaining("CRN 80001"),
      expect.stringContaining("CRN 80002"),
    ]);
  });

  it("S6: seats free while a waitlist exists -> no email; waitlist drops to 0 with seats -> 1 email", async () => {
    const user = await seedUser(testDb.db);
    gosolarLists(TERM, open("80001", TERM, { seatsAvailable: 2, waitCount: 4 }));
    expect(await track(user, "80001")).toMatchObject({ openNow: false });

    expect(await run(0)).toMatchObject({ emailsSent: 0 });
    expect(await run(3)).toMatchObject({ emailsSent: 0 });
    expect((await watchRow(user, "80001"))?.notifiedAt).toBeNull();

    gosolarLists(TERM, open("80001", TERM, { seatsAvailable: 2, waitCount: 0 }));
    expect(await run(6)).toMatchObject({ emailsSent: 1 });
    expect(mail.sent).toHaveLength(1);
  });

  it("S7: the user's email changed between tracking and the alert -> sent to the new address", async () => {
    const user = await seedUser(testDb.db, { email: "old@student.gsu.test" });
    gosolarLists(TERM, closed("80001"));
    await track(user, "80001");
    await testDb.db.update(users).set({ email: "new@student.gsu.test" }).where(eq(users.id, user.id));
    gosolarLists(TERM, open("80001"));

    expect(await run(0)).toMatchObject({ emailsSent: 1 });
    expect(mail.sent.map((m) => m.to)).toEqual(["new@student.gsu.test"]);
    expect(await alerts()).toEqual([expect.objectContaining({ recipient: "new@student.gsu.test", userId: user.id })]);
  });

  it("S7b: an email change after the run loaded its rows (just before the claim) still wins", async () => {
    const user = await seedUser(testDb.db, { email: "old@student.gsu.test" });
    gosolarLists(TERM, closed("80001"));
    await track(user, "80001");
    gosolarLists(TERM, open("80001"));

    await run(0, {
      beforeClaim: async () => {
        await testDb.db.update(users).set({ email: "newest@student.gsu.test" }).where(eq(users.id, user.id));
      },
    });
    expect(mail.sent.map((m) => m.to)).toEqual(["newest@student.gsu.test"]);
    expect((await alerts())[0].recipient).toBe("newest@student.gsu.test");
  });

  it("S8: account deleted -> watches gone, goodbye exactly once, the watcher sends nothing for that user", async () => {
    const gone = await seedUser(testDb.db, { email: "gone@student.gsu.test" });
    const stays = await seedUser(testDb.db, { email: "stays@student.gsu.test" });
    gosolarLists(TERM, closed("80001"));
    await track(gone, "80001");
    await track(stays, "80001");

    const cookie = await sessionCookie(gone);
    const deleted = await call(accountDelete, await apiRequest("/api/account", { method: "DELETE", cookie }));
    expect(deleted.status).toBe(200);
    // A second delete with the old cookie (double click, second tab) is refused: no second goodbye.
    const again = await call(accountDelete, await apiRequest("/api/account", { method: "DELETE", cookie }));
    expect(again.status).toBe(401);

    expect(mail.sent.map((m) => m.to)).toEqual(["gone@student.gsu.test"]);
    expect(await testDb.db.select().from(emailLog).where(eq(emailLog.type, "goodbye"))).toHaveLength(1);
    expect(await testDb.db.select().from(watchedSections).where(eq(watchedSections.userId, gone.id))).toEqual([]);

    gosolarLists(TERM, open("80001"));
    expect(await run(0)).toMatchObject({ watches: 1, emailsSent: 1 });
    expect(mail.sent.map((m) => m.to)).toEqual(["gone@student.gsu.test", "stays@student.gsu.test"]);
  });

  it("S8b: account deleted mid-run (after load, before claim) -> no alert to that user", async () => {
    const user = await seedUser(testDb.db, { email: "midrun@student.gsu.test" });
    gosolarLists(TERM, closed("80001"));
    await track(user, "80001");
    gosolarLists(TERM, open("80001"));
    const cookie = await sessionCookie(user);

    const summary = await run(0, {
      beforeClaim: async () => {
        const response = await call(accountDelete, await apiRequest("/api/account", { method: "DELETE", cookie }));
        expect(response.status).toBe(200);
      },
    });
    expect(summary).toMatchObject({ emailsSent: 0, claimsLost: 1 });
    // Only the goodbye went out.
    expect(mail.sent).toHaveLength(1);
    expect(mail.sent[0].tags).toContainEqual({ name: "type", value: "GOODBYE" });
    expect(await alerts()).toHaveLength(0);
  });

  describe("S9: welcome email", () => {
    let google: ReturnType<typeof mockGoogle>;
    beforeEach(() => {
      google = mockGoogle();
    });
    afterEach(() => google.restore());

    const signIn = async () => {
      const response = await googleCallback(callbackRequest());
      await flushAfter();
      expect(response.headers.get("location")).toBe("http://localhost:3000/dashboard");
    };
    const welcomes = () => testDb.db.select().from(emailLog).where(eq(emailLog.type, "welcome"));

    it("S9: first login sends 1 welcome; second login sends 0; email-linking an existing row sends 0", async () => {
      google.as({ sub: "g-first", email: "first@student.gsu.test", name: "First" });
      await signIn();
      expect(mail.sent.map((m) => m.to)).toEqual(["first@student.gsu.test"]);
      expect(await welcomes()).toHaveLength(1);

      await signIn();
      expect(mail.sent).toHaveLength(1);

      await seedUser(testDb.db, { email: "legacy@student.gsu.test", googleSub: null });
      google.as({ sub: "g-legacy", email: "legacy@student.gsu.test" });
      await signIn();
      expect(mail.sent).toHaveLength(1);
      expect(await welcomes()).toHaveLength(1);
    });
  });

  it("S10a: transport failure -> claim released (notified_at null) -> the next run sends", async () => {
    const user = await seedUser(testDb.db);
    gosolarLists(TERM, closed("80001"));
    await track(user, "80001");
    gosolarLists(TERM, open("80001"));
    mail.failNext("Resend is down");

    const failed = await run(0);
    expect(failed).toMatchObject({ emailsSent: 0, emailsFailed: 1 });
    expect(failed.errors[0]).toMatch(/CRN 80001 notify: Resend is down/);
    expect((await watchRow(user, "80001"))?.notifiedAt).toBeNull();
    expect(await alerts()).toHaveLength(0);

    expect(await run(3)).toMatchObject({ emailsSent: 1, errors: [] });
    expect(mail.sent).toHaveLength(1);
    expect(await alerts()).toHaveLength(1);
  });

  it("S10b: quota error -> no more sends this run, every watch stays armed, all retried next run", async () => {
    const a = await seedUser(testDb.db);
    const b = await seedUser(testDb.db);
    gosolarLists(TERM, closed("80001"));
    await track(a, "80001");
    await track(b, "80001");
    gosolarLists(TERM, open("80001"));
    mail.failNext("You have reached your daily email sending quota", "daily_quota_exceeded");

    const stopped = await run(0);
    expect(stopped).toMatchObject({ emailsSent: 0, emailsFailed: 1, skippedBudget: 1 });
    expect(mail.sent).toHaveLength(0);
    expect((await watchRow(a, "80001"))?.notifiedAt).toBeNull();
    expect((await watchRow(b, "80001"))?.notifiedAt).toBeNull();

    expect(await run(3)).toMatchObject({ emailsSent: 2, emailsFailed: 0 });
    expect(mail.sent.map((m) => m.to).sort()).toEqual([a.email, b.email].sort());
  });

  it("S11: 95 sent today with a reserve of 10 -> the watcher sends 0 (watch stays armed); a welcome still sends", async () => {
    const user = await seedUser(testDb.db);
    gosolarLists(TERM, closed("80001"));
    await track(user, "80001");
    gosolarLists(TERM, open("80001"));
    await testDb.db.insert(emailLog).values(
      Array.from({ length: 95 }, () => ({ recipient: "someone@student.gsu.test", type: "custom" as const, sentAt: at(-60) })),
    );

    expect(await run(0)).toMatchObject({ budgetAtStart: 0, emailsSent: 0, skippedBudget: 1 });
    expect(mail.sent).toHaveLength(0);
    expect((await watchRow(user, "80001"))?.notifiedAt).toBeNull();

    // A brand-new user signs in on the same day: the reserve is theirs.
    const google = mockGoogle();
    try {
      google.as({ sub: "g-budget", email: "budget@student.gsu.test" });
      await withFakeNow(at(1), async () => {
        await googleCallback(callbackRequest());
        await flushAfter();
      });
    } finally {
      google.restore();
    }
    expect(mail.sent.map((m) => m.to)).toEqual(["budget@student.gsu.test"]);
    expect(await testDb.db.select().from(emailLog).where(eq(emailLog.type, "welcome"))).toHaveLength(1);

    // The next UTC day the budget is back and the still-armed watch alerts.
    expect(await run(24 * 60)).toMatchObject({ emailsSent: 1 });
  });

  it(`S12: missing from GoSolar ${UNLISTED_AFTER_RUNS} runs -> flagged unlisted; reappears -> cleared; no emails either way`, async () => {
    const user = await seedUser(testDb.db);
    gosolarLists(TERM, closed("80001"), open("80002"));
    await track(user, "80001");
    // The section disappears (cancelled / renumbered); its sibling is still listed.
    gosolarLists(TERM, open("80002"));

    const details = async (): Promise<WatchDetails> => {
      const response = await call(detailsGet, await apiRequest("/api/watches/details", { as: user }));
      expect(response.status).toBe(200);
      return (await response.json()) as WatchDetails;
    };

    expect(await run(0)).toMatchObject({ sectionsMissing: 1, emailsSent: 0 });
    expect(await run(3)).toMatchObject({ sectionsMissing: 1 });
    expect((await details()).items[0]).toMatchObject({ section: null, partial: false, unlisted: false });

    // A failed search is unknown: it neither counts nor resets.
    gs.failNextSearches({ kind: "http", status: 503 });
    expect(await run(6)).toMatchObject({ sectionsMissing: 0, sectionsRelisted: 0 });
    expect((await watchRow(user, "80001"))?.missingRuns).toBe(2);

    expect(await run(9)).toMatchObject({ sectionsMissing: 1 });
    expect((await watchRow(user, "80001"))?.missingRuns).toBe(UNLISTED_AFTER_RUNS);
    expect((await details()).items[0]).toMatchObject({ section: null, partial: false, unlisted: true });

    // Back (still full): the flag clears, nothing is sent.
    gosolarLists(TERM, closed("80001"), open("80002"));
    expect(await run(12)).toMatchObject({ sectionsRelisted: 1, emailsSent: 0 });
    expect((await watchRow(user, "80001"))?.missingRuns).toBe(0);
    expect((await details()).items[0]).toMatchObject({ partial: false, unlisted: false, section: { courseReferenceNumber: "80001" } });

    expect(mail.sent).toHaveLength(0);
    expect(await testDb.db.select().from(emailLog)).toHaveLength(0);
  });

  it("S13: the term goes view-only -> the watcher skips it (no email) and cleanup deletes the watch", async () => {
    const user = await seedUser(testDb.db);
    gosolarLists(TERM, closed("80001"));
    await track(user, "80001");
    await testDb.db.update(terms).set({ viewOnly: true, description: "Spring Semester 2027 (View only)" }).where(eq(terms.code, TERM));
    gosolarLists(TERM, open("80001"));
    gs.requests.length = 0;

    expect(await run(0)).toMatchObject({ watches: 0, skippedTerms: 1, emailsSent: 0 });
    expect(searchCount()).toBe(0);

    const cleanup = await runCleanup({ now: at(1) });
    expect(cleanup).toMatchObject({ purgedTerms: [TERM], watchedSectionsDeleted: 1 });
    expect(await testDb.db.select().from(watchedSections)).toHaveLength(0);

    expect(await run(3)).toMatchObject({ watches: 0, skippedTerms: 0, emailsSent: 0 });
    expect(mail.sent).toHaveLength(0);
  });

  it("S14: the same CRN tracked in two terms -> independent rows and independent alerts", async () => {
    const user = await seedUser(testDb.db);
    gosolarLists(TERM, closed("80001", TERM));
    gosolarLists(TERM_B, closed("80001", TERM_B));
    expect(await track(user, "80001", TERM)).toMatchObject({ created: true });
    expect(await track(user, "80001", TERM_B)).toMatchObject({ created: true });
    expect(await testDb.db.select().from(watchedSections)).toHaveLength(2);

    gosolarLists(TERM, open("80001", TERM));
    expect(await run(0)).toMatchObject({ groups: 2, emailsSent: 1 });
    expect((await watchRow(user, "80001", TERM))?.notifiedAt).toEqual(at(0));
    expect((await watchRow(user, "80001", TERM_B))?.notifiedAt).toBeNull();

    gosolarLists(TERM_B, open("80001", TERM_B));
    expect(await run(3)).toMatchObject({ emailsSent: 1 });
    expect(await run(6)).toMatchObject({ emailsSent: 0 });
    expect((await alerts()).map((log) => log.term).sort()).toEqual([TERM, TERM_B]);
    expect(mail.sent).toHaveLength(2);
  });

  it("S15: a rapid double click on Track -> one row (201 + 200), at most one email", async () => {
    const user = await seedUser(testDb.db);
    gosolarLists(TERM, closed("80001"));
    const clicks = await Promise.all([track(user, "80001"), track(user, "80001")]);
    expect(clicks.map((c) => c.status).sort()).toEqual([200, 201]);
    expect(new Set(clicks.map((c) => c.watch.id)).size).toBe(1);
    expect(await testDb.db.select().from(watchedSections)).toHaveLength(1);

    gosolarLists(TERM, open("80001"));
    expect(await run(0)).toMatchObject({ emailsSent: 1 });
    expect(await run(3)).toMatchObject({ emailsSent: 0 });
    expect(mail.sent).toHaveLength(1);
  });

  it("S15b: overlapping watcher runs (double cron fire) still send one email", async () => {
    const user = await seedUser(testDb.db);
    gosolarLists(TERM, closed("80001"));
    await track(user, "80001");
    gosolarLists(TERM, open("80001"));

    // The second run starts while the first is between load and claim; the job lock refuses it.
    let second: Awaited<ReturnType<typeof runWatcher>> | undefined;
    await run(0, {
      beforeClaim: async () => {
        second = await runWatcher({ now: at(0), gosolar: { baseUrl: gs.url }, transport: mail, sendSpacingMs: 0 });
      },
    });
    expect(second).toEqual({ skipped: "locked" });
    expect(mail.sent).toHaveLength(1);
  });
});
