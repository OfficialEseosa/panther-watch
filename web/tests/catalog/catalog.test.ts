import { NextRequest } from "next/server";
import { eq } from "drizzle-orm";
import { fetch as undiciFetch } from "undici";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

// `after()` needs Next's request scope; the cron route is only called with ?sync=1 here.
vi.mock("server-only", () => ({}));

import { GET as catalogGet, OPTIONS as catalogOptions } from "@/app/api/courses/catalog/route";
import { setDbForTests } from "@/db";
import { catalogCourses, catalogRefresh, jobRuns, terms } from "@/db/schema";
import { catalogLevel, formatCredits, refreshCatalog, splitCatalogDescription } from "@/lib/course-meta/catalog";
import {
  buildCatalogIndex,
  findCourses,
  resetCatalogCacheForTests,
  searchCatalog,
  stem,
  SYNONYM_TARGETS,
  tokenize,
} from "@/lib/course-meta/catalog-lookup";
import type { FetchLike } from "@/lib/gosolar";
import { setJobsGoSolarOptionsForTests } from "@/lib/jobs/gosolar-options";
import { catalogFixture, makeCatalogCourse } from "../helpers/catalog-fixture";
import { createTestDb, truncateAll, type TestDatabase } from "../helpers/db";
import { startFakeGoSolar, type FakeGoSolar } from "../helpers/fake-gosolar";

/**
 * The course catalog end to end: the refresh job against the fake GoSolar's course catalog
 * search (PGlite), its resumable progress, the cron route, `findCourses` ranking, and the public
 * GET /api/courses/catalog.
 */

const OPEN = "202701";
const IN_PROGRESS = "202608";
const SECRET = "test-cron-secret-0123456789abcdef";

let testDb: TestDatabase;
let gs: FakeGoSolar;

beforeAll(async () => {
  vi.stubEnv("CRON_SECRET", SECRET);
  testDb = await createTestDb();
  setDbForTests(testDb.db);
  gs = await startFakeGoSolar();
  setJobsGoSolarOptionsForTests({ baseUrl: gs.url });
});
afterAll(async () => {
  setJobsGoSolarOptionsForTests(undefined);
  setDbForTests(undefined);
  vi.unstubAllEnvs();
  await gs.close();
  await testDb.close();
});
beforeEach(async () => {
  await truncateAll(testDb.db);
  gs.reset();
  resetCatalogCacheForTests();
  gs.setCatalog(OPEN, catalogFixture());
});

const rows = () => testDb.db.select().from(catalogCourses).orderBy(catalogCourses.subject, catalogCourses.courseNumber);
const row = async (subject: string, courseNumber: string) =>
  (await rows()).find((r) => r.subject === subject && r.courseNumber === courseNumber);
const catalogSearches = () => gs.requests.filter((r) => r.path === "/courseSearchResults/courseSearchResults");
const declarations = () => gs.requests.filter((r) => r.path === "/term/search");

describe("parsing GoSolar's catalog records", () => {
  it("takes the full title from the description's first line and keeps the rest as the description", () => {
    expect(splitCatalogDescription("Calculus of One Variable II. \nPrerequisite: Math 2211.\nIntegration.")).toEqual({
      title: "Calculus of One Variable II",
      description: "Prerequisite: Math 2211.\nIntegration.",
    });
    expect(splitCatalogDescription("MATH 0996: Support for Elementary Statistics.\nSupport.").title).toBe("Support for Elementary Statistics");
    // No title line: everything is description (the caller falls back to Banner's short title).
    expect(splitCatalogDescription("Prerequisite: none.\nThis course covers things.")).toEqual({
      title: null,
      description: "Prerequisite: none.\nThis course covers things.",
    });
  });

  it("credits and level", () => {
    expect([formatCredits(3, null, null), formatCredits(1, 6, "TO"), formatCredits(3, 4, "OR"), formatCredits(null, null, null)]).toEqual([
      "3",
      "1-6",
      "3 or 4",
      null,
    ]);
    expect([
      catalogLevel("CSC", "1301", "AS"),
      catalogLevel("CSC", "1010", "PC"),
      catalogLevel("CSC", "6350", "AS"),
      catalogLevel("LAW", "5000", "LW"),
      catalogLevel("CSC", "TBA", "AS"),
    ]).toEqual(["US", "UA", "GS", "LW", null]);
  });

  it("tokenizes roman numerals, glued numbers and a lone I only after a word", () => {
    expect(tokenize("Calculus II")).toEqual(["calculus", "2"]);
    expect(tokenize("calc2 & cs1")).toEqual(["calc", "2", "and", "cs", "1"]);
    expect(tokenize("Can I take calc I?", { query: true })).toEqual(["can", "i", "take", "calc", "1"]);
  });
});

