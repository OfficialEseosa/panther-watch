import { and, eq, gt, inArray, isNotNull, isNull, lte, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { emailLog, terms, users, watchedSections, type Term } from "@/db/schema";
import { EMAIL_DEFAULT_RESERVE, sendClassAvailabilityEmail, type EmailSent, type EmailTransport } from "@/lib/email";
import { findSectionsByCrn, type CourseData, type FetchLike } from "@/lib/gosolar";
import { defaultJobsGoSolarOptions } from "@/lib/jobs/gosolar-options";
import { errorMessage, finishJobRun, startJobRun } from "@/lib/jobs/runs";
import { isTermExpired, termDisplayName } from "@/lib/jobs/terms";
import { emailBudget } from "./budget";
import { decide, MISSING_RUNS_CAP, observe, REARM_AFTER_MS, type WatchAction } from "./state";

export const WATCHER_JOB = "watcher";
export const DEFAULT_DEADLINE_MS = 25_000;
export const DEFAULT_CONCURRENCY = 4;
/** Resend allows only a few requests per second per team; space seat-alert sends out. */
export const DEFAULT_SEND_SPACING_MS = 500;
const MAX_ERRORS = 20;

export interface RunWatcherOptions {
  /** The run's clock for every state timestamp and the expiry/budget windows. */
  now?: Date;
  /** Stop starting new course groups after this long; the rest wait for the next run. */
  deadlineMs?: number;
  gosolar?: { baseUrl?: string; fetchImpl?: FetchLike; timeoutMs?: number };
  /** Defaults to the process-wide transport (Resend, or what the harness installed). */
  transport?: EmailTransport;
  /** Origin for links in the email. Defaults to env.APP_URL. */
  appUrl?: string;
  /** Emails held back from the daily/monthly budget for welcome/goodbye. Default 10. */
  reserve?: number;
  /** GoSolar searches in flight at once. Default 4. */
  concurrency?: number;
  /** Minimum gap between email sends. Default 500 ms. */
  sendSpacingMs?: number;
  rearmAfterMs?: number;
  /**
   * Test-only hook: awaited after a watch is chosen for an alert and immediately before its
   * atomic claim, e.g. to untrack it or change the user's email "between load and claim".
   */
  beforeClaim?: (watchId: number) => Promise<void>;
}

export interface WatcherSummary extends Record<string, unknown> {
  /** Watches considered (after skipping view-only and expired terms). */
  watches: number;
  /** (term, subject, course number) groups to search. */
  groups: number;
  /** Groups not started before the deadline; they are searched by a later run. */
  carriedOver: number;
  /** Watched sections GoSolar returned a reading for. */
  sectionsChecked: number;
  emailsSent: number;
  emailsFailed: number;
  /** Armed watches whose section was open while the email budget was spent. */
  skippedBudget: number;
  markedClosed: number;
  debounceCleared: number;
  rearmed: number;
  /** Alerts not sent because the claim found the row gone or already notified (untracked or overlapping run). */
  claimsLost: number;
  /** Watches whose CRN was absent from a successful search (missing_runs incremented). */
  sectionsMissing: number;
  /** Watches listed again after being absent (missing_runs reset to 0). */
  sectionsRelisted: number;
  /** Watches skipped because their term is view-only or expired. */
  skippedTerms: number;
  /** Seat alerts the budget allowed when the run started. */
  budgetAtStart: number;
  durationMs: number;
  /** Short, PII-free messages (course codes, CRNs and watch ids only), capped at 20. */
  errors: string[];
}

export type RunWatcherResult =
  | { skipped: "locked" }
  | ({ skipped?: undefined; jobRunId: number } & WatcherSummary);

/**
 * A watch as loaded at the start of the run. Deliberately no email address: the recipient is
 * read from `users` by the claim itself, so an alert always goes to the user's current email.
 */
interface WatchRow {
  id: number;
  term: string;
  crn: string;
  subject: string;
  courseNumber: string;
  courseTitle: string | null;
  instructor: string | null;
  notifiedAt: Date | null;
  lastClosedAt: Date | null;
  userId: string;
}

interface Group {
  term: string;
  subject: string;
  courseNumber: string;
  rows: WatchRow[];
}

interface GroupContext {
  now: Date;
  options: RunWatcherOptions;
  rearmAfterMs: number;
  termsByCode: Map<string, Term>;
  summary: WatcherSummary;
  addError: (message: string) => void;
  /** Shared by all workers; reserved synchronously before each send. */
  budget: { remaining: number };
  throttle: () => Promise<void>;
}

/**
 * One seat-watcher pass. Takes the `job_runs` lock (returns `{ skipped: "locked" }` if another
 * pass is active), searches GoSolar once per (term, subject, course number) group with up to
 * `concurrency` searches in flight, and applies `decide()` to every watch of a group as soon
 * as its search returns. Every state change is its own short conditional UPDATE, so a crash
 * mid-run keeps what was done and overlapping runs cannot double-send. See state.ts.
 */
export async function runWatcher(options: RunWatcherOptions = {}): Promise<RunWatcherResult> {
  const startedAt = performance.now();
  const now = options.now ?? new Date();
  const deadlineMs = options.deadlineMs ?? DEFAULT_DEADLINE_MS;

  const run = await startJobRun(WATCHER_JOB);
  if (!run) return { skipped: "locked" };

  const summary: WatcherSummary = {
    watches: 0,
    groups: 0,
    carriedOver: 0,
    sectionsChecked: 0,
    emailsSent: 0,
    emailsFailed: 0,
    skippedBudget: 0,
    markedClosed: 0,
    debounceCleared: 0,
    rearmed: 0,
    claimsLost: 0,
    sectionsMissing: 0,
    sectionsRelisted: 0,
    skippedTerms: 0,
    budgetAtStart: 0,
    durationMs: 0,
    errors: [],
  };
  const addError = (message: string) => {
    if (summary.errors.length < MAX_ERRORS) summary.errors.push(message);
  };

  try {
    const db = getDb();
    const [allRows, termRows, budget] = await Promise.all([
      db
        .select({
          id: watchedSections.id,
          term: watchedSections.term,
          crn: watchedSections.crn,
          subject: watchedSections.subject,
          courseNumber: watchedSections.courseNumber,
          courseTitle: watchedSections.courseTitle,
          instructor: watchedSections.instructor,
          notifiedAt: watchedSections.notifiedAt,
          lastClosedAt: watchedSections.lastClosedAt,
          userId: watchedSections.userId,
        })
        .from(watchedSections),
      db.select().from(terms),
      emailBudget(db, now, options.reserve ?? EMAIL_DEFAULT_RESERVE),
    ]);

    const termsByCode = new Map<string, Term>(termRows.map((term) => [term.code, term]));
    const rows = allRows.filter((row) => {
      const skip = termsByCode.get(row.term)?.viewOnly === true || isTermExpired(row.term, now);
      if (skip) summary.skippedTerms++;
      return !skip;
    });
    summary.watches = rows.length;
    summary.budgetAtStart = budget.watcherBudget;

    const groups = shuffle(groupWatches(rows));
    summary.groups = groups.length;

    const ctx: GroupContext = {
      now,
      options,
      rearmAfterMs: options.rearmAfterMs ?? REARM_AFTER_MS,
      termsByCode,
      summary,
      addError,
      budget: { remaining: budget.watcherBudget },
      throttle: createThrottle(options.sendSpacingMs ?? DEFAULT_SEND_SPACING_MS),
    };

    let next = 0;
    const worker = async () => {
      while (next < groups.length) {
        if (performance.now() - startedAt >= deadlineMs) return;
        await processGroup(groups[next++], ctx);
      }
    };
    const concurrency = Math.max(1, Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, groups.length));
    await Promise.all(Array.from({ length: concurrency }, worker));
    summary.carriedOver = groups.length - next;
  } catch (error) {
    addError(`fatal: ${errorMessage(error)}`);
    summary.durationMs = Math.round(performance.now() - startedAt);
    await finishJobRun(run.id, false, summary).catch(() => {});
    throw error;
  }

  summary.durationMs = Math.round(performance.now() - startedAt);
  await finishJobRun(run.id, summary.errors.length === 0, summary);
  return { jobRunId: run.id, ...summary };
}

