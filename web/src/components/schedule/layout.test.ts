import { describe, expect, it } from "vitest";
import type { CourseData, MeetingTime } from "@/lib/gosolar/types";
import { creditsLabel, formatTimeRange } from "@/lib/format";
import { findConflicts } from "@/lib/schedule/conflicts";
import {
  agendaDays,
  blockGeometry,
  buildBlocks,
  fileSlug,
  hourRange,
  laneGeometry,
  layoutDay,
  layoutWeek,
  meetingSummary,
  unscheduledCourses,
  visibleDays,
  type ResolvedCourse,
} from "./layout";

type Days = Partial<Pick<MeetingTime, "monday" | "tuesday" | "wednesday" | "thursday" | "friday" | "saturday" | "sunday">>;

function meeting(days: Days, begin: string | null, end: string | null, extra: Partial<MeetingTime> = {}): MeetingTime {
  return {
    beginTime: begin,
    endTime: end,
    buildingDescription: "Langdale Hall",
    room: "405",
    campusDescription: null,
    category: null,
    startDate: "08/24/2026",
    endDate: "12/14/2026",
    sunday: false,
    monday: false,
    tuesday: false,
    wednesday: false,
    thursday: false,
    friday: false,
    saturday: false,
    hoursWeek: 0,
    meetingTypeDescription: "Lecture",
    ...days,
    ...extra,
  };
}

function section(crn: string, subject: string, number: string, meetings: MeetingTime[], extra: Partial<CourseData> = {}): CourseData {
  return {
    term: "202608",
    termDesc: "Fall 2026",
    courseReferenceNumber: crn,
    partOfTerm: "1",
    courseNumber: number,
    subject,
    subjectDescription: null,
    sequenceNumber: "001",
    campusDescription: null,
    scheduleTypeDescription: "Lecture",
    courseTitle: `${subject} ${number} title`,
    creditHours: 3,
    maximumEnrollment: 30,
    enrollment: 20,
    seatsAvailable: 10,
    waitCapacity: 0,
    waitCount: 0,
    waitAvailable: 0,
    creditHourHigh: 0,
    creditHourLow: 3,
    linkIdentifier: null,
    isSectionLinked: false,
    subjectCourse: null,
    faculty: [],
    meetingsFaculty: meetings.map((meetingTime) => ({ category: null, meetingTime })),
    ...extra,
  };
}

const course = (s: CourseData, colorIndex = 0): ResolvedCourse => ({
  crn: s.courseReferenceNumber!,
  code: `${s.subject} ${s.courseNumber}`,
  section: s,
  colorIndex,
});

const csc = section("80001", "CSC", "2720", [meeting({ monday: true, wednesday: true }, "1000", "1115")]);
const math = section("80002", "MATH", "2211", [meeting({ monday: true, wednesday: true }, "1030", "1145")]);
const engl = section("80003", "ENGL", "1102", [meeting({ tuesday: true, thursday: true }, "0930", "1045")]);
const online = section("80004", "CSC", "4350", [meeting({}, null, null, { buildingDescription: null, room: null })]);

describe("buildBlocks", () => {
  it("emits one block per meeting day with unique ids and view-transition names", () => {
    const blocks = buildBlocks([course(csc), course(engl)]);
    expect(blocks.map((b) => b.id)).toEqual(["80001-0-monday", "80001-0-wednesday", "80003-0-tuesday", "80003-0-thursday"]);
    expect(new Set(blocks.map((b) => b.vtName)).size).toBe(blocks.length);
    expect(blocks[0]).toMatchObject({ start: 600, end: 675, code: "CSC 2720", location: "Langdale Hall 405" });
  });

  it("leaves TBA sections out of the grid and lists them as unscheduled", () => {
    expect(buildBlocks([course(online)])).toEqual([]);
    expect(unscheduledCourses([course(csc), course(online)]).map((c) => c.crn)).toEqual(["80004"]);
  });
});

