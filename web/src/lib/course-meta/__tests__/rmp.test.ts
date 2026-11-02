import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { rmpCache } from "@/db/schema/course-meta";
import { parseName, type ParsedName } from "../names";
import {
  RMP_ENDPOINT,
  RMP_HIT_TTL_MS,
  RMP_MISS_TTL_MS,
  RMP_SCHOOL_ID,
  bestMatch,
  findMatch,
  getProfessorRating,
  rmpCacheKey,
  parseTeacherSearch,
  type RmpTeacher,
} from "../rmp";
import { fakeFetch, response } from "./fake-fetch";
import { createTestDb, type TestDb } from "./pglite";

interface NodeInput {
  first: string;
  last: string;
  legacyId: number;
  numRatings: number;
  rating: number;
}

/** A canned RMP GraphQL search response, shaped like the live API. */
function graphql(...teachers: NodeInput[]) {
  return {
    data: {
      newSearch: {
        teachers: {
          edges: teachers.map((t) => ({
            node: {
              legacyId: t.legacyId,
              firstName: t.first,
              lastName: t.last,
              department: "Computer Science",
              avgRating: t.rating,
              avgDifficulty: 4.7,
              numRatings: t.numRatings,
              wouldTakeAgainPercent: 33.3333,
              ratingsDistribution: { r1: 1, r2: 0, r3: 0, r4: 0, r5: 2, total: 3 },
              teacherRatingTags: [
                { tagName: "Tough grader", tagCount: 3 },
                { tagName: "Lots of homework", tagCount: 1 },
                { tagName: "Caring", tagCount: 5 },
                { tagName: "Clear grading", tagCount: 2 },
                { tagName: "Respected", tagCount: 4 },
                { tagName: "Hilarious", tagCount: 0 },
              ],
            },
          })),
        },
      },
    },
  };
}

const NEMIRA = { first: "Alina", last: "Nemira", legacyId: 3119831, numRatings: 3, rating: 1.7 };

function name(raw: string): ParsedName {
  const parsed = parseName(raw);
  if (!parsed) throw new Error(raw);
  return parsed;
}

function teachers(...input: NodeInput[]): RmpTeacher[] {
  return parseTeacherSearch(graphql(...input));
}

describe("parseTeacherSearch", () => {
  it("maps the GraphQL nodes", () => {
    const [t] = teachers(NEMIRA);
    expect(t).toMatchObject({
      legacyId: 3119831,
      firstName: "Alina",
      lastName: "Nemira",
      avgRating: 1.7,
      numRatings: 3,
      distribution: { r1: 1, r2: 0, r3: 0, r4: 0, r5: 2 },
    });
    expect(t.tags).toHaveLength(6);
  });

  it("tolerates nulls and missing edges", () => {
    expect(parseTeacherSearch({ data: { newSearch: { teachers: { edges: null } } } })).toEqual([]);
    expect(parseTeacherSearch({ data: null })).toEqual([]);
    const [t] = parseTeacherSearch({
      data: { newSearch: { teachers: { edges: [{ node: { legacyId: 1, firstName: "A", lastName: "B", avgRating: null, ratingsDistribution: null, teacherRatingTags: null } }] } } },
    });
    expect(t).toMatchObject({ avgRating: null, distribution: null, tags: [], department: "" });
  });
});

