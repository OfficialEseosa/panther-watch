import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/session")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  ...(await import("../helpers/session")).nextServerMock,
}));

import { setDbForTests } from "@/db";
import { scheduleEntries, terms, type User } from "@/db/schema";
import { PATCH as colorPatch } from "@/app/api/schedule/color/route";
import { DELETE as scheduleDelete, GET as scheduleGet, POST as schedulePost } from "@/app/api/schedule/route";
import type { CourseData, MeetingTime } from "@/lib/gosolar";
import {
  SCHEDULE_PALETTE,
  contrastRatio,
  scheduleTextColor,
  colorIndexForCrn,
  colorIndexToHex,
  findConflicts,
  findConflictsWith,
  generateIcs,
  hexToColorIndex,
  meetingsOf,
  overlaps,
  pickDefaultColorIndex,
  toMinutes,
  type ScheduleEntry,
} from "@/lib/schedule";
import { createTestDb, seedUser, truncateAll, type TestDatabase } from "../helpers/db";
import { makeSection } from "../helpers/fake-gosolar";
import { apiRequest, call } from "../helpers/session";

const OPEN = "202701";
const VIEW_ONLY = "202705";

let testDb: TestDatabase;
let alice: User;
let bob: User;

beforeAll(async () => {
  testDb = await createTestDb();
  setDbForTests(testDb.db);
});
afterAll(async () => {
  setDbForTests(undefined);
  await testDb.close();
});
beforeEach(async () => {
  await truncateAll(testDb.db);
  await testDb.db.insert(terms).values([
    { code: OPEN, description: "Spring Semester 2027", viewOnly: false },
    { code: VIEW_ONLY, description: "Summer Semester 2027 (View Only)", viewOnly: true },
  ]);
  alice = await seedUser(testDb.db);
  bob = await seedUser(testDb.db);
});

const entryBody = (crn: string, overrides: Record<string, unknown> = {}) => ({
  term: OPEN,
  crn,
  subject: "CSC",
  courseNumber: "1301",
  courseTitle: "Principles of Computer Science I",
  ...overrides,
});

async function add(as: User, body: unknown, origin?: string | null) {
  const response = await call(schedulePost, await apiRequest("/api/schedule", { method: "POST", as, body, origin }));
  return { response, body: (await response.json()) as { entry: ScheduleEntry; created: boolean; error?: { code: string } } };
}

