/**
 * Core PantherWatch schema: users, terms, watches, schedules, email log, announcements and
 * job runs. Replaces the Hibernate-shaped mirror of the Spring backend's tables; the cutover
 * from the live tables is `scripts/prod-migrate/` (see scripts/README.md).
 *
 * Conventions:
 * - Every timestamp is `timestamptz`, read and written as JS `Date` (UTC instants).
 * - `users.id` is a UUID generated in the database; every other table uses a
 *   `bigint generated always as identity` key, so inserts never pass `id`.
 * - Term codes are `char(6)` (`YYYYMM`, e.g. 202608) and CRNs are 5-digit `varchar(5)`,
 *   both CHECKed. Every CRN in backend/grade-data (61k rows, 2022-2025) is exactly 5 digits.
 * - `updated_at` is maintained by Drizzle's `$onUpdate` (app-side, no trigger), so raw SQL
 *   updates must set it themselves.
 */
import { sql } from "drizzle-orm";
import {
  bigint,
  boolean,
  char,
  check,
  index,
  jsonb,
  pgEnum,
  pgTable,
  smallint,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
  varchar,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

const identityId = () => bigint("id", { mode: "number" }).primaryKey().generatedAlwaysAsIdentity();

/** GoSolar term code, e.g. "202608" (Fall 2026). */
const termCode = (name = "term") => char(name, { length: 6 });
/** GoSolar course reference number, e.g. "80001". */
const crn = () => varchar("crn", { length: 5 });
/** Subject code, e.g. "CSC". */
const subject = () => varchar("subject", { length: 8 });
/** Course number, e.g. "1301" or "1301L". */
const courseNumber = () => varchar("course_number", { length: 8 });

// `\\d`, not `\d`: `sql` reads the cooked template strings, where "\d" is just "d".
const termFormat = (name: string, column: AnyPgColumn) => check(name, sql`${column} ~ '^\\d{6}$'`);
const crnFormat = (name: string, column: AnyPgColumn) => check(name, sql`${column} ~ '^\\d{5}$'`);

// ---------------------------------------------------------------------------------------------
// users
// ---------------------------------------------------------------------------------------------

/**
 * One row per person. Identity is Google: `google_sub` is matched first, then a verified
 * email (see src/lib/auth/users.ts). Legacy rows from the Supabase-auth era may have a null
 * `google_sub` until their next sign-in. `id` is NOT tied to `auth.users`.
 */
export const users = pgTable(
  "users",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    email: text("email").notNull(),
    name: text("name"),
    pictureUrl: text("picture_url"),
    googleSub: text("google_sub"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    uniqueIndex("users_email_lower_key").on(sql`lower(${t.email})`),
    uniqueIndex("users_google_sub_key")
      .on(t.googleSub)
      .where(sql`${t.googleSub} IS NOT NULL`),
  ],
);

// ---------------------------------------------------------------------------------------------
// terms
// ---------------------------------------------------------------------------------------------

/**
 * Cache of GoSolar's term list (`/classSearch/getTerms`), refreshed by a cron job, so term
 * validation and the expired/view-only cleanup never have to call GoSolar.
 */
export const terms = pgTable(
  "terms",
  {
    code: termCode("code").primaryKey(),
    description: text("description").notNull(),
    /** GoSolar labels closed registration windows "(View only)". */
    viewOnly: boolean("view_only").notNull(),
    fetchedAt: timestamptz("fetched_at").notNull().defaultNow(),
  },
  (t) => [termFormat("terms_code_format", t.code)],
);

// ---------------------------------------------------------------------------------------------
// watched_sections
// ---------------------------------------------------------------------------------------------

/**
 * A user's seat alert on one section. `subject` + `course_number` are required because
 * GoSolar cannot look a CRN up directly: the watcher searches each (term, subject,
 * course_number) group once and picks out the watched CRNs.
 */
export const watchedSections = pgTable(
  "watched_sections",
  {
    id: identityId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    term: termCode().notNull(),
    crn: crn().notNull(),
    subject: subject().notNull(),
    courseNumber: courseNumber().notNull(),
    courseTitle: text("course_title"),
    instructor: text("instructor"),
    /**
     * Seat-alert state, part 1. Set when an open-seat alert was sent for this watch. Claim it
     * atomically before calling Resend (`UPDATE ... SET notified_at = now() WHERE id = $1 AND
     * notified_at IS NULL RETURNING id`) so overlapping runs cannot double-send. While set, no
     * further alert is sent. It is cleared (re-armed) only after the section has been observed
     * closed for at least 2 consecutive watcher runs, so one bad or transient reading cannot
     * cause a second email.
     *
     * This per-watch state machine is the ONLY anti-spam mechanism; the old email-log
     * cooldown is gone.
     */
    notifiedAt: timestamptz("notified_at"),
    /**
     * Seat-alert state, part 2: the debounce. Records the FIRST closed observation after an
     * alert (set when `notified_at` is set, the section reads closed, and this is null). If the
     * next run still reads closed, both columns are cleared and the watch is re-armed; an open
     * reading in between resets this to null. Meaningless while `notified_at` is null.
     */
    lastClosedAt: timestamptz("last_closed_at"),
    /**
     * Consecutive watcher runs in which GoSolar answered for this course but did not list the
     * CRN (cancelled or renumbered section). Reset to 0 when the CRN is listed again; a failed
     * search changes nothing. At >= 3 (UNLISTED_AFTER_RUNS) the tracked page shows "no longer
     * listed". Display only: it never sends or suppresses an email. Capped by the watcher.
     */
    missingRuns: smallint("missing_runs").notNull().default(0),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
    updatedAt: timestamptz("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (t) => [
    unique("watched_sections_user_term_crn_key").on(t.userId, t.term, t.crn),
    index("watched_sections_course_idx").on(t.term, t.subject, t.courseNumber),
    termFormat("watched_sections_term_format", t.term),
    crnFormat("watched_sections_crn_format", t.crn),
    check("watched_sections_missing_runs_nonnegative", sql`${t.missingRuns} >= 0`),
  ],
);

// ---------------------------------------------------------------------------------------------
// schedule_entries
// ---------------------------------------------------------------------------------------------

/** A section on a user's planned schedule (Schedule Builder), synced across devices. */
export const scheduleEntries = pgTable(
  "schedule_entries",
  {
    id: identityId(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    term: termCode().notNull(),
    crn: crn().notNull(),
    subject: subject().notNull(),
    courseNumber: courseNumber().notNull(),
    courseTitle: text("course_title"),
    /** Index into the frontend's schedule color palette; null = derive from the CRN. */
    color: smallint("color"),
    addedAt: timestamptz("added_at").notNull().defaultNow(),
  },
  (t) => [
    unique("schedule_entries_user_term_crn_key").on(t.userId, t.term, t.crn),
    // Expired/view-only term cleanup deletes by term.
    index("schedule_entries_term_idx").on(t.term),
    termFormat("schedule_entries_term_format", t.term),
    crnFormat("schedule_entries_crn_format", t.crn),
    check("schedule_entries_color_range", sql`${t.color} >= 0`),
  ],
);

// ---------------------------------------------------------------------------------------------
// email_log
// ---------------------------------------------------------------------------------------------

export const emailType = pgEnum("email_type", ["welcome", "goodbye", "class_availability", "custom"]);
export type EmailType = (typeof emailType.enumValues)[number];

/**
 * Audit trail of sent emails (one row per send Resend accepted). Not used for dedup or
 * cooldowns: seat-alert dedup lives on `watched_sections`. `recipient` survives user deletion
 * (`user_id` goes null), e.g. for the goodbye email.
 */
export const emailLog = pgTable(
  "email_log",
  {
    id: identityId(),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    recipient: text("recipient").notNull(),
    type: emailType("type").notNull(),
    /** Section the email was about; required for class_availability. */
    term: termCode(),
    crn: crn(),
    /** The email's Subject line (not a course subject). */
    subject: text("subject"),
    /** Resend message id, for correlating bounces and complaints. */
    providerMessageId: text("provider_message_id"),
    sentAt: timestamptz("sent_at").notNull().defaultNow(),
  },
  (t) => [
    index("email_log_sent_at_idx").on(t.sentAt),
    index("email_log_recipient_type_sent_at_idx").on(t.recipient, t.type, t.sentAt),
    // Keeps ON DELETE SET NULL from scanning the whole log when a user is deleted.
    index("email_log_user_id_idx").on(t.userId),
    termFormat("email_log_term_format", t.term),
    crnFormat("email_log_crn_format", t.crn),
    check(
      "email_log_class_availability_section",
      sql`${t.type} <> 'class_availability' OR (${t.term} IS NOT NULL AND ${t.crn} IS NOT NULL)`,
    ),
  ],
);

// ---------------------------------------------------------------------------------------------
// announcements
// ---------------------------------------------------------------------------------------------

export const announcementLevel = pgEnum("announcement_level", ["info", "warning", "error"]);
export type AnnouncementLevel = (typeof announcementLevel.enumValues)[number];

/**
 * Site-wide banner. Visible while `active AND starts_at <= now() AND (expires_at IS NULL OR
 * expires_at > now())`. Times are instants; the admin UI must convert from the admin's local
 * time (the old backend compared naive browser-local times with server time).
 */
export const announcements = pgTable(
  "announcements",
  {
    id: identityId(),
    message: varchar("message", { length: 500 }).notNull(),
    level: announcementLevel("level").notNull().default("info"),
    active: boolean("active").notNull().default(true),
    startsAt: timestamptz("starts_at").notNull().defaultNow(),
    expiresAt: timestamptz("expires_at"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    check("announcements_message_not_blank", sql`btrim(${t.message}) <> ''`),
    check(
      "announcements_expires_after_start",
      sql`${t.expiresAt} IS NULL OR ${t.expiresAt} > ${t.startsAt}`,
    ),
  ],
);

// ---------------------------------------------------------------------------------------------
// job_runs
// ---------------------------------------------------------------------------------------------

/**
 * One row per cron invocation, for observability. Insert at start (`ok` null = still running,
 * or crashed), then set `finished_at`, `ok` and a small JSON `summary` (counts, never PII).
 */
export const jobRuns = pgTable(
  "job_runs",
  {
    id: identityId(),
    job: text("job").notNull(),
    startedAt: timestamptz("started_at").notNull().defaultNow(),
    finishedAt: timestamptz("finished_at"),
    ok: boolean("ok"),
    summary: jsonb("summary").$type<Record<string, unknown>>(),
  },
  (t) => [index("job_runs_job_started_at_idx").on(t.job, t.startedAt.desc())],
);
