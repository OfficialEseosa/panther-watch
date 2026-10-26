import { mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  renderClassAvailabilityEmail,
  renderCustomEmail,
  renderGoodbyeEmail,
  renderWelcomeEmail,
  type RenderedEmail,
} from "../templates";

/**
 * Writes each template to disk so a human can open them in a browser. Set
 * EMAIL_PREVIEW_DIR to choose the folder; otherwise it goes to <os temp>/pantherwatch-emails.
 */
function resolveOutDir(): string {
  return process.env.EMAIL_PREVIEW_DIR ?? join(tmpdir(), "pantherwatch-emails");
}

const appUrl = "https://www.pantherwatch.app";

const samples: Record<string, RenderedEmail> = {
  welcome: renderWelcomeEmail({ appUrl, name: "Raphael" }),
  "account-goodbye": renderGoodbyeEmail({ appUrl, name: "Raphael" }),
  "class-availability": renderClassAvailabilityEmail({
    appUrl,
    name: "Raphael",
    course: {
      crn: "83410",
      subject: "CSC",
      courseNumber: "1301",
      title: "Principles of Computer Science I",
      instructor: "Ada Lovelace",
      term: "202608",
      termName: "Fall Semester 2026",
      seatsAvailable: 2,
      waitCount: 0,
    },
  }),
  custom: renderCustomEmail({
    appUrl,
    subject: "Spring registration opens Monday",
    htmlBody:
      '<p>Spring registration opens <strong>Monday at 8 AM</strong>.</p><p>Add your sections now so you get alerts. <a href="https://www.pantherwatch.app">Open PantherWatch</a></p>',
    previewText: "Spring registration opens Monday.",
  }),
};

describe("render smoke", () => {
  it("renders every template to a well-formed document and writes it out", () => {
    const dir = resolveOutDir();
    mkdirSync(dir, { recursive: true });
    for (const [name, email] of Object.entries(samples)) {
      expect(email.html.startsWith("<!DOCTYPE html>")).toBe(true);
      expect(email.html.trimEnd().endsWith("</html>")).toBe(true);
      expect(email.html).not.toContain("${");
      expect(email.html).not.toContain("undefined");
      expect(email.html).not.toContain("%s");
      expect(email.subject.length).toBeGreaterThan(0);
      expect(email.text).not.toContain("undefined");
      writeFileSync(join(dir, `${name}.html`), email.html, "utf8");
      writeFileSync(join(dir, `${name}.txt`), `Subject: ${email.subject}\n\n${email.text}`, "utf8");
    }
  });
});
