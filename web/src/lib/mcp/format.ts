import "server-only";
import type { GradeDistributionResponse, ProfessorRating } from "@/lib/course-meta";
import type { SectionMeta } from "@/lib/courses";
import { decodeEntities } from "@/lib/email/escape";
import { creditsLabel, instructorsOf, partOfTermName, titleCase } from "@/lib/format";
import type { CourseData, CourseRef, SectionRequirements } from "@/lib/gosolar";
import { effectiveSeatsAvailable, sectionIsOpen } from "@/lib/gosolar/seats";
import { WEEK_DAYS, type WeekDay } from "@/lib/schedule/conflicts";

/**
 * Compact, model-friendly shapes for the MCP tools. GoSolar's records are large and nested;
 * these keep what a student (or an assistant planning for one) needs, in stable field names.
 */

const DAY_LETTER: Record<WeekDay, string> = {
  monday: "M",
  tuesday: "T",
  wednesday: "W",
  thursday: "R",
  friday: "F",
  saturday: "S",
  sunday: "U",
};

/** Delivery mode from the section attribute codes (the same codes the results filters read). */
const DELIVERY: Array<[code: string, label: string]> = [
  ["HYB", "Hybrid"],
  ["SONL", "Online, scheduled meetings"],
  ["LONL", "Online, asynchronous"],
  ["LF2F", "In person"],
];

export interface CompactMeeting {
  /** Day letters in M T W R F S U order ("MW"); empty for no set days. */
  days: string;
  /** 24-hour "HHMM"; null when TBA or asynchronous. */
  start: string | null;
  end: string | null;
  building: string | null;
  room: string | null;
  type: string | null;
  /** "MM/DD/YYYY". */
  startDate: string | null;
  endDate: string | null;
}

export interface CompactSection {
  term: string | null;
  crn: string | null;
  subject: string | null;
  courseNumber: string | null;
  section: string | null;
  title: string;
  instructor: string | null;
  otherInstructors?: string[];
  credits: string | null;
  /** Seats a student can actually take (cross-listed pools included); can be <= 0 when full. */
  seatsAvailable: number;
  maximumEnrollment: number;
  waitCount: number;
  waitCapacity: number;
  /** An effective seat is free and nobody is waitlisted (PantherWatch's alert rule). */
  open: boolean;
  meetings: CompactMeeting[];
  delivery: string | null;
  partOfTerm: string | null;
  campus: string | null;
  scheduleType: string | null;
  honors: boolean;
}

const hhmm = (value: string | null | undefined): string | null => {
  const digits = (value ?? "").replace(/\D/g, "");
  return digits.length >= 3 && digits.length <= 4 ? digits.padStart(4, "0") : null;
};

const clean = (value: string | null | undefined): string | null => {
  const text = decodeEntities(value ?? "").trim();
  return text || null;
};

function attributeCodes(section: CourseData): Set<string> {
  return new Set((section.sectionAttributes ?? []).map((a) => a?.code?.trim().toUpperCase() ?? "").filter(Boolean));
}

export function compactSection(section: CourseData): CompactSection {
  const codes = attributeCodes(section);
  const [instructor = null, ...others] = instructorsOf(section);
  const meetings: CompactMeeting[] = [];
  for (const entry of section.meetingsFaculty ?? []) {
    const mt = entry?.meetingTime;
    if (!mt) continue;
    const start = hhmm(mt.beginTime);
    const end = hhmm(mt.endTime);
    meetings.push({
      days: WEEK_DAYS.filter((day) => mt[day] === true)
        .map((day) => DAY_LETTER[day])
        .join(""),
      start: start && end ? start : null,
      end: start && end ? end : null,
      building: clean(mt.buildingDescription),
      room: clean(mt.room),
      type: clean(mt.meetingTypeDescription),
      startDate: mt.startDate ?? null,
      endDate: mt.endDate ?? null,
    });
  }
  const seats = effectiveSeatsAvailable(section);
  return {
    term: section.term,
    crn: section.courseReferenceNumber,
    subject: section.subject,
    courseNumber: section.courseNumber,
    section: section.sequenceNumber,
    title: titleCase(decodeEntities(section.courseTitle ?? "").trim()) || "Untitled course",
    instructor,
    ...(others.length ? { otherInstructors: others } : {}),
    credits: creditsLabel(section),
    seatsAvailable: Number.isFinite(seats) ? seats : 0,
    maximumEnrollment: section.maximumEnrollment,
    waitCount: section.waitCount,
    waitCapacity: section.waitCapacity,
    open: sectionIsOpen(section),
    meetings,
    delivery: DELIVERY.find(([code]) => codes.has(code))?.[1] ?? clean(section.instructionalMethodDescription),
    partOfTerm: partOfTermName(section.partOfTerm),
    campus: clean(section.campusDescription),
    scheduleType: clean(section.scheduleTypeDescription),
    honors: codes.has("HC"),
  };
}