describe("layoutDay", () => {
  it("keeps non-overlapping blocks full width", () => {
    const laid = layoutDay([
      { start: 600, end: 675 },
      { start: 675, end: 750 }, // back to back: no overlap
    ]);
    expect(laid.map((b) => [b.lane, b.laneCount])).toEqual([
      [0, 1],
      [0, 1],
    ]);
  });

  it("splits overlapping blocks into side-by-side lanes", () => {
    const laid = layoutDay([
      { start: 630, end: 705, code: "B" },
      { start: 600, end: 675, code: "A" },
    ]);
    expect(laid.map((b) => [b.code, b.lane, b.laneCount])).toEqual([
      ["A", 0, 2],
      ["B", 1, 2],
    ]);
  });

  it("reuses a freed lane inside a transitive cluster", () => {
    // A 9-10, B 9:30-11, C 10-10:30 (fits in A's lane after A ends): 2 lanes, not 3.
    const laid = layoutDay([
      { start: 540, end: 600, code: "A" },
      { start: 570, end: 660, code: "B" },
      { start: 600, end: 630, code: "C" },
    ]);
    expect(laid.map((b) => [b.code, b.lane, b.laneCount])).toEqual([
      ["A", 0, 2],
      ["B", 1, 2],
      ["C", 0, 2],
    ]);
  });

  it("gives three mutually overlapping blocks three lanes", () => {
    const laid = layoutDay([
      { start: 600, end: 700 },
      { start: 610, end: 700 },
      { start: 620, end: 700 },
    ]);
    expect(laid.map((b) => b.lane)).toEqual([0, 1, 2]);
    expect(laid.every((b) => b.laneCount === 3)).toBe(true);
  });
});

describe("layoutWeek", () => {
  it("marks both sides of a conflict on the overlapping days only", () => {
    const courses = [course(csc), course(math), course(engl)];
    const week = layoutWeek(buildBlocks(courses), findConflicts(courses.map((c) => c.section)));
    const monday = week.get("monday")!;
    expect(monday.map((b) => [b.code, b.lane, b.laneCount, b.conflictsWith])).toEqual([
      ["CSC 2720", 0, 2, ["MATH 2211"]],
      ["MATH 2211", 1, 2, ["CSC 2720"]],
    ]);
    expect(week.get("tuesday")!.every((b) => b.conflictsWith.length === 0)).toBe(true);
    expect(week.has("friday")).toBe(false);
  });

  it("splits lanes but does not flag sections with disjoint date ranges", () => {
    const first = section("80010", "MATH", "1111", [
      meeting({ friday: true }, "0900", "1000", { startDate: "08/24/2026", endDate: "10/09/2026" }),
    ]);
    const second = section("80011", "MATH", "1113", [
      meeting({ friday: true }, "0900", "1000", { startDate: "10/12/2026", endDate: "12/14/2026" }),
    ]);
    const courses = [course(first), course(second)];
    const friday = layoutWeek(buildBlocks(courses), findConflicts(courses.map((c) => c.section))).get("friday")!;
    expect(friday.map((b) => b.laneCount)).toEqual([2, 2]);
    expect(friday.every((b) => b.conflictsWith.length === 0)).toBe(true);
  });
});

describe("agendaDays", () => {
  it("groups by day in calendar order, chronologically", () => {
    const courses = [course(math), course(engl), course(csc)];
    const week = layoutWeek(buildBlocks(courses), []);
    const groups = agendaDays([...week.values()].flat());
    expect(groups.map((g) => g.day)).toEqual(["monday", "tuesday", "wednesday", "thursday"]);
    expect(groups[0].blocks.map((b) => b.code)).toEqual(["CSC 2720", "MATH 2211"]);
  });
});

describe("visibleDays", () => {
  it("shows Mon–Fri, and Saturday/Sunday only when a class meets then", () => {
    const weekdays = ["monday", "tuesday", "wednesday", "thursday", "friday"];
    expect(visibleDays([])).toEqual(weekdays);
    const sunday = section("80020", "MUS", "1000", [meeting({ sunday: true }, "1400", "1500")]);
    expect(visibleDays(buildBlocks([course(sunday)]))).toEqual([...weekdays, "sunday"]);
    const saturday = section("80021", "ART", "1000", [meeting({ saturday: true }, "0900", "1200")]);
    expect(visibleDays(buildBlocks([course(saturday)]))).toEqual([...weekdays, "saturday"]);
    expect(visibleDays(buildBlocks([course(saturday), course(sunday)]))).toEqual([...weekdays, "saturday", "sunday"]);
  });
});

