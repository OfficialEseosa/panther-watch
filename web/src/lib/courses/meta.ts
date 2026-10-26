import "server-only";
import { z } from "zod";
import {
  getCourseGrades,
  getProfessorRating,
  getSyllabus,
  professorKey,
  type GradeDistributionResponse,
  type ProfessorRating,
} from "@/lib/course-meta";
import {
  blankToUndefined,
  courseNumberSchema,
  crnSchema,
  subjectSchema,
  termCodeSchema,
} from "./validation";

export const sectionMetaSchema = z.object({
  term: termCodeSchema,
  subject: subjectSchema,
  courseNumber: courseNumberSchema,
  crn: crnSchema,
  instructor: z.preprocess(blankToUndefined, z.string().trim().max(200).nullish()).transform((v) => v ?? null),
});
export type SectionMetaInput = z.input<typeof sectionMetaSchema>;

export const BATCH_META_MAX = 50;
export const batchMetaSchema = z.object({
  items: z.array(sectionMetaSchema).min(1).max(BATCH_META_MAX),
});

export interface SectionMeta {
  /** Course-wide grade history plus the instructor's slice; null when the lookup failed. */
  grades: GradeDistributionResponse | null;
  /** RateMyProfessors summary (`found: false` when no match); null when there is no instructor or the lookup failed. */
  rating: ProfessorRating | null;
  /** Public syllabus PDF; null when none is published or the lookup failed. */
  syllabus: { url: string } | null;
}

/** The course-meta getters, injectable so tests can count calls. */
export interface MetaSources {
  getCourseGrades: (query: { subject: string; courseNumber: string; instructor?: string | null }) => Promise<GradeDistributionResponse>;
  getProfessorRating: (name: string) => Promise<ProfessorRating>;
  getSyllabus: (term: string, crn: string) => Promise<{ url: string } | null>;
}

const defaultSources: MetaSources = {
  getCourseGrades: (query) => getCourseGrades(query),
  getProfessorRating: (name) => getProfessorRating(name),
  getSyllabus: (term, crn) => getSyllabus(term, crn),
};

/** Grades, rating and syllabus for one section. Never throws: failed parts are null. */
export async function getSectionMeta(
  input: SectionMetaInput,
  sources: MetaSources = defaultSources,
): Promise<SectionMeta> {
  const [meta] = await getBatchMeta([input], sources);
  return meta;
}

/**
 * Meta for many sections (a results page), in input order. Lookups are deduplicated:
 * grades once per course (the instructor slice is derived from the course-wide
 * `professors` list, exactly as getCourseGrades matches it, by professor key), ratings once
 * per distinct instructor, syllabi once per (term, crn). So 12 cards of one course with 12
 * instructors cost 1 grade query + 12 rating lookups, not 24. Never throws for lookup
 * failures; invalid input throws a ZodError.
 */
export async function getBatchMeta(
  inputs: readonly SectionMetaInput[],
  sources: MetaSources = defaultSources,
): Promise<SectionMeta[]> {
  const items = inputs.map((input) => sectionMetaSchema.parse(input));

  const gradeTasks = new Map<string, Promise<GradeDistributionResponse | null>>();
  const ratingTasks = new Map<string, Promise<ProfessorRating | null>>();
  const syllabusTasks = new Map<string, Promise<{ url: string } | null>>();

  for (const item of items) {
    const courseKey = `${item.subject}|${item.courseNumber}`;
    if (!gradeTasks.has(courseKey)) {
      gradeTasks.set(
        courseKey,
        settle(() => sources.getCourseGrades({ subject: item.subject, courseNumber: item.courseNumber }), "grades"),
      );
    }
    const ratingKey = instructorKey(item.instructor);
    if (ratingKey && !ratingTasks.has(ratingKey)) {
      const name = item.instructor as string;
      ratingTasks.set(ratingKey, settle(() => sources.getProfessorRating(name), "rating"));
    }
    const sectionKey = `${item.term}|${item.crn}`;
    if (!syllabusTasks.has(sectionKey)) {
      syllabusTasks.set(sectionKey, settle(() => sources.getSyllabus(item.term, item.crn), "syllabus"));
    }
  }

  return Promise.all(
    items.map(async (item) => {
      const ratingKey = instructorKey(item.instructor);
      const [courseGrades, rating, syllabus] = await Promise.all([
        gradeTasks.get(`${item.subject}|${item.courseNumber}`)!,
        ratingKey ? ratingTasks.get(ratingKey)! : Promise.resolve(null),
        syllabusTasks.get(`${item.term}|${item.crn}`)!,
      ]);
      return {
        grades: courseGrades ? forInstructor(courseGrades, item.instructor) : null,
        rating: rating ? { ...rating, professorQueried: item.instructor } : null,
        syllabus,
      };
    }),
  );
}

/** Professor key for dedup; falls back to the folded raw string for unparseable names. */
function instructorKey(instructor: string | null): string | null {
  if (!instructor) return null;
  return professorKey(instructor) ?? `raw:${instructor.trim().toLowerCase()}`;
}

/**
 * The instructor-specific fields of a course-wide GradeDistributionResponse. Mirrors
 * getCourseGrades: `professors[i].professor` is the display name whose key grouped the row.
 */
function forInstructor(
  grades: GradeDistributionResponse,
  instructor: string | null,
): GradeDistributionResponse {
  const wanted = instructor?.trim() ? professorKey(instructor) : null;
  const matched = wanted ? (grades.professors.find((p) => professorKey(p.professor) === wanted) ?? null) : null;
  return {
    ...grades,
    instructorQueried: instructor,
    instructorHasTaught: matched !== null,
    instructorDistribution: matched,
  };
}

async function settle<T>(task: () => Promise<T>, label: string): Promise<T | null> {
  const [result] = await Promise.allSettled([Promise.resolve().then(task)]);
  if (result.status === "fulfilled") return result.value;
  console.warn(`course meta ${label} lookup failed:`, result.reason instanceof Error ? result.reason.message : result.reason);
  return null;
}