type Distribution = GradeDistributionResponse["overall"];

function compactDistribution(d: Distribution | null | undefined) {
  if (!d) return null;
  return {
    professor: d.professor ?? null,
    gpa: d.gpa ?? null,
    dwfPercent: d.dwfPercent ?? null,
    students: d.total ?? null,
    sections: d.sectionsCount ?? null,
    gradeCounts: d.gradeCounts ?? null,
  };
}

/**
 * Grades, rating and syllabus for get_section_details, without the bulky parts.
 * `syllabusSummaryCached` (when known) says whether get_syllabus_summary has a stored summary.
 */
export function compactMeta(meta: SectionMeta, extra: { syllabusSummaryCached?: boolean } = {}) {
  const grades = meta.grades;
  const rating: ProfessorRating | null = meta.rating;
  return {
    grades: grades
      ? {
          hasData: grades.hasData,
          termsIncluded: grades.termsIncluded ?? [],
          overall: compactDistribution(grades.overall),
          instructor: grades.instructorHasTaught ? compactDistribution(grades.instructorDistribution) : null,
          instructorHasTaughtThisCourse: grades.instructorHasTaught ?? false,
          otherProfessors: (grades.professors ?? [])
            .slice(0, 12)
            .map((p) => ({ professor: p.professor, gpa: p.gpa ?? null, dwfPercent: p.dwfPercent ?? null, students: p.total ?? null })),
        }
      : null,
    rating: rating
      ? rating.found
        ? {
            found: true,
            matchedName: rating.matchedName ?? null,
            matchQuality: rating.matchQuality ?? null,
            avgRating: rating.avgRating ?? null,
            avgDifficulty: rating.avgDifficulty ?? null,
            numRatings: rating.numRatings ?? null,
            wouldTakeAgainPercent: rating.wouldTakeAgainPercent ?? null,
            profileUrl: rating.profileUrl ?? null,
          }
        : { found: false }
      : null,
    syllabusUrl: meta.syllabus?.url ?? null,
    ...(meta.syllabus && extra.syllabusSummaryCached !== undefined ? { syllabusSummaryCached: extra.syllabusSummaryCached } : {}),
  };
}

/** Subject code, or Banner's subject name when the code couldn't be resolved. */
const subjectOf = (ref: CourseRef) => (ref.subject ? { subject: ref.subject } : { subject: null, subjectName: ref.subjectDescription });

/**
 * Requirements for get_course_requirements: GoSolar's own prerequisite wording plus a flat course
 * list (the and/or tree is left out; `text` carries the grouping), corequisites and restrictions.
 * Unparsed fragments are passed through so nothing is lost.
 */
export function compactRequirements(req: SectionRequirements) {
  const { prerequisites: pre, restrictions } = req;
  const group = ({ kind, label, values }: { kind: string; label: string; values: string[] }) => ({ kind, label, values });
  return {
    term: req.term,
    crn: req.crn,
    description: req.description?.trim() || null,
    prerequisites: pre
      ? {
          text: pre.text,
          rule: pre.rule,
          items: pre.items.map((item) => ({
            ...subjectOf(item),
            courseNumber: item.courseNumber,
            ...(item.courseNumberTo ? { courseNumberTo: item.courseNumberTo } : {}),
            ...(item.minimumGrade ? { minimumGrade: item.minimumGrade } : {}),
            ...(item.concurrent !== undefined ? { concurrent: item.concurrent } : {}),
          })),
        }
      : null,
    corequisites: req.corequisites.map((c) => ({
      ...subjectOf(c),
      courseNumber: c.courseNumber,
      ...(c.title ? { title: titleCase(c.title) } : {}),
    })),
    restrictions: {
      mustBe: restrictions.mustBe.map(group),
      mustNotBe: restrictions.mustNotBe.map(group),
      specialApprovals: restrictions.specialApprovals,
      other: restrictions.other,
    },
    ...(req.unparsed ? { unparsed: req.unparsed } : {}),
  };
}