async function schedule(as: User): Promise<Record<string, ScheduleEntry[]>> {
  const response = await call(scheduleGet, await apiRequest("/api/schedule", { as }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  return ((await response.json()) as { schedule: Record<string, ScheduleEntry[]> }).schedule;
}

describe("schedule routes", () => {
  it("adds, lists by term and removes entries", async () => {
    const first = await add(alice, entryBody("80001"));
    expect(first.response.status).toBe(201);
    expect(first.body).toMatchObject({ created: true, entry: { term: OPEN, crn: "80001", color: 0, colorIndex: 0, colorHex: SCHEDULE_PALETTE[0] } });

    // Second class in the term gets the next free color.
    const second = await add(alice, entryBody("80002", { courseNumber: "2720" }));
    expect(second.body.entry.color).toBe(1);

    // Re-adding is an update, not a duplicate.
    const again = await add(alice, entryBody("80001", { courseTitle: "Renamed" }));
    expect(again.response.status).toBe(200);
    expect(again.body).toMatchObject({ created: false, entry: { courseTitle: "Renamed", color: 0 } });

    const listed = await schedule(alice);
    expect(Object.keys(listed)).toEqual([OPEN]);
    expect(listed[OPEN].map((e) => e.crn)).toEqual(["80001", "80002"]);

    const removed = await call(scheduleDelete, await apiRequest(`/api/schedule?term=${OPEN}&crn=80001`, { method: "DELETE", as: alice }));
    expect(await removed.json()).toEqual({ removed: true });
    expect((await schedule(alice))[OPEN].map((e) => e.crn)).toEqual(["80002"]);
  });

  it("server is the source of truth: a removed entry stays removed", async () => {
    await add(alice, entryBody("80001"));
    await call(scheduleDelete, await apiRequest(`/api/schedule?term=${OPEN}&crn=80001`, { method: "DELETE", as: alice }));
    expect(await schedule(alice)).toEqual({});
  });

  it("rejects closed terms and bad input", async () => {
    const closed = await add(alice, entryBody("80001", { term: VIEW_ONLY }));
    expect(closed.response.status).toBe(409);
    expect(closed.body.error?.code).toBe("term_closed");

    const bad = await add(alice, entryBody("80001", { color: 99 }));
    expect(bad.response.status).toBe(400);

    expect(await testDb.db.select().from(scheduleEntries)).toHaveLength(0);
  });

  it("accepts an expired term that is still open (the semester in progress)", async () => {
    // Fall 2026 seat alerts ended 2026-10-01 (term start + 2 months), but students keep
    // building their schedule for it until GoSolar marks it view-only.
    await testDb.db.insert(terms).values({ code: "202608", description: "Fall Semester 2026", viewOnly: false });
    const added = await add(alice, entryBody("80001", { term: "202608" }));
    expect(added.response.status).toBe(201);
    expect(added.body).toMatchObject({ created: true, entry: { term: "202608", crn: "80001" } });
    expect((await schedule(alice))["202608"].map((e) => e.crn)).toEqual(["80001"]);
  });

  it("requires auth and same origin", async () => {
    const anonymous = await call(scheduleGet, await apiRequest("/api/schedule"));
    expect(anonymous.status).toBe(401);
    const crossOrigin = await add(alice, entryBody("80001"), "https://evil.test");
    expect(crossOrigin.response.status).toBe(403);
  });

  it("round-trips a color and isolates users", async () => {
    await add(alice, entryBody("80001"));

    const set = await call(colorPatch, await apiRequest("/api/schedule/color", { method: "PATCH", as: alice, body: { term: OPEN, crn: "80001", color: 5 } }));
    expect(set.status).toBe(200);
    expect(await set.json()).toMatchObject({ entry: { color: 5, colorHex: SCHEDULE_PALETTE[5] } });
    expect((await schedule(alice))[OPEN][0]).toMatchObject({ color: 5, colorIndex: 5 });

    const reset = await call(colorPatch, await apiRequest("/api/schedule/color", { method: "PATCH", as: alice, body: { term: OPEN, crn: "80001", color: null } }));
    expect(await reset.json()).toMatchObject({ entry: { color: null, colorIndex: colorIndexForCrn("80001") } });

    const outOfRange = await call(colorPatch, await apiRequest("/api/schedule/color", { method: "PATCH", as: alice, body: { term: OPEN, crn: "80001", color: 8 } }));
    expect(outOfRange.status).toBe(400);

    const notMine = await call(colorPatch, await apiRequest("/api/schedule/color", { method: "PATCH", as: bob, body: { term: OPEN, crn: "80001", color: 2 } }));
    expect(notMine.status).toBe(404);
    expect(await schedule(bob)).toEqual({});
    const bobDelete = await call(scheduleDelete, await apiRequest(`/api/schedule?term=${OPEN}&crn=80001`, { method: "DELETE", as: bob }));
    expect(await bobDelete.json()).toEqual({ removed: false });
    expect((await schedule(alice))[OPEN]).toHaveLength(1);
  });
});

describe("colors", () => {
  it("maps indexes and hex both ways", () => {
    expect(SCHEDULE_PALETTE).toHaveLength(8);
    expect(colorIndexToHex(0)).toBe("#2563eb");
    expect(colorIndexToHex(8)).toBeNull();
    expect(hexToColorIndex("#0D9488")).toBe(1);
    expect(hexToColorIndex("0d9488")).toBe(1);
    expect(hexToColorIndex("#000000")).toBeNull();
    expect(pickDefaultColorIndex([0, 1, 3])).toBe(2);
    expect(pickDefaultColorIndex([0, 1, 2, 3, 4, 5, 6, 7, 0])).toBe(1);
    expect(colorIndexForCrn("80003")).toBe(80003 % 8);
  });

  it("keeps the original flat palette in index order", () => {
    expect(SCHEDULE_PALETTE).toEqual(["#2563eb", "#0d9488", "#7c3aed", "#db2777", "#ea580c", "#16a34a", "#0891b2", "#475569"]);
  });

  it("gives every block color a text color with at least 4.5:1 contrast", () => {
    SCHEDULE_PALETTE.forEach((fill, index) => {
      expect(contrastRatio(fill, scheduleTextColor(index))).toBeGreaterThanOrEqual(4.5);
    });
    expect(scheduleTextColor(0)).toBe("#ffffff");
    expect(scheduleTextColor(7)).toBe("#ffffff");
  });
});

// ---------------------------------------------------------------------------------------------
// Conflicts and ICS on realistic GoSolar sections
// ---------------------------------------------------------------------------------------------

const NO_DAYS = { sunday: false, monday: false, tuesday: false, wednesday: false, thursday: false, friday: false, saturday: false };

function meeting(overrides: Partial<MeetingTime>): { category: string; meetingTime: MeetingTime } {
  return {
    category: "01",
    meetingTime: {
      beginTime: "1100",
      endTime: "1215",
      buildingDescription: "Langdale Hall",
      campusDescription: "Atlanta Campus",
      category: "01",
      startDate: "01/11/2027",
      endDate: "05/03/2027",
      hoursWeek: 2.5,
      meetingTypeDescription: "Lecture",
      room: "0410",
      ...NO_DAYS,
      ...overrides,
    },
  };
}

function section(crn: string, ...meetings: Array<Partial<MeetingTime>>): CourseData {
  return makeSection({ term: OPEN, courseReferenceNumber: crn, meetingsFaculty: meetings.map(meeting) });
}

describe("conflicts", () => {
  const mw1100 = section("80001", { monday: true, wednesday: true });
  const mw1200 = section("80002", { monday: true, wednesday: true, beginTime: "1200", endTime: "1315" });
  const mw1215 = section("80003", { monday: true, wednesday: true, beginTime: "1215", endTime: "1330" });
  const tr1100 = section("80004", { tuesday: true, thursday: true });
  const tba = section("80005", { beginTime: null, endTime: null });
  const online = makeSection({ term: OPEN, courseReferenceNumber: "80006", meetingsFaculty: [] });
  const firstHalf = section("80007", { monday: true, startDate: "01/11/2027", endDate: "03/05/2027" });
  const secondHalf = section("80008", { monday: true, startDate: "03/08/2027", endDate: "05/03/2027" });
  const lab = section("80009", { tuesday: true, thursday: true }, { friday: true, beginTime: "0900", endTime: "1150" });
  const fridayClash = section("80010", { friday: true, beginTime: "1100", endTime: "1200" });

  it("parses times and meetings", () => {
    expect(toMinutes("0930")).toBe(570);
    expect(toMinutes("930")).toBe(570);
    expect(toMinutes("13:15")).toBe(795);
    expect(toMinutes(null)).toBeNull();
    expect(toMinutes("")).toBeNull();
    expect(meetingsOf(mw1100)).toMatchObject([{ crn: "80001", days: ["monday", "wednesday"], start: 660, end: 735 }]);
    expect(meetingsOf(tba)).toEqual([]);
    expect(meetingsOf(online)).toEqual([]);
    expect(meetingsOf(lab)).toHaveLength(2);
  });

  it("detects overlapping meetings on a shared day", () => {
    expect(overlaps(meetingsOf(mw1100)[0], meetingsOf(mw1200)[0])).toBe(true);
    const conflicts = findConflicts([mw1100, mw1200]);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0]).toMatchObject({ crns: ["80001", "80002"], day: "monday", start: 720, end: 735, label: "Mon, Wed 12:00 PM – 12:15 PM" });
  });

  it("does not flag back-to-back, different-day, TBA or disjoint-date sections", () => {
    expect(findConflicts([mw1100, mw1215])).toEqual([]);
    expect(findConflicts([mw1100, tr1100])).toEqual([]);
    expect(findConflicts([mw1100, tba, online])).toEqual([]);
    expect(findConflicts([firstHalf, secondHalf])).toEqual([]);
  });

  it("checks every meeting of multi-meeting sections", () => {
    expect(findConflicts([lab, tr1100, fridayClash]).map((c) => c.crns)).toEqual([
      ["80009", "80004"],
      ["80009", "80010"],
    ]);
  });

  it("findConflictsWith ignores the candidate itself and duplicates", () => {
    expect(findConflictsWith(mw1100, [mw1100, mw1200, mw1200, tr1100]).map((c) => c.crns[1])).toEqual(["80002"]);
    expect(findConflictsWith(tba, [mw1100])).toEqual([]);
  });
});

