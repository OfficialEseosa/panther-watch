import { describe, expect, it } from "vitest";
import {
  isTermPosted,
  looksLikeGradeCsv,
  parseCsv,
  parseTerm,
  splitCourse,
  weightedGpa,
  type SectionGradeRow,
} from "../grades/parse";
import { fixture } from "./fixtures";

// Real rows copied from backend/grade-data/202508__{summary,detailed}.csv.
const SUMMARY = fixture("202508__summary.csv");
const DETAILED = fixture("202508__detailed.csv");

function byCrn(rows: SectionGradeRow[], crn: string): SectionGradeRow {
  const row = rows.find((r) => r.crn === crn);
  if (!row) throw new Error(`no row ${crn}`);
  return row;
}

describe("parseCsv", () => {
  it("handles quoted fields, escaped quotes, CRLF and a BOM", () => {
    expect(parseCsv('﻿a,b\r\n"x, y","say ""hi"""\r\n\r\n1,\n')).toEqual([
      ["a", "b"],
      ["x, y", 'say "hi"'],
      ["1", ""],
    ]);
  });

  it("returns [] for empty input", () => {
    expect(parseCsv("")).toEqual([]);
    expect(parseCsv(null)).toEqual([]);
  });
});

describe("splitCourse", () => {
  it("splits subject, number and section", () => {
    expect(splitCourse("CSC 4520 ")).toEqual(["CSC", "4520", ""]);
    expect(splitCourse("PHYS 1111 K")).toEqual(["PHYS", "1111", "K"]);
    expect(splitCourse(null)).toEqual(["", "", ""]);
  });
});

describe("parseTerm on the 202508 fixture", () => {
  const rows = parseTerm(SUMMARY, DETAILED, "202508");

  it("keeps one row per CRN", () => {
    expect(rows).toHaveLength(24);
    expect(new Set(rows.map((r) => r.crn)).size).toBe(24);
  });

  it("parses a known section (ported from parsesCsvIntoSections)", () => {
    const nemira = byCrn(rows, "83015");
    expect(nemira).toMatchObject({
      term: "202508",
      subject: "CSC",
      courseNumber: "4520",
      section: "",
      professor: "Nemira, Alina",
      professorKey: "nemira|alina",
      instructionMethod: "T",
      gradeA: 21,
      gradeB: 20,
      gradeC: 15,
      gradeD: 4,
      gradeF: 2,
      wf: 0,
      withdrawCount: 0,
      otherCount: 0,
      total: 62,
      gpa: 2.85,
      aPlus: 6,
      aFlat: 6,
      aMinus: 9,
      bPlus: 3,
      bFlat: 13,
      bMinus: 4,
      cPlus: 4,
      cFlat: 8,
      cMinus: 3,
    });
    // Coarse A bucket == fine A+/A/A-.
    expect(nemira.aPlus + nemira.aFlat + nemira.aMinus).toBe(nemira.gradeA);
  });

  it("reads the odd headers ('A  (90-100)', 'F <60', 'Other ')", () => {
    const bunting = byCrn(rows, "80007");
    expect(bunting.otherCount).toBe(13);
    expect(bunting.total).toBe(13);
    expect(byCrn(rows, "80001")).toMatchObject({ gradeA: 81, gradeF: 4, withdrawCount: 2, gpa: 3.84 });
  });

  it("keeps lab/section suffixes and multi-word professor names", () => {
    expect(byCrn(rows, "80281")).toMatchObject({ subject: "PHYS", courseNumber: "1111", section: "K" });
    expect(byCrn(rows, "84035").professorKey).toBe("saghaeiannejad esfahani|sayed");
  });

  it("leaves gpa null when CRS AVG is blank", () => {
    expect(byCrn(rows, "80007").gpa).toBeNull();
    expect(byCrn(rows, "80011").gpa).toBeNull();
  });

  it("detects posted grades", () => {
    expect(isTermPosted(rows)).toBe(true);
    const unposted = rows.filter((r) => r.gpa === null);
    expect(unposted.length).toBeGreaterThan(0);
    expect(isTermPosted(unposted)).toBe(false);
    expect(isTermPosted([])).toBe(false);
  });

  it("computes the enrollment-weighted GPA like the Java aggregate", () => {
    const nemira = rows.filter((r) => r.professorKey === "nemira|alina");
    expect(nemira).toHaveLength(2);
    // (2.85 * 62 + 3.16 * 49) / 111 = 2.9868...
    expect(weightedGpa(nemira)).toBe(2.99);
    // Sections without a GPA or students are ignored.
    expect(weightedGpa([{ gpa: null, total: 10 }, { gpa: 3, total: 0 }])).toBeNull();
  });
});

describe("parseTerm edge cases", () => {
  it("skips non-CRN rows and tolerates a missing detailed file", () => {
    const summary =
      "﻿CRN,Course,Professor,A  (90-100),CRS AVG,Total\n" +
      "Total,,,,,\n" +
      '12345,CSC 1301 ,"Doe, Jane",5,,5\n';
    const rows = parseTerm(summary, "", "202608");
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ crn: "12345", gradeA: 5, aPlus: 0, gpa: null, total: 5 });
    expect(isTermPosted(rows)).toBe(false);
  });

  it("ignores detailed rows whose CRN is not in the summary", () => {
    const rows = parseTerm(SUMMARY, `${DETAILED}99999,1,1,1,1,1,1,1,1,1,0,0,0,9,0,0,0,9,T\n`, "202508");
    expect(rows.some((r) => r.crn === "99999")).toBe(false);
  });

  it("recognizes a grade CSV vs an HTML error page", () => {
    expect(looksLikeGradeCsv(SUMMARY)).toBe(true);
    expect(looksLikeGradeCsv(DETAILED)).toBe(true);
    expect(looksLikeGradeCsv("<!doctype html><title>Site Unavailable</title>")).toBe(false);
  });
});
