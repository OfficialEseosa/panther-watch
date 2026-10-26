import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/session")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  ...(await import("../helpers/session")).nextServerMock,
}));

import { setDbForTests } from "@/db";
import { terms, watchedSections, type User } from "@/db/schema";
import { GET as detailsGet } from "@/app/api/watches/details/route";
import { DELETE as watchesDelete, GET as watchesGet, POST as watchesPost } from "@/app/api/watches/route";
import { setGoSolarOptionsForTests } from "@/lib/courses";
import { listWatchesWithDetails, type Watch, type WatchDetails } from "@/lib/watches";
import { createTestDb, seedUser, seedWatchedSection, truncateAll, type TestDatabase } from "../helpers/db";
import { makeClosedSection, makeSection, startFakeGoSolar, type FakeGoSolar } from "../helpers/fake-gosolar";
import { apiRequest, call } from "../helpers/session";

/** Open term (Spring 2027: expires 2027-03-01, after today). */
const OPEN = "202701";
/** Registration closed in GoSolar, not yet expired. */
const VIEW_ONLY = "202705";

let testDb: TestDatabase;
let gs: FakeGoSolar;
let alice: User;
let bob: User;

beforeAll(async () => {
  testDb = await createTestDb();
  setDbForTests(testDb.db);
  gs = await startFakeGoSolar();
  setGoSolarOptionsForTests({ baseUrl: gs.url });
});
afterAll(async () => {
  setGoSolarOptionsForTests(undefined);
  setDbForTests(undefined);
  await gs.close();
  await testDb.close();
});
beforeEach(async () => {
  await truncateAll(testDb.db);
  gs.reset();
  // A fresh terms cache, so adds never call GoSolar's term list.
  await testDb.db.insert(terms).values([
    { code: OPEN, description: "Spring Semester 2027", viewOnly: false },
    { code: VIEW_ONLY, description: "Summer Semester 2027 (View Only)", viewOnly: true },
  ]);
  alice = await seedUser(testDb.db, { name: "Alice" });
  bob = await seedUser(testDb.db, { name: "Bob" });
});

const watchBody = (crn: string, overrides: Record<string, unknown> = {}) => ({
  term: OPEN,
  crn,
  subject: "csc",
  courseNumber: "1301",
  courseTitle: "Principles of Computer Science I",
  instructor: "Instructor, Test",
  ...overrides,
});

async function post(as: User | undefined, body: unknown, origin?: string | null) {
  const response = await call(watchesPost, await apiRequest("/api/watches", { method: "POST", as, body, origin }));
  return { response, body: (await response.json()) as Record<string, unknown> };
}

async function list(as: User): Promise<Watch[]> {
  const response = await call(watchesGet, await apiRequest("/api/watches", { as }));
  expect(response.status).toBe(200);
  return ((await response.json()) as { watches: Watch[] }).watches;
}

async function details(as: User): Promise<WatchDetails> {
  const response = await call(detailsGet, await apiRequest("/api/watches/details", { as }));
  expect(response.status).toBe(200);
  return (await response.json()) as WatchDetails;
}

describe("auth and CSRF", () => {
  it("answers 401 without a session on every route", async () => {
    for (const [handler, method] of [
      [watchesGet, "GET"],
      [watchesPost, "POST"],
      [watchesDelete, "DELETE"],
      [detailsGet, "GET"],
    ] as const) {
      const response = await call(handler, await apiRequest(`/api/watches?term=${OPEN}&crn=80001`, { method, body: method === "POST" ? watchBody("80001") : undefined }));
      expect(response.status).toBe(401);
      expect(await response.json()).toEqual({ error: { code: "unauthorized", message: "Sign in required" } });
    }
  });

  it("refuses a POST without Origin (403) and writes nothing", async () => {
    const { response, body } = await post(alice, watchBody("80001"), null);
    expect(response.status).toBe(403);
    expect(body).toMatchObject({ error: { code: "forbidden" } });
    expect(await testDb.db.select().from(watchedSections)).toHaveLength(0);
  });

  it("refuses a cross-origin DELETE", async () => {
    await seedWatchedSection(testDb.db, alice.id, { term: OPEN, crn: "80001" });
    const response = await call(
      watchesDelete,
      await apiRequest(`/api/watches?term=${OPEN}&crn=80001`, { method: "DELETE", as: alice, origin: "https://evil.test" }),
    );
    expect(response.status).toBe(403);
    expect(await testDb.db.select().from(watchedSections)).toHaveLength(1);
  });
});

