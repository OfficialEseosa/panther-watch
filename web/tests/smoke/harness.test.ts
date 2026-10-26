import { eq } from "drizzle-orm";
import { fetch as undiciFetch } from "undici";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { getDb, setDbForTests } from "@/db";
import { users, watchedSections } from "@/db/schema";
import { upsertGoogleUser } from "@/lib/auth/users";
import {
  GoSolarAffinityError,
  getSubjects,
  getTerms,
  searchCourses,
  type FetchLike,
} from "@/lib/gosolar";
import {
  createTestDb,
  seedUser,
  seedWatchedSection,
  truncateAll,
  type TestDatabase,
} from "../helpers/db";
import {
  AFFINITY_COOKIE,
  SESSION_COOKIE,
  makeClosedSection,
  makeSection,
  makeTerm,
  startFakeGoSolar,
  type FakeGoSolar,
} from "../helpers/fake-gosolar";
import { withFakeNow } from "../helpers/time";

vi.mock("server-only", () => ({}));

describe("PGlite test database", () => {
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

  it("applies the migrations and round-trips a user and a watched section", async () => {
    const user = await seedUser(testDb.db);
    expect(user.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(user.createdAt).toBeInstanceOf(Date);

    const watch = await seedWatchedSection(testDb.db, user.id, { crn: "80001" });
    const [row] = await testDb.db
      .select()
      .from(watchedSections)
      .where(eq(watchedSections.userId, user.id));
    expect(row).toEqual(watch);
    expect(row.notifiedAt).toBeNull();
    expect(row.lastClosedAt).toBeNull();
  });

  it("enforces the schema's constraints", async () => {
    const user = await seedUser(testDb.db, { email: "Mixed@Example.test" });
    await expect(seedUser(testDb.db, { email: "mixed@example.test" })).rejects.toThrow();
    await expect(seedWatchedSection(testDb.db, user.id, { crn: "1234" })).rejects.toThrow();
    await expect(seedWatchedSection(testDb.db, user.id, { term: "2026" })).rejects.toThrow();

    await seedWatchedSection(testDb.db, user.id, { crn: "80002" });
    await expect(seedWatchedSection(testDb.db, user.id, { crn: "80002" })).rejects.toThrow();

    await testDb.db.delete(users).where(eq(users.id, user.id));
    expect(await testDb.db.select().from(watchedSections)).toHaveLength(0);
  });

  it("truncateAll empties the tables", async () => {
    await seedUser(testDb.db);
    await truncateAll(testDb.db);
    expect(await testDb.db.select().from(users)).toHaveLength(0);
  });

  it("routes app code through setDbForTests", async () => {
    expect(getDb()).toBe(testDb.db);
    const info = {
      sub: "google-123",
      email: "Panther@student.gsu.test",
      email_verified: true,
      name: "Pounce",
      picture: null,
    };
    const first = await upsertGoogleUser(info);
    expect(first.created).toBe(true);
    const second = await upsertGoogleUser({ ...info, name: "Pounce II" });
    expect(second).toMatchObject({ created: false, user: { id: first.user.id, name: "Pounce II" } });

    const legacy = await seedUser(testDb.db, { email: "old@student.gsu.test", googleSub: null });
    const linked = await upsertGoogleUser({ ...info, sub: "google-456", email: "OLD@student.gsu.test" });
    expect(linked).toMatchObject({ created: false, user: { id: legacy.id, googleSub: "google-456" } });

    await expect(
      upsertGoogleUser({ ...info, sub: "google-789", email: "old@student.gsu.test", email_verified: false }),
    ).rejects.toThrow(/already uses this email/);
  });

  it("db transactions work on PGlite", async () => {
    const db = getDb();
    await expect(
      db.transaction(async (tx) => {
        await tx.insert(users).values({ email: "rollback@student.gsu.test" });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    expect(await db.select().from(users)).toHaveLength(0);
  });
});

describe("fake GoSolar", () => {
  let gs: FakeGoSolar;

  beforeAll(async () => {
    gs = await startFakeGoSolar();
  });
  afterAll(() => gs.close());
  beforeEach(() => gs.reset());

  it("serves configured sections to the real searchCourses", async () => {
    const open = makeSection({ courseReferenceNumber: "80001" });
    const closed = makeClosedSection({ courseReferenceNumber: "80002" });
    gs.setSections("202608", "CSC", "1301", [open, closed]);
    gs.setSections("202608", "MATH", "2211", [makeSection({ subject: "MATH", courseNumber: "2211" })]);

    const result = await searchCourses(
      { term: "202608", subject: "CSC", courseNumber: "1301" },
      { baseUrl: gs.url },
    );
    expect(result.data).toEqual([open, closed]);
    expect(result.data[1].seatsAvailable).toBe(0);
    expect(result.data[0].meetingsFaculty?.[0].meetingTime?.monday).toBe(true);
    expect(result.data[0].faculty?.[0].courseReferenceNumber).toBe("80001");

    expect(gs.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "POST /term/search",
      "GET /searchResults/searchResults",
    ]);
    expect(Object.keys(gs.requests[1].cookies).sort()).toEqual(
      [AFFINITY_COOKIE, SESSION_COOKIE].sort(),
    );
  });

  it("answers data:null when the affinity cookie is missing", async () => {
    const declare = await undiciFetch(`${gs.url}/term/search`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: "term=202608",
    });
    await declare.text();
    const sessionCookie = declare.headers
      .getSetCookie()
      .map((c) => c.split(";", 1)[0])
      .find((c) => c.startsWith(`${SESSION_COOKIE}=`));
    expect(sessionCookie).toBeDefined();

    const search = await undiciFetch(
      `${gs.url}/searchResults/searchResults?txt_term=202608&txt_subject=CSC&txt_courseNumber=1301`,
      { headers: { Cookie: sessionCookie ?? "" } },
    );
    expect(await search.json()).toMatchObject({ success: true, data: null });
  });

  it("makes the real client throw GoSolarAffinityError when F5 issues no affinity cookie", async () => {
    gs.setSections("202608", "CSC", "1301", [makeSection()]);
    // Imitates the production failure: the declaration comes back on an already-pinned
    // connection, so only JSESSIONID is set.
    const dropAffinityCookie: FetchLike = async (url, init) => {
      const response = await undiciFetch(url, init);
      return {
        ok: response.ok,
        status: response.status,
        headers: {
          getSetCookie: () =>
            response.headers.getSetCookie().filter((c) => !c.startsWith(`${AFFINITY_COOKIE}=`)),
        },
        json: () => response.json(),
        text: () => response.text(),
      };
    };

    await expect(
      searchCourses(
        { term: "202608", subject: "CSC", courseNumber: "1301" },
        { baseUrl: gs.url, fetchImpl: dropAffinityCookie },
      ),
    ).rejects.toBeInstanceOf(GoSolarAffinityError);
  });

  it("injects search failures", async () => {
    gs.failNextSearches({ kind: "http", status: 503 });
    await expect(
      searchCourses({ term: "202608", subject: "CSC" }, { baseUrl: gs.url }),
    ).rejects.toThrow(/503/);
    gs.failNextSearches({ kind: "affinity" });
    await expect(
      searchCourses({ term: "202608", subject: "CSC" }, { baseUrl: gs.url }),
    ).rejects.toBeInstanceOf(GoSolarAffinityError);
    await expect(
      searchCourses({ term: "202608", subject: "CSC" }, { baseUrl: gs.url }),
    ).resolves.toMatchObject({ data: [] });
  });

  it("serves terms and subjects", async () => {
    gs.setTerms([
      makeTerm("202608", "Fall Semester 2026"),
      makeTerm("202605", "Summer Semester 2026 (View Only)"),
    ]);
    gs.setSubjects("202608", [
      { code: "CSC", description: "Computer Science" },
      { code: "MATH", description: "Mathematics" },
    ]);

    expect(await getTerms({ baseUrl: gs.url })).toHaveLength(2);
    expect(await getSubjects({ searchTerm: "comp", term: "202608" }, { baseUrl: gs.url })).toEqual([
      { code: "CSC", description: "Computer Science" },
    ]);
  });
});

describe("withFakeNow", () => {
  it("freezes Date and restores it", async () => {
    const frozen = await withFakeNow("2026-08-24T12:00:00Z", async () => {
      await new Promise((resolve) => setTimeout(resolve, 5));
      return new Date().toISOString();
    });
    expect(frozen).toBe("2026-08-24T12:00:00.000Z");
    expect(Date.now()).toBeGreaterThan(Date.parse("2026-10-01T00:00:00Z"));
  });
});