describe("refreshCatalog", () => {
  it("stores every course of every subject: one courseSearch session per batch, one search per session", async () => {
    const result = await refreshCatalog({ terms: [OPEN], gosolar: { baseUrl: gs.url }, subjectsPerSession: 3 });
    expect(result).toEqual({
      terms: [{ term: OPEN, status: "finished", subjects: 4, courses: 40, subjectsTotal: 4, cursor: null }],
      outOfTime: false,
    });
    expect(await rows()).toHaveLength(40);
    expect(await row("CSC", "1301")).toMatchObject({
      title: "Principles of Computer Science I",
      description: expect.stringMatching(/^Prerequisite: Only for STEM majors and minors\. Co-requisite: CSC 1301L\.\nThis course is an introduction/),
      credits: "4",
      level: "US",
      source: "gosolar",
      firstSeenTerm: OPEN,
      lastSeenTerm: OPEN,
    });
    expect(await row("CSC", "1010")).toMatchObject({ title: "Computers and Applications", level: "UA" });
    expect(await row("CSC", "6350")).toMatchObject({ level: "GS" });
    expect(await row("CSC", "4352")).toMatchObject({ credits: "1-3" });
    expect(await row("PHYS", "1111K")).toMatchObject({ title: "Introductory Physics I", credits: "4" });

    // 4 subjects in batches of 3: two sessions declared for the course catalog, each searched once
    // (one page each) with its own subject list, in code order.
    expect(declarations().map((r) => r.query.mode)).toEqual(["courseSearch", "courseSearch"]);
    expect(catalogSearches().map((r) => r.query.txt_subject)).toEqual(["CSC,ENGL,MATH", "PHYS"]);
    expect(new Set(catalogSearches().map((r) => r.cookies.JSESSIONID)).size).toBe(2);
    expect(await testDb.db.select().from(catalogRefresh)).toEqual([
      expect.objectContaining({ term: OPEN, cursor: null, coursesSeen: 40, passFinishedAt: expect.any(Date) }),
    ]);
  });

  it("pages a large batch on the same session", async () => {
    gs.setCatalog(OPEN, [
      ...catalogFixture(),
      ...Array.from({ length: 520 }, (_, i) =>
        makeCatalogCourse({ code: `MATH ${7000 + i}`, short: "SELECTED TOPICS", title: `Selected Topics ${i}`, about: "Topics." }),
      ),
    ]);
    await refreshCatalog({ terms: [OPEN], gosolar: { baseUrl: gs.url } });
    expect(catalogSearches().map((r) => r.query.pageOffset)).toEqual(["0", "500"]);
    expect(new Set(catalogSearches().map((r) => r.cookies.JSESSIONID)).size).toBe(1);
    expect(await rows()).toHaveLength(560);
  });

  it("updates changed courses and widens first/last seen; the newer term's text wins", async () => {
    gs.setCatalog(IN_PROGRESS, catalogFixture());
    await refreshCatalog({ terms: [IN_PROGRESS], gosolar: { baseUrl: gs.url } });
    expect(await row("CSC", "2720")).toMatchObject({ firstSeenTerm: IN_PROGRESS, lastSeenTerm: IN_PROGRESS });

    const renamed = catalogFixture().map((c) =>
      c.subject === "CSC" && c.courseNumber === "2720" ? { ...c, courseDescription: "Data Structures and Algorithms.\nNew text." } : c,
    );
    gs.setCatalog(OPEN, renamed);
    await refreshCatalog({ terms: [OPEN], gosolar: { baseUrl: gs.url } });
    expect(await row("CSC", "2720")).toMatchObject({
      title: "Data Structures and Algorithms",
      description: "New text.",
      firstSeenTerm: IN_PROGRESS,
      lastSeenTerm: OPEN,
    });

    // Refreshing the older term again (forced) doesn't bring its older text back.
    await refreshCatalog({ terms: [IN_PROGRESS], gosolar: { baseUrl: gs.url }, force: true });
    expect(await row("CSC", "2720")).toMatchObject({ title: "Data Structures and Algorithms", lastSeenTerm: OPEN });
  });

  it("is resumable: out of time after two batches, the next run continues after the stored cursor, then the term rests", async () => {
    // Every GoSolar request "takes" 10 s on a fake clock: the subject list (10 s), then 20 s a batch
    // (declare + search). Budget 45 s with a 12 s reserve: two batches fit.
    let clock = 0;
    const slowFetch: FetchLike = async (url, init) => {
      clock += 10_000;
      return undiciFetch(url, init) as unknown as ReturnType<FetchLike>;
    };
    const run = () =>
      refreshCatalog({ terms: [OPEN], gosolar: { baseUrl: gs.url, fetchImpl: slowFetch }, subjectsPerSession: 1, budgetMs: 45_000, now: () => clock });

    const first = await run();
    expect(first).toEqual({
      terms: [{ term: OPEN, status: "partial", subjects: 2, courses: 19, subjectsTotal: 4, cursor: "ENGL" }],
      outOfTime: true,
    });
    expect(new Set((await rows()).map((r) => r.subject))).toEqual(new Set(["CSC", "ENGL"]));
    expect(await testDb.db.select().from(catalogRefresh)).toEqual([
      expect.objectContaining({ cursor: "ENGL", coursesSeen: 19, passFinishedAt: null }),
    ]);

    gs.requests.length = 0;
    const second = await run();
    expect(second.terms[0]).toMatchObject({ status: "finished", subjects: 2, courses: 21, cursor: null });
    expect(catalogSearches().map((r) => r.query.txt_subject)).toEqual(["MATH", "PHYS"]);
    expect(await rows()).toHaveLength(40);
    expect(await testDb.db.select().from(catalogRefresh)).toEqual([
      expect.objectContaining({ cursor: null, coursesSeen: 40, passFinishedAt: expect.any(Date) }),
    ]);

    // Finished less than a day ago: the next run doesn't touch GoSolar.
    gs.requests.length = 0;
    expect((await run()).terms[0]).toMatchObject({ status: "done_recently", subjects: 0 });
    expect(gs.requests).toHaveLength(0);
  });

  it("a failed batch keeps the cursor where it was and reports the error; the next run retries it", async () => {
    gs.failNextCatalogSearches({ kind: "http", status: 500 });
    const failed = await refreshCatalog({ terms: [OPEN], gosolar: { baseUrl: gs.url }, subjectsPerSession: 2 });
    expect(failed.terms[0]).toMatchObject({ status: "partial", subjects: 0, cursor: null, error: expect.stringMatching(/^CSC-ENGL: GoSolar responded 500/) });
    expect(await rows()).toHaveLength(0);

    const retried = await refreshCatalog({ terms: [OPEN], gosolar: { baseUrl: gs.url }, subjectsPerSession: 2 });
    expect(retried.terms[0]).toMatchObject({ status: "finished", subjects: 4, courses: 40 });
  });
});

