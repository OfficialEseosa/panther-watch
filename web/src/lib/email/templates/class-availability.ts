import { cleanSubject, decodeEntities, escapeHtml } from "../escape";
import { GOSOLAR_REGISTRATION_URL, renderLayout, textFooter, type RenderedEmail } from "./layout";
import { greetingName, titleCase } from "@/lib/format";

const CSS = `.content { padding: 36px 36px 8px; }

.status {
    display: inline-block;
    background-color: #eaf0fb;
    color: #0039a6;
    padding: 7px 14px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 800;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 16px;
}

.h1 { margin: 0 0 14px; font-size: 26px; line-height: 1.25; font-weight: 800; letter-spacing: -0.01em; color: #15223b; }
.p { margin: 0 0 22px; font-size: 16px; line-height: 1.7; font-weight: 500; color: #3a4a66; }

.course-card {
    border: 1px solid #dbe3f1;
    border-left: 4px solid #0039a6;
    border-radius: 10px;
    padding: 22px 24px;
    margin: 24px 0 28px;
    background-color: #fafbfe;
}
.course-title { font-size: 18px; font-weight: 800; color: #15223b; margin: 0 0 14px; }
.detail-table { width: 100%; }
.detail-table tr td { padding: 7px 0; font-size: 14px; vertical-align: top; }
.detail-label { color: #6b7796; font-weight: 700; width: 84px; }
.detail-value { color: #15223b; font-weight: 700; }

.subhead { margin: 0 0 12px; font-size: 13px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; color: #0039a6; }

.steps { width: 100%; margin: 4px 0; }
.step-row td { padding: 8px 0; vertical-align: top; }
.step-n { width: 32px; }
.step-badge {
    display: inline-block;
    width: 28px;
    height: 28px;
    line-height: 28px;
    text-align: center;
    border-radius: 50%;
    background-color: #eaf0fb;
    color: #0039a6;
    font-size: 14px;
    font-weight: 800;
}
.step-t { padding-left: 14px; font-size: 15px; line-height: 1.6; font-weight: 500; color: #3a4a66; }
.step-t strong { color: #15223b; font-weight: 700; }

.btn-wrap { padding: 28px 0 6px; text-align: center; }
.btn {
    display: inline-block;
    background-color: #0039a6;
    color: #ffffff;
    text-decoration: none;
    padding: 15px 36px;
    border-radius: 8px;
    font-weight: 700;
    font-size: 16px;
}

.fineprint { margin: 22px 0 4px; font-size: 13px; line-height: 1.6; font-weight: 500; color: #93a0bd; }

@media only screen and (max-width: 620px) {
    .container { width: 100% !important; border-radius: 0 !important; }
    .content { padding: 28px 22px 4px !important; }
    .header { padding: 26px 22px 22px !important; }
    .footer { padding: 24px 22px 28px !important; }
    .h1 { font-size: 23px !important; }
}`;

const PREHEADER = "A seat just opened in a class you're watching. Grab it before it's gone.";
const FOOTER_REASON = "You're receiving this because you're tracking this class on PantherWatch.";

export interface AvailabilityCourse {
  crn: string;
  /** Subject code, e.g. "CSC". */
  subject: string;
  courseNumber: string;
  title: string;
  instructor?: string | null;
  /** Banner term code, e.g. "202608". */
  term: string;
  /** Human term name, e.g. "Fall Semester 2026"; shown instead of the code when present. */
  termName?: string | null;
  seatsAvailable: number;
  waitCount: number;
}

export interface ClassAvailabilityTemplateInput {
  appUrl: string;
  name: string | null | undefined;
  course: AvailabilityCourse;
}

/**
 * Subject line. Users search their inbox for the CRN, so "(CRN <crn>)" must stay in it;
 * the wording is unchanged from the Java service.
 */
export function classAvailabilitySubject(course: Pick<AvailabilityCourse, "crn" | "subject" | "courseNumber">): string {
  return cleanSubject(`Class Spot Available: ${course.subject} ${course.courseNumber} (CRN ${course.crn})`);
}

