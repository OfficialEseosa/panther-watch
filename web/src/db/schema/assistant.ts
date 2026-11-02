/**
 * Usage counters for the on-site assistant (src/lib/assistant/budget.ts), the hard cost control
 * behind POST /api/assistant/chat. `day` is the America/New_York calendar date, so every limit
 * resets at midnight Eastern. A message is reserved (`messages + 1`) before the model is called
 * and its token usage and cost are added after the turn.
 *
 * `cost_micro_usd` is the cost in millionths of a dollar, priced per model at record time
 * (src/lib/assistant/pricing.ts), so a later price change never rewrites history.
 */
import { sql } from "drizzle-orm";
import { bigint, check, date, index, integer, pgTable, primaryKey, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./core";

const timestamptz = (name: string) => timestamp(name, { withTimezone: true, mode: "date" });

const counters = () => ({
  messages: integer("messages").notNull().default(0),
  inputTokens: bigint("input_tokens", { mode: "number" }).notNull().default(0),
  outputTokens: bigint("output_tokens", { mode: "number" }).notNull().default(0),
  cacheReadTokens: bigint("cache_read_tokens", { mode: "number" }).notNull().default(0),
  cacheWriteTokens: bigint("cache_write_tokens", { mode: "number" }).notNull().default(0),
  costMicroUsd: bigint("cost_micro_usd", { mode: "number" }).notNull().default(0),
  updatedAt: timestamptz("updated_at").notNull().defaultNow(),
});

/** One row per (user, Eastern day) with at least one assistant message. Deleted with the user. */
export const assistantUsage = pgTable(
  "assistant_usage",
  {
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    day: date("day", { mode: "string" }).notNull(),
    ...counters(),
  },
  (t) => [
    primaryKey({ columns: [t.userId, t.day], name: "assistant_usage_pkey" }),
    index("assistant_usage_day_idx").on(t.day),
    check("assistant_usage_messages_nonnegative", sql`${t.messages} >= 0`),
  ],
);

/** Site-wide totals per Eastern day (survives account deletion, so the global cap can't be reset). */
export const assistantDaily = pgTable(
  "assistant_daily",
  {
    day: date("day", { mode: "string" }).primaryKey(),
    ...counters(),
  },
  (t) => [check("assistant_daily_messages_nonnegative", sql`${t.messages} >= 0`)],
);

export type AssistantUsage = typeof assistantUsage.$inferSelect;
export type AssistantDaily = typeof assistantDaily.$inferSelect;
