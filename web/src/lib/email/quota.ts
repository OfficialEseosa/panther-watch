/**
 * Resend free-tier limits. The daily window resets at 00:00 UTC and the monthly one on the
 * 1st at 00:00 UTC. Counting what was sent is the caller's job (it needs the DB); use
 * utcDayStart/utcMonthStart as the lower bounds of those counts.
 */
export const EMAIL_DAILY_LIMIT = 100;
export const EMAIL_MONTHLY_LIMIT = 3000;

/** Emails held back from the watcher so welcome/goodbye emails still go out. */
export const EMAIL_DEFAULT_RESERVE = 10;

export interface RemainingBudgetInput {
  sentTodayUtc: number;
  sentThisMonthUtc: number;
  reserve?: number;
}

export interface RemainingBudget {
  /** Sends left today before Resend refuses. Welcome/goodbye may use all of it. */
  dailyRemaining: number;
  /** Sends left this month before Resend refuses. */
  monthlyRemaining: number;
  /** Seat-alert emails the watcher may still send: the tighter window minus the reserve. */
  watcherBudget: number;
}

function count(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

export function remainingBudget({
  sentTodayUtc,
  sentThisMonthUtc,
  reserve = EMAIL_DEFAULT_RESERVE,
}: RemainingBudgetInput): RemainingBudget {
  const dailyRemaining = Math.max(0, EMAIL_DAILY_LIMIT - count(sentTodayUtc));
  const monthlyRemaining = Math.max(0, EMAIL_MONTHLY_LIMIT - count(sentThisMonthUtc));
  const watcherBudget = Math.max(0, Math.min(dailyRemaining, monthlyRemaining) - count(reserve));
  return { dailyRemaining, monthlyRemaining, watcherBudget };
}

/** 00:00 UTC of the day containing `now`: start of Resend's daily window. */
export function utcDayStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** 00:00 UTC on the 1st of the month containing `now`: start of Resend's monthly window. */
export function utcMonthStart(now: Date = new Date()): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}