function seatsLine(seatsAvailable: number, waitCount: number): string {
  const open = `${seatsAvailable} open`;
  return waitCount > 0 ? `${open}, ${waitCount} on waitlist` : open;
}

export function renderClassAvailabilityEmail({ appUrl, name, course }: ClassAvailabilityTemplateInput): RenderedEmail {
  const who = greetingName(name);
  // GoSolar course strings can arrive entity-encoded ("Lab &amp; Lecture"); decode to plain
  // text first so escaping does not show a literal "&amp;".
  // GoSolar titles are all caps ("PRINCIPLES OF COMPUTER SCI I"): title-case them like the app.
  const title = titleCase(decodeEntities(course.title).trim());
  const courseCode = decodeEntities(`${course.subject} ${course.courseNumber}`).trim();
  const crn = decodeEntities(course.crn).trim();
  const instructor = course.instructor ? decodeEntities(course.instructor).trim() : "";
  const term = decodeEntities(course.termName?.trim() || course.term).trim();
  const seats = seatsLine(course.seatsAvailable, course.waitCount);
  const reason =
    course.waitCount === 0
      ? "You're getting this because the waitlist for this section dropped to zero."
      : "You're getting this because a seat opened in this section.";

  const row = (label: string, value: string) => `                                    <tr>
                                        <td class="detail-label">${label}</td>
                                        <td class="detail-value">${escapeHtml(value)}</td>
                                    </tr>`;

  const rows = [
    row("Course", courseCode),
    row("CRN", crn),
    ...(instructor ? [row("Instructor", instructor)] : []),
    row("Term", term),
    row("Seats", seats),
  ].join("\n");

  const content = `                            <span class="status">Seat available</span>
                            <h1 class="h1">A seat just opened, ${escapeHtml(who)}.</h1>
                            <p class="p">
                                One of the classes you're watching just freed up. Open seats in popular
                                sections rarely last long, so it's worth registering now.
                            </p>

                            <div class="course-card">
                                <p class="course-title">${escapeHtml(title)}</p>
                                <table role="presentation" class="detail-table" cellpadding="0" cellspacing="0" border="0">
${rows}
                                </table>
                            </div>

                            <p class="subhead">What to do next</p>
                            <table role="presentation" class="steps" cellpadding="0" cellspacing="0" border="0">
                                <tr class="step-row">
                                    <td class="step-n"><span class="step-badge">1</span></td>
                                    <td class="step-t"><strong>Log into GoSolar</strong> right away.</td>
                                </tr>
                                <tr class="step-row">
                                    <td class="step-n"><span class="step-badge">2</span></td>
                                    <td class="step-t"><strong>Search for CRN ${escapeHtml(crn)}</strong> in registration.</td>
                                </tr>
                                <tr class="step-row">
                                    <td class="step-n"><span class="step-badge">3</span></td>
                                    <td class="step-t"><strong>Register</strong> before the seat is taken.</td>
                                </tr>
                            </table>

                            <div class="btn-wrap">
                                <a href="${escapeHtml(GOSOLAR_REGISTRATION_URL)}" class="btn">Open GoSolar</a>
                            </div>

                            <p class="fineprint">
                                ${escapeHtml(reason)}
                                We'll keep watching it for you.
                            </p>`;

  const textRows = [
    `Course: ${courseCode}`,
    `CRN: ${crn}`,
    ...(instructor ? [`Instructor: ${instructor}`] : []),
    `Term: ${term}`,
    `Seats: ${seats}`,
  ].join("\n");

  const text = `A seat just opened, ${who}.

One of the classes you're watching just freed up. Open seats in popular sections rarely last long, so it's worth registering now.

${title}
${textRows}

What to do next:
1. Log into GoSolar right away.
2. Search for CRN ${crn} in registration.
3. Register before the seat is taken.

Open GoSolar: ${GOSOLAR_REGISTRATION_URL}

${reason} We'll keep watching it for you.

${textFooter(appUrl, FOOTER_REASON)}
`;

  return {
    subject: classAvailabilitySubject(course),
    html: renderLayout({ appUrl, title: "A seat just opened", preheader: PREHEADER, css: CSS, content, footerReason: FOOTER_REASON }),
    text,
  };
}
