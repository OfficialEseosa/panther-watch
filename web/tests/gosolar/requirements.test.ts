/**
 * getSectionRequirements end to end: the real client (term declaration on a fresh
 * single-connection Agent, F5 cookies, four fragment POSTs, subject-list lookup) against the
 * fake GoSolar serving the HTML live GoSolar sent for Spring 2027 sections
 * (tests/fixtures/gosolar, captured 2026-11-01).
 */
import { readFileSync } from "node:fs";
import { Agent } from "undici";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import {
  GoSolarAffinityError,
  GoSolarError,
  getSectionRequirements,
  parsePrerequisites,
  subjectResolver,
  type AgentFactory,
  type GoSolarOptions,
} from "@/lib/gosolar";
import { AFFINITY_COOKIE, SESSION_COOKIE, startFakeGoSolar, type FakeGoSolar } from "../helpers/fake-gosolar";

const TERM = "202701";
const fixture = (name: string) => readFileSync(new URL(`../fixtures/gosolar/${name}`, import.meta.url), "utf8");

const SUBJECTS = [
  { code: "CSC", description: "COMPUTER SCIENCE" },
  { code: "DSCI", description: "DATA SCIENCE" },
  { code: "MATH", description: "MATHEMATICS" },
  { code: "CSD", description: "COMMUNICATION SCI &amp; DISORDERS" },
];

let gs: FakeGoSolar;
let agents: Agent[];
let options: GoSolarOptions;

beforeAll(async () => {
  gs = await startFakeGoSolar();
});
afterAll(async () => {
  await gs.close();
});
beforeEach(() => {
  gs.reset();
  gs.setSubjects(TERM, SUBJECTS);
  agents = [];
  const agentFactory: AgentFactory = () => {
    const agent = new Agent({ connections: 1 });
    agents.push(agent);
    return agent;
  };
  options = { baseUrl: gs.url, agentFactory };
});

const FRAGMENT_PATHS = [
  "/searchResults/getSectionPrerequisites",
  "/searchResults/getCorequisites",
  "/searchResults/getRestrictions",
  "/searchResults/getCourseDescription",
];

