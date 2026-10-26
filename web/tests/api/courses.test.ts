import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/session")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  ...(await import("../helpers/session")).nextServerMock,
}));

// Course-meta getters hit RateMyProfessors and tables that are not in the core migration;
// stub them (professorKey etc. stay real).
const metaCalls = { grades: 0, rating: 0, syllabus: 0 };
vi.mock("@/lib/course-meta", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/course-meta")>();
  return {
    ...actual,
    getCourseGrades: async (query: { subject: string; courseNumber: string }) => {
      metaCalls.grades++;
      return {
        subject: query.subject,
        courseNumber: query.courseNumber,
        hasData: false,
        termsIncluded: [],
        overall: null,
        professors: [],
        instructorQueried: null,
        instructorHasTaught: false,
        instructorDistribution: null,
      };
    },
    getProfessorRating: async (name: string) => {
      metaCalls.rating++;
      if (name.includes("Broken")) throw new Error("RMP exploded with internal details");
      return { professorQueried: name, found: true, matchedName: name, avgRating: 4.2 };
    },
    getSyllabus: async (_term: string, crn: string) => {
      metaCalls.syllabus++;
      return crn === "80001" ? { url: "https://cdn.example.test/syllabus.pdf" } : null;
    },
  };
});

import { setDbForTests } from "@/db";
import { GET as metaGet } from "@/app/api/courses/meta/route";
import { POST as metaBatch } from "@/app/api/courses/meta/batch/route";
import { GET as searchGet } from "@/app/api/courses/search/route";
import { GET as subjectsGet } from "@/app/api/courses/subjects/route";
import { GET as termsGet } from "@/app/api/courses/terms/route";
import { setGoSolarOptionsForTests } from "@/lib/courses";
import { createTestDb, truncateAll, type TestDatabase } from "../helpers/db";
import { makeSection, makeTerm, startFakeGoSolar, type FakeGoSolar } from "../helpers/fake-gosolar";
import { apiRequest, call } from "../helpers/session";

let testDb: TestDatabase;
let gs: FakeGoSolar;

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
  metaCalls.grades = metaCalls.rating = metaCalls.syllabus = 0;
});

async function get(handler: Parameters<typeof call>[0], path: string) {
  const response = await call(handler, await apiRequest(path));
  return { response, body: (await response.json()) as Record<string, unknown> };
}

describe("GET /api/courses/terms", () => {
  it("serves terms from the cache: GoSolar is asked once, open terms first", async () => {
    gs.setTerms([
      makeTerm("202705", "Summer Semester 2027 (View Only)"),
      makeTerm("202701", "Spring Semester 2027"),
      makeTerm("202608", "Fall Semester 2026 (View only)"),
    ]);

    const first = await get(termsGet, "/api/courses/terms");
    expect(first.response.status).toBe(200);
    expect(first.response.headers.get("cache-control")).toContain("s-maxage=300");
    expect(first.body.terms).toEqual([
      { code: "202701", description: "Spring Semester 2027", viewOnly: false },
      { code: "202705", description: "Summer Semester 2027 (View Only)", viewOnly: true },
      { code: "202608", description: "Fall Semester 2026 (View only)", viewOnly: true },
    ]);

    const second = await get(termsGet, "/api/courses/terms");
    expect(second.body.terms).toEqual(first.body.terms);
    expect(gs.requests.filter((r) => r.path === "/classSearch/getTerms")).toHaveLength(1);
  });

  it("answers 502 with a clean body when the cache is empty and GoSolar is unreachable", async () => {
    setGoSolarOptionsForTests({ baseUrl: "http://127.0.0.1:9/StudentRegistrationSsb/ssb", timeoutMs: 2_000 });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { response, body } = await get(termsGet, "/api/courses/terms");
      expect(response.status).toBe(502);
      expect(body).toEqual({ error: { code: "upstream_unavailable", message: expect.any(String) } });
    } finally {
      errors.mockRestore();
      setGoSolarOptionsForTests({ baseUrl: gs.url });
    }
  });
});

