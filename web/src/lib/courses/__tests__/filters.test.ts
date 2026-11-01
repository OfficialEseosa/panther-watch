import { describe, expect, it } from "vitest";
import type { GradeAggregate } from "@/lib/course-meta";
import type { MeetingTime } from "@/lib/gosolar";
import { makeSection } from "../../../../tests/helpers/fake-gosolar";
import {
  activeFilterCount,
  applySectionFilters,
  DEFAULT_SECTION_FILTERS,
  matchesDays,
  needsMeta,
  openSeats,
  type FilterableSection,
  type SectionFilters,
} from "../filters";
import type { SectionMeta } from "../meta";

type Day = "monday" | "tuesday" | "wednesday" | "thursday" | "friday";
const DAYS: Day[] = ["monday", "tuesday", "wednesday", "thursday", "friday"];

/** A section meeting on `days` from `begin` (none: TBA), with optional attribute codes. */
function section(
  crn: string,
  days: Day[],
  extra: Partial<FilterableSection> & { begin?: string; end?: string; codes?: string[] } = {},
): FilterableSection {
  const { begin = "1100", end = "1215", codes, ...overrides } = extra;
  const base = makeSection({ courseReferenceNumber: crn, ...overrides });
  const meetingTime = base.meetingsFaculty![0].meetingTime!;
  const timed: MeetingTime = {
    ...meetingTime,
    ...Object.fromEntries(DAYS.map((day) => [day, days.includes(day)])),
    beginTime: days.length ? begin : null,
    endTime: days.length ? end : null,
  };
  return {
    ...base,
    meetingsFaculty: [{ category: "01", meetingTime: timed }],
    sectionAttributes: codes?.map((code) => ({ code, description: code })) ?? [],
  };
}

const aggregate = (gpa: number): GradeAggregate => ({
  professor: null,
  gpa,
  dwfPercent: 10,
  total: 100,
  withdrawCount: 1,
  sectionsCount: 2,
  termsTaught: ["202601"],
  gradeCounts: { "A+": 0, A: 1, "A-": 0, "B+": 0, B: 0, "B-": 0, "C+": 0, C: 0, "C-": 0, D: 0, F: 0, WF: 0 },
});

/** Meta with an RMP average and a course GPA (or the instructor's, when `own`). */
function meta(rating: number | null, gpa: number | null, own = false): SectionMeta {
  return {
    rating:
      rating === null
        ? { professorQueried: "x", found: false }
        : { professorQueried: "x", found: true, matchedName: "x", avgRating: rating, numRatings: 12 },
    grades:
      gpa === null
        ? null
        : {
            subject: "CSC",
            courseNumber: "1301",
            hasData: true,
            termsIncluded: ["202601"],
            overall: aggregate(own ? 2 : gpa),
            professors: [],
            instructorQueried: "x",
            instructorHasTaught: own,
            instructorDistribution: own ? aggregate(gpa) : null,
          },
    syllabus: null,
  } as SectionMeta;
}

const filters = (patch: Partial<SectionFilters>): SectionFilters => ({ ...DEFAULT_SECTION_FILTERS, ...patch });

type Item = { section: FilterableSection; meta: SectionMeta | undefined };
const crns = (items: Item[]) => items.map((item) => item.section.courseReferenceNumber);
const run = (items: Item[], patch: Partial<SectionFilters>) => crns(applySectionFilters(items, filters(patch), (item) => item));

describe("matchesDays", () => {
  const mw = section("80001", ["monday", "wednesday"]);
  const tr = section("80002", ["tuesday", "thursday"]);
  const mwf = section("80003", ["monday", "wednesday", "friday"]);
  const async = section("80004", [], { codes: ["LONL"] });
  const sync = section("80005", ["monday", "wednesday"], { codes: ["SONL"] });
  const hybrid = section("80006", ["tuesday"], { codes: ["HYB", "HC"] });

  it("MW / TR / MWF match the exact meeting days", () => {
    expect([mw, tr, mwf, sync].filter((s) => matchesDays(s, "MW")).map((s) => s.courseReferenceNumber)).toEqual(["80001", "80005"]);
    expect(matchesDays(tr, "TR")).toBe(true);
    expect(matchesDays(mwf, "MW")).toBe(false);
    expect(matchesDays(mwf, "MWF")).toBe(true);
    // TBA (no timed meeting) meets on no days.
    expect(matchesDays(async, "MW")).toBe(false);
  });

  it("online is SONL or LONL, hybrid is HYB (attribute codes, not text)", () => {
    expect([mw, async, sync, hybrid].filter((s) => matchesDays(s, "online")).map((s) => s.courseReferenceNumber)).toEqual([
      "80004",
      "80005",
    ]);
    expect(matchesDays(hybrid, "hybrid")).toBe(true);
    expect(matchesDays(section("80007", ["monday"], { campusDescription: "Online" }), "online")).toBe(false);
    expect(matchesDays(mw, "any")).toBe(true);
  });
});

