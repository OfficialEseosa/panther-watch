import { gte, sql } from "drizzle-orm";
import type { Db } from "@/db";
import { emailLog } from "@/db/schema";
import { EMAIL_DEFAULT_RESERVE, remainingBudget, utcDayStart, utcMonthStart, type RemainingBudget } from "@/lib/email";

export interface EmailBudget extends RemainingBudget {
  sentTodayUtc: number;
  sentThisMonthUtc: number;
}

/**
 * Resend free-tier budget from `email_log` (every type counts: Resend counts every email).
 * `watcherBudget` is what the seat watcher may still send this run, after holding back
 * `reserve` for welcome/goodbye emails.
 */
export async function emailBudget(db: Db, now: Date = new Date(), reserve = EMAIL_DEFAULT_RESERVE): Promise<EmailBudget> {
  const dayStart = utcDayStart(now).toISOString();
  const [row] = await db
    .select({
      today: sql<number>`(count(*) filter (where ${emailLog.sentAt} >= ${dayStart}::timestamptz))::int`,
      month: sql<number>`count(*)::int`,
    })
    .from(emailLog)
    .where(gte(emailLog.sentAt, utcMonthStart(now)));
  const sentTodayUtc = Number(row?.today ?? 0);
  const sentThisMonthUtc = Number(row?.month ?? 0);
  return { sentTodayUtc, sentThisMonthUtc, ...remainingBudget({ sentTodayUtc, sentThisMonthUtc, reserve }) };
}