describe("getSectionRequirements: request flow", () => {
  it("declares the term, then POSTs all four fragments on that session's connection and cookies", async () => {
    gs.setRequirements(TERM, "19010", {
      prerequisites: fixture("prerequisites-csc1301.html"),
      corequisites: fixture("corequisites-csc1301.html"),
      restrictions: fixture("restrictions-csc1301.html"),
      description: fixture("description-csc1301.html"),
    });

    const result = await getSectionRequirements(TERM, "19010", options);

    const declare = gs.requests.find((r) => r.path === "/term/search");
    expect(declare).toMatchObject({ method: "POST", body: `term=${TERM}`, status: 200 });
    const fragments = gs.requests.filter((r) => FRAGMENT_PATHS.includes(r.path));
    expect(fragments.map((r) => r.path).sort()).toEqual([...FRAGMENT_PATHS].sort());
    const declaredSession = Object.fromEntries(
      [SESSION_COOKIE, AFFINITY_COOKIE].map((name) => [name, expect.any(String)]),
    );
    for (const request of fragments) {
      expect(request.method).toBe("POST");
      expect(Object.fromEntries(new URLSearchParams(request.body))).toEqual({ term: TERM, courseReferenceNumber: "19010" });
      expect(request.cookies).toMatchObject(declaredSession);
      expect(request.cookies[SESSION_COOKIE]).toBe(fragments[0].cookies[SESSION_COOKIE]);
      // Same TCP connection as the declaration: the F5 affinity cookie is only issued on a fresh one.
      expect(request.remotePort).toBe(declare?.remotePort);
      expect(request.status).toBe(200);
    }
    // One session, torn down afterwards.
    expect(agents).toHaveLength(1);
    expect(agents[0].destroyed).toBe(true);

    expect(result.term).toBe(TERM);
    expect(result.crn).toBe("19010");
    expect(result.description?.split("\n")[0]).toBe("Principles of Computer Science I.");
    expect(result.description).toContain("Co-requisite: CSC 1301L.");
    expect(result.description).not.toMatch(/<|-->/);
    expect(result.corequisites).toEqual([
      {
        subject: "CSC",
        subjectDescription: "COMPUTER SCIENCE",
        courseNumber: "1301L",
        title: "PRINCIPLES COMPUTER SCI LAB I",
      },
    ]);
    expect(result.prerequisites?.rule).toBe("Prereq");
    expect(result.prerequisites?.tree).toEqual({
      type: "or",
      children: [
        { type: "course", subject: "MATH", subjectDescription: "MATHEMATICS", courseNumber: "1111", courseNumberTo: "1113", minimumGrade: "C", concurrent: true },
        { type: "course", subject: "MATH", subjectDescription: "MATHEMATICS", courseNumber: "2201", courseNumberTo: "2215", minimumGrade: "C", concurrent: true },
        {
          type: "and",
          children: [
            { type: "course", subject: "MATH", subjectDescription: "MATHEMATICS", courseNumber: "0999", minimumGrade: "C", concurrent: true },
            { type: "course", subject: "MATH", subjectDescription: "MATHEMATICS", courseNumber: "1111", minimumGrade: "C", concurrent: true },
          ],
        },
      ],
    });
    expect(result.restrictions).toEqual({
      mustBe: [
        {
          kind: "major",
          label: "Fields of Study (Major, Minor or Concentration)",
          values: [
            "Computer Science (CSC)",
            "Computer Science (CSCI)",
            "Data Science (DSCI)",
            "Data Sci & Geographic Info Sci (DSG)", // entity decoded
            "Engineering (ENGR)",
            "Information Technology (ITC)",
            "Mathematics (MATH)",
            "Mathematics (MTH)",
            "Pre-Computer Science (PCSC)",
            "Pre-Data Science (PDSC)",
            "Physics (PHY)",
          ],
        },
      ],
      mustNotBe: [
        { kind: "level", label: "Levels", values: ["Undergrad Associate Semester (UA)"] },
        { kind: "other", label: "Cohorts", values: ["P:Online Only-No Immunizations (OL)"] },
      ],
      specialApprovals: [],
      other: [],
    });
    expect(result.unparsed).toBeUndefined();
  });

  it("parses nested AND/OR prerequisites with minimum grades and concurrency (CSC 2720)", async () => {
    gs.setRequirements(TERM, "19633", { prerequisites: fixture("prerequisites-csc2720.html") });

    const { prerequisites } = await getSectionRequirements(TERM, "19633", options);

    const course = (subject: string, subjectDescription: string, courseNumber: string, extra: object = {}) => ({
      type: "course",
      subject,
      subjectDescription,
      courseNumber,
      minimumGrade: "C",
      concurrent: false,
      ...extra,
    });
    // Banner leaves the top level unparenthesized; it reads as an AND of three OR-groups.
    expect(prerequisites?.tree).toEqual({
      type: "and",
      children: [
        {
          type: "or",
          children: [
            course("CSC", "COMPUTER SCIENCE", "1302"),
            course("DSCI", "DATA SCIENCE", "1302"),
            { type: "and", children: [course("CSC", "COMPUTER SCIENCE", "1302"), course("CSC", "COMPUTER SCIENCE", "1302L")] },
            course("CSC", "COMPUTER SCIENCE", "1302K"),
          ],
        },
        {
          type: "or",
          children: [
            course("MATH", "MATHEMATICS", "2211", { courseNumberTo: "2212", concurrent: true }),
            course("MATH", "MATHEMATICS", "2211", { courseNumberTo: "2212", minimumGrade: "K" }),
            course("MATH", "MATHEMATICS", "2201", { courseNumberTo: "2202", concurrent: true }),
          ],
        },
        {
          type: "or",
          children: [
            course("CSC", "COMPUTER SCIENCE", "2510"),
            course("MATH", "MATHEMATICS", "2420"),
            course("MATH", "MATHEMATICS", "2420"), // Banner lists "2420." separately
          ],
        },
      ],
    });
    // Flat list: every course once, in order.
    expect(prerequisites?.items.map((i) => `${i.subject} ${i.courseNumber}${i.courseNumberTo ? `-${i.courseNumberTo}` : ""} ${i.minimumGrade}`)).toEqual([
      "CSC 1302 C",
      "DSCI 1302 C",
      "CSC 1302L C",
      "CSC 1302K C",
      "MATH 2211-2212 C",
      "MATH 2211-2212 K",
      "MATH 2201-2202 C",
      "CSC 2510 C",
      "MATH 2420 C",
    ]);
    expect(prerequisites?.text).toMatch(/^\(Course or Test: COMPUTER SCIENCE 1302 Minimum Grade of C May not be taken concurrently\.\) or /);
    expect(prerequisites?.text).toContain(") and (Course or Test: MATHEMATICS 2211 to 2212");
  });

  it("returns empty requirements for a section with none", async () => {
    const result = await getSectionRequirements(TERM, "21829", options);
    expect(result).toEqual({
      term: TERM,
      crn: "21829",
      description: null,
      prerequisites: null,
      corequisites: [],
      restrictions: { mustBe: [], mustNotBe: [], specialApprovals: [], other: [] },
    });
  });

  it("reads honors and graduate restrictions, and attribute-only prerequisites", async () => {
    gs.setRequirements(TERM, "16290", {
      prerequisites: fixture("prerequisites-csc4870-honors.html"),
      restrictions: fixture("restrictions-csc4870-honors.html"),
    });
    gs.setRequirements(TERM, "14643", { restrictions: fixture("restrictions-csc8850-graduate.html") });

    const honors = await getSectionRequirements(TERM, "16290", options);
    expect(honors.restrictions).toEqual({
      mustBe: [],
      mustNotBe: [
        { kind: "level", label: "Levels", values: ["Undergrad Associate Semester (UA)"] },
        { kind: "other", label: "Cohorts", values: ["P:Online Only-No Immunizations (OL)"] },
      ],
      specialApprovals: ["Honors College Restricts"],
      other: [],
    });
    expect(honors.prerequisites).toEqual({
      text:
        "(Student Attributes: P:Meets CSC Area F May not be taken concurrently.) or " +
        "(Student Attributes: Exception to CSC Area F May not be taken concurrently.)",
      rule: "Csc GPA Restriction",
      tree: {
        type: "or",
        children: [
          { type: "other", text: "Student Attributes: P:Meets CSC Area F" },
          { type: "other", text: "Student Attributes: Exception to CSC Area F" },
        ],
      },
      items: [],
    });

    const graduate = await getSectionRequirements(TERM, "14643", options);
    expect(graduate.restrictions.mustBe).toEqual([{ kind: "level", label: "Levels", values: ["Graduate Semester (GS)"] }]);
    expect(graduate.restrictions.mustNotBe).toEqual([
      { kind: "other", label: "Cohorts", values: ["P:Online Only-No Immunizations (OL)"] },
    ]);
  });

  it("keeps the subject description when the subject list does not know it", async () => {
    gs.setSubjects(TERM, []);
    gs.setRequirements(TERM, "19010", { corequisites: fixture("corequisites-csc1301.html") });
    const { corequisites } = await getSectionRequirements(TERM, "19010", options);
    expect(corequisites).toEqual([
      { subject: null, subjectDescription: "COMPUTER SCIENCE", courseNumber: "1301L", title: "PRINCIPLES COMPUTER SCI LAB I" },
    ]);
  });

  it("keeps unrecognized markup as plain text instead of dropping it", async () => {
    gs.setRequirements(TERM, "19010", {
      prerequisites: '<section aria-labelledby="preReqs"><h3>Catalog Prerequisites</h3><p>Consent of the  instructor &amp; department.</p></section>',
      corequisites: '<section aria-labelledby="coReqs"><h3>Corequisites</h3><p>Take with the lab the department assigns.</p></section>',
      restrictions: '<section aria-labelledby="restrictions"><p>Seats reserved for freshmen.</p></section>',
    });
    const result = await getSectionRequirements(TERM, "19010", options);
    expect(result.prerequisites).toEqual({ text: "Consent of the instructor & department.", rule: null, tree: null, items: [] });
    expect(result.corequisites).toEqual([]);
    expect(result.unparsed).toEqual({
      corequisites: "Take with the lab the department assigns.",
      restrictions: "Seats reserved for freshmen.",
    });
  });
});

