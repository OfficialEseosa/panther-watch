import { describe, expect, it, vi } from "vitest";
import { findSectionsByCrn, getSubjects, getTerms, isViewOnlyTerm, searchCourses } from "../client";
import { GoSolarAffinityError, GoSolarError } from "../errors";
import { GOSOLAR_BASE_URL, type FetchLike } from "../http";
import type { CourseData } from "../types";
import { DECLARE_OK, fakeFetch, response } from "./fake-fetch";

const searchBody = (data: Partial<CourseData>[] | null) =>
  response({
    body: { success: true, totalCount: data?.length ?? 0, data, pageOffset: 0, pageMaxSize: 200 },
  });

function query(url: string): [string, string][] {
  return [...new URL(url).searchParams.entries()];
}

describe("searchCourses", () => {
  it("builds the search URL with exactly GoSolar's parameter names", async () => {
    const { fetchImpl, calls } = fakeFetch(DECLARE_OK(), searchBody([]));
    await searchCourses({ term: "202608", subject: "CSC", courseNumber: "1301", level: "US" }, { fetchImpl });

    const url = calls[1].url;
    expect(url.startsWith(`${GOSOLAR_BASE_URL}/searchResults/searchResults?`)).toBe(true);
    expect(query(url)).toEqual([
      ["txt_subject", "CSC"],
      ["txt_courseNumber", "1301"],
      ["txt_term", "202608"],
      ["pageOffset", "0"],
      ["pageMaxSize", "200"],
      ["sortColumn", "subjectDescription"],
      ["sortDirection", "asc"],
      ["txt_level", "US"],
    ]);
    expect(calls[1].init.method).toBe("GET");
    expect(calls[1].init.headers.Cookie).toContain("BIGipServer");
  });

  it("omits txt_level when no level is given and sends an empty course number", async () => {
    const { fetchImpl, calls } = fakeFetch(DECLARE_OK(), searchBody([]));
    await searchCourses({ term: "202608", subject: "CSC" }, { fetchImpl });

    const params = new URL(calls[1].url).searchParams;
    expect(params.has("txt_level")).toBe(false);
    expect(params.get("txt_courseNumber")).toBe("");
  });

  it("omits txt_level when it is blank", async () => {
    const { fetchImpl, calls } = fakeFetch(DECLARE_OK(), searchBody([]));
    await searchCourses({ term: "202608", subject: "CSC", level: "  " }, { fetchImpl });
    expect(new URL(calls[1].url).searchParams.has("txt_level")).toBe(false);
  });

  it("passes page offset and size through", async () => {
    const { fetchImpl, calls } = fakeFetch(DECLARE_OK(), searchBody([]));
    await searchCourses({ term: "202608", subject: "CSC", pageOffset: 50, pageMaxSize: 25 }, { fetchImpl });
    const params = new URL(calls[1].url).searchParams;
    expect(params.get("pageOffset")).toBe("50");
    expect(params.get("pageMaxSize")).toBe("25");
  });

  it("throws GoSolarAffinityError when data is null with success:true", async () => {
    const { fetchImpl } = fakeFetch(DECLARE_OK(), searchBody(null));
    await expect(searchCourses({ term: "202608", subject: "CSC" }, { fetchImpl })).rejects.toBeInstanceOf(
      GoSolarAffinityError,
    );
  });

  it("makes exactly two requests (no resetDataForm)", async () => {
    const { fetchImpl, calls } = fakeFetch(DECLARE_OK(), searchBody([]));
    await searchCourses({ term: "202608", subject: "CSC" }, { fetchImpl });
    expect(calls).toHaveLength(2);
    expect(calls.some((call) => call.url.includes("resetDataForm"))).toBe(false);
  });

  it("wraps a non-OK search response in GoSolarError with status and url", async () => {
    const { fetchImpl } = fakeFetch(DECLARE_OK(), response({ status: 503 }));
    await expect(searchCourses({ term: "202608", subject: "CSC" }, { fetchImpl })).rejects.toMatchObject({
      name: "GoSolarError",
      status: 503,
      url: expect.stringContaining("/searchResults/searchResults?"),
    });
  });
});

