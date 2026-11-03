/**
 * A small GSU course catalog (40 courses in CSC, ENGL, MATH and PHYS) as GoSolar's course
 * catalog search sends it: abbreviated upper-case `courseTitle`, and a `courseDescription` whose
 * first line is the full title, then "Prerequisite: ..." and the description (titles and the
 * shape copied from live GoSolar, Spring 2027, 2026-11-02). It holds every nickname target in
 * CSC/MATH/ENGL/PHYS, the 4000/6000 twins (Software Engineering, Linear Algebra II, Algorithms),
 * a Perimeter-owned course (CSC 1010), combined lecture/lab "K" courses and a lab.
 *
 *   gs.setCatalog("202701", catalogFixture());
 *   await seedCatalog(testDb.db, catalogFixture(), "202701");   // straight into catalog_courses
 */
import { catalogCourses } from "@/db/schema";
import type { Db } from "@/db";
import { parseCatalogCourse } from "@/lib/course-meta/catalog";
import type { CatalogCourseData } from "@/lib/gosolar";

const SUBJECTS: Record<string, string> = {
  CSC: "COMPUTER SCIENCE",
  ENGL: "ENGLISH",
  MATH: "MATHEMATICS",
  PHYS: "PHYSICS",
};

interface Spec {
  code: string;
  short: string;
  title: string;
  about: string;
  prereq?: string;
  credits?: number;
  high?: number;
  indicator?: "TO" | "OR";
  college?: string;
}

