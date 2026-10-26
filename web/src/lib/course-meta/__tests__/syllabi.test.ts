import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { syllabi } from "@/db/schema/course-meta";
import { CourseMetaHttpError } from "../http";
import { SYLLABI_BASE_URL, getSyllabus, ingestSyllabiForTerm, parseSyllabiFile } from "../syllabi";
import { fakeFetch, response } from "./fake-fetch";
import { createTestDb, type TestDb } from "./pglite";

const termFile = (...courses: { crn: string | number; syllabus?: string | null }[]) => ({
  courses: courses.map((c) => ({ term: "202508", subject: "CSC", ...c })),
});

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

describe("parseSyllabiFile", () => {
  it("keeps courses with a non-empty path", () => {
    const file = parseSyllabiFile(
      termFile(
        { crn: "83410", syllabus: "syllabi/202508/83410.pdf" },
        { crn: 83411, syllabus: " " },
        { crn: "83412", syllabus: null },
        { crn: 83413, syllabus: "syllabi/202508/83413.pdf" },
      ),
    );
    expect(file.courseCount).toBe(4);
    expect([...file.paths]).toEqual([
      ["83410", "syllabi/202508/83410.pdf"],
      ["83413", "syllabi/202508/83413.pdf"],
    ]);
  });

  it("rejects an unexpected shape", () => {
    expect(() => parseSyllabiFile({ data: [] })).toThrow();
  });
});

describe("ingestSyllabiForTerm + getSyllabus", () => {
  it("upserts paths and serves the CDN URL", async () => {
    const { fetchImpl, calls } = fakeFetch(
      response({ body: termFile({ crn: "83410", syllabus: "syllabi/202508/83410.pdf" }, { crn: "83411", syllabus: "" }) }),
    );
    expect(await ingestSyllabiForTerm("202508", { fetchImpl, db: t.db })).toEqual({
      term: "202508",
      upserted: 1,
      removed: 0,
    });
    expect(calls[0].url).toBe(`${SYLLABI_BASE_URL}202508.json`);

    expect(await getSyllabus("202508", "83410", { db: t.db })).toEqual({
      url: "https://cdn.gsu.edu/static/syllabi-public/files/syllabi/202508/83410.pdf",
    });
    expect(await getSyllabus("202508", "83411", { db: t.db })).toBeNull();
    expect(await getSyllabus("202601", "83410", { db: t.db })).toBeNull();
    expect(await getSyllabus("../etc", "83410", { db: t.db })).toBeNull();
  });

  it("handles batches larger than 500 and removes syllabi that disappeared", async () => {
    const many = Array.from({ length: 1203 }, (_, i) => ({ crn: String(10000 + i), syllabus: `syllabi/202508/${10000 + i}.pdf` }));
    const { fetchImpl } = fakeFetch(
      response({ body: termFile(...many) }),
      response({ body: termFile(...many.slice(0, 1000), { crn: "10001", syllabus: "syllabi/202508/10001-v2.pdf" }) }),
    );
    expect((await ingestSyllabiForTerm("202508", { fetchImpl, db: t.db })).upserted).toBe(1203);
    const second = await ingestSyllabiForTerm("202508", { fetchImpl, db: t.db });
    expect(second).toEqual({ term: "202508", upserted: 1000, removed: 203 });
    expect(await t.db.select().from(syllabi)).toHaveLength(1000);
    expect(await getSyllabus("202508", "10001", { db: t.db })).toEqual({
      url: `${SYLLABI_BASE_URL}files/syllabi/202508/10001-v2.pdf`,
    });
  });

  it("a failed fetch writes nothing and leaves earlier data intact (Java cached an empty map for 6 h)", async () => {
    const { fetchImpl } = fakeFetch(
      response({ body: termFile({ crn: "83410", syllabus: "syllabi/202508/83410.pdf" }) }),
      response({ status: 503, body: "Service Unavailable" }),
      new Error("timeout"),
      response({ body: "<html>oops</html>" }),
      response({ body: termFile() }),
    );
    await ingestSyllabiForTerm("202508", { fetchImpl, db: t.db });

    await expect(ingestSyllabiForTerm("202508", { fetchImpl, db: t.db })).rejects.toBeInstanceOf(CourseMetaHttpError);
    await expect(ingestSyllabiForTerm("202508", { fetchImpl, db: t.db })).rejects.toThrow("timeout");
    await expect(ingestSyllabiForTerm("202508", { fetchImpl, db: t.db })).rejects.toThrow();
    await expect(ingestSyllabiForTerm("202508", { fetchImpl, db: t.db })).rejects.toThrow(/no courses/);

    expect(await getSyllabus("202508", "83410", { db: t.db })).not.toBeNull();
  });

  it("validates the term before fetching", async () => {
    const { fetchImpl, calls } = fakeFetch();
    await expect(ingestSyllabiForTerm("2025/08", { fetchImpl, db: t.db })).rejects.toThrow(/Invalid term/);
    expect(calls).toHaveLength(0);
  });
});
