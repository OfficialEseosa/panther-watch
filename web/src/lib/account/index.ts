import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { emailLog, users } from "@/db/schema";
import { sendGoodbyeEmail, sendWelcomeEmail, type EmailTransport } from "@/lib/email";
import { emailBudget } from "@/lib/watcher/budget";

export interface DeleteAccountOptions {
  /** Email transport for the goodbye email; defaults to the process-wide one (Resend). */
  transport?: EmailTransport;
  /** Origin for links in the email; defaults to env.APP_URL. */
  appUrl?: string;
}

export interface DeleteAccountResult {
  /** False when the user did not exist (already deleted). */
  deleted: boolean;
  /** Whether the goodbye email was accepted by the provider. */
  goodbyeSent: boolean;
}

export interface WelcomeEmailOptions {
  transport?: EmailTransport;
  appUrl?: string;
}

export type WelcomeResult = "sent" | "already_sent" | "no_user" | "over_budget" | "failed";

/**
 * Sends the welcome email for a brand-new account (call it only when `upsertGoogleUser`
 * returned `created: true`, outside any DB transaction; the OAuth callback runs it in
 * `after()`). Once per user: skipped when `email_log` already has a welcome for this user id,
 * so a retried or repeated call cannot send a second one. Goes to the user's current email,
 * may use the reserve the seat watcher leaves (it skips only when the daily or monthly Resend
 * budget is fully spent), is logged to `email_log` as `welcome`, and never throws: sign-in
 * must not fail because of email.
 */
export async function sendWelcomeEmailOnce(
  userId: string,
  { transport, appUrl }: WelcomeEmailOptions = {},
): Promise<WelcomeResult> {
  let sent = false;
  try {
    const db = getDb();
    const [user] = await db
      .select({ email: users.email, name: users.name })
      .from(users)
      .where(eq(users.id, userId))
      .limit(1);
    if (!user) return "no_user";

    const [previous] = await db
      .select({ id: emailLog.id })
      .from(emailLog)
      .where(and(eq(emailLog.userId, userId), eq(emailLog.type, "welcome")))
      .limit(1);
    if (previous) return "already_sent";

    const budget = await emailBudget(db, new Date(), 0);
    if (budget.dailyRemaining <= 0 || budget.monthlyRemaining <= 0) {
      console.warn("welcome email skipped: Resend budget spent");
      return "over_budget";
    }

    const email = await sendWelcomeEmail({
      to: user.email,
      name: user.name,
      transport,
      appUrl,
      idempotencyKey: `welcome-${userId}`,
    });
    sent = true;
    await db.insert(emailLog).values({
      userId,
      recipient: user.email,
      type: "welcome",
      subject: email.subject,
      providerMessageId: email.id,
    });
    return "sent";
  } catch (error) {
    console.error(
      sent ? "welcome email sent but email_log insert failed:" : "welcome email failed:",
      error instanceof Error ? error.message : error,
    );
    return sent ? "sent" : "failed";
  }
}

/**
 * Deletes the user. Watches and schedule entries go with it (ON DELETE CASCADE); email_log
 * rows keep their recipient with user_id set null. The goodbye email is sent after the
 * transaction commits, so a mail failure never resurrects the account; it is logged, not
 * thrown, and recorded in email_log with user_id null.
 */
export async function deleteAccount(
  userId: string,
  { transport, appUrl }: DeleteAccountOptions = {},
): Promise<DeleteAccountResult> {
  const db = getDb();
  const user = await db.transaction(async (tx) => {
    const [row] = await tx
      .delete(users)
      .where(eq(users.id, userId))
      .returning({ email: users.email, name: users.name });
    return row;
  });
  if (!user) return { deleted: false, goodbyeSent: false };

  let goodbyeSent = false;
  try {
    const sent = await sendGoodbyeEmail({ to: user.email, name: user.name, transport, appUrl });
    goodbyeSent = true;
    await db.insert(emailLog).values({
      userId: null,
      recipient: user.email,
      type: "goodbye",
      subject: sent.subject,
      providerMessageId: sent.id,
    });
  } catch (error) {
    console.error(
      goodbyeSent ? "goodbye email sent but email_log insert failed:" : "goodbye email failed:",
      error instanceof Error ? error.message : error,
    );
  }
  return { deleted: true, goodbyeSent };
}
