import { describe, expect, it, vi } from "vitest";
import {
  COURSES_PER_SEARCH,
  MAX_COMBO_RESULTS,
  findSectionsByCrn,
  getSubjects,
  getTerms,
  isViewOnlyTerm,
  searchCourses,
} from "../client";
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
  const sec = (subject: string, courseNumber: string, crn: string, extra: Partial<CourseData> = {}) => ({
    subject,
    courseNumber,
    courseReferenceNumber: crn,
    ...extra,
  });
  const comboBody = (data: Partial<CourseData>[] | null, totalCount = data?.length ?? 0) =>
    response({ body: { success: true, totalCount, data, pageOffset: 0, pageMaxSize: 500 } });

  it("searches every group in one session with txt_subjectcoursecombo and keeps only requested sections", async () => {
    const { fetchImpl, calls } = fakeFetch(
      DECLARE_OK(),
      comboBody([
        sec("CSC", "1301", "10001", { seatsAvailable: 3 }),
        sec("CSC", "1301", "10002", { seatsAvailable: 0 }),
        sec("MATH", "2211", "20001", { seatsAvailable: 1 }),
      ]),
    );

    const sections = await findSectionsByCrn(
      "202608",
      [
        { subject: "CSC", courseNumber: "1301", crns: ["10001"] },
        { subject: "MATH", courseNumber: "2211", crns: ["20001", "29999"] },
      ],
      { fetchImpl },
    );

    expect([...sections.keys()].sort()).toEqual(["10001", "20001"]);
    expect(sections.get("10001")?.seatsAvailable).toBe(3);
    expect(calls).toHaveLength(2);
    expect(query(calls[1].url)).toEqual([
      ["txt_subjectcoursecombo", "CSC1301,MATH2211"],
      ["txt_term", "202608"],
      ["pageOffset", "0"],
      ["pageMaxSize", "500"],
      ["sortColumn", "subjectDescription"],
      ["sortDirection", "asc"],
    ]);
    expect(calls[1].init.dispatcher).toBe(calls[0].init.dispatcher);
  });

  it("matches subject and course number too, not just the CRN", async () => {
    const { fetchImpl } = fakeFetch(DECLARE_OK(), comboBody([sec("CHEM", "1212L", "30001"), sec("CHEM", "1212", "30002")]));
    const sections = await findSectionsByCrn(
      "202608",
      // 30001 belongs to CHEM 1212L, so it must not be returned for a CHEM 1212 group.
      [{ subject: "CHEM", courseNumber: "1212", crns: ["30001", "30002"] }],
      { fetchImpl },
    );
    expect([...sections.keys()]).toEqual(["30002"]);
  });

  it("decodes HTML entities in kept sections only", async () => {
    const { fetchImpl } = fakeFetch(
      DECLARE_OK(),
      comboBody([
        sec("ARTH", "1700", "1", { courseTitle: "Art &amp; Society" }),
        sec("ARTH", "1700", "2", { courseTitle: "Skipped &amp; Raw" }),
      ]),
    );
    const sections = await findSectionsByCrn("202608", [{ subject: "ARTH", courseNumber: "1700", crns: ["1"] }], { fetchImpl });
    expect(sections.get("1")?.courseTitle).toBe("Art & Society");
  });

  it("pages a combined search on the same session until totalCount", async () => {
    const rows = (from: number, n: number) => Array.from({ length: n }, (_, i) => sec("ENGL", "1101", String(from + i)));
    const { fetchImpl, calls } = fakeFetch(DECLARE_OK(), comboBody(rows(0, 500), 700), comboBody(rows(500, 200), 700));
    const sections = await findSectionsByCrn("202608", [{ subject: "ENGL", courseNumber: "1101", crns: ["3", "650"] }], { fetchImpl });
    expect([...sections.keys()].sort()).toEqual(["3", "650"]);
    expect(calls).toHaveLength(3);
    expect(new URL(calls[2].url).searchParams.get("pageOffset")).toBe("500");
    expect(calls[2].init.dispatcher).toBe(calls[0].init.dispatcher);
  });

  it("splits a batch into one session per batchSize courses", async () => {
    const groups = Array.from({ length: 5 }, (_, i) => ({ subject: "CSC", courseNumber: String(1000 + i), crns: [String(i)] }));
    const combos: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      if (url.endsWith("/term/search")) return DECLARE_OK();
      combos.push(new URL(url).searchParams.get("txt_subjectcoursecombo") ?? "");
      return comboBody([]);
    };
    await findSectionsByCrn("202608", groups, { fetchImpl, batchSize: 2, concurrency: 1 });
    expect(combos).toEqual(["CSC1000,CSC1001", "CSC1002,CSC1003", "CSC1004"]);
  });

  it("defaults to COURSES_PER_SEARCH courses per session", async () => {
    const groups = Array.from({ length: COURSES_PER_SEARCH + 1 }, (_, i) => ({
      subject: "CSC",
      courseNumber: String(1000 + i),
      crns: [String(i)],
    }));
    let sessions = 0;
    const fetchImpl: FetchLike = async (url) => {
      if (url.endsWith("/term/search")) {
        sessions++;
        return DECLARE_OK();
      }
      return comboBody([]);
    };
    await findSectionsByCrn("202608", groups, { fetchImpl });
    expect(sessions).toBe(2);
  });

  it("splits a combined search that matches too many sections in half and retries", async () => {
    const combos: string[] = [];
    const fetchImpl: FetchLike = async (url) => {
      if (url.endsWith("/term/search")) return DECLARE_OK();
      const combo = new URL(url).searchParams.get("txt_subjectcoursecombo") ?? "";
      combos.push(combo);
      if (combo.includes(",")) return comboBody([], MAX_COMBO_RESULTS + 1);
      return comboBody([sec("CSC", combo.slice(3), combo.slice(3))]);
    };
    const sections = await findSectionsByCrn(
      "202608",
      [
        { subject: "CSC", courseNumber: "1301", crns: ["1301"] },
        { subject: "CSC", courseNumber: "1302", crns: ["1302"] },
      ],
      { fetchImpl },
    );
    expect(combos).toEqual(["CSC1301,CSC1302", "CSC1301", "CSC1302"]);
    expect([...sections.keys()].sort()).toEqual(["1301", "1302"]);
  });

  it("reports every group of a failed combined search through onError and keeps other batches", async () => {
    const fetchImpl: FetchLike = async (url) => {
      if (url.endsWith("/term/search")) return DECLARE_OK();
      const combo = new URL(url).searchParams.get("txt_subjectcoursecombo") ?? "";
      return combo.startsWith("CSC") ? comboBody(null) : comboBody([sec("MATH", "2211", "20001")]);
    };
    const failures: string[] = [];

    const sections = await findSectionsByCrn(
      "202608",
      [
        { subject: "CSC", courseNumber: "1301", crns: ["10001"] },
        { subject: "CSC", courseNumber: "1302", crns: ["10002"] },
        { subject: "MATH", courseNumber: "2211", crns: ["20001"] },
      ],
      { fetchImpl, batchSize: 2, concurrency: 1, onError: (group, error) => {
        expect(error).toBeInstanceOf(GoSolarAffinityError);
        failures.push(`${group.subject} ${group.courseNumber}`);
      } },
    );

    expect(failures).toEqual(["CSC 1301", "CSC 1302"]);
    expect([...sections.keys()]).toEqual(["20001"]);
  });

  it("limits concurrency across batches", async () => {
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
      return url.endsWith("/term/search") ? DECLARE_OK() : comboBody([]);
    };

    await findSectionsByCrn("202608", groups, { fetchImpl, concurrency: 3, batchSize: 1 });
    expect(peak).toBeLessThanOrEqual(3);
    expect(peak).toBeGreaterThan(1);
  });

  it("skips groups with no CRNs and makes no request when none are left", async () => {
    const { fetchImpl, calls } = fakeFetch();
    const sections = await findSectionsByCrn("202608", [{ subject: "CSC", courseNumber: "1301", crns: [] }], { fetchImpl });
    expect(sections.size).toBe(0);
    expect(calls).toHaveLength(0);
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
      const { fetchImpl } = fakeFetch(
        DECLARE_OK(),
        response({ body: { success: true, totalCount: 1, data: [{ subject: "CSC", courseNumber: "1301", courseReferenceNumber: "1" }] } }),
      );
      const sections = await findSectionsByCrn("202608", groups, { fetchImpl, concurrency });
      expect([...sections.keys()]).toEqual(["1"]);
    }
  });

  it("keeps going when onError itself throws", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const { fetchImpl } = fakeFetch(
      DECLARE_OK(),
      searchBody(null),
      DECLARE_OK(),
      response({ body: { success: true, totalCount: 1, data: [{ subject: "MATH", courseNumber: "2211", courseReferenceNumber: "2" }] } }),
    );
    const sections = await findSectionsByCrn(
      "202608",
      [
        { subject: "CSC", courseNumber: "1301", crns: ["1"] },
        { subject: "MATH", courseNumber: "2211", crns: ["2"] },
      ],
      {
        fetchImpl,
        concurrency: 1,
        batchSize: 1,
        onError: () => {
          throw new Error("callback bug");
        },
      },
    );
    expect([...sections.keys()]).toEqual(["2"]);
    log.mockRestore();
  });
});