describe("POST /api/cron/catalog", () => {
  it("refreshes the registrable terms (default and in progress) and records a job run", async () => {
    await testDb.db.insert(terms).values([
      { code: OPEN, description: "Spring Semester 2027", viewOnly: false },
      { code: IN_PROGRESS, description: "Fall Semester 2026", viewOnly: false },
      { code: "202605", description: "Summer Semester 2026 (View Only)", viewOnly: true },
    ]);
    gs.setCatalog(IN_PROGRESS, catalogFixture().slice(0, 10));
    const { POST } = await import("@/app/api/cron/catalog/route");
    const request = (secret: string) =>
      new NextRequest("http://localhost:3000/api/cron/catalog?sync=1", { method: "POST", headers: { authorization: `Bearer ${secret}` } });

    expect((await POST(request("wrong"))).status).toBe(401);
    const response = await POST(request(SECRET));
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({
      outOfTime: false,
      errors: [],
      terms: [
        { term: OPEN, status: "finished", courses: 40 },
        { term: IN_PROGRESS, status: "finished", courses: 10 },
      ],
    });
    const [run] = await testDb.db.select().from(jobRuns).where(eq(jobRuns.job, "catalog"));
    expect(run).toMatchObject({ ok: true, finishedAt: expect.any(Date) });
    expect(await rows()).toHaveLength(40);

    // Run again the same day: both terms rest, nothing asked of GoSolar.
    gs.requests.length = 0;
    expect((await (await POST(request(SECRET))).json()).terms.map((t: { status: string }) => t.status)).toEqual(["done_recently", "done_recently"]);
    expect(gs.requests.filter((r) => r.path !== "/classSearch/getTerms")).toHaveLength(0);
  });
});