describe("ics", () => {
  it("emits one VEVENT per meeting with the right BYDAY, times and dates", () => {
    // Spring 2027 starts Monday 01/11/2027; a TR meeting must start on Tuesday 01/12.
    const lecture = section("80001", { monday: true, wednesday: true });
    const lab = section("80002", { tuesday: true, thursday: true, beginTime: "1400", endTime: "1540" }, { friday: true, beginTime: "0900", endTime: "0950" });
    const tba = section("80003", { beginTime: null, endTime: null });
    const ics = generateIcs([{ ...lecture, color: 3 }, lab, tba], { now: new Date("2026-10-25T12:00:00Z") });

    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).not.toMatch(/[^\r]\n/);
    const events = ics.split("BEGIN:VEVENT").slice(1);
    expect(events).toHaveLength(3);

    expect(events[0]).toContain("RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20270504T045959Z");
    expect(events[0]).toContain("DTSTART;TZID=America/New_York:20270111T110000");
    expect(events[0]).toContain("DTEND;TZID=America/New_York:20270111T121500");
    expect(events[0]).toContain("COLOR:mediumvioletred");
    expect(events[0]).toContain("LOCATION:Langdale Hall - Room 0410");
    expect(events[0]).toContain("DTSTAMP:20261025T120000Z");
    expect(events[0]).toContain("UID:80001-202701-0@pantherwatch.app");

    expect(events[1]).toContain("RRULE:FREQ=WEEKLY;BYDAY=TU,TH;UNTIL=20270504T045959Z");
    expect(events[1]).toContain("DTSTART;TZID=America/New_York:20270112T140000");
    expect(events[2]).toContain("RRULE:FREQ=WEEKLY;BYDAY=FR;UNTIL=20270504T045959Z");
    expect(events[2]).toContain("DTSTART;TZID=America/New_York:20270115T090000");
    expect(events[2]).not.toContain("COLOR:");
    expect(ics).toContain("BEGIN:VTIMEZONE\r\nTZID:America/New_York");
  });

  it("escapes text and folds long lines", () => {
    const long = makeSection({
      term: OPEN,
      courseReferenceNumber: "80004",
      courseTitle: "Special Topics; Data, Ethics and Society in an Increasingly Long Course Title",
      meetingsFaculty: [meeting({ monday: true })],
    });
    const ics = generateIcs([long]);
    expect(ics).toContain("Special Topics\\; Data\\, Ethics");
    expect(ics.replace(/\r\n /g, "")).toContain(
      "DESCRIPTION:CRN: 80004\\nInstructor: Instructor\\, Test\\nTerm: Fall Semester 2026",
    );
    for (const line of ics.split("\r\n")) expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
    // Unfolding restores the summary.
    expect(ics.replace(/\r\n /g, "")).toContain("SUMMARY:Special Topics\\; Data\\, Ethics and Society in an Increasingly Long Course Title - CSC 1301");
  });
});
