/**
 * Standalone fake GoSolar + fake Resend for the e2e rig, started by Playwright's `webServer`
 * (`npx tsx e2e/fake-gosolar-server.ts`). It reuses the integration tests' fake
 * (tests/helpers/fake-gosolar.ts, F5 affinity behaviour included), which listens on a random
 * port, behind a front server on the fixed GOSOLAR_PORT:
 *
 *   /StudentRegistrationSsb/...   proxied to the fake GoSolar (cookies pass through)
 *   POST /resend/emails           fake Resend "send email": records it, answers { id }
 *   GET  /__control/health        readiness probe
 *   POST /__control/reset         restore the seed data below; clear recorded emails/requests
 *   POST /__control/sections      { term, subject, courseNumber, crn, seatsAvailable?, waitCount? }
 *                                 change one seeded section's seats (e.g. close it)
 *   GET  /__control/emails        emails "sent" through the fake Resend
 *   GET  /__control/requests      GoSolar requests received (method, path, query, status)
 *   POST /__control/fail-searches { kind: "affinity" | "http", status?, count? }
 *                                 the next `count` (default 1) section searches fail: "affinity"
 *                                 answers success:true/data:null (F5 affinity lost), "http" the status
 *
 * Seed (term 202701, Spring 2027), with fixed meeting times so schedule specs can assert the grid:
 *   CSC 1301  CRN 80001 open (3 seats)  Mon/Wed 9:00-9:50 AM
 *             CRN 80002 closed          Mon/Wed 11:00 AM-12:15 PM
 *   CSC 1302  CRN 80003 open (3 seats)  Mon/Wed 9:30-10:20 AM (overlaps 80001)
 *   MATH 2211 CRN 80010 open (3 seats)  Tue/Thu 10:00-10:50 AM
 * Terms 202701 and 202608 (view only).
 */
import { createServer, request as httpRequest, type IncomingMessage, type ServerResponse } from "node:http";
import type { CourseData } from "@/lib/gosolar";
import {
  makeClosedSection,
  makeSection,
  makeTerm,
  startFakeGoSolar,
  type SearchFailure,
} from "../tests/helpers/fake-gosolar";
import { GOSOLAR_PORT } from "./env";

const SEED_TERM = "202701";

type SectionKey = `${string}|${string}|${string}`;
const keyOf = (term: string, subject: string, courseNumber: string): SectionKey =>
  `${term}|${subject.toUpperCase()}|${courseNumber.toUpperCase()}`;

type Day = "monday" | "tuesday" | "wednesday" | "thursday" | "friday";
const DAYS: Day[] = ["monday", "tuesday", "wednesday", "thursday", "friday"];

function seedSections(): Map<SectionKey, CourseData[]> {
  const spring = { term: SEED_TERM, termDesc: "Spring Semester 2027" };
  /**
   * makeSection's meeting is Fall 2026, MW 11:00-12:15; move it into Spring 2027 and, when
   * given, onto `days` from `begin` to `end` ("0900").
   */
  const withDates = (section: CourseData, days?: Day[], begin?: string, end?: string): CourseData => ({
    ...section,
    meetingsFaculty: (section.meetingsFaculty ?? []).map((mf) => ({
      ...mf,
      meetingTime: mf.meetingTime && {
        ...mf.meetingTime,
        startDate: "01/11/2027",
        endDate: "05/03/2027",
        ...(days ? Object.fromEntries(DAYS.map((day) => [day, days.includes(day)])) : {}),
        ...(begin && end ? { beginTime: begin, endTime: end } : {}),
      },
    })),
  });
  return new Map<SectionKey, CourseData[]>([
    [
      keyOf(SEED_TERM, "CSC", "1301"),
      [
        withDates(
          makeSection({ ...spring, courseReferenceNumber: "80001", sequenceNumber: "001" }),
          ["monday", "wednesday"],
          "0900",
          "0950",
        ),
        withDates(makeClosedSection({ ...spring, courseReferenceNumber: "80002", sequenceNumber: "002" })),
      ],
    ],
    [
      keyOf(SEED_TERM, "CSC", "1302"),
      [
        withDates(
          makeSection({
            ...spring,
            courseReferenceNumber: "80003",
            courseNumber: "1302",
            courseTitle: "Principles of Computer Science II",
            subjectCourse: "CSC1302",
          }),
          ["monday", "wednesday"],
          "0930",
          "1020",
        ),
      ],
    ],
    [
      keyOf(SEED_TERM, "MATH", "2211"),
      [
        withDates(
          makeSection({
            ...spring,
            courseReferenceNumber: "80010",
            subject: "MATH",
            courseNumber: "2211",
            subjectDescription: "Mathematics",
            courseTitle: "Calculus of One Variable I",
            subjectCourse: "MATH2211",
          }),
          ["tuesday", "thursday"],
          "1000",
          "1050",
        ),
      ],
    ],
  ]);
}

interface RecordedEmail {
  id: string;
  body: unknown;
  receivedAt: string;
}

