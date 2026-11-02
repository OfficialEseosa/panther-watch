import "server-only";
import { and, eq, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { assistantDaily, assistantUsage } from "@/db/schema";
import { nyDateParts } from "@/lib/format";
import { TokenBucket } from "@/lib/oauth/rate-limit";
import { assistantConfig } from "./config";
import type { TokenUsage } from "./pricing";

/**
 * Cost control for the on-site assistant. Three layers, cheapest first:
 *
 * 1. In memory, per instance (best effort, like src/lib/oauth/rate-limit.ts): one turn in flight
 *    per user, and at most 10 turns a minute.
 * 2. Daily message caps in Postgres: per user (ASSISTANT_USER_DAILY_MESSAGES) and site-wide
 *    (ASSISTANT_GLOBAL_DAILY_MESSAGES). A message is RESERVED atomically before the model is
 *    called, so concurrent requests can't both slip under a cap.
 * 3. A site-wide daily spend cap (ASSISTANT_GLOBAL_DAILY_USD), from the recorded token usage
 *    priced per model. Spend is recorded after each turn, so one turn already in flight can
 *    overshoot it by that turn's cost (bounded by max_tokens and the tool-round cap).
 *
 * Days are America/New_York calendar days: every cap resets at midnight Eastern.
 */

export const RESETS_AT = "midnight Eastern time";

/** "2026-11-01": the Eastern calendar day containing `now`. */
export function easternDay(now: Date = new Date()): string {
  const { year, month, day } = nyDateParts(now);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ------------------------------------------------------------------ in-memory limiter

const turnLimiter = new TokenBucket(10, 10 / 60);
const inFlight = new Set<string>();

export type TurnLock = { ok: true; release: () => void } | { ok: false; message: string };

/** One turn at a time per user, and at most 10 a minute (per instance). */
export function acquireTurn(userId: string): TurnLock {
  if (inFlight.has(userId)) {
    return { ok: false, message: "Your previous message is still being answered. Wait for it to finish, then try again." };
  }
  const wait = turnLimiter.take(userId);
  if (wait > 0) return { ok: false, message: `You're sending messages too quickly. Try again in about ${wait} seconds.` };
  inFlight.add(userId);
  let released = false;
  return {
    ok: true,
    release: () => {
      if (released) return;
      released = true;
      inFlight.delete(userId);
    },
  };
}

export function resetAssistantLimitsForTests(): void {
  turnLimiter.reset();
  inFlight.clear();
}

// ------------------------------------------------------------------ daily caps

export type Reservation =
  | { ok: true; day: string; used: number; limit: number; remainingToday: number }
  | { ok: false; reason: "user" | "global" | "spend"; message: string };

class Rejected extends Error {
  constructor(readonly reason: "user" | "global" | "spend") {
    super(reason);
  }
}

const MESSAGES: Record<"user" | "global" | "spend", string> = {
  user: `You've used all of today's assistant messages. They reset at ${RESETS_AT}.`,
  global: `The assistant has reached its daily limit for everyone. It resets at ${RESETS_AT}.`,
  spend: `The assistant has reached its daily limit for everyone. It resets at ${RESETS_AT}.`,
};

const microUsd = (usd: number) => Math.floor(usd * 1_000_000);

/**
 * Reserves one message for `userId` today (per-user and site-wide counters + 1, in one
 * transaction). Refused, with nothing written, when the user's cap, the site-wide message cap or
 * the site-wide spend cap is reached.
 */
export async function reserveMessage(userId: string, now: Date = new Date()): Promise<Reservation> {
  const { userDailyMessages, globalDailyMessages, globalDailyUsd } = assistantConfig();
  const day = easternDay(now);
  const spendCap = microUsd(globalDailyUsd);
  if (userDailyMessages <= 0) return { ok: false, reason: "user", message: MESSAGES.user };
  if (globalDailyMessages <= 0) return { ok: false, reason: "global", message: MESSAGES.global };
  if (spendCap <= 0) return { ok: false, reason: "spend", message: MESSAGES.spend };
  try {
    const used = await getDb().transaction(async (tx) => {
      const [userRow] = await tx
        .insert(assistantUsage)
        .values({ userId, day, messages: 1 })
        .onConflictDoUpdate({
          target: [assistantUsage.userId, assistantUsage.day],
          set: { messages: sql`${assistantUsage.messages} + 1`, updatedAt: sql`now()` },
          setWhere: sql`${assistantUsage.messages} < ${userDailyMessages}`,
        })
        .returning({ messages: assistantUsage.messages });
      if (!userRow) throw new Rejected("user");
      const [globalRow] = await tx
        .insert(assistantDaily)
        .values({ day, messages: 1 })
        .onConflictDoUpdate({
          target: assistantDaily.day,
          set: { messages: sql`${assistantDaily.messages} + 1`, updatedAt: sql`now()` },
          setWhere: sql`${assistantDaily.messages} < ${globalDailyMessages} AND ${assistantDaily.costMicroUsd} < ${spendCap}`,
        })
        .returning({ messages: assistantDaily.messages });
      if (!globalRow) {
        const [row] = await tx.select({ cost: assistantDaily.costMicroUsd }).from(assistantDaily).where(eq(assistantDaily.day, day));
        throw new Rejected(row && row.cost >= spendCap ? "spend" : "global");
      }
      return userRow.messages;
    });
    return { ok: true, day, used, limit: userDailyMessages, remainingToday: Math.max(0, userDailyMessages - used) };
  } catch (error) {
    if (error instanceof Rejected) return { ok: false, reason: error.reason, message: MESSAGES[error.reason] };
    throw error;
  }
}

/** Adds a finished turn's tokens and cost to the user's and the site-wide row for `day`. */
export async function recordUsage(userId: string, day: string, usage: TokenUsage, costMicro: number): Promise<void> {
  const add = (table: typeof assistantUsage | typeof assistantDaily) => ({
    inputTokens: sql`${table.inputTokens} + ${usage.input}`,
    outputTokens: sql`${table.outputTokens} + ${usage.output}`,
    cacheReadTokens: sql`${table.cacheReadTokens} + ${usage.cacheRead}`,
    cacheWriteTokens: sql`${table.cacheWriteTokens} + ${usage.cacheWrite}`,
    costMicroUsd: sql`${table.costMicroUsd} + ${costMicro}`,
    updatedAt: sql`now()`,
  });
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(assistantUsage)
      .set(add(assistantUsage))
      .where(and(eq(assistantUsage.userId, userId), eq(assistantUsage.day, day)));
    await tx.update(assistantDaily).set(add(assistantDaily)).where(eq(assistantDaily.day, day));
  });
}