describe("getTerms / getSubjects", () => {
  it("fetches terms without a session", async () => {
    const terms = [{ code: "202608", description: "Fall Semester 2026" }];
    const { fetchImpl, calls } = fakeFetch(response({ body: terms }));
    await expect(getTerms({ fetchImpl })).resolves.toEqual(terms);
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(`${GOSOLAR_BASE_URL}/classSearch/getTerms?offset=1&max=10`);
    expect(calls[0].init.dispatcher).toBeUndefined();
  });

  it("fetches subjects with GoSolar's parameter names and defaults", async () => {
    const { fetchImpl, calls } = fakeFetch(response({ body: [] }));
    await getSubjects({ searchTerm: "comp", term: "202608" }, { fetchImpl });
    expect(query(calls[0].url)).toEqual([
      ["searchTerm", "comp"],
      ["term", "202608"],
      ["offset", "1"],
      ["max", "10"],
    ]);
  });

  it("detects view-only terms", () => {
    expect(isViewOnlyTerm({ description: "Summer Semester 2026 (View only)" })).toBe(true);
    expect(isViewOnlyTerm({ description: "Summer Semester 2026 (View Only)" })).toBe(true);
    expect(isViewOnlyTerm({ description: "Fall Semester 2026" })).toBe(false);
    expect(isViewOnlyTerm(null)).toBe(false);
  });
});

describe("findSectionsByCrn", () => {
  it("searches each group and maps only the requested CRNs", async () => {
    const { fetchImpl, calls } = fakeFetch(
      DECLARE_OK(),
      searchBody([
        { courseReferenceNumber: "10001", seatsAvailable: 3 },
        { courseReferenceNumber: "10002", seatsAvailable: 0 },
      ]),
      DECLARE_OK(),
      searchBody([{ courseReferenceNumber: "20001", seatsAvailable: 1 }]),
    );

    const sections = await findSectionsByCrn(
      "202608",
      [
        { subject: "CSC", courseNumber: "1301", crns: ["10001"] },
        { subject: "MATH", courseNumber: "2211", crns: ["20001", "29999"] },
      ],
      { fetchImpl, concurrency: 1 },
    );

    expect([...sections.keys()].sort()).toEqual(["10001", "20001"]);
    expect(sections.get("10001")?.seatsAvailable).toBe(3);
    expect(calls).toHaveLength(4);
  });

  it("reports failed groups through onError and keeps the others", async () => {
    const { fetchImpl } = fakeFetch(
      DECLARE_OK(),
      searchBody(null),
      DECLARE_OK(),
      searchBody([{ courseReferenceNumber: "20001" }]),
    );
    const failures: string[] = [];

    const sections = await findSectionsByCrn(
      "202608",
      [
        { subject: "CSC", courseNumber: "1301", crns: ["10001"] },
        { subject: "MATH", courseNumber: "2211", crns: ["20001"] },
      ],
      { fetchImpl, concurrency: 1, onError: (group) => failures.push(group.subject) },
    );

    expect(failures).toEqual(["CSC"]);
    expect([...sections.keys()]).toEqual(["20001"]);
  });

  it("limits concurrency", async () => {
    let inFlight = 0;
    let peak = 0;
    const groups = Array.from({ length: 10 }, (_, i) => ({
      subject: "CSC",
      courseNumber: String(1000 + i),
      crns: [String(i)],
    }));
    const fetchImpl: FetchLike = async (url) => {
      inFlight++;
      peak = Math.max(peak, inFlight);
      await new Promise((resolve) => setTimeout(resolve, 5));
      inFlight--;
      return url.endsWith("/term/search") ? DECLARE_OK() : searchBody([]);
    };

    await findSectionsByCrn("202608", groups, { fetchImpl, concurrency: 3 });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });
});