describe("add / list / remove", () => {
  it("adds a watch, lists it, and is idempotent", async () => {
    const first = await post(alice, watchBody("80001"));
    expect(first.response.status).toBe(201);
    expect(first.body).toMatchObject({
      created: true,
      openNow: false,
      watch: { term: OPEN, crn: "80001", subject: "CSC", courseNumber: "1301", instructor: "Instructor, Test", notifiedAt: null },
    });

    const again = await post(alice, watchBody("80001"));
    expect(again.response.status).toBe(200);
    expect(again.body).toMatchObject({ created: false, openNow: false, watch: { id: (first.body.watch as Watch).id } });

    const watches = await list(alice);
    expect(watches.map((w) => w.crn)).toEqual(["80001"]);
    expect(await testDb.db.select().from(watchedSections)).toHaveLength(1);
  });

  it("rejects a view-only term with 409 term_closed", async () => {
    const { response, body } = await post(alice, watchBody("80001", { term: VIEW_ONLY }));
    expect(response.status).toBe(409);
    expect(body).toMatchObject({ error: { code: "term_closed" } });
  });

  it("rejects an expired term with 409 term_closed", async () => {
    // Fall 2026 seat alerts ended 2026-10-01 (term start + 2 months).
    await testDb.db.insert(terms).values({ code: "202608", description: "Fall Semester 2026", viewOnly: false });
    const { response, body } = await post(alice, watchBody("80001", { term: "202608" }));
    expect(response.status).toBe(409);
    expect(body).toMatchObject({ error: { code: "term_closed" } });
  });

  it("rejects a term GoSolar does not list with 409 term_unknown", async () => {
    const { response, body } = await post(alice, watchBody("80001", { term: "202801" }));
    expect(response.status).toBe(409);
    expect(body).toMatchObject({ error: { code: "term_unknown" } });
  });

  it("validates the body", async () => {
    for (const body of [watchBody("8001"), watchBody("80001", { subject: "" }), { term: OPEN }, "not json"]) {
      const result = await post(alice, body);
      expect(result.response.status).toBe(400);
      expect(result.body).toMatchObject({ error: { code: "invalid_request" } });
    }
  });

  it("removes a watch", async () => {
    await post(alice, watchBody("80001"));
    const response = await call(
      watchesDelete,
      await apiRequest(`/api/watches?term=${OPEN}&crn=80001`, { method: "DELETE", as: alice }),
    );
    expect(await response.json()).toEqual({ removed: true });
    expect(await list(alice)).toEqual([]);

    const again = await call(
      watchesDelete,
      await apiRequest(`/api/watches?term=${OPEN}&crn=80001`, { method: "DELETE", as: alice }),
    );
    expect(await again.json()).toEqual({ removed: false });
  });

  it("isolates users: another user can neither see nor delete a watch", async () => {
    await post(alice, watchBody("80001"));
    expect(await list(bob)).toEqual([]);

    const response = await call(
      watchesDelete,
      await apiRequest(`/api/watches?term=${OPEN}&crn=80001`, { method: "DELETE", as: bob }),
    );
    expect(await response.json()).toEqual({ removed: false });
    expect(await list(alice)).toHaveLength(1);
    expect((await details(bob)).items).toEqual([]);
  });
});