describe("hourRange", () => {
  it("defaults to 8:00–18:00", () => {
    expect(hourRange([])).toEqual({ startHour: 8, endHour: 18 });
  });

  it("always covers 8:00–18:00 for midday classes", () => {
    expect(hourRange([{ start: 600, end: 675 }])).toEqual({ startHour: 8, endHour: 18 });
  });

  it("keeps 8:00–18:00 for a class at the edges of the day", () => {
    expect(hourRange([{ start: 8 * 60, end: 9 * 60 }])).toEqual({ startHour: 8, endHour: 18 });
    expect(hourRange([{ start: 17 * 60, end: 18 * 60 }])).toEqual({ startHour: 8, endHour: 18 });
  });

  it("extends the bottom to an hour past an evening class", () => {
    expect(hourRange([{ start: 18 * 60, end: 20 * 60 + 30 }])).toEqual({ startHour: 8, endHour: 22 });
    // 19:00–21:45 (e.g. a TR night section): the grid runs to 23:00.
    expect(hourRange([{ start: 19 * 60, end: 21 * 60 + 45 }])).toEqual({ startHour: 8, endHour: 23 });
    expect(hourRange([{ start: 18 * 60 + 15, end: 18 * 60 + 30 }])).toEqual({ startHour: 8, endHour: 20 });
  });

  it("extends the top to the start hour of an early class", () => {
    expect(hourRange([{ start: 7 * 60 + 30, end: 8 * 60 + 45 }])).toEqual({ startHour: 7, endHour: 18 });
    expect(hourRange([{ start: 6 * 60 + 30, end: 7 * 60 + 45 }])).toEqual({ startHour: 6, endHour: 18 });
  });

  it("never clips a late class: capped only at midnight", () => {
    expect(hourRange([{ start: 21 * 60, end: 22 * 60 + 30 }])).toEqual({ startHour: 8, endHour: 24 });
    expect(hourRange([{ start: 22 * 60, end: 23 * 60 + 50 }])).toEqual({ startHour: 8, endHour: 24 });
    expect(hourRange([{ start: 7 * 60 + 30, end: 9 * 60 }, { start: 19 * 60, end: 21 * 60 + 45 }])).toEqual({ startHour: 7, endHour: 23 });
  });
});

describe("geometry", () => {
  it("positions blocks in hours from the grid start", () => {
    expect(blockGeometry({ start: 600, end: 675 }, { startHour: 8, endHour: 18 })).toEqual({ top: 2, height: 1.25 });
  });

  it("splits the column evenly across lanes", () => {
    expect(laneGeometry({ lane: 0, laneCount: 1 })).toEqual({ left: 0, width: 1 });
    expect(laneGeometry({ lane: 1, laneCount: 2 })).toEqual({ left: 0.5, width: 0.5 });
  });
});

describe("text helpers", () => {
  it("formats time ranges with a shared or split period", () => {
    expect(formatTimeRange(600, 675)).toBe("10:00 – 11:15 AM");
    expect(formatTimeRange(660, 735)).toBe("11:00 AM – 12:15 PM");
  });

  it("summarises meetings with registrar day letters", () => {
    expect(meetingSummary(engl)).toBe("TR 9:30 – 10:45 AM");
    expect(meetingSummary(online)).toBe("Online / TBA");
    // One meeting per day, out of order (as GoSolar sends some sections): merged, week order.
    const split = section("80020", "MATH", "2211", [
      meeting({ friday: true }, "1400", "1450"),
      meeting({ wednesday: true }, "0900", "1045"),
      meeting({ monday: true }, "0900", "1045"),
    ]);
    expect(meetingSummary(split)).toBe(`MW ${formatTimeRange(540, 645)} · F ${formatTimeRange(840, 890)}`);
  });

  it("sums credits, showing a range for variable-credit sections", () => {
    expect(creditsLabel([csc, math])).toBe("6 credits");
    expect(creditsLabel([csc, section("80030", "CSC", "4999", [], { creditHourLow: 1, creditHourHigh: 3 })])).toBe(
      "4–6 credits",
    );
    expect(creditsLabel([section("80031", "PE", "1000", [], { creditHourLow: 1, creditHours: 1 })])).toBe("1 credit");
  });

  it("slugs term labels for file names", () => {
    expect(fileSlug("Fall 2026", "202608")).toBe("fall-2026");
    expect(fileSlug("  ", "202608")).toBe("202608");
  });
});