describe("getSectionRequirements: upstream failures", () => {
  it("turns data:null (lost F5 affinity) into GoSolarAffinityError", async () => {
    gs.failNextRequirements({ kind: "affinity" });
    const error = await getSectionRequirements(TERM, "19010", options).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GoSolarAffinityError);
    expect(error).toBeInstanceOf(GoSolarError);
    expect((error as Error).message).toContain(AFFINITY_COOKIE);
    expect(agents[0].destroyed).toBe(true);
  });

  it("rejects an HTML error page served with 200 instead of the fragment", async () => {
    gs.failNextRequirements({
      kind: "html",
      body: "<!DOCTYPE html><html><head><title>Service Unavailable</title></head><body>Maintenance</body></html>",
    });
    await expect(getSectionRequirements(TERM, "19010", options)).rejects.toMatchObject({
      name: "GoSolarError",
      status: 200,
      message: expect.stringContaining("unexpected page"),
    });
  });

  it("maps a non-2xx answer to GoSolarError with the status", async () => {
    gs.failNextRequirements({ kind: "http", status: 503 });
    await expect(getSectionRequirements(TERM, "19010", options)).rejects.toMatchObject({
      name: "GoSolarError",
      status: 503,
      url: expect.stringContaining("/searchResults/"),
    });
  });

  it("times out per call and reports it as GoSolarError", async () => {
    gs.failNextRequirements({ kind: "hang" });
    const started = Date.now();
    const error = await getSectionRequirements(TERM, "19010", { ...options, timeoutMs: 300 }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GoSolarError);
    expect((error as GoSolarError).status).toBeNull();
    expect(((error as GoSolarError).cause as Error).name).toBe("TimeoutError");
    expect(Date.now() - started).toBeLessThan(5_000);
    expect(agents[0].destroyed).toBe(true);
  });
});

