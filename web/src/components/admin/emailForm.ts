import type { AdminEmailPayload } from "@/lib/client/admin";
import { escapeHtml } from "@/lib/email/escape";
import {
  WELCOME_FEATURES,
  WELCOME_INTRO,
  WELCOME_SIGNATURE,
  WELCOME_SIGNOFF,
  WELCOME_SUBJECT,
} from "@/lib/email/templates/welcomeCopy";

/**
 * Email composer helpers (pure, unit-tested): the quick-template snippets ported from the old
 * EmailTemplates.jsx (now HTML, since the API takes `htmlBody`), validation and the payload.
 */

export const SUBJECT_MAX = 200;
export const PREVIEW_TEXT_MAX = 200;
export const HTML_BODY_MAX = 100_000;

export interface EmailFormValues {
  to: string;
  subject: string;
  previewText: string;
  htmlBody: string;
}

export type EmailFormErrors = Partial<Record<keyof EmailFormValues, string>>;

export interface EmailTemplate {
  id: string;
  name: string;
  subject: string;
  /** HTML body for a recipient display name. */
  body: (name: string) => string;
}

export const EMAIL_TEMPLATES: readonly EmailTemplate[] = [
  {
    id: "welcome",
    name: "Welcome message",
    // Same words as the automatic welcome email (welcomeCopy.ts), so the two can't drift.
    subject: WELCOME_SUBJECT,
    body: (name) =>
      [
        `<p>Hi ${escapeHtml(name)},</p>`,
        `<p>${escapeHtml(WELCOME_INTRO)}</p>`,
        "<ul>",
        ...WELCOME_FEATURES.map((f) => `  <li><strong>${escapeHtml(f.lead)}</strong>${escapeHtml(f.rest)}</li>`),
        "</ul>",
        '<p><a href="https://www.pantherwatch.app">Open PantherWatch</a></p>',
        `<p>${escapeHtml(WELCOME_SIGNOFF)}<br>${escapeHtml(WELCOME_SIGNATURE)}</p>`,
      ].join("\n"),
  },
  {
    id: "maintenance",
    name: "System maintenance",
    subject: "Scheduled maintenance notice",
    body: (name) =>
      [
        `<p>Hi ${escapeHtml(name)},</p>`,
        "<p>PantherWatch will be undergoing scheduled maintenance on <strong>[DATE]</strong> from <strong>[TIME]</strong> to <strong>[TIME]</strong>.</p>",
        "<p>During this time you may see brief interruptions in service, and seat alerts may be delayed. We apologize for any inconvenience.</p>",
        "<p>Thank you for your patience.</p>",
      ].join("\n"),
  },
  {
    id: "feature",
    name: "Feature update",
    subject: "New features available!",
    body: (name) =>
      [
        `<p>Hi ${escapeHtml(name)},</p>`,
        "<p>We've just released some new features to improve your PantherWatch experience:</p>",
        "<ul>\n  <li>[Feature 1]</li>\n  <li>[Feature 2]</li>\n  <li>[Feature 3]</li>\n</ul>",
        "<p>Sign in to check them out!</p>",
      ].join("\n"),
  },
];

/**
 * Applies a template. The subject is replaced only when empty (or still another template's
 * subject); the body is replaced (callers confirm first when it's non-empty).
 */
export function applyTemplate(values: EmailFormValues, template: EmailTemplate, name: string): EmailFormValues {
  const subject = values.subject.trim();
  const isTemplateSubject = EMAIL_TEMPLATES.some((t) => t.subject === subject);
  return {
    ...values,
    subject: !subject || isTemplateSubject ? template.subject : values.subject,
    htmlBody: template.body(name),
  };
}

const EMAIL = /^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/;

export function validateEmailForm(values: EmailFormValues): EmailFormErrors {
  const errors: EmailFormErrors = {};
  const to = values.to.trim();
  if (!to) errors.to = "Enter a recipient.";
  else if (!EMAIL.test(to)) errors.to = "Enter a single valid email address.";
  const subject = values.subject.trim();
  if (!subject) errors.subject = "Enter a subject.";
  else if (subject.length > SUBJECT_MAX) errors.subject = `Keep it under ${SUBJECT_MAX} characters.`;
  if (values.previewText.trim().length > PREVIEW_TEXT_MAX) {
    errors.previewText = `Keep it under ${PREVIEW_TEXT_MAX} characters.`;
  }
  const body = values.htmlBody.trim();
  if (!body) errors.htmlBody = "Write a message.";
  else if (body.length > HTML_BODY_MAX) errors.htmlBody = "The message is too long.";
  return errors;
}

/** POST /api/admin/email body: trimmed, previewText omitted when empty (strict schema). */
export function toEmailPayload(values: EmailFormValues): AdminEmailPayload {
  const payload: AdminEmailPayload = {
    to: values.to.trim(),
    subject: values.subject.trim(),
    htmlBody: values.htmlBody.trim(),
  };
  const previewText = values.previewText.trim();
  if (previewText) payload.previewText = previewText;
  return payload;
}

/**
 * Maps a server 400 message ("subject: must not be empty") to a field, so the error shows
 * inline under the right control. Unknown prefixes return null.
 */
export function fieldFromServerMessage(message: string): keyof EmailFormValues | null {
  const field = /^(\w+):/.exec(message)?.[1];
  return field === "to" || field === "subject" || field === "htmlBody" || field === "previewText" ? field : null;
}
