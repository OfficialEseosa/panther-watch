import "server-only";
import { asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { z } from "zod";
import { getDb } from "@/db";
import { emailLog, scheduleEntries, users, watchedSections, type JobRun } from "@/db/schema";
import { listIngestedTerms } from "@/lib/course-meta";
import {
  remainingBudget,
  sendCustomEmail,
  utcDayStart,
  utcMonthStart,
  type EmailTransport,
  type RemainingBudget,
} from "@/lib/email";
import { recentRuns } from "@/lib/jobs/runs";
import { parseInput } from "./errors";

export { InvalidInputError } from "./errors";

// ---------------------------------------------------------------------------------------------
// Stats
// ---------------------------------------------------------------------------------------------

export interface AdminStats {
  users: number;
  watches: number;
  scheduleEntries: number;
  /** Emails logged since 00:00 UTC (Resend's daily window). */
  emailsToday: number;
  /** Emails logged since the 1st, 00:00 UTC (Resend's monthly window). */
  emailsThisMonth: number;
  emailBudget: RemainingBudget;
  lastWatcherRun: JobRun | null;
  /** Grade-distribution terms stored (posted), newest first. */
  gradeTerms: string[];
}

/**
 * Dashboard numbers. Three queries in parallel: one SQL with scalar subselects for all the
 * counts, the latest watcher run, and the ingested grade terms.
 */
export async function getStats(now: Date = new Date()): Promise<AdminStats> {
  const db = getDb();
  const dayStart = utcDayStart(now).toISOString();
  const monthStart = utcMonthStart(now).toISOString();
  const countOf = (query: SQL) => sql<number>`(${query})`.mapWith(Number);

  const [[counts], lastRuns, gradeTerms] = await Promise.all([
    db
      .select({
        users: countOf(sql`SELECT count(*) FROM ${users}`),
        watches: countOf(sql`SELECT count(*) FROM ${watchedSections}`),
        scheduleEntries: countOf(sql`SELECT count(*) FROM ${scheduleEntries}`),
        emailsToday: countOf(sql`SELECT count(*) FROM ${emailLog} WHERE ${emailLog.sentAt} >= ${dayStart}`),
        emailsThisMonth: countOf(
          sql`SELECT count(*) FROM ${emailLog} WHERE ${emailLog.sentAt} >= ${monthStart}`,
        ),
      })
      .from(sql`(SELECT 1) AS one`),
    recentRuns("watcher", 1),
    listIngestedTerms(),
  ]);

  return {
    ...counts,
    emailBudget: remainingBudget({
      sentTodayUtc: counts.emailsToday,
      sentThisMonthUtc: counts.emailsThisMonth,
    }),
    lastWatcherRun: lastRuns[0] ?? null,
    gradeTerms,
  };
}

// ---------------------------------------------------------------------------------------------
// Users
// ---------------------------------------------------------------------------------------------

export const LIST_USERS_MAX_LIMIT = 200;

export const listUsersSchema = z.object({
  q: z
    .string()
    .trim()
    .max(200, "must be at most 200 characters")
    .optional()
    .transform((value) => value || undefined),
  limit: z.coerce.number().int().min(1).max(LIST_USERS_MAX_LIMIT).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});
export type ListUsersInput = z.input<typeof listUsersSchema>;

export interface AdminUser {
  id: string;
  email: string;
  name: string | null;
  pictureUrl: string | null;
  createdAt: string;
  watchCount: number;
  scheduleCount: number;
}

export interface UserPage {
  users: AdminUser[];
  /** Users matching `q` (all users without it), ignoring limit/offset. */
  total: number;
  limit: number;
  offset: number;
}

/** Escapes LIKE wildcards so `q` matches literally (Postgres's default LIKE escape is `\`). */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}

/**
 * Users newest first with their watch and schedule counts. The counts come from two
 * pre-aggregated (GROUP BY user_id) subqueries LEFT JOINed onto users: one query, no
 * per-user lookups (the old backend's N+1), and no watches x schedules row blow-up. Users
 * with nothing get 0. `q` matches name or email as a case-insensitive substring.
 */
export async function listUsers(input: ListUsersInput = {}): Promise<UserPage> {
  const { q, limit, offset } = parseInput(listUsersSchema, input);
  const db = getDb();

  const pattern = q === undefined ? undefined : `%${escapeLike(q)}%`;
  const where = pattern ? or(ilike(users.email, pattern), ilike(users.name, pattern)) : undefined;

  const watchCounts = db
    .select({ userId: watchedSections.userId, n: count().as("watch_n") })
    .from(watchedSections)
    .groupBy(watchedSections.userId)
    .as("watch_counts");
  const scheduleCounts = db
    .select({ userId: scheduleEntries.userId, n: count().as("schedule_n") })
    .from(scheduleEntries)
    .groupBy(scheduleEntries.userId)
    .as("schedule_counts");

  const [rows, [{ total }]] = await Promise.all([
    db
      .select({
        id: users.id,
        email: users.email,
        name: users.name,
        pictureUrl: users.pictureUrl,
        createdAt: users.createdAt,
        watchCount: sql<number>`coalesce(${watchCounts.n}, 0)`.mapWith(Number),
        scheduleCount: sql<number>`coalesce(${scheduleCounts.n}, 0)`.mapWith(Number),
      })
      .from(users)
      .leftJoin(watchCounts, eq(watchCounts.userId, users.id))
      .leftJoin(scheduleCounts, eq(scheduleCounts.userId, users.id))
      .where(where)
      .orderBy(desc(users.createdAt), asc(users.id))
      .limit(limit)
      .offset(offset),
    db.select({ total: count() }).from(users).where(where),
  ]);

  return {
    users: rows.map((row) => ({ ...row, createdAt: row.createdAt.toISOString() })),
    total,
    limit,
    offset,
  };
}

// ---------------------------------------------------------------------------------------------
// Custom email
// ---------------------------------------------------------------------------------------------

export const adminEmailSchema = z.strictObject({
  to: z.string().trim().pipe(z.email("must be a single valid email address")),
  subject: z.string().trim().min(1, "must not be empty").max(200, "must be at most 200 characters"),
  /** Raw admin-authored HTML, inserted unescaped into the email layout. */
  htmlBody: z.string().trim().min(1, "must not be empty").max(100_000, "must be at most 100000 characters"),
  previewText: z.string().trim().max(200, "must be at most 200 characters").optional(),
});
export type AdminEmailInput = z.input<typeof adminEmailSchema>;

export interface AdminEmailResult {
  /** Resend message id. */
  id: string;
  to: string;
  subject: string;
  /** `email_log.id` of the audit row. */
  logId: number;
}

/**
 * Sends one custom email and logs it to `email_log` (type `custom`, `user_id` = the admin who
 * sent it, `recipient` = `to`). Throws `InvalidInputError` on bad input and `EmailSendError`
 * when the provider refuses; nothing is logged then.
 */
export async function sendAdminEmail(
  adminUserId: string,
  input: unknown,
  options: { transport?: EmailTransport } = {},
): Promise<AdminEmailResult> {
  const { to, subject, htmlBody, previewText } = parseInput(adminEmailSchema, input);
  const sent = await sendCustomEmail({ to, subject, htmlBody, previewText, transport: options.transport });

  const [log] = await getDb()
    .insert(emailLog)
    .values({
      userId: adminUserId,
      recipient: sent.to,
      type: "custom",
      subject: sent.subject,
      providerMessageId: sent.id,
    })
    .returning({ id: emailLog.id });
  return { id: sent.id, to: sent.to, subject: sent.subject, logId: log.id };
}