describe("parsePrerequisites: classic Banner table", () => {
  it("reads And/Or, parentheses, tests and grades from the basePreqTable layout", () => {
    const resolve = subjectResolver(SUBJECTS);
    expect(parsePrerequisites(fixture("prerequisites-base-table.synthetic.html"), resolve)).toEqual({
      text:
        "(Course: Mathematics 1113 Level Undergraduate Semester Minimum Grade of C or " +
        "Test: SAT Mathematics Minimum Score of 530) and " +
        "Course: Computer Science 1301 Level Undergraduate Semester Minimum Grade of C-",
      rule: null,
      tree: {
        type: "and",
        children: [
          {
            type: "or",
            children: [
              { type: "course", subject: "MATH", subjectDescription: "Mathematics", courseNumber: "1113", minimumGrade: "C", level: "Undergraduate Semester" },
              { type: "test", test: "SAT Mathematics", minimumScore: "530" },
            ],
          },
          { type: "course", subject: "CSC", subjectDescription: "Computer Science", courseNumber: "1301", minimumGrade: "C-", level: "Undergraduate Semester" },
        ],
      },
      items: [
        { subject: "MATH", subjectDescription: "Mathematics", courseNumber: "1113", minimumGrade: "C", level: "Undergraduate Semester" },
        { subject: "CSC", subjectDescription: "Computer Science", courseNumber: "1301", minimumGrade: "C-", level: "Undergraduate Semester" },
      ],
    });
  });
});