describe("bestMatch (ported from ProfessorRatingServiceTest)", () => {
  it("prefers the matching first name over a more-rated namesake", () => {
    const hits = teachers(
      { first: "Robert", last: "Smith", legacyId: 111, numRatings: 50, rating: 4 },
      { first: "Alice", last: "Smith", legacyId: 222, numRatings: 5, rating: 3 },
    );
    expect(bestMatch(hits, name("Smith, Alice"))?.legacyId).toBe(222);
  });

  it("accepts first-name prefixes either way and breaks ties by ratings", () => {
    const hits = teachers(
      { first: "Alina Marie", last: "Nemira", legacyId: 1, numRatings: 2, rating: 3 },
      { first: "Alina", last: "Nemira", legacyId: 2, numRatings: 9, rating: 3 },
    );
    expect(bestMatch(hits, name("Nemira, Alina"))?.legacyId).toBe(2);
    expect(bestMatch(hits.slice(0, 1), name("Nemira, Alina"))?.legacyId).toBe(1);
  });

  it("matches the preferred name", () => {
    const hits = teachers(
      { first: "Robert", last: "Jones", legacyId: 1, numRatings: 40, rating: 3 },
      { first: "Bob", last: "Jones", legacyId: 2, numRatings: 1, rating: 3 },
    );
    expect(bestMatch(hits, name("Jones, William (Bob)"))?.legacyId).toBe(2);
  });

  it("never falls back to a last-name-only match (a namesake's rating is worse than none)", () => {
    // The live regression: Keith, Smith, Wang, Luo, Asare, Powell got a different person's rating.
    const hits = teachers(
      { first: "Robert", last: "Smith", legacyId: 111, numRatings: 50, rating: 4 },
      { first: "Rob", last: "Smith", legacyId: 112, numRatings: 2, rating: 4 },
      { first: "Alice", last: "Smithers", legacyId: 333, numRatings: 99, rating: 4 },
    );
    expect(bestMatch(hits, name("Smith, Jane"))).toBeNull();
    expect(bestMatch(teachers({ first: "Wei", last: "Wang", legacyId: 1, numRatings: 80, rating: 2 }), name("Wang, Yu"))).toBeNull();
  });

  it("does not match a query without a first name", () => {
    const hits = teachers({ first: "Robert", last: "Smith", legacyId: 111, numRatings: 50, rating: 4 });
    expect(bestMatch(hits, name("Smith"))).toBeNull();
  });

  it("matches a GoSolar initial to a full RMP first name, flagged as an initial match", () => {
    const hits = teachers(
      { first: "Jennifer", last: "Smith", legacyId: 1, numRatings: 4, rating: 4 },
      { first: "Robert", last: "Smith", legacyId: 2, numRatings: 90, rating: 4 },
    );
    expect(findMatch(hits, name("Smith, J."))).toMatchObject({ teacher: { legacyId: 1 }, quality: "initial" });
    expect(findMatch(hits, name("Smith, J"))?.teacher.legacyId).toBe(1);
    expect(findMatch(hits, name("Smith, Jennifer"))?.quality).toBe("exact");
  });

  it("never matches by initial when a full first name is available", () => {
    // Full query name vs an initial-only RMP profile, and vice versa a different J-name.
    const initialProfile = teachers({ first: "J.", last: "Smith", legacyId: 1, numRatings: 9, rating: 4 });
    expect(bestMatch(initialProfile, name("Smith, John"))).toBeNull();
    const james = teachers({ first: "James", last: "Smith", legacyId: 2, numRatings: 9, rating: 4 });
    expect(bestMatch(james, name("Smith, Jennifer"))).toBeNull();
  });

  it("returns no match when an initial fits several different first names", () => {
    const hits = teachers(
      { first: "John", last: "Smith", legacyId: 1, numRatings: 4, rating: 4 },
      { first: "James", last: "Smith", legacyId: 2, numRatings: 40, rating: 4 },
    );
    expect(bestMatch(hits, name("Smith, J."))).toBeNull();
  });

  it("matches multi-token given names in full (GoSolar initials plus a name)", () => {
    const hits = teachers({ first: "S M Towhidul", last: "Islam", legacyId: 2921056, numRatings: 13, rating: 3.7 });
    expect(findMatch(hits, name("Islam, S M Towhidul (Towhid)"))).toMatchObject({ teacher: { legacyId: 2921056 }, quality: "exact" });
  });

  it("breaks ties between duplicate profiles by ratings count", () => {
    const hits = teachers(
      { first: "Jennifer", last: "Ortgies-Young", legacyId: 1, numRatings: 3, rating: 4 },
      { first: "Jennifer", last: "Ortgies-Young", legacyId: 2, numRatings: 30, rating: 4 },
      { first: "J", last: "Ortgies-Young", legacyId: 3, numRatings: 99, rating: 4 },
    );
    expect(findMatch(hits, name("Ortgies-Young, Jennifer"))).toMatchObject({ teacher: { legacyId: 2 }, quality: "exact" });
  });

  it("fuzzy-matches a misspelled RMP last name when the first name matches in full", () => {
    // Live case: RMP lists Tamra Ortgies-Young (POLS) as "Ortegies-Young".
    const hits = teachers(
      { first: "Tamra", last: "Ortegies-Young", legacyId: 2753188, numRatings: 7, rating: 4 },
      { first: "Jennifer", last: "Ortgies-Young", legacyId: 9, numRatings: 70, rating: 4 },
    );
    expect(findMatch(hits, name("Ortgies-Young, Tamra"))).toMatchObject({ teacher: { legacyId: 2753188 }, quality: "fuzzy" });
    expect(findMatch(hits, name("Ortgies-Young, Tamra S."))?.quality).toBe("fuzzy");
    // Two typos are tolerated only because both names are 8+ letters; three never are.
    const twoOff = teachers({ first: "Tamra", last: "Ortegies-Yuong", legacyId: 3, numRatings: 1, rating: 4 });
    expect(findMatch(twoOff, name("Ortgies-Young, Tamra"))?.quality).toBe("fuzzy");
    const threeOff = teachers({ first: "Tamra", last: "Ortegeis-Yuong", legacyId: 4, numRatings: 1, rating: 4 });
    expect(findMatch(threeOff, name("Ortgies-Young, Tamra"))).toBeNull();
  });

  it("prefers a strict match over a fuzzy one, and needs the first name to match", () => {
    const hits = teachers(
      { first: "Tamra", last: "Ortegies-Young", legacyId: 1, numRatings: 70, rating: 4 },
      { first: "Tamra", last: "Ortgies-Young", legacyId: 2, numRatings: 1, rating: 4 },
    );
    expect(findMatch(hits, name("Ortgies-Young, Tamra"))).toMatchObject({ teacher: { legacyId: 2 }, quality: "exact" });
    expect(bestMatch(hits.slice(0, 1), name("Ortgies-Young, Jennifer"))).toBeNull();
  });

  it("never fuzzy-matches last names under 7 letters (Smith vs Smyth, Powell vs Howell)", () => {
    const smyth = teachers({ first: "Jane", last: "Smyth", legacyId: 1, numRatings: 9, rating: 4 });
    expect(bestMatch(smyth, name("Smith, Jane"))).toBeNull();
    const howell = teachers({ first: "Gary", last: "Howell", legacyId: 2, numRatings: 9, rating: 4 });
    expect(bestMatch(howell, name("Powell, Gary"))).toBeNull(); // 6 letters: a real different name
    const jacksom = teachers({ first: "Gary", last: "Jacksom", legacyId: 3, numRatings: 9, rating: 4 });
    expect(findMatch(jacksom, name("Jackson, Gary"))?.quality).toBe("fuzzy"); // 7 letters, one typo
  });

  it("never fuzzy-matches an initial-only first name", () => {
    const hits = teachers({ first: "Tamra", last: "Ortegies-Young", legacyId: 1, numRatings: 7, rating: 4 });
    expect(bestMatch(hits, name("Ortgies-Young, T."))).toBeNull();
  });

  it("compares last names folded (case, diacritics, suffixes)", () => {
    const hits = teachers({ first: "Jose", last: "MUNOZ Jr.", legacyId: 7, numRatings: 1, rating: 4 });
    expect(bestMatch(hits, name("Muñoz, José"))?.legacyId).toBe(7);
    expect(bestMatch(hits, name("Garcia, Jose"))).toBeNull();
  });
});