async function main(): Promise<void> {
  const gs = await startFakeGoSolar();
  const upstream = new URL(gs.url);
  let sections = seedSections();
  let emails: RecordedEmail[] = [];
  let emailSeq = 0;

  const apply = () => {
    gs.reset();
    gs.setTerms([makeTerm(SEED_TERM, "Spring Semester 2027"), makeTerm("202608", "Fall Semester 2026 (View only)")]);
    gs.setSubjects(SEED_TERM, [
      { code: "CSC", description: "Computer Science" },
      { code: "MATH", description: "Mathematics" },
    ]);
    for (const [key, list] of sections) {
      const [term, subject, courseNumber] = key.split("|");
      gs.setSections(term, subject, courseNumber, list);
    }
  };
  const reset = () => {
    sections = seedSections();
    emails = [];
    apply();
  };
  reset();

  const sendJson = (res: ServerResponse, status: number, payload: unknown) => {
    res.statusCode = status;
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(payload));
  };

  const readBody = (req: IncomingMessage) =>
    new Promise<Buffer>((resolve, reject) => {
      const chunks: Buffer[] = [];
      req.on("data", (chunk: Buffer) => chunks.push(chunk));
      req.on("end", () => resolve(Buffer.concat(chunks)));
      req.on("error", reject);
    });

  const proxy = (req: IncomingMessage, res: ServerResponse, body: Buffer) => {
    const headers = { ...req.headers, host: upstream.host };
    const forward = httpRequest(
      { host: upstream.hostname, port: upstream.port, method: req.method, path: req.url, headers },
      (upstreamRes) => {
        res.writeHead(upstreamRes.statusCode ?? 502, upstreamRes.headers);
        upstreamRes.pipe(res);
      },
    );
    forward.on("error", (error) => sendJson(res, 502, { error: String(error) }));
    forward.end(body);
  };

  const server = createServer(async (req, res) => {
    try {
      const url = new URL(req.url ?? "/", "http://fake");
      const body = await readBody(req);
      const route = `${req.method} ${url.pathname}`;

      if (url.pathname.startsWith("/StudentRegistrationSsb/")) return proxy(req, res, body);

      switch (route) {
        case "GET /__control/health":
          return sendJson(res, 200, { ok: true, upstream: gs.url });
        case "POST /__control/reset":
          reset();
          return sendJson(res, 200, { ok: true });
        case "GET /__control/emails":
          return sendJson(res, 200, { emails });
        case "GET /__control/requests":
          return sendJson(res, 200, {
            requests: gs.requests.map(({ method, path, query, status }) => ({ method, path, query, status })),
          });
        case "POST /__control/sections": {
          const input = JSON.parse(body.toString("utf8") || "{}") as {
            term: string;
            subject: string;
            courseNumber: string;
            crn: string;
            seatsAvailable?: number;
            waitCount?: number;
          };
          const list = sections.get(keyOf(input.term, input.subject, input.courseNumber));
          const index = list?.findIndex((s) => s.courseReferenceNumber === input.crn) ?? -1;
          if (!list || index < 0) return sendJson(res, 404, { error: "no such seeded section" });
          const current = list[index];
          const seatsAvailable = input.seatsAvailable ?? current.seatsAvailable;
          const waitCount = input.waitCount ?? current.waitCount;
          list[index] = {
            ...current,
            seatsAvailable,
            enrollment: current.maximumEnrollment - seatsAvailable,
            waitCount,
            waitAvailable: current.waitCapacity - waitCount,
          };
          apply();
          return sendJson(res, 200, { section: list[index] });
        }
        case "POST /__control/fail-searches": {
          const input = JSON.parse(body.toString("utf8") || "{}") as { kind?: string; status?: number; count?: number };
          const failure: SearchFailure | null =
            input.kind === "affinity"
              ? { kind: "affinity" }
              : input.kind === "http"
                ? { kind: "http", status: input.status ?? 500 }
                : null;
          if (!failure) return sendJson(res, 400, { error: 'kind must be "affinity" or "http"' });
          gs.failNextSearches(failure, input.count ?? 1);
          return sendJson(res, 200, { ok: true });
        }
        case "POST /resend/emails": {
          const id = `e2e-email-${++emailSeq}`;
          emails.push({ id, body: JSON.parse(body.toString("utf8") || "null"), receivedAt: new Date().toISOString() });
          return sendJson(res, 200, { id });
        }
        default:
          return sendJson(res, 404, { error: `fake has no route ${route}` });
      }
    } catch (error) {
      sendJson(res, 500, { error: String(error) });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(GOSOLAR_PORT, "127.0.0.1", resolve);
  });
  console.log(`fake GoSolar listening on http://127.0.0.1:${GOSOLAR_PORT} (upstream ${gs.url})`);

  const shutdown = () => {
    server.closeAllConnections();
    server.close();
    void gs.close().finally(() => process.exit(0));
  };
  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