describe("openSeats", () => {
  it("is the smaller of the section's and the cross-list pool's", () => {
    expect(openSeats(section("80001", ["monday"], { seatsAvailable: 5 }))).toBe(5);
    expect(openSeats(section("80002", ["monday"], { seatsAvailable: 5, crossList: "XA", crossListAvailable: 0 }))).toBe(0);
    expect(openSeats(section("80003", ["monday"], { seatsAvailable: 2, crossList: "XB", crossListAvailable: 9 }))).toBe(2);
  });
});

describe("applySectionFilters", () => {
  const items: Item[] = [
    { section: section("80001", ["monday", "wednesday"], { seatsAvailable: 2, begin: "1400", end: "1515" }), meta: meta(3.1, 2.8) },
    { section: section("80002", ["tuesday", "thursday"], { seatsAvailable: 0, begin: "0800" }), meta: meta(4.6, 3.6) },
    { section: section("80003", ["monday", "wednesday"], { seatsAvailable: 9, begin: "0930", codes: ["HC"] }), meta: undefined },
    { section: section("80004", [], { seatsAvailable: 4, codes: ["LONL"] }), meta: meta(null, 3.2, true) },
    {
      section: section("80005", ["tuesday", "thursday"], { seatsAvailable: 6, crossList: "XA", crossListAvailable: 0, begin: "1000" }),
      meta: meta(4.0, null),
    },
  ];

  it("defaults keep everything in course (incoming) order", () => {
    expect(run(items, {})).toEqual(["80001", "80002", "80003", "80004", "80005"]);
  });

  it("filters by days, open seats (cross-list pool included) and honors", () => {
    expect(run(items, { days: "MW" })).toEqual(["80001", "80003"]);
    expect(run(items, { days: "online" })).toEqual(["80004"]);
    expect(run(items, { open: true })).toEqual(["80001", "80003", "80004"]);
    expect(run(items, { honors: true })).toEqual(["80003"]);
    expect(run(items, { days: "TR", open: true })).toEqual([]);
  });

  it("rating and GPA minimums read the meta map; sections without meta fail them", () => {
    expect(run(items, { minRating: 4 })).toEqual(["80002", "80005"]);
    expect(run(items, { minRating: 4.5 })).toEqual(["80002"]);
    // The card's GPA: the instructor's own history (80004: 3.2) over the course's (2.0).
    expect(run(items, { minGpa: 3 })).toEqual(["80002", "80004"]);
  });

  it("sorts by seats, rating, GPA and start time; missing values last, ties in course order", () => {
    expect(run(items, { sort: "seats" })).toEqual(["80003", "80004", "80001", "80002", "80005"]);
    expect(run(items, { sort: "rating" })).toEqual(["80002", "80005", "80001", "80003", "80004"]);
    expect(run(items, { sort: "gpa" })).toEqual(["80002", "80004", "80001", "80003", "80005"]);
    expect(run(items, { sort: "start" })).toEqual(["80002", "80003", "80005", "80001", "80004"]);
    expect(run(items, { sort: "seats", open: true, days: "MW" })).toEqual(["80003", "80001"]);
  });

  it("counts active settings and knows when meta is needed", () => {
    expect(activeFilterCount(DEFAULT_SECTION_FILTERS)).toBe(0);
    expect(activeFilterCount(filters({ days: "TR", open: true, sort: "seats" }))).toBe(3);
    expect(needsMeta(filters({ sort: "seats" }))).toBe(false);
    expect(needsMeta(filters({ sort: "gpa" }))).toBe(true);
    expect(needsMeta(filters({ minRating: 3.5 }))).toBe(true);
  });
});