async function processGroup(group: Group, ctx: GroupContext): Promise<void> {
  const label = `${group.subject} ${group.courseNumber} (${group.term})`;
  const crns = [...new Set(group.rows.map((row) => row.crn))];
  let searchFailed = false;
  const sections = await findSectionsByCrn(
    group.term,
    [{ subject: group.subject, courseNumber: group.courseNumber, crns }],
    {
      ...defaultJobsGoSolarOptions(),
      ...ctx.options.gosolar,
      concurrency: 1,
      onError: (_group, error) => {
        searchFailed = true;
        ctx.addError(`search ${label}: ${errorMessage(error)}`);
      },
    },
  );
  // Unknown is not closed: a failed search leaves every watch in the group untouched.
  if (searchFailed) return;
  ctx.summary.sectionsChecked += crns.filter((crn) => sections.has(crn)).length;

  try {
    await recordListing(group, sections, ctx);
  } catch (error) {
    ctx.addError(`listing ${label}: ${errorMessage(error)}`);
  }

  for (const row of group.rows) {
    const section = sections.get(row.crn);
    const action = decide(row, observe(section), ctx.now, ctx.rearmAfterMs);
    try {
      await apply(action, row, section, ctx);
    } catch (error) {
      ctx.addError(`watch ${row.id} ${label} CRN ${row.crn} ${action}: ${errorMessage(error)}`);
    }
  }
}

