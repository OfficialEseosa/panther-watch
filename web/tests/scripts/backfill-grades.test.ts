import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { count, eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { gradeTerms, sectionGrades } from "@/db/schema/course-meta";
import { getCourseGrades, listIngestedTerms } from "@/lib/course-meta/grades/store";
import { backfill } from "../../scripts/backfill-grades";
import { createTestDb, truncateAll, type TestDatabase } from "../helpers/db";

const GRADE_DATA = fileURLToPath(new URL("../../data/grade-csv", import.meta.url));
const TERMS = ["202508", "202601"];
const quiet = () => {};

/** Data rows in a summary CSV (non-empty lines minus the header). */
async function csvRowCount(term: string): Promise<number> {
  const text = await readFile(path.join(GRADE_DATA, `${term}__summary.csv`), "utf8");
  return text.split(/\r?\n/).filter((line) => line.trim() !== "").length - 1;
}

let t: TestDatabase;
beforeAll(async () => {
  t = await createTestDb();
});
beforeEach(async () => {
  await truncateAll(t.db);
});
afterAll(async () => {
  await t.close();
});

// Parses and inserts two full terms; it timed out at the 20s default under full parallel load.
describe("backfill (real grade-data CSVs)", { timeout: 60_000 }, () => {
  it("ingests the selected terms with every CSV row", async () => {
    const result = await backfill({ dir: GRADE_DATA, terms: TERMS, db: t.db, log: quiet });

    expect(result.failures).toEqual([]);
    expect(result.terms.map((r) => [r.term, r.posted])).toEqual([
      ["202508", true],
      ["202601", true],
    ]);
    for (const term of TERMS) {
      const expected = await csvRowCount(term);
      expect(expected).toBeGreaterThan(1000);
      expect(result.terms.find((r) => r.term === term)?.rows).toBe(expected);
      const [{ n }] = await t.db.select({ n: count() }).from(sectionGrades).where(eq(sectionGrades.term, term));
      expect(n).toBe(expected);
    }
    expect(result.totalRows).toBe((await csvRowCount("202508")) + (await csvRowCount("202601")));

    expect(await listIngestedTerms({ db: t.db })).toEqual(["202601", "202508"]);

    const grades = await getCourseGrades({ subject: "CSC", courseNumber: "1301" }, { db: t.db });
    expect(grades.hasData).toBe(true);
    expect(grades.termsIncluded).toEqual(["202601", "202508"]);
    expect(grades.overall?.total).toBeGreaterThan(0);
    expect(grades.overall?.gpa).toBeGreaterThan(0);
    expect(grades.professors.length).toBeGreaterThan(0);

    // Re-running replaces rather than duplicates.
    await backfill({ dir: GRADE_DATA, terms: ["202508"], db: t.db, log: quiet });
    const [{ n }] = await t.db.select({ n: count() }).from(sectionGrades).where(eq(sectionGrades.term, "202508"));
    expect(n).toBe(await csvRowCount("202508"));
  });

  it("dry run parses without a database", async () => {
    const result = await backfill({ dir: GRADE_DATA, terms: ["202601"], dryRun: true, log: quiet });
    expect(result.failures).toEqual([]);
    expect(result.terms[0]).toMatchObject({ term: "202601", rows: await csvRowCount("202601"), posted: true });
    expect(await t.db.select().from(gradeTerms)).toEqual([]);
  });
});

describe("backfill (synthetic CSVs)", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "backfill-grades-"));
    const summary =
      "CRN,Course,Professor,A  (90-100),B  (80-89),C  (70-79),D  (60-69),F <60,WF,A- WF,DWF,W,CRS AVG,Other ,Total,Instruction Method\n" +
      '10001,CSC 1301 ,"Doe, Jane",0,0,0,0,0,0,0,0.0,0,,30,30,T\n';
    const detailed = "CRN,A+,A,A-,B+,B,B-,C+,C,C-\n10001,0,0,0,0,0,0,0,0,0\n";
    await writeFile(path.join(dir, "202608__summary.csv"), summary);
    await writeFile(path.join(dir, "202608__detailed.csv"), detailed);
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("records a term without posted grades as unposted", async () => {
    const result = await backfill({ dir, db: t.db, log: quiet });
    expect(result.failures).toEqual([]);
    expect(result.terms).toMatchObject([{ term: "202608", rows: 0, posted: false }]);
    const terms = await t.db.select({ term: gradeTerms.term, posted: gradeTerms.posted }).from(gradeTerms);
    expect(terms).toEqual([{ term: "202608", posted: false }]);
    expect(await t.db.select().from(sectionGrades)).toEqual([]);
  });

  it("fails without writing when a requested term has no complete pair", async () => {
    await writeFile(path.join(dir, "202605__summary.csv"), "CRN,Course\n");
    try {
      const result = await backfill({ dir, db: t.db, log: quiet });
      expect(result.failures).toEqual(["202605: missing 202605__detailed.csv"]);
      expect(result.terms).toEqual([]);
      expect(await t.db.select().from(gradeTerms)).toEqual([]);
    } finally {
      await rm(path.join(dir, "202605__summary.csv"));
    }
  });
});
