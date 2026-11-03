/**
 * A real local HTTP server that imitates GoSolar (Banner SSB) closely enough for the real
 * client in src/lib/gosolar, including the F5 session-affinity behaviour:
 *
 * - `POST /term/search` (form `term=`) issues `JSESSIONID` and `BIGipServer...` cookies and
 *   remembers which term that session declared.
 * - `GET /searchResults/searchResults` requires BOTH cookies from one declaration. Without
 *   them it answers `{success:true, data:null}`, exactly like a search that landed on a node
 *   that never saw the declaration.
 * - `GET /classSearch/getTerms` and `GET /classSearch/get_subject` serve configured lists.
 * - `POST /searchResults/getSectionPrerequisites`, `getCorequisites`, `getRestrictions` and
 *   `getCourseDescription` (form `term=&courseReferenceNumber=`) serve the HTML fragments set
 *   with `setRequirements`, or Banner's "No ... information available." ones. Like the search,
 *   they need both cookies of a declaration of that term; without them they answer
 *   `{success:true, data:null}` (an assumption: live GoSolar was not probed without a session).
 * - The course catalog ("Browse Course Catalog"): `GET /courseSearch/get_subject` lists the
 *   subjects of the catalog set with `setCatalog`, and `GET /courseSearchResults/
 *   courseSearchResults` (comma-separated `txt_subject`) pages through their courses, sorted by
 *   subject description then course number. It needs both cookies of a `POST /term/search?
 *   mode=courseSearch` declaration of that term, and, like live Banner (2026-11-02), a session
 *   keeps its FIRST catalog search: a later call with other subjects gets the first search's
 *   courses again (only `pageOffset`/`pageMaxSize` take effect).
 *
 *   const gs = await startFakeGoSolar();
 *   gs.setSections("202608", "CSC", "1301", [makeSection({ courseReferenceNumber: "80001" })]);
 *   await searchCourses({ term: "202608", subject: "CSC", courseNumber: "1301" }, { baseUrl: gs.url });
 *   await gs.close();
 */
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { CatalogCourseData, CourseData, Faculty, MeetingTime, Subject, Term } from "@/lib/gosolar";

export const SSB_PATH = "/StudentRegistrationSsb/ssb";
export const SESSION_COOKIE = "JSESSIONID";
export const AFFINITY_COOKIE = "BIGipServerregistration.gosolar.gsu.edu";

export interface FakeGoSolarRequest {
  method: string;
  /** Path below the SSB root, e.g. "/term/search". */
  path: string;
  query: Record<string, string>;
  cookies: Record<string, string>;
  /** Raw request body (form-encoded for the term declaration). */
  body: string;
  status: number;
  /** Client socket port: equal ports mean one TCP connection. */
  remotePort: number | undefined;
}

/** How the next search(es) should fail, to test error handling. */
export type SearchFailure = { kind: "http"; status: number } | { kind: "affinity" };

/** How the next requirement-fragment request(s) should fail. `hang` never answers. */
export type RequirementFailure =
  | SearchFailure
  | { kind: "html"; status?: number; body: string }
  | { kind: "hang" };

/** HTML fragments of the four per-section requirement endpoints, as GoSolar sends them. */
export interface RequirementFragments {
  prerequisites?: string;
  corequisites?: string;
  restrictions?: string;
  description?: string;
}

export interface FakeGoSolar {
  /** Base URL to pass as `GoSolarOptions.baseUrl` (ends in /StudentRegistrationSsb/ssb). */
  readonly url: string;
  /** Every request received, in order. */
  readonly requests: FakeGoSolarRequest[];
  /**
   * Sections returned for (term, subject, courseNumber). A search with a blank course number
   * returns every configured section of that subject in the term. With `level` (GoSolar
   * `txt_level`, e.g. "UA") they exist only at that level: a search with another `txt_level`
   * skips them, one without `txt_level` (every level, like GoSolar) includes them. Without
   * `level` they match every search, whatever its level.
   */
  setSections(term: string, subject: string, courseNumber: string, sections: CourseData[], level?: string): void;
  setTerms(terms: Term[]): void;
  setSubjects(term: string, subjects: Subject[]): void;
  /**
   * The next `count` searches fail as described, then behaviour returns to normal. With `level`,
   * only searches with that `txt_level` fail (other searches pass and don't use one up).
   */
  failNextSearches(failure: SearchFailure, count?: number, level?: string): void;
  /**
   * Requirement fragments for (term, crn). Missing ones are Banner's "none" fragments, as are
   * all four for an unconfigured section.
   */
  setRequirements(term: string, crn: string, fragments: RequirementFragments): void;
  /** The next `count` requirement-fragment requests fail as described. */
  failNextRequirements(failure: RequirementFailure, count?: number): void;
  /** The course catalog of `term` (raw Banner records, see tests/helpers/catalog-fixture.ts). */
  setCatalog(term: string, courses: CatalogCourseData[]): void;
  /** The next `count` catalog searches fail as described. */
  failNextCatalogSearches(failure: SearchFailure, count?: number): void;
  /** Clears configuration, failures and the request log. */
  reset(): void;
  close(): Promise<void>;
}