describe("GET /api/courses/search", () => {
  it("returns the configured sections, with no-store caching", async () => {
    const a = makeSection({ term: "202701", courseReferenceNumber: "80001" });
    const b = makeSection({ term: "202701", courseReferenceNumber: "80002", seatsAvailable: 0 });
    gs.setSections("202701", "CSC", "1301", [a, b]);

    const { response, body } = await get(searchGet, "/api/courses/search?term=202701&subject=csc&courseNumber=1301&level=US");
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(body.sections).toEqual([a, b]);
    const search = gs.requests.find((r) => r.path === "/searchResults/searchResults");
    expect(search?.query).toMatchObject({ txt_subject: "CSC", txt_courseNumber: "1301", txt_level: "US" });
  });

  it("searches a whole subject when courseNumber is blank", async () => {
    gs.setSections("202701", "CSC", "1301", [makeSection({ term: "202701" })]);
    gs.setSections("202701", "CSC", "2720", [makeSection({ term: "202701", courseNumber: "2720" })]);
    const { body } = await get(searchGet, "/api/courses/search?term=202701&subject=CSC&courseNumber=");
    expect(body.sections).toHaveLength(2);
  });

  it.each([
    ["missing subject", "/api/courses/search?term=202701"],
    ["bad term", "/api/courses/search?term=2027&subject=CSC"],
    ["bad subject", "/api/courses/search?term=202701&subject=C5C"],
    ["bad course number", "/api/courses/search?term=202701&subject=CSC&courseNumber=13-01"],
  ])("rejects %s with 400", async (_label, path) => {
    const { response, body } = await get(searchGet, path);
    expect(response.status).toBe(400);
    expect(body).toMatchObject({ error: { code: "invalid_request" } });
    expect(gs.requests).toHaveLength(0);
  });

  it("maps a GoSolar affinity failure to 502 without leaking details", async () => {
    gs.setSections("202701", "CSC", "1301", [makeSection({ term: "202701" })]);
    gs.failNextSearches({ kind: "affinity" });
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { response, body } = await get(searchGet, "/api/courses/search?term=202701&subject=CSC&courseNumber=1301");
      expect(response.status).toBe(502);
      expect(body).toEqual({
        error: { code: "upstream_unavailable", message: expect.any(String) },
      });
      expect(JSON.stringify(body)).not.toMatch(/affinity|BIGip|cookie|stack|at /i);
    } finally {
      errors.mockRestore();
    }
  });
});

describe("GET /api/courses/subjects", () => {
  it("filters subjects for a term", async () => {
    gs.setSubjects("202701", [
      { code: "CSC", description: "Computer Science" },
      { code: "MATH", description: "Mathematics" },
    ]);
    const { response, body } = await get(subjectsGet, "/api/courses/subjects?term=202701&q=comp");
    expect(response.status).toBe(200);
    expect(body.subjects).toEqual([{ code: "CSC", description: "Computer Science" }]);
  });

  it("requires a valid term", async () => {
    const { response } = await get(subjectsGet, "/api/courses/subjects?q=comp");
    expect(response.status).toBe(400);
  });
});

describe("course meta", () => {
  it("GET /api/courses/meta returns grades, rating and syllabus", async () => {
    const { response, body } = await get(
      metaGet,
      "/api/courses/meta?term=202701&subject=CSC&courseNumber=1301&crn=80001&instructor=Instructor,%20Test",
    );
    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      grades: { subject: "CSC", courseNumber: "1301", instructorQueried: "Instructor, Test" },
      rating: { found: true, professorQueried: "Instructor, Test" },
      syllabus: { url: "https://cdn.example.test/syllabus.pdf" },
    });
  });

  it("GET /api/courses/meta turns a failed lookup into null, not an error", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const { response, body } = await get(
        metaGet,
        "/api/courses/meta?term=202701&subject=CSC&courseNumber=1301&crn=80002&instructor=Broken,%20Prof",
      );
      expect(response.status).toBe(200);
      expect(body.rating).toBeNull();
      expect(body.syllabus).toBeNull();
      expect(JSON.stringify(body)).not.toContain("exploded");
    } finally {
      warn.mockRestore();
    }
  });

  it("GET /api/courses/meta validates input", async () => {
    const { response } = await get(metaGet, "/api/courses/meta?term=202701&subject=CSC&courseNumber=1301");
    expect(response.status).toBe(400);
  });

  it("POST /api/courses/meta/batch dedupes lookups and keeps order", async () => {
    const items = Array.from({ length: 12 }, (_, i) => ({
      term: "202701",
      subject: "CSC",
      courseNumber: "1301",
      crn: String(80001 + i),
      instructor: i % 2 === 0 ? "Instructor, Test" : "Test Instructor",
    }));
    const response = await call(metaBatch, await apiRequest("/api/courses/meta/batch", { method: "POST", body: { items } }));
    expect(response.status).toBe(200);
    const body = (await response.json()) as { items: Array<{ syllabus: unknown; rating: { professorQueried: string } }> };
    expect(body.items).toHaveLength(12);
    expect(body.items[0].syllabus).toEqual({ url: "https://cdn.example.test/syllabus.pdf" });
    expect(body.items[1].syllabus).toBeNull();
    expect(body.items[1].rating.professorQueried).toBe("Test Instructor");
    // One course, one professor (two spellings of the same name).
    expect(metaCalls.grades).toBe(1);
    expect(metaCalls.rating).toBe(1);
    expect(metaCalls.syllabus).toBe(12);
  });

  it("POST /api/courses/meta/batch rejects more than 50 items and cross-origin calls", async () => {
    const item = { term: "202701", subject: "CSC", courseNumber: "1301", crn: "80001" };
    const tooMany = await call(
      metaBatch,
      await apiRequest("/api/courses/meta/batch", { method: "POST", body: { items: Array(51).fill(item) } }),
    );
    expect(tooMany.status).toBe(400);
    const crossOrigin = await call(
      metaBatch,
      await apiRequest("/api/courses/meta/batch", { method: "POST", body: { items: [item] }, origin: "https://evil.test" }),
    );
    expect(crossOrigin.status).toBe(403);
    const notJson = await call(metaBatch, await apiRequest("/api/courses/meta/batch", { method: "POST", body: "{nope" }));
    expect(notJson.status).toBe(400);
  });
});
