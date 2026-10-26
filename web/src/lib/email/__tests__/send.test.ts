import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  EMAIL_FROM,
  EmailSendError,
  createMemoryTransport,
  sendClassAvailabilityEmail,
  sendCustomEmail,
  sendGoodbyeEmail,
  sendWelcomeEmail,
  type AvailabilityCourse,
  type MemoryTransport,
} from "..";

const appUrl = "https://www.pantherwatch.app";

const course: AvailabilityCourse = {
  crn: "83410",
  subject: "CSC",
  courseNumber: "1301",
  title: "Principles of Computer Science I",
  instructor: "Ada Lovelace",
  term: "202608",
  termName: "Fall Semester 2026",
  seatsAvailable: 3,
  waitCount: 0,
};

let transport: MemoryTransport;
beforeEach(() => {
  transport = createMemoryTransport();
});

describe("escaping", () => {
  it("escapes <script> in a course title and in a name", async () => {
    await sendClassAvailabilityEmail({
      to: "student@example.com",
      name: `<script>alert("name")</script>`,
      course: { ...course, title: `Intro <script>alert('title')</script> & Lab` },
      transport,
      appUrl,
    });
    const { html, text } = transport.sent[0];
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;alert(&quot;name&quot;)&lt;/script&gt;");
    expect(html).toContain("Intro &lt;script&gt;alert(&#39;title&#39;)&lt;/script&gt; &amp; Lab");
    // The text part is plain text, so it carries the value verbatim.
    expect(text).toContain(`Intro <script>alert('title')</script> & Lab`);
  });

  it("escapes the name in welcome and goodbye emails", async () => {
    await sendWelcomeEmail({ to: "a@example.com", name: "<b>Eve</b>", transport, appUrl });
    // Greetings use the first word of the name (lib/format greetingName), so no spaces here.
    await sendGoodbyeEmail({ to: "a@example.com", name: "<img/src=x/onerror=alert(1)>", transport, appUrl });
    expect(transport.sent[0].html).toContain("You're in, &lt;b&gt;Eve&lt;/b&gt;.");
    expect(transport.sent[1].html).toContain("Sorry to see you go, &lt;img/src=x/onerror=alert(1)&gt;.");
    expect(transport.sent[1].html).not.toContain("<img/src=x");
  });

  it("does not double-escape entity-encoded GoSolar titles", async () => {
    await sendClassAvailabilityEmail({
      to: "s@example.com",
      name: "Sam",
      course: { ...course, title: "Biology Lab &amp; Lecture" },
      transport,
      appUrl,
    });
    expect(transport.sent[0].html).toContain("Biology Lab &amp; Lecture");
    expect(transport.sent[0].html).not.toContain("&amp;amp;");
    expect(transport.sent[0].text).toContain("Biology Lab & Lecture");
  });
});

describe("sendClassAvailabilityEmail", () => {
  it("uses the searchable subject with CRN <crn> and the shared sender", async () => {
    const sent = await sendClassAvailabilityEmail({ to: "s@example.com", name: "Sam", course, transport, appUrl });
    expect(sent.subject).toBe("Class Spot Available: CSC 1301 (CRN 83410)");
    expect(sent.subject).toContain(`CRN ${course.crn}`);
    expect(sent.type).toBe("CLASS_AVAILABILITY");
    const message = transport.sent[0];
    expect(message.from).toBe(EMAIL_FROM);
    expect(message.from).toBe("PantherWatch <no-reply@class.pantherwatch.app>");
    expect(message.to).toBe("s@example.com");
    expect(message.subject).toBe(sent.subject);
    expect(message.tags).toEqual([
      { name: "type", value: "CLASS_AVAILABILITY" },
      { name: "crn", value: "83410" },
      { name: "term", value: "202608" },
    ]);
  });

  it("renders the course block with term name, instructor and seats", async () => {
    await sendClassAvailabilityEmail({ to: "s@example.com", name: "Sam", course, transport, appUrl });
    const { html, text } = transport.sent[0];
    expect(html).toContain('<div class="course-card">');
    expect(html).toContain("Principles of Computer Science I");
    expect(html).toContain("Fall Semester 2026");
    expect(html).toContain("Ada Lovelace");
    expect(html).toContain("3 open");
    expect(html).toContain("Search for CRN 83410");
    expect(text).toContain("CRN: 83410");
    expect(text).toContain("Term: Fall Semester 2026");
  });

  it("falls back to the term code and omits the instructor row when absent", async () => {
    await sendClassAvailabilityEmail({
      to: "s@example.com",
      name: "Sam",
      course: { ...course, instructor: undefined, termName: undefined },
      transport,
      appUrl,
    });
    const { html } = transport.sent[0];
    expect(html).toContain(">202608<");
    expect(html).not.toContain("Instructor");
  });
});