const sectionKey = (term: string, subject: string, courseNumber: string) =>
  `${term}|${subject.toUpperCase()}|${courseNumber.toUpperCase()}`;

/** Storage key of sections set for one level: the section key plus `#LEVEL`. */
const LEVEL_MARK = "#";

/**
 * Banner's fragments for a section without that kind of requirement. Prerequisites and
 * corequisites are live (2026-11); every probed section had restrictions and a description, so
 * those two follow Banner's template wording and are not verified.
 */
export const EMPTY_REQUIREMENT_FRAGMENTS: Required<RequirementFragments> = {
  prerequisites:
    `<section aria-labelledby="preReqs">
    <h3>Catalog Prerequisites</h3>
        No prerequisite information available.
</section>`,
  corequisites:
    `<section aria-labelledby="coReqs">
    <h3>Corequisites</h3>
        No corequisite course information available.
</section>`,
  restrictions:
    `<section aria-labelledby="restrictions">

    <div class="infoicon"><span class="status-bold">Not all restrictions are applicable.</span></div> <br/>
</section>`,
  description:
    `<section aria-labelledby="courseDescription">
    <!--when there is no course or section description, provide the no information message-->
    No course description information available.
</section>`,
};

const REQUIREMENT_PATHS: Record<string, keyof RequirementFragments> = {
  "/searchResults/getSectionPrerequisites": "prerequisites",
  "/searchResults/getCorequisites": "corequisites",
  "/searchResults/getRestrictions": "restrictions",
  "/searchResults/getCourseDescription": "description",
};