describe("track-while-open: POST /api/watches checks live seats once", () => {
  const searches = () => gs.requests.filter((r) => r.path === "/searchResults/searchResults").length;

  it("an OPEN section is tracked already notified: openNow true, notified_at set", async () => {
    gs.setSections(OPEN, "CSC", "1301", [makeSection({ term: OPEN, courseReferenceNumber: "80001" })]);
    const { response, body } = await post(alice, watchBody("80001"));
    expect(response.status).toBe(201);
    expect(body).toMatchObject({ created: true, openNow: true });
    expect((body.watch as Watch).notifiedAt).not.toBeNull();
    expect(searches()).toBe(1);
    const [row] = await testDb.db.select().from(watchedSections);
    expect(row.notifiedAt).toBeInstanceOf(Date);
    expect(row.lastClosedAt).toBeNull();
  });

  it("a CLOSED section is tracked armed: openNow false, notified_at null", async () => {
    gs.setSections(OPEN, "CSC", "1301", [makeClosedSection({ term: OPEN, courseReferenceNumber: "80001" })]);
    const { response, body } = await post(alice, watchBody("80001"));
    expect(response.status).toBe(201);
    expect(body).toMatchObject({ created: true, openNow: false, watch: { notifiedAt: null } });
  });

  it("seats free but a waitlist exists is not open: armed", async () => {
    gs.setSections(OPEN, "CSC", "1301", [makeSection({ term: OPEN, courseReferenceNumber: "80001", waitCount: 2 })]);
    const { body } = await post(alice, watchBody("80001"));
    expect(body).toMatchObject({ created: true, openNow: false, watch: { notifiedAt: null } });
  });

  it("unknown (GoSolar fails, or the CRN is not listed) is tracked armed and the add still succeeds", async () => {
    gs.setSections(OPEN, "CSC", "1301", [makeSection({ term: OPEN, courseReferenceNumber: "80001" })]);
    gs.failNextSearches({ kind: "http", status: 503 });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const failed = await post(alice, watchBody("80001"));
      expect(failed.response.status).toBe(201);
      expect(failed.body).toMatchObject({ created: true, openNow: false, watch: { notifiedAt: null } });

      const missing = await post(alice, watchBody("80055"));
      expect(missing.body).toMatchObject({ created: true, openNow: false, watch: { notifiedAt: null } });
    } finally {
      warn.mockRestore();
    }
  });

  it("re-adding an existing watch makes no GoSolar call and leaves its alert state alone", async () => {
    gs.setSections(OPEN, "CSC", "1301", [makeClosedSection({ term: OPEN, courseReferenceNumber: "80001" })]);
    await post(alice, watchBody("80001"));
    expect(searches()).toBe(1);
    gs.setSections(OPEN, "CSC", "1301", [makeSection({ term: OPEN, courseReferenceNumber: "80001" })]);
    const again = await post(alice, watchBody("80001"));
    expect(again.response.status).toBe(200);
    expect(again.body).toMatchObject({ created: false, openNow: false, watch: { notifiedAt: null } });
    expect(searches()).toBe(1);
  });

  it("a rapid double click creates one row (201 + 200)", async () => {
    gs.setSections(OPEN, "CSC", "1301", [makeClosedSection({ term: OPEN, courseReferenceNumber: "80001" })]);
    const results = await Promise.all([post(alice, watchBody("80001")), post(alice, watchBody("80001"))]);
    expect(results.map((r) => r.response.status).sort()).toEqual([200, 201]);
    expect(await testDb.db.select().from(watchedSections)).toHaveLength(1);
  });
});