describe("welcome and goodbye", () => {
  it("render without the course block, with the dark-mode-safe logo from APP_URL", async () => {
    await sendWelcomeEmail({ to: "a@example.com", name: "Ada", transport, appUrl });
    await sendGoodbyeEmail({ to: "a@example.com", name: "Ada", transport, appUrl });
    const [welcome, goodbye] = transport.sent;

    expect(welcome.subject).toBe("🎉 Welcome to PantherWatch!");
    expect(goodbye.subject).toBe("We're sorry to see you go");
    for (const message of [welcome, goodbye]) {
      expect(message.html).not.toContain("course-card");
      expect(message.html).not.toContain("CRN ");
      expect(message.html).toContain(`<img src="${appUrl}/email-logo.png"`);
      expect(message.html).not.toContain("favicon.png");
      expect(message.html).not.toContain('<link rel="stylesheet"');
      expect(message.html).toContain("<style>");
      expect(message.text.length).toBeGreaterThan(0);
      expect(message.text).not.toMatch(/<[a-z]/i);
    }
    expect(welcome.html).toContain("You're in, Ada.");
    expect(goodbye.html).toContain("Sorry to see you go, Ada.");
    expect(welcome.tags).toEqual([{ name: "type", value: "WELCOME" }]);
  });

  it("greets 'there' when the name is blank", async () => {
    await sendWelcomeEmail({ to: "a@example.com", name: "  ", transport, appUrl });
    await sendGoodbyeEmail({ to: "a@example.com", name: null, transport, appUrl });
    expect(transport.sent[0].html).toContain("You're in, there.");
    expect(transport.sent[1].html).toContain("Sorry to see you go, there.");
  });
});

describe("sendCustomEmail", () => {
  it("keeps the raw HTML body but escapes the subject in the HTML", async () => {
    const htmlBody = `<p>Registration opens <strong>Monday</strong>. <a href="https://gsu.edu">Details</a></p>`;
    const subject = `Heads up <script>alert(1)</script>`;
    const sent = await sendCustomEmail({ to: "a@example.com", subject, htmlBody, transport, appUrl });
    const message = transport.sent[0];

    expect(message.html).toContain(htmlBody);
    expect(message.html).toContain("<title>Heads up &lt;script&gt;alert(1)&lt;/script&gt;</title>");
    expect(message.html).not.toContain("<script>");
    expect(sent.subject).toBe(subject);
    expect(message.text).toContain("Registration opens Monday. Details (https://gsu.edu)");
  });

  it("strips line breaks from the subject header and escapes preview text", async () => {
    await sendCustomEmail({
      to: "a@example.com",
      subject: "Hello\r\nBcc: victim@example.com",
      htmlBody: "<p>x</p>",
      previewText: "<b>preview</b>",
      transport,
      appUrl,
    });
    expect(transport.sent[0].subject).toBe("Hello Bcc: victim@example.com");
    expect(transport.sent[0].html).toContain('<span class="preheader">&lt;b&gt;preview&lt;/b&gt;</span>');
  });
});

describe("transport errors", () => {
  it("surfaces EmailSendError with the provider message", async () => {
    transport.failNext("You have reached your daily email sending quota.", "daily_quota_exceeded");
    const error = await sendWelcomeEmail({ to: "a@example.com", name: "A", transport, appUrl }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailSendError);
    expect((error as EmailSendError).message).toBe("You have reached your daily email sending quota.");
    expect((error as EmailSendError).code).toBe("daily_quota_exceeded");
    expect(transport.sent).toHaveLength(0);
  });

  it("wraps non-EmailSendError failures from a custom transport", async () => {
    const broken = { send: () => Promise.reject(new Error("socket hang up")) };
    const error = await sendGoodbyeEmail({ to: "a@example.com", transport: broken, appUrl }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(EmailSendError);
    expect((error as EmailSendError).message).toBe("socket hang up");
  });
});