/**
 * GoSolar answered for this course: count a run against each watched CRN it did not list and
 * reset the count for the ones it did. `missing_runs >= UNLISTED_AFTER_RUNS` is what the
 * tracked page shows as "no longer listed". Never sends anything.
 */
async function recordListing(group: Group, sections: Map<string, CourseData>, ctx: GroupContext): Promise<void> {
  const db = getDb();
  const missing = group.rows.filter((row) => !sections.has(row.crn)).map((row) => row.id);
  const listed = group.rows.filter((row) => sections.has(row.crn)).map((row) => row.id);
  if (missing.length > 0) {
    const counted = await db
      .update(watchedSections)
      .set({
        missingRuns: sql`least(${watchedSections.missingRuns} + 1, ${MISSING_RUNS_CAP})`,
        updatedAt: ctx.now,
      })
      .where(inArray(watchedSections.id, missing))
      .returning({ id: watchedSections.id });
    ctx.summary.sectionsMissing += counted.length;
  }
  if (listed.length > 0) {
    const reset = await db
      .update(watchedSections)
      .set({ missingRuns: 0, updatedAt: ctx.now })
      .where(and(inArray(watchedSections.id, listed), gt(watchedSections.missingRuns, 0)))
      .returning({ id: watchedSections.id });
    ctx.summary.sectionsRelisted += reset.length;
  }
}

async function apply(
  action: WatchAction,
  row: WatchRow,
  section: CourseData | undefined,
  ctx: GroupContext,
): Promise<void> {
  const db = getDb();
  const { now, summary } = ctx;

  switch (action) {
    case "none":
      return;

    case "clear_debounce": {
      const cleared = await db
        .update(watchedSections)
        .set({ lastClosedAt: null, updatedAt: now })
        .where(
          and(
            eq(watchedSections.id, row.id),
            isNotNull(watchedSections.notifiedAt),
            isNotNull(watchedSections.lastClosedAt),
          ),
        )
        .returning({ id: watchedSections.id });
      summary.debounceCleared += cleared.length;
      return;
    }

    case "mark_closed": {
      const marked = await db
        .update(watchedSections)
        .set({ lastClosedAt: now, updatedAt: now })
        .where(
          and(
            eq(watchedSections.id, row.id),
            isNotNull(watchedSections.notifiedAt),
            isNull(watchedSections.lastClosedAt),
          ),
        )
        .returning({ id: watchedSections.id });
      summary.markedClosed += marked.length;
      return;
    }

    case "rearm": {
      const rearmed = await db
        .update(watchedSections)
        .set({ notifiedAt: null, lastClosedAt: null, updatedAt: now })
        .where(
          and(
            eq(watchedSections.id, row.id),
            isNotNull(watchedSections.notifiedAt),
            lte(watchedSections.lastClosedAt, new Date(now.getTime() - ctx.rearmAfterMs)),
          ),
        )
        .returning({ id: watchedSections.id });
      summary.rearmed += rearmed.length;
      return;
    }

    case "notify":
      // decide() only returns notify for an "open" observation, which needs a section.
      if (section) await notify(row, section, ctx);
      return;
  }
}