describe("getProfessorRating", () => {
  let t: TestDb;
  beforeAll(async () => {
    t = await createTestDb();
  });
  beforeEach(async () => {
    await t.reset();
  });
  afterAll(async () => {
    await t.close();
  });

  it("matches a messy GoSolar name (ported from matchesMessyGoSolarNameToRmpProfile)", async () => {
    const { fetchImpl, calls } = fakeFetch(response({ body: graphql(NEMIRA) }));
    const rating = await getProfessorRating("Nemira, Alina (Alina) ", { fetchImpl, cache: false });

    expect(rating).toMatchObject({
      professorQueried: "Nemira, Alina (Alina) ",
      found: true,
      matchedName: "Alina Nemira",
      matchQuality: "exact",
      legacyId: 3119831,
      avgRating: 1.7,
      profileUrl: "https://www.ratemyprofessors.com/professor/3119831",
      distribution: { r1: 1, r2: 0, r3: 0, r4: 0, r5: 2 },
    });
    expect(rating.topTags.map((tag) => tag.name)).toEqual([
      "Caring",
      "Respected",
      "Tough grader",
      "Clear grading",
      "Lots of homework",
    ]);

    const [call] = calls;
    expect(call.url).toBe(RMP_ENDPOINT);
    expect(call.init.method).toBe("POST");
    expect(call.init.headers.Authorization).toBe("Basic dGVzdDp0ZXN0");
    const body = JSON.parse(call.init.body ?? "{}") as { query: string; variables: unknown };
    expect(body.variables).toEqual({ query: { text: "Alina Nemira", schoolID: RMP_SCHOOL_ID } });
    expect(body.query).toContain("teacherRatingTags { tagName tagCount }");
  });

  it("reports not found when RMP has no match (reportsNotFoundWhenRmpHasNoMatch)", async () => {
    const { fetchImpl } = fakeFetch(response({ body: graphql() }));
    expect((await getProfessorRating("Doe, Jane", { fetchImpl, cache: false })).found).toBe(false);
  });

  it("skips the lookup for TBA and null (skipsLookupForTba)", async () => {
    const { fetchImpl, calls } = fakeFetch();
    expect((await getProfessorRating("TBA", { fetchImpl, db: t.db })).found).toBe(false);
    expect((await getProfessorRating(null, { fetchImpl, db: t.db })).found).toBe(false);
    expect(calls).toHaveLength(0);
  });

  it("caches hits for 24 h under the professor key", async () => {
    const now = new Date("2026-10-25T12:00:00Z");
    const { fetchImpl, calls } = fakeFetch(response({ body: graphql(NEMIRA) }), response({ body: graphql(NEMIRA) }));

    await getProfessorRating("Nemira, Alina (Alina) ", { fetchImpl, db: t.db, now });
    const cachedRead = await getProfessorRating("Alina Nemira", {
      fetchImpl,
      db: t.db,
      now: new Date(now.getTime() + RMP_HIT_TTL_MS - 1000),
    });
    expect(calls).toHaveLength(1);
    expect(cachedRead).toMatchObject({ found: true, legacyId: 3119831, professorQueried: "Alina Nemira" });

    const rows = await t.db.select().from(rmpCache);
    expect(rows.map((r) => r.queryKey)).toEqual(["rmp:v2:nemira|alina"]);
    expect(rows[0].payload).not.toHaveProperty("professorQueried");

    await getProfessorRating("Nemira, Alina", { fetchImpl, db: t.db, now: new Date(now.getTime() + RMP_HIT_TTL_MS) });
    expect(calls).toHaveLength(2);
  });

  it("ignores rows cached under the pre-v2 key (written by the old last-name fallback)", async () => {
    const now = new Date("2026-10-25T12:00:00Z");
    // A stale wrong hit from the old rules: Jane Smith got Robert Smith's rating.
    await t.db.insert(rmpCache).values({
      queryKey: "rmp:smith|jane",
      payload: { found: true, matchedName: "Robert Smith", legacyId: 111, avgRating: 4, topTags: [] },
      fetchedAt: now,
    });
    const robert = { first: "Robert", last: "Smith", legacyId: 111, numRatings: 50, rating: 4 };
    const { fetchImpl, calls } = fakeFetch(response({ body: graphql(robert) }));

    const rating = await getProfessorRating("Smith, Jane", { fetchImpl, db: t.db, now });
    expect(calls).toHaveLength(1);
    expect(rating.found).toBe(false);
    expect(rmpCacheKey(name("Smith, Jane"))).toBe("rmp:v2:smith|jane");

    // The fresh miss is now what later reads get, without another RMP call.
    expect((await getProfessorRating("Smith, Jane", { fetchImpl, db: t.db, now })).found).toBe(false);
    expect(calls).toHaveLength(1);
  });

  it("round-trips an initial match through the cache", async () => {
    const now = new Date("2026-10-25T12:00:00Z");
    const jennifer = { first: "Jennifer", last: "Smith", legacyId: 5, numRatings: 4, rating: 4 };
    const { fetchImpl, calls } = fakeFetch(response({ body: graphql(jennifer) }));
    const first = await getProfessorRating("Smith, J.", { fetchImpl, db: t.db, now });
    const second = await getProfessorRating("Smith, J", { fetchImpl, db: t.db, now });
    expect(calls).toHaveLength(1);
    expect(first).toMatchObject({ found: true, matchedName: "Jennifer Smith", matchQuality: "initial" });
    expect(second).toMatchObject({ found: true, matchedName: "Jennifer Smith", matchQuality: "initial", professorQueried: "Smith, J" });
  });

  it("caches misses as a null payload for 6 h", async () => {
    const now = new Date("2026-10-25T12:00:00Z");
    const { fetchImpl, calls } = fakeFetch(response({ body: graphql() }), response({ body: graphql() }));

    await getProfessorRating("Doe, Jane", { fetchImpl, db: t.db, now });
    const [row] = await t.db.select().from(rmpCache);
    expect(row.payload).toBeNull();

    await getProfessorRating("Doe, Jane", { fetchImpl, db: t.db, now: new Date(now.getTime() + RMP_MISS_TTL_MS - 1) });
    expect(calls).toHaveLength(1);
    await getProfessorRating("Doe, Jane", { fetchImpl, db: t.db, now: new Date(now.getTime() + RMP_MISS_TTL_MS) });
    expect(calls).toHaveLength(2);
  });

  it("does not cache failed requests", async () => {
    const { fetchImpl, calls } = fakeFetch(
      response({ status: 503, body: "busy" }),
      new Error("socket hang up"),
      response({ body: { errors: [{ message: "bad" }], data: { newSearch: { teachers: { edges: [{ node: {} }] } } } } }),
      response({ body: graphql(NEMIRA) }),
    );
    for (let i = 0; i < 3; i++) {
      expect((await getProfessorRating("Nemira, Alina", { fetchImpl, db: t.db })).found).toBe(false);
    }
    expect(await t.db.select().from(rmpCache)).toEqual([]);
    expect((await getProfessorRating("Nemira, Alina", { fetchImpl, db: t.db })).found).toBe(true);
    expect(calls).toHaveLength(4);
  });
});