const SPECS: Spec[] = [
  { code: "CSC 1010", short: "COMPUTERS &amp; APPLICATIONS", title: "Computers and Applications", about: "Computer concepts and common software applications.", college: "PC" },
  { code: "CSC 1301", short: "PRINCIPLES OF COMPUTER SCI I", title: "Principles of Computer Science I", prereq: "Only for STEM majors and minors. Co-requisite: CSC 1301L.", about: "This course is an introduction to the fundamental principles of programming and data analysis in computer science.", credits: 4 },
  { code: "CSC 1301L", short: "PRINCIPLES COMPUTER SCI LAB I", title: "Principles of Computer Science Laboratory I", prereq: "Co-requisite: CSC 1301.", about: "Laboratory for Principles of Computer Science I.", credits: 0 },
  { code: "CSC 1302", short: "PRINCIPLES OF COMPUTER SCI II", title: "Principles of Computer Science II", prereq: "CSC 1301 with a C or higher.", about: "Object-oriented programming, recursion and searching.", credits: 4 },
  { code: "CSC 2720", short: "DATA STRUCTURES", title: "Data Structures", prereq: "CSC 1302 with a C or higher.", about: "Linked lists, stacks, queues, trees, heaps and hashing, with the analysis of their operations." },
  { code: "CSC 3320", short: "SYSTEM-LEVEL PROGRAMMING", title: "System-Level Programming", prereq: "CSC 1302 with a C or higher.", about: "Unix, shell scripts and C programming." },
  { code: "CSC 4350", short: "SOFTWARE ENGINEERING-CTW", title: "Software Engineering - CTW", prereq: "CSc 2720, CSc 3210, CSC 3210L, and CSc 3320 with a C or higher.", about: "This course focuses on techniques for the development of large software systems.", credits: 4 },
  { code: "CSC 4351", short: "CAPSTONE I-CTW", title: "Capstone Senior Design I-CTW", prereq: "CSC 3350 with a C or higher.", about: "This first course in a sequence of two consecutive courses integrates software design.", credits: 2 },
  { code: "CSC 4352", short: "CAPSTONE II-CTW", title: "Capstone Senior Design II-CTW", prereq: "CSC 4351 with a C or higher.", about: "Student teams gain new experience in software implementation.", credits: 1, high: 3, indicator: "TO" },
  { code: "CSC 4520", short: "DESIGN &amp; ANALYSIS: ALGORITHMS", title: "Design and Analysis of Algorithms", prereq: "CSC 2720 with a C or higher.", about: "Algorithm design techniques and complexity." },
  { code: "CSC 4710", short: "DATABASE SYSTEMS", title: "Database Systems", prereq: "CSC 2720 with a C or higher.", about: "Relational databases, SQL and normalization." },
  { code: "CSC 6350", short: "SOFTWARE ENGINEERING", title: "Software Engineering", about: "Techniques for the development of large software systems.", credits: 4 },
  { code: "CSC 6520", short: "DESIGN &amp; ANALYSIS: ALGORITHMS", title: "Design and Analysis of Algorithms", about: "Algorithm design techniques and complexity." },
  { code: "ENGL 0999", short: "SUPPORT FOR ENGLISH COMP", title: "Support for English Composition", about: "Support for students in English Composition I.", credits: 2 },
  { code: "ENGL 1101", short: "ENGLISH COMPOSITION I", title: "English Composition I", about: "A composition course focusing on skills required for effective writing in a variety of contexts." },
  { code: "ENGL 1102", short: "ENGLISH COMPOSITION II", title: "English Composition II", prereq: "ENGL 1101 with a grade of C or higher.", about: "A composition course that develops writing skills beyond the levels of proficiency required by ENGL 1101." },
  { code: "ENGL 1103", short: "ADVANCED ENGLISH COMPOSITION", title: "Advanced English Composition", about: "An accelerated composition course." },
  { code: "ENGL 2110", short: "WORLD LITERATURE", title: "World Literature", prereq: "ENGL 1102.", about: "A survey of important works of world literature." },
  { code: "ENGL 2130", short: "AMERICAN LITERATURE", title: "American Literature", prereq: "ENGL 1102.", about: "A survey of important works of American literature." },
  { code: "MATH 1111", short: "COLLEGE ALGEBRA", title: "College Algebra", prereq: "Appropriate score on the math placement test.", about: "Functions and graphs, polynomial and rational functions, exponential and logarithmic functions." },
  { code: "MATH 1113", short: "PRECALCULUS", title: "Precalculus", prereq: "Math 1111 with a C or higher.", about: "An intensive study of the basic functions needed for calculus.", credits: 4 },
  { code: "MATH 1401", short: "ELEMENTARY STATISTICS", title: "Elementary Statistics", about: "This is a non-calculus based introduction to statistics." },
  { code: "MATH 2201", short: "CALCULUS FOR LIFE SCIENCES I", title: "Calculus for the Life Sciences I", prereq: "Math 1113 with a C or higher.", about: "Differential calculus with applications to the life sciences.", credits: 4 },
  { code: "MATH 2202", short: "CALCULUS FOR LIFE SCIENCES II", title: "Calculus for the Life Sciences II", prereq: "Math 2201 with a C or higher.", about: "Integral calculus with applications to the life sciences.", credits: 4 },
  { code: "MATH 2211", short: "CALCULUS OF ONE VARIABLE I", title: "Calculus of One Variable I", prereq: "Math 1113 with a C or higher, or a suitable score on the math placement test.", about: "Limits and continuity, derivatives and their applications.", credits: 4 },
  { code: "MATH 2212", short: "CALCULUS OF ONE VARIABLE II", title: "Calculus of One Variable II", prereq: "Math 2201 or Math 2211 with a C or higher.", about: "Applications and techniques of integration; transcendental functions; sequences and series.", credits: 4 },
  { code: "MATH 2215", short: "MULTIVARIATE CALCULUS", title: "Multivariate Calculus", prereq: "Math 2212 with grade of C or higher.", about: "Real-valued functions of several variables, limits, continuity, partial derivatives.", credits: 4 },
  { code: "MATH 2420", short: "DISCRETE MATHEMATICS", title: "Discrete Mathematics", prereq: "Math 1113 with a grade of C or higher.", about: "This course introduces the ideas of finite mathematics: sets, logic, counting and graphs." },
  { code: "MATH 2641", short: "LINEAR ALGEBRA I", title: "Linear Algebra I", prereq: "Math 2212 with a C or higher.", about: "Matrices, vector spaces and linear transformations." },
  { code: "MATH 3020", short: "APPL PROB &amp; STATS FOR CS", title: "Applied Probability and Statistics for Computer Science", prereq: "Math 2212.", about: "Probability and statistics with applications to computing." },
  { code: "MATH 4435", short: "LINEAR ALGEBRA II", title: "Linear Algebra II", prereq: "Math 2641.", about: "Inner product spaces, eigenvalues and canonical forms." },
  { code: "MATH 4751", short: "MATHEMATICAL STATISTICS I", title: "Mathematical Statistics I", prereq: "Math 2215.", about: "Probability theory and distributions." },
  { code: "MATH 6435", short: "LINEAR ALGEBRA II", title: "Linear Algebra II", about: "Inner product spaces, eigenvalues and canonical forms." },
  { code: "PHYS 1000", short: "GATEWAY TO PHYSICS", title: "Gateway to Physics", about: "An introduction to the physics major.", credits: 1 },
  { code: "PHYS 1111", short: "INTRODUCTORY PHYSICS I", title: "Introductory Physics I", prereq: "Math 1113.", about: "Algebra-based introductory physics: mechanics and heat." },
  { code: "PHYS 1111K", short: "INTRODUCTORY PHYSICS I", title: "Introductory Physics I", prereq: "Math 1113.", about: "Algebra-based introductory physics with laboratory.", credits: 4 },
  { code: "PHYS 1112", short: "INTRODUCTORY PHYSICS II", title: "Introductory Physics II", prereq: "PHYS 1111.", about: "Algebra-based introductory physics: electricity, magnetism and optics." },
  { code: "PHYS 2211", short: "PRINCIPLES OF PHYSICS I", title: "Principles of Physics I", prereq: "Math 2211.", about: "Calculus-based introductory physics: mechanics." },
  { code: "PHYS 2211K", short: "PRINCIPLES OF PHYSICS I", title: "Principles of Physics I", prereq: "Math 2211.", about: "Calculus-based introductory physics with laboratory.", credits: 4 },
  { code: "PHYS 2212", short: "PRINCIPLES OF PHYSICS II", title: "Principles of Physics II", prereq: "PHYS 2211.", about: "Calculus-based introductory physics: electricity and magnetism." },
];