describe("hardening", () => {
  const page = (total: number, crns: string[]) =>
    response({
      body: {
        success: true,
        totalCount: total,
        data: crns.map((courseReferenceNumber) => ({ courseReferenceNumber })),
        pageOffset: 0,
        pageMaxSize: 200,
      },
    });

  it("throws GoSolarError on success:false", async () => {
    const { fetchImpl } = fakeFetch(DECLARE_OK(), response({ body: { success: false } }));
    await expect(searchCourses({ term: "202608", subject: "CSC" }, { fetchImpl })).rejects.toBeInstanceOf(
      GoSolarError,
    );
  });

  it("wraps an unparseable body in GoSolarError", async () => {
    const bad = { ...response(), json: async () => JSON.parse("<html>") };
    const { fetchImpl } = fakeFetch(bad);
    await expect(getTerms({ fetchImpl })).rejects.toBeInstanceOf(GoSolarError);
  });

  it("follows pagination on the same session until totalCount", async () => {
    const { fetchImpl, calls } = fakeFetch(DECLARE_OK(), page(3, ["1", "2"]), page(3, ["3"]));
    const result = await searchCourses({ term: "202608", subject: "ENGL", pageMaxSize: 2 }, { fetchImpl });
    expect(result.data.map((c) => c.courseReferenceNumber)).toEqual(["1", "2", "3"]);
    expect(new URL(calls[2].url).searchParams.get("pageOffset")).toBe("2");
    expect(calls[2].init.dispatcher).toBe(calls[0].init.dispatcher);
  });

  it("returns one page when the caller asks for a specific offset", async () => {
    const { fetchImpl, calls } = fakeFetch(DECLARE_OK(), page(500, ["1"]));
    const result = await searchCourses({ term: "202608", subject: "ENGL", pageOffset: 0 }, { fetchImpl });
    expect(result.data).toHaveLength(1);
    expect(calls).toHaveLength(2);
  });

  it("stops at an empty page and warns about the shortfall", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { fetchImpl } = fakeFetch(DECLARE_OK(), page(5, ["1"]), page(5, []));
    const result = await searchCourses({ term: "202608", subject: "ENGL" }, { fetchImpl });
    expect(result.data).toHaveLength(1);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("caps collection at MAX_SEARCH_RESULTS", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const fetchImpl: FetchLike = async (url) => {
      if (url.endsWith("/term/search")) return DECLARE_OK();
      const offset = Number(new URL(url).searchParams.get("pageOffset"));
      return page(5000, Array.from({ length: 200 }, (_, i) => String(offset + i)));
    };
    const result = await searchCourses({ term: "202608", subject: "ENGL" }, { fetchImpl });
    expect(result.data).toHaveLength(1000);
    expect(warn).toHaveBeenCalledOnce();
    warn.mockRestore();
  });

  it("clamps a non-finite or silly concurrency instead of hanging or flooding", async () => {
    const groups = [{ subject: "CSC", courseNumber: "1301", crns: ["1"] }];
    for (const concurrency of [Number.NaN, Number.POSITIVE_INFINITY, -3, 0.2]) {
      const { fetchImpl } = fakeFetch(DECLARE_OK(), page(1, ["1"]));
      const sections = await findSectionsByCrn("202608", groups, { fetchImpl, concurrency });
      expect([...sections.keys()]).toEqual(["1"]);
    }
  });

  it("keeps going when onError itself throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { fetchImpl } = fakeFetch(DECLARE_OK(), searchBody(null), DECLARE_OK(), page(1, ["2"]));
    const sections = await findSectionsByCrn(
      "202608",
      [
        { subject: "CSC", courseNumber: "1301", crns: ["1"] },
        { subject: "MATH", courseNumber: "2211", crns: ["2"] },
      ],
      {
        fetchImpl,
        concurrency: 1,
        onError: () => {
          throw new Error("callback bug");
        },
      },
    );
    expect([...sections.keys()]).toEqual(["2"]);
    log.mockRestore();
  });
});