export async function startFakeGoSolar(): Promise<FakeGoSolar> {
  const sections = new Map<string, CourseData[]>();
  const subjects = new Map<string, Subject[]>();
  let terms: Term[] = [];
  let failures: Array<{ failure: SearchFailure; level?: string }> = [];
  const requirements = new Map<string, RequirementFragments>();
  let requirementFailures: RequirementFailure[] = [];
  const catalogs = new Map<string, CatalogCourseData[]>();
  let catalogFailures: SearchFailure[] = [];
  /** JSESSIONID -> { term, affinity cookie value, declaration mode, first catalog search } */
  const sessions = new Map<string, { term: string; affinity: string; mode: string; catalogSubjects?: string }>();
  const requests: FakeGoSolarRequest[] = [];

  function handle(req: IncomingMessage, res: ServerResponse, body: string): void {
    const url = new URL(req.url ?? "/", "http://fake.gosolar");
    const path = url.pathname.startsWith(SSB_PATH)
      ? url.pathname.slice(SSB_PATH.length)
      : url.pathname;
    const query = Object.fromEntries(url.searchParams);
    const cookies = parseCookies(req.headers.cookie);
    const entry: FakeGoSolarRequest = {
      method: req.method ?? "GET",
      path,
      query,
      cookies,
      body,
      status: 200,
      remotePort: req.socket.remotePort,
    };
    requests.push(entry);

    const send = (status: number, payload: unknown, headers: Record<string, string[]> = {}) => {
      entry.status = status;
      res.statusCode = status;
      res.setHeader("Content-Type", "application/json;charset=UTF-8");
      for (const [name, values] of Object.entries(headers)) res.setHeader(name, values);
      res.end(JSON.stringify(payload));
    };

    if (req.method === "POST" && path === "/term/search") {
      const term = new URLSearchParams(body).get("term") ?? "";
      const sessionId = randomBytes(16).toString("hex").toUpperCase();
      const affinity = `${randomBytes(4).readUInt32BE()}.20480.0000`;
      const mode = query.mode ?? "";
      sessions.set(sessionId, { term, affinity, mode });
      const forward = mode === "courseSearch" ? "courseSearch/courseSearch" : "classSearch/classSearch";
      send(200, { fwdURL: `/StudentRegistrationSsb/ssb/${forward}` }, {
        "Set-Cookie": [
          `${SESSION_COOKIE}=${sessionId}; Path=/StudentRegistrationSsb; HttpOnly`,
          `${AFFINITY_COOKIE}=${affinity}; path=/; Httponly`,
        ],
      });
      return;
    }

    if (req.method === "GET" && path === "/searchResults/searchResults") {
      const pageOffset = Number(query.pageOffset ?? 0);
      const pageMaxSize = Number(query.pageMaxSize ?? 10);
      const failureAt = failures.findIndex((f) => f.level === undefined || f.level === (query.txt_level ?? "").trim());
      const failure = failureAt >= 0 ? failures.splice(failureAt, 1)[0].failure : undefined;
      if (failure?.kind === "http") {
        send(failure.status, { success: false });
        return;
      }

      const session = sessions.get(cookies[SESSION_COOKIE] ?? "");
      const affinityOk =
        failure?.kind !== "affinity" &&
        session !== undefined &&
        cookies[AFFINITY_COOKIE] === session.affinity &&
        session.term === query.txt_term;
      if (!affinityOk) {
        send(200, { success: true, totalCount: 0, data: null, pageOffset, pageMaxSize });
        return;
      }

      const term = query.txt_term ?? "";
      const subject = (query.txt_subject ?? "").toUpperCase();
      const courseNumber = (query.txt_courseNumber ?? "").trim();
      const level = (query.txt_level ?? "").trim();
      const matches = [...sections.entries()]
        .filter(([key]) => {
          const [base, keyLevel] = key.split(LEVEL_MARK);
          const course = courseNumber
            ? base === sectionKey(term, subject, courseNumber)
            : base.startsWith(`${term}|${subject}|`);
          return course && (!keyLevel || !level || keyLevel === level);
        })
        .flatMap(([, list]) => list);
      send(200, {
        success: true,
        totalCount: matches.length,
        data: matches.slice(pageOffset, pageOffset + pageMaxSize),
        pageOffset,
        pageMaxSize,
        sectionsFetchedCount: matches.length,
        pathMode: "search",
      });
      return;
    }

    const fragmentKind = REQUIREMENT_PATHS[path];
    if (req.method === "POST" && fragmentKind) {
      const form = new URLSearchParams(body);
      const term = form.get("term") ?? "";
      const crn = form.get("courseReferenceNumber") ?? "";
      const failure = requirementFailures.shift();
      if (failure?.kind === "hang") return; // never answered; close() destroys the socket
      if (failure?.kind === "http") {
        send(failure.status, { success: false });
        return;
      }
      if (failure?.kind === "html") {
        entry.status = failure.status ?? 200;
        res.statusCode = entry.status;
        res.setHeader("Content-Type", "text/html;charset=UTF-8");
        res.end(failure.body);
        return;
      }
      const session = sessions.get(cookies[SESSION_COOKIE] ?? "");
      const affinityOk =
        failure?.kind !== "affinity" &&
        session !== undefined &&
        cookies[AFFINITY_COOKIE] === session.affinity &&
        session.term === term;
      if (!affinityOk) {
        send(200, { success: true, data: null });
        return;
      }
      const html =
        requirements.get(`${term}|${crn}`)?.[fragmentKind] ?? EMPTY_REQUIREMENT_FRAGMENTS[fragmentKind];
      res.statusCode = 200;
      res.setHeader("Content-Type", "text/html;charset=UTF-8");
      res.end(html);
      return;
    }

    if (req.method === "GET" && path === "/courseSearchResults/courseSearchResults") {
      const pageOffset = Number(query.pageOffset ?? 0);
      const pageMaxSize = Number(query.pageMaxSize ?? 10);
      const failure = catalogFailures.shift();
      if (failure?.kind === "http") {
        send(failure.status, { success: false });
        return;
      }
      const session = sessions.get(cookies[SESSION_COOKIE] ?? "");
      const affinityOk =
        failure?.kind !== "affinity" &&
        session !== undefined &&
        session.mode === "courseSearch" &&
        cookies[AFFINITY_COOKIE] === session.affinity &&
        session.term === query.txt_term;
      if (!affinityOk) {
        send(200, { success: true, totalCount: 0, data: null, pageOffset, pageMaxSize });
        return;
      }
      // The session's first catalog search sticks (live Banner behaviour).
      session.catalogSubjects ??= (query.txt_subject ?? "").toUpperCase();
      const wanted = new Set(session.catalogSubjects.split(",").map((code) => code.trim()).filter(Boolean));
      const matches = (catalogs.get(session.term) ?? [])
        .filter((course) => wanted.has((course.subjectCode ?? course.subject ?? "").toUpperCase()))
        .sort(
          (a, b) =>
            (a.subjectDescription ?? "").localeCompare(b.subjectDescription ?? "") ||
            (a.courseNumber ?? "").localeCompare(b.courseNumber ?? ""),
        );
      send(200, {
        success: true,
        totalCount: matches.length,
        data: matches.slice(pageOffset, pageOffset + pageMaxSize),
        pageOffset,
        pageMaxSize,
        coursesFetchedCount: matches.length,
        pathMode: "courseSearch",
      });
      return;
    }

    if (req.method === "GET" && path === "/courseSearch/get_subject") {
      const needle = (query.searchTerm ?? "").toLowerCase();
      const seen = new Map<string, Subject>();
      for (const course of catalogs.get(query.term ?? "") ?? []) {
        const code = (course.subjectCode ?? course.subject ?? "").toUpperCase();
        if (!seen.has(code)) seen.set(code, { code, description: `${code} - ${course.subjectDescription ?? code}` });
      }
      const list = [...seen.values()]
        .sort((a, b) => a.description.localeCompare(b.description))
        .filter((s) => s.code.toLowerCase().includes(needle) || s.description.toLowerCase().includes(needle));
      send(200, page(list, query));
      return;
    }

    if (req.method === "GET" && path === "/classSearch/getTerms") {
      send(200, page(terms, query));
      return;
    }

    if (req.method === "GET" && path === "/classSearch/get_subject") {
      const needle = (query.searchTerm ?? "").toLowerCase();
      const list = (subjects.get(query.term ?? "") ?? []).filter(
        (s) => s.code.toLowerCase().includes(needle) || s.description.toLowerCase().includes(needle),
      );
      send(200, page(list, query));
      return;
    }

    send(404, { error: `fake GoSolar has no route ${req.method} ${path}` });
  }

  const server = createServer((req, res) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => handle(req, res, Buffer.concat(chunks).toString("utf8")));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as AddressInfo;

  return {
    url: `http://127.0.0.1:${port}${SSB_PATH}`,
    requests,
    setSections(term, subject, courseNumber, list, level) {
      sections.set(`${sectionKey(term, subject, courseNumber)}${level ? `${LEVEL_MARK}${level}` : ""}`, list);
    },
    setTerms(list) {
      terms = list;
    },
    setSubjects(term, list) {
      subjects.set(term, list);
    },
    failNextSearches(failure, count = 1, level) {
      for (let i = 0; i < count; i++) failures.push({ failure, level });
    },
    setRequirements(term, crn, fragments) {
      requirements.set(`${term}|${crn}`, fragments);
    },
    failNextRequirements(failure, count = 1) {
      for (let i = 0; i < count; i++) requirementFailures.push(failure);
    },
    setCatalog(term, courses) {
      catalogs.set(term, courses);
    },
    failNextCatalogSearches(failure, count = 1) {
      for (let i = 0; i < count; i++) catalogFailures.push(failure);
    },
    reset() {
      sections.clear();
      subjects.clear();
      terms = [];
      failures = [];
      requirements.clear();
      requirementFailures = [];
      catalogs.clear();
      catalogFailures = [];
      sessions.clear();
      requests.length = 0;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.closeAllConnections();
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
}

/** GoSolar list paging: `offset` is a 1-based page number, `max` the page size. */
function page<T>(items: T[], query: Record<string, string>): T[] {
  const offset = Math.max(1, Number(query.offset ?? 1));
  const max = Math.max(1, Number(query.max ?? 10));
  return items.slice((offset - 1) * max, offset * max);
}

function parseCookies(header: string | undefined): Record<string, string> {
  const cookies: Record<string, string> = {};
  for (const pair of (header ?? "").split(";")) {
    const index = pair.indexOf("=");
    if (index > 0) cookies[pair.slice(0, index).trim()] = pair.slice(index + 1).trim();
  }
  return cookies;
}

// ---------------------------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------------------------

let crnSeq = 80000;

/**
 * A realistic GoSolar section: CSC 1301 lecture in term 202608 with a unique CRN, 3 of 30
 * seats open and an empty waitlist (so "open" by the watcher's rule), one MW meeting and one
 * primary instructor. Faculty/meeting CRNs follow `courseReferenceNumber`, and seat counts
 * stay consistent unless you override them individually. Not cross-listed (`crossList: null`
 * and null pool counts, like live GoSolar); `creditHours` is null as on live GoSolar.
 *
 * Cross-listed: pass `crossList` (group id) and `crossListAvailable`; capacity and count
 * default to a 40-seat pool consistent with `crossListAvailable`.
 */
export function makeSection(overrides: Partial<CourseData> = {}): CourseData {
  const crn = overrides.courseReferenceNumber ?? String(++crnSeq);
  const term = overrides.term ?? "202608";
  const subject = overrides.subject ?? "CSC";
  const courseNumber = overrides.courseNumber ?? "1301";
  const maximumEnrollment = overrides.maximumEnrollment ?? 30;
  const seatsAvailable = overrides.seatsAvailable ?? 3;
  const waitCapacity = overrides.waitCapacity ?? 10;
  const waitCount = overrides.waitCount ?? 0;
  const crossList = overrides.crossList ?? null;
  const crossListAvailable = crossList ? (overrides.crossListAvailable ?? seatsAvailable) : null;
  const crossListCapacity = crossList ? (overrides.crossListCapacity ?? 40) : null;
  const crossListCount =
    crossList && crossListCapacity !== null && crossListAvailable !== null
      ? (overrides.crossListCount ?? crossListCapacity - crossListAvailable)
      : null;

  const faculty: Faculty = {
    bannerId: "900123456",
    courseReferenceNumber: crn,
    displayName: "Instructor, Test",
    emailAddress: "tinstructor@gsu.test",
    primaryIndicator: true,
  };
  const meetingTime: MeetingTime = {
    beginTime: "1100",
    endTime: "1215",
    buildingDescription: "Langdale Hall",
    campusDescription: "Atlanta Campus",
    category: "01",
    startDate: "08/24/2026",
    endDate: "12/14/2026",
    sunday: false,
    monday: true,
    tuesday: false,
    wednesday: true,
    thursday: false,
    friday: false,
    saturday: false,
    hoursWeek: 2.5,
    meetingTypeDescription: "Lecture",
    room: "0410",
  };

  return {
    term,
    termDesc: "Fall Semester 2026",
    courseReferenceNumber: crn,
    partOfTerm: "1",
    courseNumber,
    subject,
    subjectDescription: "Computer Science",
    sequenceNumber: "001",
    campusDescription: "Atlanta Campus",
    scheduleTypeDescription: "Lecture",
    courseTitle: "Principles of Computer Science I",
    creditHours: null,
    maximumEnrollment,
    enrollment: maximumEnrollment - seatsAvailable,
    seatsAvailable,
    waitCapacity,
    waitCount,
    waitAvailable: waitCapacity - waitCount,
    creditHourHigh: 4,
    creditHourLow: 4,
    linkIdentifier: null,
    isSectionLinked: false,
    subjectCourse: `${subject}${courseNumber}`,
    faculty: [faculty],
    meetingsFaculty: [{ category: "01", meetingTime }],
    crossList,
    crossListCapacity,
    crossListCount,
    crossListAvailable,
    sectionAttributes: [
      { code: "LF2F", description: "Face-to-Face", courseReferenceNumber: crn, termCode: term, isZTCAttribute: false },
    ],
    instructionalMethodDescription: "Face-to-Face",
    openSection: seatsAvailable > 0,
    reservedSeatSummary: null,
    ...overrides,
  };
}

/** `makeSection` with no seats left (still no waitlist). */
export function makeClosedSection(overrides: Partial<CourseData> = {}): CourseData {
  return makeSection({ seatsAvailable: 0, ...overrides });
}

export function makeTerm(code: string, description: string): Term {
  return { code, description };
}