/** One raw catalog record, Banner-shaped. */
export function makeCatalogCourse(spec: Spec, overrides: Partial<CatalogCourseData> = {}): CatalogCourseData {
  const [subject, courseNumber] = spec.code.split(" ");
  const lines = [`${spec.title}. `, ...(spec.prereq ? [`Prerequisite: ${spec.prereq}`] : []), spec.about];
  return {
    subject,
    subjectCode: subject,
    subjectDescription: SUBJECTS[subject],
    courseNumber,
    courseTitle: spec.short,
    courseDescription: lines.join("\n"),
    collegeCode: spec.college ?? "AS",
    college: spec.college === "PC" ? "Perimeter College" : "College of Arts &amp; Sciences",
    creditHourLow: spec.credits ?? 3,
    creditHourHigh: spec.high ?? null,
    creditHourIndicator: spec.indicator ?? null,
    termEffective: "202608",
    ...overrides,
  };
}

/** The 40 fixture courses (fresh objects on every call). */
export function catalogFixture(): CatalogCourseData[] {
  return SPECS.map((spec) => makeCatalogCourse(spec));
}

/** Inserts parsed fixture courses straight into `catalog_courses` (no GoSolar), seen in `term`. */
export async function seedCatalog(db: Db, courses: CatalogCourseData[] = catalogFixture(), term = "202701"): Promise<void> {
  const rows = courses
    .map((course) => ({ ...course, courseTitle: course.courseTitle?.replace(/&amp;/g, "&") ?? null }))
    .map(parseCatalogCourse)
    .filter((row) => row !== null)
    .map((row) => ({ ...row, firstSeenTerm: term, lastSeenTerm: term }));
  await db.insert(catalogCourses).values(rows);
}
