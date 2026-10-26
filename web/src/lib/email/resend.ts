import "server-only";
import { Resend } from "resend";
import { env } from "@/lib/env";

/** The one sender address. The class.pantherwatch.app domain is verified in Resend. */
export const EMAIL_FROM = "PantherWatch <no-reply@class.pantherwatch.app>";

/** Resend tag. Name and value may only contain ASCII letters, digits, `_` and `-`. */
export interface EmailTag {
  name: string;
  value: string;
}

export interface SendEmailInput {
  to: string;
  subject: string;
  html: string;
  text: string;
  tags?: EmailTag[];
  /** Sent as Resend's Idempotency-Key header so a retried request is not delivered twice. */
  idempotencyKey?: string;
}

/** What a transport receives: the input plus the fixed sender. */
export interface OutgoingEmail extends SendEmailInput {
  from: string;
}

export interface SentEmail {
  id: string;
}

/** Delivery backend. Production uses Resend; tests and the integration harness use memory. */
export interface EmailTransport {
  send(message: OutgoingEmail): Promise<SentEmail>;
}

export class EmailSendError extends Error {
  /** Resend error name, e.g. "daily_quota_exceeded", when Resend returned one. */
  readonly code: string | undefined;
  readonly statusCode: number | null;

  constructor(message: string, options: { code?: string; statusCode?: number | null; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = "EmailSendError";
    this.code = options.code;
    this.statusCode = options.statusCode ?? null;
  }
}

let resendClient: Resend | undefined;

/** Created on first send so importing this module needs no API key (next build, tests). */
function getResend(): Resend {
  resendClient ??= new Resend(env.RESEND_API_KEY);
  return resendClient;
}

export const resendTransport: EmailTransport = {
  async send({ idempotencyKey, ...message }) {
    const { data, error } = await getResend().emails.send(
      {
        from: message.from,
        to: message.to,
        subject: message.subject,
        html: message.html,
        text: message.text,
        tags: message.tags,
      },
      idempotencyKey ? { idempotencyKey } : undefined,
    );
    if (error) {
      throw new EmailSendError(error.message, { code: error.name, statusCode: error.statusCode });
    }
    return { id: data.id };
  },
};

let defaultTransport: EmailTransport | null = null;

/**
 * Replaces the transport used when a call passes none, e.g. the integration harness installs
 * a memory transport for route handlers it cannot pass one to. Pass null to restore Resend.
 */
export function setDefaultEmailTransport(transport: EmailTransport | null): void {
  defaultTransport = transport;
}

export function getDefaultEmailTransport(): EmailTransport {
  return defaultTransport ?? resendTransport;
}

/** Sends one email from EMAIL_FROM. Resolves with the provider id or throws EmailSendError. */
export async function sendEmail(input: SendEmailInput, transport: EmailTransport = getDefaultEmailTransport()): Promise<SentEmail> {
  try {
    return await transport.send({ ...input, from: EMAIL_FROM });
  } catch (error) {
    if (error instanceof EmailSendError) throw error;
    const message = error instanceof Error ? error.message : String(error);
    throw new EmailSendError(message, { cause: error });
  }
}

export interface RecordedEmail extends OutgoingEmail {
  id: string;
}

export interface MemoryTransport extends EmailTransport {
  /** Every successfully "sent" message, oldest first. */
  readonly sent: RecordedEmail[];
  /** Makes the next send throw EmailSendError with this message instead of recording. */
  failNext(message: string, code?: string): void;
  clear(): void;
}

export function createMemoryTransport(): MemoryTransport {
  const sent: RecordedEmail[] = [];
  let pendingFailure: { message: string; code?: string } | null = null;
  let counter = 0;

  return {
    sent,
    failNext(message, code) {
      pendingFailure = { message, code };
    },
    clear() {
      sent.length = 0;
      pendingFailure = null;
    },
    async send(message) {
      if (pendingFailure) {
        const { message: failure, code } = pendingFailure;
        pendingFailure = null;
        throw new EmailSendError(failure, { code });
      }
      counter += 1;
      const id = `memory-${counter}`;
      sent.push({ ...message, tags: message.tags?.map((tag) => ({ ...tag })), id });
      return { id };
    },
  };
}
