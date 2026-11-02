import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "@/components/shell/Brand";
import { SiteFooter } from "@/components/shell/SiteFooter";
import { SkipLink } from "@/components/shell/SkipLink";
import { ThemeToggle } from "@/components/theme/ThemeToggle";
import { Badge } from "@/components/ui/Badge";
import { ChevronLeftIcon } from "@/components/ui/icons";
import styles from "./page.module.css";

export const metadata: Metadata = {
  title: "Developers",
  description:
    "Connect an AI assistant to PantherWatch over MCP, or use the public JSON API for Georgia State University course data: terms, subjects, live section search, grade history and professor ratings.",
  alternates: { canonical: "/developers" },
};

const BASE = "https://www.pantherwatch.app";

/*
 * Examples are real responses from production (Spring 2027, captured 2026-11-01), trimmed with
 * "…" where arrays or objects were cut. Keep them in sync with the route handlers under
 * src/app/api/courses.
 */

const TERMS_RESPONSE = `{
  "terms": [
    { "code": "202701", "description": "Spring Semester 2027", "viewOnly": false },
    { "code": "202608", "description": "Fall Semester 2026", "viewOnly": false },
    { "code": "202605", "description": "Summer Semester 2026 (View Only)", "viewOnly": true },
    …
  ]
}`;

const SUBJECTS_RESPONSE = `{
  "subjects": [
    { "code": "APCP", "description": "APPLIED COMPOSITION" },
    { "code": "CIS", "description": "COMPUTER INFORMATION SYSTEMS" },
    { "code": "CSC", "description": "COMPUTER SCIENCE" }
  ]
}`;

const SEARCH_RESPONSE = `{
  "sections": [
    {
      "term": "202701",
      "termDesc": "Spring Semester 2027",
      "courseReferenceNumber": "19010",
      "subject": "CSC",
      "subjectDescription": "COMPUTER SCIENCE",
      "courseNumber": "1301",
      "sequenceNumber": "002",
      "courseTitle": "PRINCIPLES OF COMPUTER SCI I",
      "scheduleTypeDescription": "Lecture",
      "campusDescription": "Atlanta",
      "creditHours": null,
      "creditHourLow": 3,
      "creditHourHigh": null,
      "maximumEnrollment": 120,
      "enrollment": 22,
      "seatsAvailable": 98,
      "waitCapacity": 99,
      "waitCount": 0,
      "waitAvailable": 99,
      "openSection": true,
      "faculty": [
        {
          "displayName": "Saghaeiannejad Esfahani, Sayed Hossein (Hossein) ",
          "primaryIndicator": true,
          …
        }
      ],
      "meetingsFaculty": [
        {
          "meetingTime": {
            "beginTime": "1100",
            "endTime": "1215",
            "monday": true, "tuesday": false, "wednesday": true, "thursday": false,
            "friday": false, "saturday": false, "sunday": false,
            "buildingDescription": "Langdale Hall",
            "room": "700",
            "startDate": "01/11/2027",
            "endDate": "05/04/2027",
            "meetingTypeDescription": "Class",
            …
          },
          …
        }
      ],
      "sectionAttributes": [
        { "code": "FMTH", "description": "Area F Mathematics Electives", … },
        { "code": "LF2F", "description": "Face to Face - Instruction", … },
        …
      ],
      "instructionalMethodDescription": "*Tech enhanced classrm inst re",
      …
    },
    …
  ]
}`;