/**
 * Claim, send, log. The claim is one conditional UPDATE joined to `users`, so it both
 * guarantees at most one email per open episode and reads the recipient's CURRENT address (a
 * watch untracked or an account deleted since the run loaded its rows claims nothing). A
 * failed send releases the claim so the next run retries.
 */
async function notify(row: WatchRow, section: CourseData, ctx: GroupContext): Promise<void> {
  const { now, summary } = ctx;
  if (ctx.budget.remaining <= 0) {
    summary.skippedBudget++;
    return;
  }
  ctx.budget.remaining--;

  const db = getDb();
  await ctx.options.beforeClaim?.(row.id);
  const [recipient] = await db
    .update(watchedSections)
    .set({ notifiedAt: now, lastClosedAt: null, updatedAt: now })
    .from(users)
    .where(
      and(
        eq(watchedSections.id, row.id),
        isNull(watchedSections.notifiedAt),
        eq(users.id, watchedSections.userId),
      ),
    )
    .returning({ email: users.email, name: users.name });
  if (!recipient) {
    // Untracked (or the account was deleted) since the rows were loaded, or an overlapping
    // run claimed it first.
    summary.claimsLost++;
    ctx.budget.remaining++;
    return;
  }

  let sent: EmailSent;
  try {
    await ctx.throttle();
    sent = await sendClassAvailabilityEmail({
      to: recipient.email,
      name: recipient.name,
      transport: ctx.options.transport,
      appUrl: ctx.options.appUrl,
      // Per claim: a transport-level retry of this send is delivered once.
      idempotencyKey: `seat-alert-${row.id}-${now.getTime()}`,
      course: {
        crn: row.crn,
        subject: section.subject ?? row.subject,
        courseNumber: section.courseNumber ?? row.courseNumber,
        title: section.courseTitle ?? row.courseTitle ?? `${row.subject} ${row.courseNumber}`,
        instructor: primaryInstructor(section) ?? row.instructor,
        term: row.term,
        termName: termDisplayName(ctx.termsByCode.get(row.term), row.term),
        seatsAvailable: section.seatsAvailable,
        waitCount: section.waitCount,
      },
    });
  } catch (error) {
    summary.emailsFailed++;
    ctx.budget.remaining = isQuotaError(error) ? 0 : ctx.budget.remaining + 1;
    await db
      .update(watchedSections)
      .set({ notifiedAt: null, updatedAt: now })
      .where(and(eq(watchedSections.id, row.id), eq(watchedSections.notifiedAt, now)));
    throw error;
  }

  summary.emailsSent++;
  await db.insert(emailLog).values({
    userId: row.userId,
    recipient: recipient.email,
    type: "class_availability",
    term: row.term,
    crn: row.crn,
    subject: sent.subject,
    providerMessageId: sent.id,
    sentAt: now,
  });
}

function primaryInstructor(section: CourseData): string | null {
  const faculty = section.faculty ?? [];
  return (faculty.find((f) => f.primaryIndicator) ?? faculty[0])?.displayName ?? null;
}

/** Resend refused for quota or rate: stop sending for the rest of this run. */
function isQuotaError(error: unknown): boolean {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /quota|rate_limit/i.test(code);
}

function groupWatches(rows: WatchRow[]): Group[] {
  const groups = new Map<string, Group>();
  for (const row of rows) {
    const key = `${row.term}|${row.subject}|${row.courseNumber}`;
    let group = groups.get(key);
    if (!group) {
      group = { term: row.term, subject: row.subject, courseNumber: row.courseNumber, rows: [] };
      groups.set(key, group);
    }
    group.rows.push(row);
  }
  return [...groups.values()];
}

/** Random order, so the groups carried over past the deadline are not always the same. */
function shuffle<T>(items: T[]): T[] {
  for (let i = items.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [items[i], items[j]] = [items[j], items[i]];
  }
  return items;
}

/** Serializes callers so consecutive sends start at least `spacingMs` apart. */
function createThrottle(spacingMs: number): () => Promise<void> {
  let nextAt = 0;
  return async () => {
    if (spacingMs <= 0) return;
    const current = performance.now();
    const wait = nextAt - current;
    nextAt = Math.max(current, nextAt) + spacingMs;
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
  };
}
