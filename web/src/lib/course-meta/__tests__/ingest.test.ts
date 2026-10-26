import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { gradeTerms } from "@/db/schema/course-meta";
import type { MetaRequestInit } from "../http";
import { ingestNextTerm } from "../grades/ingest";
import { getCourseGrades, listIngestedTerms } from "../grades/store";
import { response } from "./fake-fetch";
import { fixture } from "./fixtures";
import { createTestDb, type TestDb } from "./pglite";

const PAGE = fixture("apex-page-184.html"); // terms 202608, 202601, 202508, 202505
const CSV: Record<string, { summary: string; detailed: string }> = {
  "202601": { summary: fixture("202601__summary.csv"), detailed: fixture("202601__detailed.csv") },
  "202508": { summary: fixture("202508__summary.csv"), detailed: fixture("202508__detailed.csv") },
};
const UNPOSTED_SUMMARY =
  "CRN,Course,Professor,A  (90-100),B  (80-89),C  (70-79),D  (60-69),F <60,WF,A- WF,DWF,W,CRS AVG,Other ,Total,Instruction Method\n" +
  '20001,CSC 1301 ,"Doe, Jane",0,0,0,0,0,0,0,0.0,0,,30,30,T\n';

/** A fake APEX that tracks the session's term filter like the real one. */
function fakeApex() {
  let term = "";
  const urls: string[] = [];
  const fetchImpl = async (url: string, init: MetaRequestInit) => {
    void init;
    urls.push(url);
    const p = new URL(url).searchParams.get("p") ?? "";
    const set = /::NO::P_TERM_184:(\d{6})$/.exec(p);
    if (set) {
      term = set[1];
      return response({ body: PAGE });
    }
    const exp = /:FLOW_EXCEL_OUTPUT_(R\d+)_en$/.exec(p);
    if (exp) {
      const data = CSV[term];
      const summary = exp[1] === "R40828346286637";
      if (!data) return response({ body: summary ? UNPOSTED_SUMMARY : "CRN,A+,A\n" });
      return response({ body: summary ? data.summary : data.detailed });
    }
    return response({ body: PAGE });
  };
  return { fetchImpl, urls };
}

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

describe("ingestNextTerm", () => {
  it("ingests one term per call until the window is full", async () => {
    const apex = fakeApex();
    const options = { fetchImpl: apex.fetchImpl, db: t.db, window: 2 };

    expect(await ingestNextTerm(options)).toEqual({ term: "202608", rows: 0, posted: false });
    expect(await ingestNextTerm(options)).toEqual({ term: "202601", rows: 8, posted: true });
    expect(await ingestNextTerm(options)).toEqual({ term: "202508", rows: 24, posted: true });
    expect(await ingestNextTerm(options)).toEqual({ done: true });

    expect(await listIngestedTerms({ db: t.db })).toEqual(["202601", "202508"]);
    const unposted = await t.db.select().from(gradeTerms);
    expect(unposted.find((row) => row.term === "202608")?.posted).toBe(false);

    const grades = await getCourseGrades({ subject: "CSC", courseNumber: "4520" }, { db: t.db });
    expect(grades.termsIncluded).toEqual(["202601", "202508"]);
    // 4 requests per ingesting call (landing, set term, 2 CSVs), 1 for the final one.
    expect(apex.urls).toHaveLength(4 * 3 + 1);
  });

  it("refuses an HTML page where a CSV was expected", async () => {
    const fetchImpl = async (url: string) =>
      response({ body: /FLOW_EXCEL_OUTPUT/.test(url) ? "<html>error</html>" : PAGE });
    await expect(ingestNextTerm({ fetchImpl, db: t.db })).rejects.toThrow(/not a grade CSV/);
    expect(await t.db.select().from(gradeTerms)).toEqual([]);
  });
});