describe("GET /api/watches/details", () => {
  it("searches once per course and returns both watched sections", async () => {
    const a = makeSection({ term: OPEN, courseReferenceNumber: "80001" });
    const b = makeSection({ term: OPEN, courseReferenceNumber: "80002", seatsAvailable: 0 });
    gs.setSections(OPEN, "CSC", "1301", [a, b, makeSection({ term: OPEN, courseReferenceNumber: "80003" })]);
    await seedWatchedSection(testDb.db, alice.id, { term: OPEN, crn: "80001" });
    await seedWatchedSection(testDb.db, alice.id, { term: OPEN, crn: "80002" });

    const { items } = await details(alice);
    expect(gs.requests.filter((r) => r.path === "/searchResults/searchResults")).toHaveLength(1);
    expect(items).toHaveLength(2);
    expect(items.every((item) => item.partial === false)).toBe(true);
    const byCrn = Object.fromEntries(items.map((item) => [item.watch.crn, item.section]));
    expect(byCrn).toEqual({ "80001": a, "80002": b });
  });

  it("marks only the failed course partial", async () => {
    const csc = makeSection({ term: OPEN, courseReferenceNumber: "80001" });
    gs.setSections(OPEN, "CSC", "1301", [csc]);
    gs.setSections(OPEN, "MATH", "2211", [makeSection({ term: OPEN, subject: "MATH", courseNumber: "2211", courseReferenceNumber: "80010" })]);
    await seedWatchedSection(testDb.db, alice.id, { term: OPEN, crn: "80001" });
    await seedWatchedSection(testDb.db, alice.id, { term: OPEN, crn: "80010", subject: "MATH", courseNumber: "2211" });
    // Gone from GoSolar: searched fine, CRN no longer listed.
    await seedWatchedSection(testDb.db, alice.id, { term: OPEN, crn: "80009" });
    gs.failNextSearches({ kind: "http", status: 503 });

    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      // Concurrency 1 makes the order deterministic: the newest watch's group (CSC) searches first.
      const result = await listWatchesWithDetails(alice.id, { concurrency: 1 });
      const byCrn = Object.fromEntries(result.items.map((item) => [item.watch.crn, item]));
      expect(byCrn["80009"]).toMatchObject({ section: null, partial: true });
      expect(byCrn["80001"]).toMatchObject({ section: null, partial: true });
      expect(byCrn["80010"]).toMatchObject({ partial: false, section: { courseReferenceNumber: "80010" } });

      // Next time GoSolar answers: CSC resolves, and the missing CRN is reported as gone.
      const retry = await details(alice);
      const again = Object.fromEntries(retry.items.map((item) => [item.watch.crn, item]));
      expect(again["80001"]).toMatchObject({ partial: false, section: csc });
      expect(again["80009"]).toEqual({
        watch: expect.objectContaining({ crn: "80009" }),
        section: null,
        partial: false,
        unlisted: false,
      });
    } finally {
      warn.mockRestore();
    }
  });

  it("returns partial items when the deadline passes", async () => {
    gs.setSections(OPEN, "CSC", "1301", [makeSection({ term: OPEN, courseReferenceNumber: "80001" })]);
    await seedWatchedSection(testDb.db, alice.id, { term: OPEN, crn: "80001" });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const result = await listWatchesWithDetails(alice.id, { deadlineMs: 0 });
      expect(result.items).toEqual([
        { watch: expect.objectContaining({ crn: "80001" }), section: null, partial: true, unlisted: false },
      ]);
    } finally {
      warn.mockRestore();
    }
  });

  it("exposes unlisted once the watcher has missed the CRN for 3 runs, unless it is listed live", async () => {
    gs.setSections(OPEN, "CSC", "1301", [makeSection({ term: OPEN, courseReferenceNumber: "80001" })]);
    await seedWatchedSection(testDb.db, alice.id, { term: OPEN, crn: "80009", missingRuns: 3 });
    await seedWatchedSection(testDb.db, alice.id, { term: OPEN, crn: "80008", missingRuns: 2 });
    await seedWatchedSection(testDb.db, alice.id, { term: OPEN, crn: "80001", missingRuns: 5 });
    const byCrn = Object.fromEntries((await details(alice)).items.map((item) => [item.watch.crn, item]));
    expect(byCrn["80009"]).toMatchObject({ section: null, partial: false, unlisted: true });
    expect(byCrn["80008"]).toMatchObject({ section: null, partial: false, unlisted: false });
    // Listed again since the watcher last looked: the live listing wins.
    expect(byCrn["80001"]).toMatchObject({ partial: false, unlisted: false, section: { courseReferenceNumber: "80001" } });
  });

  it("returns an empty list without calling GoSolar", async () => {
    expect(await details(alice)).toEqual({ items: [] });
    expect(gs.requests).toHaveLength(0);
  });

  it("only touches the caller's rows", async () => {
    await seedWatchedSection(testDb.db, bob.id, { term: OPEN, crn: "80001" });
    expect((await details(alice)).items).toEqual([]);
    const rows = await testDb.db.select().from(watchedSections).where(eq(watchedSections.userId, bob.id));
    expect(rows).toHaveLength(1);
  });
});