/** Gives a reserved message back (the model never answered: rate-limited or unreachable). */
export async function releaseMessage(userId: string, day: string): Promise<void> {
  const db = getDb();
  await db.transaction(async (tx) => {
    await tx
      .update(assistantUsage)
      .set({ messages: sql`GREATEST(${assistantUsage.messages} - 1, 0)`, updatedAt: sql`now()` })
      .where(and(eq(assistantUsage.userId, userId), eq(assistantUsage.day, day)));
    await tx
      .update(assistantDaily)
      .set({ messages: sql`GREATEST(${assistantDaily.messages} - 1, 0)`, updatedAt: sql`now()` })
      .where(eq(assistantDaily.day, day));
  });
}

/** Messages `userId` has left today (for the page; does not reserve). */
export async function remainingToday(userId: string, now: Date = new Date()): Promise<number> {
  const { userDailyMessages } = assistantConfig();
  const [row] = await getDb()
    .select({ messages: assistantUsage.messages })
    .from(assistantUsage)
    .where(and(eq(assistantUsage.userId, userId), eq(assistantUsage.day, easternDay(now))));
  return Math.max(0, userDailyMessages - (row?.messages ?? 0));
}

// ------------------------------------------------------------------ site spend outside chat turns

/**
 * Whether today's site-wide spend has reached ASSISTANT_GLOBAL_DAILY_USD. For model calls made
 * outside a chat turn (syllabus summaries, which the MCP connector can trigger too): they count
 * toward the spend cap but not toward anyone's message count.
 */
export async function spendCapReached(now: Date = new Date()): Promise<boolean> {
  const spendCap = microUsd(assistantConfig().globalDailyUsd);
  if (spendCap <= 0) return true;
  const [row] = await getDb()
    .select({ cost: assistantDaily.costMicroUsd })
    .from(assistantDaily)
    .where(eq(assistantDaily.day, easternDay(now)));
  return (row?.cost ?? 0) >= spendCap;
}

/** Adds tokens and cost to today's site-wide row (created if needed), leaving `messages` alone. */
export async function recordSiteSpend(usage: TokenUsage, costMicro: number, now: Date = new Date()): Promise<void> {
  const day = easternDay(now);
  await getDb()
    .insert(assistantDaily)
    .values({
      day,
      messages: 0,
      inputTokens: usage.input,
      outputTokens: usage.output,
      cacheReadTokens: usage.cacheRead,
      cacheWriteTokens: usage.cacheWrite,
      costMicroUsd: costMicro,
    })
    .onConflictDoUpdate({
      target: assistantDaily.day,
      set: {
        inputTokens: sql`${assistantDaily.inputTokens} + ${usage.input}`,
        outputTokens: sql`${assistantDaily.outputTokens} + ${usage.output}`,
        cacheReadTokens: sql`${assistantDaily.cacheReadTokens} + ${usage.cacheRead}`,
        cacheWriteTokens: sql`${assistantDaily.cacheWriteTokens} + ${usage.cacheWrite}`,
        costMicroUsd: sql`${assistantDaily.costMicroUsd} + ${costMicro}`,
        updatedAt: sql`now()`,
      },
    });
}
