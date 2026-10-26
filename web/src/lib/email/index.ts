import "server-only";
import { env } from "@/lib/env";
import { sendEmail, type EmailTag, type EmailTransport } from "./resend";
import {
  renderClassAvailabilityEmail,
  renderCustomEmail,
  renderGoodbyeEmail,
  renderWelcomeEmail,
  type AvailabilityCourse,
  type RenderedEmail,
} from "./templates";

/** Logged alongside every send by the DB layer. Values match the Java EmailLog enum. */
export type EmailType = "WELCOME" | "GOODBYE" | "CLASS_AVAILABILITY" | "CUSTOM";

export const EMAIL_TYPES = ["WELCOME", "GOODBYE", "CLASS_AVAILABILITY", "CUSTOM"] as const satisfies readonly EmailType[];

export interface SendOptions {
  /** Defaults to the process-wide transport (Resend unless the harness swapped it). */
  transport?: EmailTransport;
  /** Origin for the logo and links. Defaults to env.APP_URL. */
  appUrl?: string;
  /** Forwarded to Resend's Idempotency-Key so a retried send is delivered once. */
  idempotencyKey?: string;
}

export interface EmailSent {
  /** Provider message id. */
  id: string;
  type: EmailType;
  to: string;
  /** Exact subject sent; the DB layer logs it. */
  subject: string;
}

const TAG_SAFE = /^[A-Za-z0-9_-]{1,256}$/;

async function deliver(
  type: EmailType,
  to: string,
  rendered: RenderedEmail,
  options: SendOptions,
  extraTags: EmailTag[] = [],
): Promise<EmailSent> {
  const tags = [{ name: "type", value: type }, ...extraTags].filter(
    (tag) => TAG_SAFE.test(tag.name) && TAG_SAFE.test(tag.value),
  );
  const { id } = await sendEmail(
    { to, subject: rendered.subject, html: rendered.html, text: rendered.text, tags, idempotencyKey: options.idempotencyKey },
    options.transport,
  );
  return { id, type, to, subject: rendered.subject };
}

const appUrlOf = (options: SendOptions): string => (options.appUrl ?? env.APP_URL).replace(/\/+$/, "");

export interface WelcomeEmailInput extends SendOptions {
  to: string;
  name?: string | null;
}

export function sendWelcomeEmail({ to, name, ...options }: WelcomeEmailInput): Promise<EmailSent> {
  return deliver("WELCOME", to, renderWelcomeEmail({ appUrl: appUrlOf(options), name }), options);
}

export interface GoodbyeEmailInput extends SendOptions {
  to: string;
  name?: string | null;
}

export function sendGoodbyeEmail({ to, name, ...options }: GoodbyeEmailInput): Promise<EmailSent> {
  return deliver("GOODBYE", to, renderGoodbyeEmail({ appUrl: appUrlOf(options), name }), options);
}

export interface ClassAvailabilityEmailInput extends SendOptions {
  to: string;
  name?: string | null;
  course: AvailabilityCourse;
}

export function sendClassAvailabilityEmail({ to, name, course, ...options }: ClassAvailabilityEmailInput): Promise<EmailSent> {
  const rendered = renderClassAvailabilityEmail({ appUrl: appUrlOf(options), name, course });
  return deliver("CLASS_AVAILABILITY", to, rendered, options, [
    { name: "crn", value: course.crn },
    { name: "term", value: course.term },
  ]);
}

export interface CustomEmailInput extends SendOptions {
  to: string;
  /** Plain text; escaped in the HTML. */
  subject: string;
  /** Raw admin-authored HTML, inserted unescaped. */
  htmlBody: string;
  previewText?: string | null;
}

export function sendCustomEmail({ to, subject, htmlBody, previewText, ...options }: CustomEmailInput): Promise<EmailSent> {
  const rendered = renderCustomEmail({ appUrl: appUrlOf(options), subject, htmlBody, previewText });
  return deliver("CUSTOM", to, rendered, options);
}

export {
  EMAIL_FROM,
  EmailSendError,
  createMemoryTransport,
  getDefaultEmailTransport,
  sendEmail,
  setDefaultEmailTransport,
  type EmailTag,
  type EmailTransport,
  type MemoryTransport,
  type OutgoingEmail,
  type RecordedEmail,
  type SendEmailInput,
  type SentEmail,
} from "./resend";
export {
  EMAIL_DAILY_LIMIT,
  EMAIL_DEFAULT_RESERVE,
  EMAIL_MONTHLY_LIMIT,
  remainingBudget,
  utcDayStart,
  utcMonthStart,
  type RemainingBudget,
  type RemainingBudgetInput,
} from "./quota";
export { classAvailabilitySubject, type AvailabilityCourse, type RenderedEmail } from "./templates";
