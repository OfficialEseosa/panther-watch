import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { emailLog, users } from "@/db/schema";
import { sendGoodbyeEmail, type EmailTransport } from "@/lib/email";

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