describe("findCourses", () => {
  beforeEach(async () => {
    await refreshCatalog({ terms: [OPEN], gosolar: { baseUrl: gs.url } });
  });

  const top = async (query: string, level?: "US" | "UA" | "GS" | "LW") => {
    const found = await findCourses(query, { level });
    return {
      code: found.candidates[0] ? `${found.candidates[0].subject} ${found.candidates[0].courseNumber}` : null,
      confidence: found.confidence,
      matchedBy: found.matchedBy,
      matched: found.matched,
    };
  };

  it.each([
    ["csc 1301", "CSC 1301"],
    ["CSC1301", "CSC 1301"],
    ["is math-2212 hard?", "MATH 2212"],
    ["CSC 6350", "CSC 6350"],
  ])("an exact code wins outright (any level): %s", async (query, code) => {
    expect(await top(query, "US")).toMatchObject({ code, confidence: "high", matchedBy: "code" });
  });

  it.each([
    ["calculus 2", "MATH 2212", "calculus 2"],
    ["Calc II", "MATH 2212", "calc 2"],
    ["calc 1", "MATH 2211", "calc 1"],
    ["calc 3", "MATH 2215", "calc 3"],
    ["intro to programming", "CSC 1301", "intro to programming"],
    ["cs1", "CSC 1301", "cs 1"],
    ["data structures", "CSC 2720", "data structures"],
    ["discrete math", "MATH 2420", "discrete math"],
    ["linear algebra", "MATH 2641", "linear algebra"],
    ["stats", "MATH 1401", "stats"],
    ["precalc", "MATH 1113", "precalc"],
    ["college algebra", "MATH 1111", "college algebra"],
    ["english comp 1", "ENGL 1101", "english comp 1"],
    ["English Composition II", "ENGL 1102", "english composition 2"],
    ["Can you compare the professors for calculus 2?", "MATH 2212", "calculus 2"],
  ])("a nickname maps to its course: %s", async (query, code, matched) => {
    expect(await top(query, "US")).toEqual({ code, confidence: "high", matchedBy: "nickname", matched });
  });

  it("title words: a clear title is high at the student's level; 4000/6000 twins are ambiguous across levels", async () => {
    expect(await top("software engineering", "US")).toEqual({ code: "CSC 4350", confidence: "high", matchedBy: "title", matched: "software engineering" });
    expect(await top("software engineering", "GS")).toMatchObject({ code: "CSC 6350", confidence: "high" });
    const both = await findCourses("software engineering");
    expect(both.confidence).toBe("ambiguous");
    expect(both.candidates.slice(0, 2).map((c) => c.courseNumber)).toEqual(["4350", "6350"]);
    expect(await top("linear algebra 2", "US")).toMatchObject({ code: "MATH 4435", confidence: "high" });
  });

  it("a misspelt (one edit) or shortened word still finds the title", async () => {
    expect(await top("algoritms", "US")).toMatchObject({ code: "CSC 4520", matchedBy: "title" });
    expect(await top("multivariate calc", "US")).toMatchObject({ code: "MATH 2215", confidence: "high" });
    expect(await top("databse systems", "US")).toMatchObject({ code: "CSC 4710", matchedBy: "title" });
  });

  it("ambiguous: a nickname with two courses, or titles that fit several courses", async () => {
    const physics = await findCourses("physics 1", { level: "US" });
    expect(physics.confidence).toBe("ambiguous");
    expect(physics.candidates.slice(0, 2).map((c) => `${c.subject} ${c.courseNumber}`)).toEqual(["PHYS 1111", "PHYS 2211"]);
    expect((await top("capstone", "US")).confidence).toBe("ambiguous");
    expect((await findCourses("capstone")).candidates.map((c) => c.courseNumber).slice(0, 2)).toEqual(["4351", "4352"]);
  });

  it("a lecture and its combined lecture/lab (K) are one course for the confidence", async () => {
    const found = await findCourses("principles of physics 1", { level: "US" });
    expect(found.confidence).toBe("high");
    expect(found.candidates.slice(0, 2).map((c) => c.courseNumber)).toEqual(["2211", "2211K"]);
  });

  it("the level filter: UA means Perimeter's courses and undergraduate courses below 3000", async () => {
    expect(await top("computers and applications", "UA")).toMatchObject({ code: "CSC 1010", confidence: "high" });
    expect(await top("computers and applications", "US")).toMatchObject({ code: "CSC 1010" });
    expect(await top("computers and applications", "GS")).toMatchObject({ code: null, confidence: "none" });
    expect(await top("data structures", "UA")).toMatchObject({ code: "CSC 2720" });
    expect(await top("software engineering", "UA")).toMatchObject({ code: null, confidence: "none" });
  });

  it("description words alone score low; nothing at all is 'none'", async () => {
    expect(await top("linked lists hashing", "US")).toMatchObject({ code: "CSC 2720", confidence: "ambiguous", matchedBy: "description" });
    expect(await top("underwater basket weaving", "US")).toEqual({ code: null, confidence: "none", matchedBy: null, matched: "" });
    expect(await top("can you help me pick a class?", "US")).toMatchObject({ code: null, confidence: "none" });
  });

  it("a nickname whose course isn't in the catalog yields nothing, never a made-up code", async () => {
    expect(await top("chem 1", "US")).toMatchObject({ code: null, confidence: "none" });
    // Every nickname target in this fixture's subjects exists in it.
    const codes = new Set(catalogFixture().map((c) => `${c.subject} ${c.courseNumber}`));
    expect(SYNONYM_TARGETS.filter((t) => ["CSC", "MATH", "ENGL", "PHYS"].includes(t.split(" ")[0]) && !codes.has(t))).toEqual([]);
  });

  it("an exact title beats a longer title that contains it; word families match ('ethics' ~ Ethical)", () => {
    // Titles from live GoSolar (2026-11-02).
    const index = buildCatalogIndex([
      { subject: "CSC", courseNumber: "4350", title: "Software Engineering - CTW", description: null, credits: "4", level: "US" },
      { subject: "CSC", courseNumber: "4226", title: "Secure Software Engineering", description: null, credits: "3", level: "US" },
      { subject: "CSC", courseNumber: "2920", title: "Ethical and Social Issues in Computing", description: null, credits: "3", level: "US" },
      { subject: "CSC", courseNumber: "4311", title: "Cloud Computing", description: null, credits: "3", level: "US" },
    ]);
    const exact = searchCatalog(index, "software engineering");
    expect(exact.confidence).toBe("high");
    expect(exact.candidates.map((c) => [c.courseNumber, c.score])).toEqual([
      ["4350", 0.97],
      ["4226", 0.65],
    ]);
    const ethics = searchCatalog(index, "ethics in computing");
    expect(ethics).toMatchObject({ matchedBy: "title", matched: "ethics computing", confidence: "ambiguous" });
    expect(ethics.candidates[0].courseNumber).toBe("2920");
    expect([stem("ethics"), stem("ethical"), stem("computing"), stem("computers")]).toEqual(["ethic", "ethic", "comput", "comput"]);
  });

  it("a nickname inside a longer name doesn't take over ('business statistics' is not Elementary Statistics)", async () => {
    const found = await findCourses("probability and statistics for computer science", { level: "US" });
    expect(found.candidates[0]).toMatchObject({ subject: "MATH", courseNumber: "3020" });
    expect(found.matchedBy).toBe("title");
  });
});