const META_RESPONSE = `{
  "grades": {
    "subject": "CSC",
    "courseNumber": "2720",
    "hasData": true,
    "termsIncluded": ["202605", "202601", "202508", "202505", …],
    "overall": { "professor": null, "gpa": 3.08, "dwfPercent": 12, "total": 2077, "sectionsCount": 99, … },
    "professors": [ … ],
    "instructorQueried": "Islam, S M Towhidul (Towhid)",
    "instructorHasTaught": true,
    "instructorDistribution": {
      "professor": "Islam, S M Towhidul",
      "gpa": 2.65,
      "dwfPercent": 16.1,
      "total": 790,
      "withdrawCount": 32,
      "sectionsCount": 36,
      "termsTaught": ["202601", "202508", "202505", "202501", "202408"],
      "gradeCounts": { "A+": 38, "A": 76, "A-": 64, "B+": 74, "B": 104, "B-": 83,
                       "C+": 60, "C": 163, "C-": 0, "D": 60, "F": 35, "WF": 0 }
    }
  },
  "rating": {
    "professorQueried": "Islam, S M Towhidul (Towhid)",
    "found": true,
    "matchedName": "S M Towhidul Islam",
    "department": "Computer Science",
    "profileUrl": "https://www.ratemyprofessors.com/professor/2921056",
    "avgRating": 3.7,
    "avgDifficulty": 2.8,
    "numRatings": 13,
    "wouldTakeAgainPercent": 76.9231,
    "distribution": { "r1": 2, "r2": 1, "r3": 2, "r4": 2, "r5": 6 },
    "topTags": [],
    …
  },
  "syllabus": { "url": "https://cdn.gsu.edu/static/syllabi-public/files/0021772031792993727494.pdf" }
}`;

const ERROR_RESPONSE = `{ "error": { "code": "invalid_request", "message": "term: term must be a 6-digit term code" } }`;

const HTML_EXAMPLE = `<div data-crn="19010" data-subject="CSC" data-course-number="1301"
     data-term="202701" data-seats-available="98" data-wait-count="0">…</div>
<ul data-crn="19010" …>
  <li data-days="MW" data-start="1100" data-end="1215">…</li>
</ul>
<span data-rmp="3.7">…</span>
<div data-gpa="2.65" data-gpa-scope="instructor">…</div>`;

const MCP_URL = `${BASE}/api/mcp`;

const MCP_TOOLS: Array<[name: string, scope: string, description: string]> = [
  ["list_terms", "read", "Terms in GoSolar, registrable ones first."],
  ["search_subjects", "read", "Subject codes matching a word (\"psych\" → PSYC)."],
  ["search_sections", "read", "Live sections of a subject or course: seats, waitlist, meetings, delivery mode."],
  ["get_section_details", "read", "Grade history, RateMyProfessors rating and syllabus for one section."],
  ["get_course_requirements", "read", "Prerequisites, corequisites, registration restrictions and catalog description of one section."],
  ["list_watches", "read", "The student's tracked sections, optionally with live seats."],
  ["list_schedule", "read", "The student's PantherWatch schedule, by term."],
  ["check_conflicts", "read", "Time clashes between CRNs, from live meeting times."],
  ["add_watch / remove_watch", "watches:write", "Start or stop a seat alert (email when a seat opens)."],
  ["add_to_schedule / remove_from_schedule", "schedule:write", "Edit the schedule; adding reports any clashes."],
];

const REQUIREMENTS_RESPONSE = `{
  "term": "202701",
  "crn": "19010",
  "description": "Principles of Computer Science I.\\nPrerequisite: Only for STEM majors and minors. …",
  "prerequisites": {
    "text": "(Course or Test: MATHEMATICS 1111 to 1113 Minimum Grade of C May be taken concurrently.) or …",
    "rule": "Prereq",
    "tree": {
      "type": "or",
      "children": [
        { "type": "course", "subject": "MATH", "subjectDescription": "MATHEMATICS", "courseNumber": "1111",
          "courseNumberTo": "1113", "minimumGrade": "C", "concurrent": true },
        …,
        { "type": "and", "children": [ … ] }
      ]
    },
    "items": [ { "subject": "MATH", "courseNumber": "1111", "courseNumberTo": "1113", "minimumGrade": "C", … }, … ]
  },
  "corequisites": [
    { "subject": "CSC", "subjectDescription": "COMPUTER SCIENCE", "courseNumber": "1301L",
      "title": "PRINCIPLES COMPUTER SCI LAB I" }
  ],
  "restrictions": {
    "mustBe": [
      { "kind": "major", "label": "Fields of Study (Major, Minor or Concentration)",
        "values": ["Computer Science (CSC)", "Data Science (DSCI)", …] }
    ],
    "mustNotBe": [
      { "kind": "level", "label": "Levels", "values": ["Undergrad Associate Semester (UA)"] },
      …
    ],
    "specialApprovals": [],
    "other": []
  }
}`;

