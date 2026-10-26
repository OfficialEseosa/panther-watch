import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { gradeTerms, sectionGrades } from "@/db/schema/course-meta";
import { parseTerm, weightedGpa } from "../grades/parse";
import {
  chooseNextTerm,
  getCourseGrades,
  listIngestedTerms,
  markTermUnposted,
  pickNextTermToIngest,
  upsertTerm,
  UNPOSTED_RECHECK_MS,
  type TermCheck,
} from "../grades/store";
import { GRADE_KEYS } from "../grades/types";
import { fixture } from "./fixtures";
import { createTestDb, type TestDb } from "./pglite";

const FALL = parseTerm(fixture("202508__summary.csv"), fixture("202508__detailed.csv"), "202508");
// 202601 fixture: real CSC 4520 rows, plus two "Smith Jr." PMAP rows from 202308 that have
// no detailed counterpart (fine grades stay 0).
const SPRING = parseTerm(fixture("202601__summary.csv"), fixture("202601__detailed.csv"), "202601");

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

describe("upsertTerm", () => {
  it("stores a term and replaces it on re-ingest", async () => {
    expect(await upsertTerm("202508", FALL, { db: t.db })).toBe(24);
    expect(await upsertTerm("202508", FALL.slice(0, 5), { db: t.db })).toBe(5);
    const rows = await t.db.select({ crn: sectionGrades.crn }).from(sectionGrades);
    expect(rows).toHaveLength(5);
    expect(await listIngestedTerms({ db: t.db })).toEqual(["202508"]);
  });

  it("round-trips numeric gpa and nulls", async () => {
    await upsertTerm("202508", FALL, { db: t.db });
    const rows = await t.db.select().from(sectionGrades);
    const nemira = rows.find((r) => r.crn === "83015");
    expect(nemira?.gpa).toBe(2.85);
    expect(nemira?.professorKey).toBe("nemira|alina");
    expect(rows.find((r) => r.crn === "80007")?.gpa).toBeNull();
  });

  it("refuses unposted rows and rows of another term, writing nothing", async () => {
    const unposted = FALL.filter((r) => r.gpa === null);
    await expect(upsertTerm("202508", unposted, { db: t.db })).rejects.toThrow(/no posted grades/);
    await expect(upsertTerm("202601", FALL, { db: t.db })).rejects.toThrow(/another term/);
    expect(await t.db.select().from(gradeTerms)).toEqual([]);
  });

  it("turns an unposted check into a posted term, and markTermUnposted never demotes one", async () => {
    await markTermUnposted("202508", { db: t.db });
    expect(await listIngestedTerms({ db: t.db })).toEqual([]);
    await upsertTerm("202508", FALL, { db: t.db });
    await markTermUnposted("202508", { db: t.db });
    expect(await listIngestedTerms({ db: t.db })).toEqual(["202508"]);
  });
});

describe("getCourseGrades", () => {
  beforeEach(async () => {
    await upsertTerm("202508", FALL, { db: t.db });
    await upsertTerm("202601", SPRING, { db: t.db });
  });

  it("aggregates per professor and overall across terms in SQL", async () => {
    const res = await getCourseGrades({ subject: "csc", courseNumber: "4520" }, { db: t.db });
    const csc = [...FALL, ...SPRING].filter((r) => r.subject === "CSC" && r.courseNumber === "4520");

    expect(res.hasData).toBe(true);
    expect(res.subject).toBe("CSC");
    expect(res.termsIncluded).toEqual(["202601", "202508"]);
    expect(res.overall).toMatchObject({
      professor: null,
      sectionsCount: csc.length,
      total: csc.reduce((sum, r) => sum + r.total, 0),
      gpa: weightedGpa(csc),
      termsTaught: ["202601", "202508"],
    });
    expect(Object.keys(res.overall?.gradeCounts ?? {})).toEqual([...GRADE_KEYS]);
    expect(res.overall?.gradeCounts["A+"]).toBe(csc.reduce((sum, r) => sum + r.aPlus, 0));

    // Sorted by enrollment: Bal (5 sections, 2 terms) first.
    expect(res.professors.map((p) => p.professor)).toEqual([
      "Bal, Abdullah",
      "Nemira, Alina",
      "Chourasia, Prakash",
      "Zelikovskiy, Aleksandr",
      "Saghaeiannejad Esfahani, Sayed Hossein",
    ]);
    const bal = res.professors[0];
    const balRows = csc.filter((r) => r.professorKey === "bal|abdullah");
    expect(bal).toMatchObject({
      sectionsCount: 5,
      total: balRows.reduce((sum, r) => sum + r.total, 0),
      withdrawCount: balRows.reduce((sum, r) => sum + r.withdrawCount, 0),
      gpa: weightedGpa(balRows),
      termsTaught: ["202601", "202508"],
    });
    const dwf = balRows.reduce((sum, r) => sum + r.gradeD + r.gradeF + r.wf + r.withdrawCount, 0);
    expect(bal.dwfPercent).toBe(Math.round((1000 * dwf) / bal.total) / 10);
    expect(res.instructorQueried).toBeNull();
    expect(res.instructorHasTaught).toBe(false);
  });

  it("matches a messy GoSolar instructor name (ported from matchesNemiraDespiteMessyGoSolarName)", async () => {
    const res = await getCourseGrades(
      { subject: "CSC", courseNumber: "4520", instructor: "Nemira, Alina (Alina) " },
      { db: t.db },
    );
    expect(res.instructorQueried).toBe("Nemira, Alina (Alina) ");
    expect(res.instructorHasTaught).toBe(true);
    expect(res.instructorDistribution).toMatchObject({
      professor: "Nemira, Alina",
      sectionsCount: 2,
      gpa: Math.round(((2.85 * 62 + 3.16 * 49) / (62 + 49)) * 100) / 100,
      termsTaught: ["202508"],
    });
  });

  it("matches suffixed names in either spelling", async () => {
    const res = await getCourseGrades(
      { subject: "PMAP", courseNumber: "8111", instructor: "Edward Smith" },
      { db: t.db },
    );
    expect(res.instructorHasTaught).toBe(true);
    expect(res.instructorDistribution?.professor).toBe("Smith Jr., Edward");
    expect(res.instructorDistribution?.gpa).toBe(4);
  });

  it("reports no match for an unknown instructor (ported from reportsNoMatchForUnknownInstructor)", async () => {
    const res = await getCourseGrades(
      { subject: "CSC", courseNumber: "4520", instructor: "Nonexistent, Person" },
      { db: t.db },
    );
    expect(res.hasData).toBe(true);
    expect(res.instructorHasTaught).toBe(false);
    expect(res.instructorDistribution).toBeNull();
  });

  it("returns hasData false for an unknown course", async () => {
    const res = await getCourseGrades({ subject: "CSC", courseNumber: "9999", instructor: "Bal, Abdullah" }, { db: t.db });
    expect(res).toEqual({
      subject: "CSC",
      courseNumber: "9999",
      hasData: false,
      termsIncluded: [],
      overall: null,
      professors: [],
      instructorQueried: "Bal, Abdullah",
      instructorHasTaught: false,
      instructorDistribution: null,
    });
  });

  it("keeps sections without a GPA out of the GPA but in the counts", async () => {
    const res = await getCourseGrades({ subject: "AL", courseNumber: "8940" }, { db: t.db });
    expect(res.overall).toMatchObject({ gpa: null, total: 13, sectionsCount: 1, dwfPercent: 0 });
  });

  it("only aggregates the newest `window` stored terms", async () => {
    const res = await getCourseGrades({ subject: "CSC", courseNumber: "4520", window: 1 }, { db: t.db });
    expect(res.termsIncluded).toEqual(["202601"]);
    expect(res.professors.map((p) => p.professor)).not.toContain("Nemira, Alina");
  });
});