describe("GET /api/courses/catalog", () => {
  beforeEach(async () => {
    await refreshCatalog({ terms: [OPEN], gosolar: { baseUrl: gs.url } });
  });

  const get = async (query: string) => {
    const response = await catalogGet(new NextRequest(`http://localhost:3000/api/courses/catalog${query}`));
    return { response, body: await response.json() };
  };

  it("ranks the catalog for a name, with CORS and an hour of CDN cache", async () => {
    const { response, body } = await get("?q=calculus%202&level=us&limit=3");
    expect(response.status).toBe(200);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=3600");
    expect(body).toMatchObject({ query: "calculus 2", level: "US", confidence: "high", matchedBy: "nickname", matched: "calculus 2" });
    expect(body.courses).toHaveLength(3);
    expect(body.courses[0]).toEqual({
      subject: "MATH",
      courseNumber: "2212",
      title: "Calculus of One Variable II",
      description: "Prerequisite: Math 2201 or Math 2211 with a C or higher.\nApplications and techniques of integration; transcendental functions; sequences and series.",
      credits: "4",
      level: "US",
      score: 1,
    });
  });

  it("no level: every level; bad input is a 400 with CORS", async () => {
    const { body } = await get("?q=software%20engineering");
    expect(body).toMatchObject({ level: null, confidence: "ambiguous" });
    for (const query of ["", "?q=a", "?q=calc&level=XX", "?q=calc&limit=99"]) {
      const { response, body: error } = await get(query);
      expect(response.status).toBe(400);
      expect(error.error.code).toBe("invalid_request");
      expect(response.headers.get("access-control-allow-origin")).toBe("*");
    }
  });

  it("answers CORS preflights", async () => {
    const response = catalogOptions();
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-methods")).toBe("GET, OPTIONS");
  });
});