const SECTIONS = [
  { id: "mcp", title: "Connect an AI assistant (MCP)" },
  { id: "overview", title: "Overview" },
  { id: "fair-use", title: "Fair use" },
  { id: "terms", title: "List terms" },
  { id: "subjects", title: "Find subjects" },
  { id: "search", title: "Search sections" },
  { id: "meta", title: "Grades, ratings and syllabus" },
  { id: "requirements", title: "Prerequisites and restrictions" },
  { id: "batch", title: "Batch meta (same-origin only)" },
  { id: "errors", title: "Errors" },
  { id: "caching", title: "Caching" },
  { id: "html", title: "Reading the web pages" },
  { id: "assistants", title: "AI assistants" },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className={styles.section}>
      <h2 id={id} className={styles.h2}>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Endpoint({ method, path }: { method: "GET" | "POST"; path: string }) {
  return (
    <p className={styles.endpoint}>
      <Badge tone={method === "GET" ? "success" : "warning"}>{method}</Badge>
      <code>{path}</code>
    </p>
  );
}

function Code({ label, children }: { label: string; children: string }) {
  return (
    <figure className={styles.figure}>
      <figcaption className={styles.caption}>{label}</figcaption>
      <pre className={styles.pre} tabIndex={0}>
        <code>{children}</code>
      </pre>
    </figure>
  );
}

function Params({ rows }: { rows: Array<[name: string, required: boolean, description: ReactNode]> }) {
  return (
    <div className={styles.tableWrap}>
      <table className={styles.table}>
        <thead>
          <tr>
            <th scope="col">Parameter</th>
            <th scope="col">Required</th>
            <th scope="col">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([name, required, description]) => (
            <tr key={name}>
              <td>
                <code>{name}</code>
              </td>
              <td>{required ? "Yes" : "No"}</td>
              <td>{description}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * /developers: the public read API (src/app/api/courses), as it behaves today. Static; same
 * chrome as the legal pages (slim header, one reading column, footer).
 */
export default function DevelopersPage() {
  return (
    <div className={styles.page}>
      <SkipLink />
      <header className={styles.header}>
        <div className={styles.headerInner}>
          <Brand href="/" size={28} />
          <ThemeToggle />
        </div>
      </header>

      <main id="main" tabIndex={-1} className={styles.main}>
        <Link href="/" className={styles.back}>
          <ChevronLeftIcon size={16} />
          Back
        </Link>

        <article className={styles.article}>
          <h1 className={styles.title}>Developers</h1>
          <p className={styles.lede}>
            Everything PantherWatch shows about Georgia State courses comes from a small JSON API. It&rsquo;s public: no
            key, no sign-in. If you&rsquo;re building a script or a browser extension, use it instead of scraping the
            results pages. To connect an AI assistant, use the <a href="#mcp">MCP connector</a>.
          </p>

          <nav aria-label="On this page" className={styles.toc}>
            <ul>
              {SECTIONS.map((s) => (
                <li key={s.id}>
                  <a href={`#${s.id}`}>{s.title}</a>
                </li>
              ))}
            </ul>
          </nav>

          <Section id="mcp" title="Connect an AI assistant (MCP)">
            <p>
              PantherWatch is a remote MCP server. Any MCP-capable assistant or agent can connect, for example Claude,
              ChatGPT or Cursor. Once connected, it searches classes and reads a student&rsquo;s tracked classes and
              schedule, and, if the student allows it, tracks sections and edits the schedule for them. This is the
              preferred way for an assistant to use PantherWatch.
            </p>
            <p>
              Students: the <Link href="/assistant?tab=connect">AI Assistant</Link> page has step-by-step setup for Claude, ChatGPT
              and Cursor. This page is the reference for developers.
            </p>
            <Code label="Connector URL">{MCP_URL}</Code>
            <ol>
              <li>
                In the assistant&rsquo;s settings, add a custom connector (MCP server) and paste the URL. In Claude,
                for example: <strong>Customize → Connectors → + Add → Add custom connector</strong>.
              </li>
              <li>
                Sign in to PantherWatch if asked, then select <strong>Allow</strong>. Students can untick the write
                permissions there.
              </li>
              <li>
                Manage or disconnect it anytime in <Link href="/settings#settings-connected-apps">Settings → Connected
                apps</Link>.
              </li>
            </ol>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Scope</th>
                    <th scope="col">Allows</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    ["read", "Search courses; read tracked classes and schedule. Always granted."],
                    ["watches:write", "Start and stop seat alerts. The student can leave it off."],
                    ["schedule:write", "Add and remove schedule entries. The student can leave it off."],
                  ].map(([scope, allows]) => (
                    <tr key={scope}>
                      <td>
                        <code>{scope}</code>
                      </td>
                      <td>{allows}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Tool</th>
                    <th scope="col">Scope</th>
                    <th scope="col">What it does</th>
                  </tr>
                </thead>
                <tbody>
                  {MCP_TOOLS.map(([name, scope, description]) => (
                    <tr key={name}>
                      <td>
                        <code>{name}</code>
                      </td>
                      <td>
                        <code>{scope}</code>
                      </td>
                      <td>{description}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>
              For client developers: Streamable HTTP, OAuth 2.1 per the MCP authorization spec. Discovery starts at{" "}
              <code>/.well-known/oauth-protected-resource/api/mcp</code> (also at the root location) and{" "}
              <code>/.well-known/oauth-authorization-server</code>. Clients identify themselves with a Client ID
              Metadata Document URL or register at <code>/api/oauth/register</code>; PKCE (S256) is required,
              redirect URIs must be https or localhost, access tokens last an hour and refresh tokens rotate. At the
              token endpoint, metadata-document clients authenticate with <code>none</code> or{" "}
              <code>private_key_jwt</code> (RS256, ES256 or PS256, keys from their <code>jwks_uri</code>). The
              server allows about 30 tool calls a minute per student.
            </p>
          </Section>

          <Section id="overview" title="Overview">
            <ul>
              <li>
                Base URL: <code>{BASE}</code>. All responses are JSON (<code>application/json</code>).
              </li>
              <li>
                The <code>GET</code> endpoints send <code>Access-Control-Allow-Origin: *</code>, so browser code on any
                site can call them. They answer <code>OPTIONS</code> preflights too.
              </li>
              <li>
                A typical flow: list terms, then search a subject (optionally one course number) for that term, then
                fetch grades and ratings for the sections you care about.
              </li>
              <li>
                Term codes are <code>YYYYMM</code>: <code>01</code> spring, <code>05</code> summer, <code>08</code> fall
                (<code>202701</code> is Spring 2027). Read them from <code>/api/courses/terms</code> rather than
                guessing.
              </li>
            </ul>
          </Section>

          <Section id="fair-use" title="Fair use">
            <p>
              Free for personal and student use. <strong>Be gentle: at most 1 request per second.</strong> Searches go
              straight to GSU&rsquo;s registration system (GoSolar), and ratings to RateMyProfessors, so a burst from
              one script slows things down for every student using the site. Cache what you can, fetch meta only for
              the sections you will actually show, and don&rsquo;t poll seat counts in a loop (sign in and use Track
              instead; PantherWatch emails you when a seat opens).
            </p>
            <p>
              PantherWatch is not affiliated with Georgia State University. Data can be incomplete or out of date;
              GoSolar is the source of truth for registration.
            </p>
          </Section>

          <Section id="terms" title="List terms">
            <Endpoint method="GET" path="/api/courses/terms" />
            <p>
              Terms you can register for come first (newest first), then view-only past terms with{" "}
              <code>viewOnly: true</code>. No parameters.
            </p>
            <Code label="Request">{`curl ${BASE}/api/courses/terms`}</Code>
            <Code label="Response 200">{TERMS_RESPONSE}</Code>
          </Section>

          <Section id="subjects" title="Find subjects">
            <Endpoint method="GET" path="/api/courses/subjects?term&q" />
            <Params
              rows={[
                ["term", true, "6-digit term code."],
                [
                  "q",
                  false,
                  <>
                    Text to match against the code or name (up to 64 characters). Blank returns the first 50 subjects.
                  </>,
                ],
              ]}
            />
            <p>Returns at most 50 subjects whose code or description contains q.</p>
            <Code label="Request">{`curl "${BASE}/api/courses/subjects?term=202701&q=comp"`}</Code>
            <Code label="Response 200">{SUBJECTS_RESPONSE}</Code>
          </Section>

          <Section id="search" title="Search sections">
            <Endpoint method="GET" path="/api/courses/search?term&subject&courseNumber&level" />
            <Params
              rows={[
                ["term", true, "6-digit term code."],
                ["subject", true, <>One subject code, 2&ndash;8 letters (case-insensitive), e.g. CSC.</>],
                [
                  "courseNumber",
                  false,
                  <>
                    1&ndash;8 letters or digits, e.g. <code>1301</code> or <code>1301L</code>. Leave it out to get the
                    whole subject.
                  </>,
                ],
                [
                  "level",
                  false,
                  <>
                    GoSolar level: <code>US</code> undergraduate, <code>GS</code> graduate. Leave it out for all levels.
                  </>,
                ],
              ]}
            />
            <ul>
              <li>
                Returns <strong>every</strong> matching section in one response: no paging, no 12-per-page limit. One
                subject per call; for several subjects, make one call each (about a second apart).
              </li>
              <li>
                Each section is GoSolar&rsquo;s own record, passed through. Useful fields: <code>seatsAvailable</code>{" "}
                (can be negative when over-enrolled; when <code>crossList</code> is set the section shares a seat pool,
                and only <code>min(seatsAvailable, crossListAvailable)</code> seats are takeable),{" "}
                <code>waitCount</code>, <code>waitCapacity</code>,{" "}
                <code>creditHourLow</code>/<code>creditHourHigh</code> (a range for variable-credit courses, else{" "}
                <code>creditHourLow</code> or <code>creditHours</code>), <code>faculty[].displayName</code> (&ldquo;Last,
                First&rdquo;; <code>primaryIndicator</code> marks the main instructor), and{" "}
                <code>instructionalMethodDescription</code> plus <code>sectionAttributes</code> for the delivery mode
                (&ldquo;Fully Distance 95% tech&rdquo;, &ldquo;Hybrid/Partially Online&rdquo;).
              </li>
              <li>
                Meeting days are booleans on <code>meetingsFaculty[].meetingTime</code> (<code>monday</code> &hellip;{" "}
                <code>sunday</code>). <code>beginTime</code>/<code>endTime</code> are 24-hour <code>HHMM</code>{" "}
                strings, <code>null</code> when the time is TBA or the class is asynchronous online. A section can
                have several meeting rows (lecture + lab, or different date ranges).
              </li>
              <li>
                Seat counts are live, so this endpoint is never cached: every call is a fresh GoSolar search
                (about a second for one course, longer for a whole large subject).
              </li>
            </ul>
            <Code label="Request">{`curl "${BASE}/api/courses/search?term=202701&subject=CSC&courseNumber=1301&level=US"`}</Code>
            <Code label="Response 200 (one section shown, trimmed)">{SEARCH_RESPONSE}</Code>
          </Section>

          <Section id="meta" title="Grades, ratings and syllabus">
            <Endpoint method="GET" path="/api/courses/meta?term&subject&courseNumber&crn&instructor" />
            <Params
              rows={[
                ["term", true, "6-digit term code."],
                ["subject", true, "Subject code."],
                ["courseNumber", true, "Course number."],
                ["crn", true, "5-digit CRN (used for the syllabus lookup)."],
                [
                  "instructor",
                  false,
                  <>
                    The primary instructor&rsquo;s <code>faculty[].displayName</code> from the search response, as-is.
                    Without it, <code>rating</code> is <code>null</code> and only course-wide grades come back.
                  </>,
                ],
              ]}
            />
            <ul>
              <li>
                <code>grades</code>: GSU grade history for the course over recent terms. <code>overall</code> is
                course-wide, <code>professors</code> has one entry per instructor, and{" "}
                <code>instructorDistribution</code> is the queried instructor&rsquo;s own history when{" "}
                <code>instructorHasTaught</code> is true. <code>gpa</code> is enrollment-weighted;{" "}
                <code>dwfPercent</code> counts D, F, WF and W. <code>hasData: false</code> means no history (often a
                new course).
              </li>
              <li>
                <code>rating</code>: RateMyProfessors summary. <code>found: false</code> means no match, which is
                &ldquo;unknown&rdquo;, not &ldquo;bad&rdquo;. <code>avgRating</code> and <code>avgDifficulty</code> are
                out of 5.
              </li>
              <li>
                <code>syllabus</code>: a public PDF when the department has posted one.
              </li>
              <li>
                Each part is <code>null</code> if its lookup fails; a failed lookup never turns the whole response into
                an error.
              </li>
            </ul>
            <Code label="Request">{`curl -G ${BASE}/api/courses/meta \\
  --data-urlencode term=202701 --data-urlencode subject=CSC \\
  --data-urlencode courseNumber=2720 --data-urlencode crn=12992 \\
  --data-urlencode "instructor=Islam, S M Towhidul (Towhid)"`}</Code>
            <Code label="Response 200 (trimmed)">{META_RESPONSE}</Code>
          </Section>

          <Section id="requirements" title="Prerequisites and restrictions">
            <Endpoint method="GET" path="/api/courses/requirements?term&crn" />
            <Params
              rows={[
                ["term", true, "6-digit term code."],
                ["crn", true, "5-digit CRN of the section."],
              ]}
            />
            <ul>
              <li>
                <code>prerequisites</code> is <code>null</code> when there are none. <code>text</code> is GoSolar&rsquo;s
                wording; <code>tree</code> nests <code>and</code>/<code>or</code> groups of <code>course</code>,{" "}
                <code>test</code> and <code>other</code> (e.g. student attributes) nodes; <code>items</code> lists
                every course once.
              </li>
              <li>
                <code>restrictions</code>: the student must match one value of each <code>mustBe</code> group and none
                of the <code>mustNotBe</code> ones. <code>description</code> is the catalog text, or <code>null</code>.
              </li>
            </ul>
            <Code label="Request">{`curl "${BASE}/api/courses/requirements?term=202701&crn=19010"`}</Code>
            <Code label="Response 200 (trimmed)">{REQUIREMENTS_RESPONSE}</Code>
          </Section>

          <Section id="batch" title="Batch meta (same-origin only)">
            <Endpoint method="POST" path="/api/courses/meta/batch" />
            <p>
              What the results page uses to load grades and ratings for a whole page of cards at once. Body:{" "}
              <code>{`{ "items": [{ term, subject, courseNumber, crn, instructor? }, …] }`}</code> (1&ndash;50 items);
              response: <code>{`{ "items": [...] }`}</code> in the same order, each shaped like{" "}
              <code>/api/courses/meta</code>. <strong>It only accepts requests from pantherwatch.app pages</strong>{" "}
              (cross-origin calls get <code>403 forbidden</code>) and sends no CORS headers. From your own code, call{" "}
              <code>GET /api/courses/meta</code> once per section instead.
            </p>
          </Section>

          <Section id="errors" title="Errors">
            <p>
              Errors share one shape. <code>400 invalid_request</code> means a parameter is missing or malformed (the
              message names it). <code>502 upstream_unavailable</code> means GoSolar didn&rsquo;t answer; wait a minute
              and retry. <code>500 internal_error</code> is a bug on our side.
            </p>
            <Code label="Response 400">{ERROR_RESPONSE}</Code>
          </Section>

          <Section id="caching" title="Caching">
            <div className={styles.tableWrap}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Endpoint</th>
                    <th scope="col">Cache-Control</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      <code>/api/courses/terms</code>
                    </td>
                    <td>
                      <code>public, s-maxage=300, stale-while-revalidate=600</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>/api/courses/subjects</code>
                    </td>
                    <td>
                      <code>public, s-maxage=3600, stale-while-revalidate=86400</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>/api/courses/requirements</code>
                    </td>
                    <td>
                      <code>public, s-maxage=3600, stale-while-revalidate=86400</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>/api/courses/meta</code>
                    </td>
                    <td>
                      <code>public, s-maxage=600, stale-while-revalidate=3600</code>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      <code>/api/courses/search</code>, <code>/api/courses/meta/batch</code>
                    </td>
                    <td>
                      <code>private, no-store</code> (live seat counts)
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
            <p>
              The <code>s-maxage</code> values apply at our CDN, which strips them, so your client sees{" "}
              <code>Cache-Control: public</code>. Repeating a cached request is cheap; a search always reaches GoSolar.
              Grade history changes once a term and ratings rarely, so cache meta on your side for at least a day.
            </p>
          </Section>

          <Section id="html" title="Reading the web pages">
            <p>
              If you must read the rendered pages, don&rsquo;t parse the text or the styling. Each card&rsquo;s seat
              panel and meeting list carry stable data attributes: <code>data-days</code> lists meeting days in{" "}
              <code>M T W R F S U</code> order (Monday&ndash;Sunday, empty for no set days), and{" "}
              <code>data-start</code>/<code>data-end</code> are 24-hour <code>HHMM</code> (absent when TBA).{" "}
              <code>data-seats-available</code> is the takeable count: for a cross-listed section, the smaller of its
              own seats and the shared pool&rsquo;s. The Rate My Professors pill has <code>data-rmp</code> (average out
              of 5) and the grade line <code>data-gpa</code>, with <code>data-gpa-scope</code> saying whether it is the
              professor&rsquo;s own history for the course (<code>instructor</code>) or course-wide (
              <code>course</code>). Either is absent when there is no data.
            </p>
            <Code label="Rendered card (excerpt)">{HTML_EXAMPLE}</Code>
            <p>
              Results pages are not for crawlers (<Link href="/robots.txt">robots.txt</Link> disallows them): each one
              is a live GoSolar search.
            </p>
          </Section>

          <Section id="assistants" title="AI assistants">
            <p>
              The <a href="#mcp">MCP connector</a> is the way to connect an assistant: any MCP-capable assistant can
              use it with no setup beyond pasting the URL, and it can act on the student&rsquo;s account. Agents that
              can&rsquo;t use connectors can call the public API above directly. Signed-in students can also chat with
              PantherWatch&rsquo;s own assistant on the <Link href="/assistant?tab=chat">AI Assistant</Link> page; it uses the
              same tools as the connector and has no API of its own.
            </p>
            <ul>
              <li>
                <a href="/llms.txt">/llms.txt</a> (a short site summary for language models)
              </li>
            </ul>
          </Section>
        </article>
      </main>

      <SiteFooter className={styles.footer} />
    </div>
  );
}
