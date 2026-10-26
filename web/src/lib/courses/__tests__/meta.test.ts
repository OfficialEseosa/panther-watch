import { describe, expect, it, vi } from "vitest";
import type { GradeAggregate, GradeDistributionResponse, ProfessorRating } from "@/lib/course-meta";
import { getBatchMeta, getSectionMeta, type MetaSources } from "../meta";

const aggregate = (professor: string | null, total: number): GradeAggregate => ({
  professor,
  gpa: 3.1,
  dwfPercent: 10,
  total,
  withdrawCount: 1,
  sectionsCount: 2,
  termsTaught: ["202601"],
  gradeCounts: { "A+": 0, A: 1, "A-": 0, "B+": 0, B: 0, "B-": 0, "C+": 0, C: 0, "C-": 0, D: 0, F: 0, WF: 0 },
});

function grades(subject: string, courseNumber: string): GradeDistributionResponse {
  return {
    subject,
    courseNumber,
    hasData: true,
    termsIncluded: ["202601"],
    overall: aggregate(null, 100),
    professors: [aggregate("Nemira, Alina", 60), aggregate("Smith, John", 40)],
    instructorQueried: null,
    instructorHasTaught: false,
    instructorDistribution: null,
  };
}

function fakeSources(overrides: Partial<MetaSources> = {}) {
  const sources = {
    getCourseGrades: vi.fn(async (q: { subject: string; courseNumber: string }) => grades(q.subject, q.courseNumber)),
    getProfessorRating: vi.fn(
      async (name: string) => ({ professorQueried: name, found: true, avgRating: 4 }) as unknown as ProfessorRating,
    ),
    getSyllabus: vi.fn(async () => null),
    ...overrides,
  };
  return sources;
}

const item = (crn: string, instructor: string | null, courseNumber = "1301") => ({
  term: "202701",
  subject: "CSC",
  courseNumber,
  crn,
  instructor,
});

describe("getBatchMeta", () => {
  it("queries grades once per course and ratings once per professor", async () => {
    const sources = fakeSources();
    const items = [
      item("80001", "Nemira, Alina"),
      item("80002", "Alina Nemira"),
      item("80003", "Smith, John"),
      item("80004", null),
      item("80005", "Nemira, Alina", "2720"),
    ];
    const result = await getBatchMeta(items, sources);

    expect(sources.getCourseGrades).toHaveBeenCalledTimes(2);
    expect(sources.getProfessorRating).toHaveBeenCalledTimes(2);
    expect(sources.getSyllabus).toHaveBeenCalledTimes(5);

    expect(result.map((m) => m.grades?.instructorDistribution?.professor ?? null)).toEqual([
      "Nemira, Alina",
      "Nemira, Alina",
      "Smith, John",
      null,
      "Nemira, Alina",
    ]);
    expect(result[1].grades).toMatchObject({ instructorQueried: "Alina Nemira", instructorHasTaught: true });
    expect(result[1].rating?.professorQueried).toBe("Alina Nemira");
    expect(result[3]).toMatchObject({ rating: null, grades: { instructorHasTaught: false } });
  });

  it("returns nulls for failed lookups instead of throwing", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const sources = fakeSources({
        getCourseGrades: vi.fn(async () => {
          throw new Error("db down");
        }),
        getSyllabus: vi.fn(() => {
          throw new Error("sync throw");
        }),
      });
      const meta = await getSectionMeta(item("80001", "Smith, John"), sources);
      expect(meta).toMatchObject({ grades: null, syllabus: null, rating: { found: true } });
    } finally {
      warn.mockRestore();
    }
  });

  it("rejects invalid input", async () => {
    await expect(getBatchMeta([{ ...item("1", null) }], fakeSources())).rejects.toThrow();
  });
});