describe("chooseNextTerm", () => {
  const now = new Date("2026-10-25T12:00:00Z");
  const posted: TermCheck = { posted: true, fetchedAt: new Date("2026-01-01T00:00:00Z") };
  const uncheckedRecently: TermCheck = { posted: false, fetchedAt: new Date(now.getTime() - 60_000) };
  const uncheckedLongAgo: TermCheck = { posted: false, fetchedAt: new Date(now.getTime() - UNPOSTED_RECHECK_MS - 1) };
  const available = ["202205", "202608", "202701", "202601", "202508", "202505", "202501"];

  it("picks the newest term never checked", () => {
    expect(chooseNextTerm(available, new Map(), 8, now)).toBe("202701");
  });

  it("does not let recently-checked unposted terms consume window slots (Java bug)", () => {
    const checked = new Map<string, TermCheck>([
      ["202701", uncheckedRecently],
      ["202608", uncheckedRecently],
      ["202601", posted],
    ]);
    // Java took the newest 8 terms including 202701/202608 and so never reached the 8th
    // posted term; here the two unposted terms are skipped without using a slot.
    expect(chooseNextTerm(available, checked, 2, now)).toBe("202508");
    checked.set("202508", posted);
    expect(chooseNextTerm(available, checked, 2, now)).toBeNull();
  });

  it("re-checks an unposted term once the recheck interval has passed", () => {
    const checked = new Map<string, TermCheck>([["202701", uncheckedLongAgo]]);
    expect(chooseNextTerm(available, checked, 8, now)).toBe("202701");
  });

  it("ignores junk options and is done when the window is full", () => {
    const checked = new Map<string, TermCheck>(["202701", "202608"].map((term) => [term, posted]));
    expect(chooseNextTerm(["%null%", "", ...available], checked, 2, now)).toBeNull();
    expect(chooseNextTerm([], new Map(), 8, now)).toBeNull();
  });
});

describe("pickNextTermToIngest (PGlite)", () => {
  it("walks terms one per call, skipping stored and recently-unposted terms", async () => {
    const available = ["202701", "202608", "202601", "202508", "202505"];
    const now = new Date();
    expect(await pickNextTermToIngest(available, 2, { db: t.db, now })).toBe("202701");
    await markTermUnposted("202701", { db: t.db });
    expect(await pickNextTermToIngest(available, 2, { db: t.db, now })).toBe("202608");
    await markTermUnposted("202608", { db: t.db });
    expect(await pickNextTermToIngest(available, 2, { db: t.db, now })).toBe("202601");
    await upsertTerm("202601", SPRING, { db: t.db });
    expect(await pickNextTermToIngest(available, 2, { db: t.db, now })).toBe("202508");
    await upsertTerm("202508", FALL, { db: t.db });
    expect(await pickNextTermToIngest(available, 2, { db: t.db, now })).toBeNull();
    // A week later the unposted terms are due again.
    const later = new Date(now.getTime() + UNPOSTED_RECHECK_MS + 1000);
    expect(await pickNextTermToIngest(available, 2, { db: t.db, now: later })).toBe("202701");
  });
});
