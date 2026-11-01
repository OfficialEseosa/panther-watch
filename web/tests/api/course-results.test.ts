import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { ZodError } from "zod";
import { parseSearch, resultsHref, resultsTitle, searchFormHref } from "@/components/courses/params";
import { searchCourseList, setGoSolarOptionsForTests } from "@/lib/courses";
import { makeSection, startFakeGoSolar, type FakeGoSolar } from "../helpers/fake-gosolar";

/**
 * The results page's multi-number search: the URL's course number list (parseSearch) and the
 * lib fan-out the page runs (searchCourseList: one GoSolar search per subject x number pair,
 * merged, deduplicated by CRN, sorted once). The API route keeps its single-number semantics.
 */

let gs: FakeGoSolar;

beforeAll(async () => {
  gs = await startFakeGoSolar();
  setGoSolarOptionsForTests({ baseUrl: gs.url });
});
afterAll(async () => {
  setGoSolarOptionsForTests(undefined);
  await gs.close();
});
beforeEach(() => gs.reset());

const searches = () => gs.requests.filter((r) => r.path === "/searchResults/searchResults");

describe("parseSearch: course number lists", () => {
  it("accepts a comma/space list, normalized, deduplicated, in order", () => {
    const parsed = parseSearch({ term: "202701", subjects: "csc", courseNumber: "4352, 4350 4110,4352 1301l" });
    expect(parsed).toMatchObject({ ok: true, subjects: ["CSC"], courseNumber: "4352,4350,4110,1301L" });
    const search = parsed as Extract<typeof parsed, { ok: true }>;
    expect(resultsHref(search)).toBe("/course-results?term=202701&subjects=CSC&courseNumber=4352%2C4350%2C4110%2C1301L");
    expect(searchFormHref(search)).toContain("courseNumber=4352%2C4350%2C4110%2C1301L");
    expect(resultsTitle(search, "Spring 2027")).toBe("CSC 4352, 4350, 4110, 1301L · Spring 2027");
  });

  it("rejects more than 6 numbers, a bad number, and more than 10 subject x number pairs", () => {
    expect(parseSearch({ term: "202701", subjects: "CSC", courseNumber: "1,2,3,4,5,6,7" })).toMatchObject({
      ok: false,
      message: "Search up to 6 course numbers at a time.",
    });
    expect(parseSearch({ term: "202701", subjects: "CSC", courseNumber: "1301,13-01" })).toMatchObject({
      ok: false,
      message: "That course number isn't valid.",
    });
    expect(parseSearch({ term: "202701", subjects: "CSC,MATH", courseNumber: "1,2,3,4,5,6" })).toMatchObject({
      ok: false,
      message: expect.stringMatching(/up to 10 subject and course number combinations.*12/),
    });
    expect(parseSearch({ term: "202701", subjects: "CSC,MATH", courseNumber: "1,2,3,4,5" })).toMatchObject({ ok: true });
  });
});

describe("searchCourseList", () => {
  it("searches every subject x number pair, merges, dedupes by CRN and sorts once", async () => {
    const a = makeSection({ term: "202701", courseNumber: "4352", courseReferenceNumber: "81003", sequenceNumber: "002" });
    const b = makeSection({ term: "202701", courseNumber: "4352", courseReferenceNumber: "81001", sequenceNumber: "001" });
    const c = makeSection({ term: "202701", courseNumber: "4350", courseReferenceNumber: "81002" });
    const m = makeSection({ term: "202701", subject: "MATH", courseNumber: "4350", courseReferenceNumber: "81004" });
    gs.setSections("202701", "CSC", "4352", [a, b]);
    // The same CRN listed under two numbers (cross-listed) comes back once.
    gs.setSections("202701", "CSC", "4350", [c, { ...a }]);
    gs.setSections("202701", "MATH", "4350", [m]);

    const { sections, failed } = await searchCourseList({
      term: "202701",
      subjects: ["CSC", "MATH"],
      courseNumbers: ["4352", "4350"],
      level: "US",
    });
    expect(failed).toEqual([]);
    expect(searches()).toHaveLength(4);
    expect(searches().map((r) => `${r.query.txt_subject} ${r.query.txt_courseNumber}`).sort()).toEqual([
      "CSC 4350",
      "CSC 4352",
      "MATH 4350",
      "MATH 4352",
    ]);
    expect(searches().every((r) => r.query.txt_level === "US")).toBe(true);
    expect(sections.map((s) => `${s.subject} ${s.courseNumber} ${s.courseReferenceNumber}`)).toEqual([
      "CSC 4350 81002",
      "CSC 4352 81001",
      "CSC 4352 81003",
      "MATH 4350 81004",
    ]);
  });

  it("an empty number list searches each whole subject once", async () => {
    gs.setSections("202701", "CSC", "1301", [makeSection({ term: "202701" })]);
    gs.setSections("202701", "CSC", "1302", [makeSection({ term: "202701", courseNumber: "1302" })]);
    const { sections } = await searchCourseList({ term: "202701", subjects: ["CSC"] });
    expect(searches()).toHaveLength(1);
    expect(searches()[0].query.txt_courseNumber ?? "").toBe("");
    expect(sections).toHaveLength(2);
  });

  it("reports a failed pair without losing the others", async () => {
    gs.setSections("202701", "CSC", "1301", [makeSection({ term: "202701", courseReferenceNumber: "82001" })]);
    gs.setSections("202701", "CSC", "1302", [makeSection({ term: "202701", courseNumber: "1302", courseReferenceNumber: "82002" })]);
    gs.failNextSearches({ kind: "http", status: 500 }, 1);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { sections, failed } = await searchCourseList({ term: "202701", subjects: ["CSC"], courseNumbers: ["1301", "1302"] });
      expect(failed).toHaveLength(1);
      expect(sections).toHaveLength(1);
      expect([...failed.map((f) => f.courseNumber), ...sections.map((s) => s.courseNumber)].sort()).toEqual(["1301", "1302"]);
    } finally {
      warn.mockRestore();
      error.mockRestore();
    }
  });

  it("refuses more than 10 pairs before asking GoSolar", async () => {
    await expect(
      searchCourseList({ term: "202701", subjects: ["CSC", "MATH"], courseNumbers: ["1", "2", "3", "4", "5", "6"] }),
    ).rejects.toBeInstanceOf(ZodError);
    expect(gs.requests).toHaveLength(0);
  });
});
