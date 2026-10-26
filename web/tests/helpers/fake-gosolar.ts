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
 *
 *   const gs = await startFakeGoSolar();
 *   gs.setSections("202608", "CSC", "1301", [makeSection({ courseReferenceNumber: "80001" })]);
 *   await searchCourses({ term: "202608", subject: "CSC", courseNumber: "1301" }, { baseUrl: gs.url });
 *   await gs.close();
 */
import { randomBytes } from "node:crypto";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { AddressInfo } from "node:net";
import type { CourseData, Faculty, MeetingTime, Subject, Term } from "@/lib/gosolar";

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
}

/** How the next search(es) should fail, to test error handling. */
export type SearchFailure = { kind: "http"; status: number } | { kind: "affinity" };

export interface FakeGoSolar {
  /** Base URL to pass as `GoSolarOptions.baseUrl` (ends in /StudentRegistrationSsb/ssb). */
  readonly url: string;
  /** Every request received, in order. */
  readonly requests: FakeGoSolarRequest[];
  /**
   * Sections returned for (term, subject, courseNumber). A search with a blank course number
   * returns every configured section of that subject in the term.
   */
  setSections(term: string, subject: string, courseNumber: string, sections: CourseData[]): void;
  setTerms(terms: Term[]): void;
  setSubjects(term: string, subjects: Subject[]): void;
  /** The next `count` searches fail as described, then behaviour returns to normal. */
  failNextSearches(failure: SearchFailure, count?: number): void;
  /** Clears configuration, failures and the request log. */
  reset(): void;
  close(): Promise<void>;
}

const sectionKey = (term: string, subject: string, courseNumber: string) =>
  `${term}|${subject.toUpperCase()}|${courseNumber.toUpperCase()}`;

export async function startFakeGoSolar(): Promise<FakeGoSolar> {
  const sections = new Map<string, CourseData[]>();
  const subjects = new Map<string, Subject[]>();
  let terms: Term[] = [];
  let failures: SearchFailure[] = [];
  /** JSESSIONID -> { term, affinity cookie value } */
  const sessions = new Map<string, { term: string; affinity: string }>();
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
      sessions.set(sessionId, { term, affinity });
      send(200, { fwdURL: "/StudentRegistrationSsb/ssb/classSearch/classSearch" }, {
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
      const failure = failures.shift();
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
      const matches = courseNumber
        ? (sections.get(sectionKey(term, subject, courseNumber)) ?? [])
        : [...sections.entries()]
            .filter(([key]) => key.startsWith(`${term}|${subject}|`))
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
    setSections(term, subject, courseNumber, list) {
      sections.set(sectionKey(term, subject, courseNumber), list);
    },
    setTerms(list) {
      terms = list;
    },
    setSubjects(term, list) {
      subjects.set(term, list);
    },
    failNextSearches(failure, count = 1) {
      for (let i = 0; i < count; i++) failures.push(failure);
    },
    reset() {
      sections.clear();
      subjects.clear();
      terms = [];
      failures = [];
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
 * stay consistent unless you override them individually.
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
    creditHours: 4,
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
