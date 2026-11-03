import "server-only";
import type { CallToolResult } from "@modelcontextprotocol/server";
import { measureGoSolar, type GoSolarStats } from "@/lib/gosolar";
import { callTool, type ToolAuth } from "@/lib/tools/registry";

/**
 * Per-turn timing of the on-site assistant: one structured log line per turn (`assistant.turn`,
 * console.info JSON) and the `timing` object of the SSE `done` event. Never any user content:
 * tool names, durations, token counts and GoSolar request counts only.
 */

export interface ModelTiming {
  ms: number;
  input: number;
  output: number;
  /** Thinking tokens within `output` (null when the API doesn't report them). */
  thinking: number | null;
  cacheRead: number;
  cacheWrite: number;
  stop: string | null;
}

export interface ToolTiming {
  name: string;
  ms: number;
  /** The tool answered with an error (or, for a prefetch, failed or timed out). */
  error: boolean;
  /** Ran before the first model request (src/lib/assistant/prefetch.ts), not called by the model. */
  prefetch: boolean;
  gosolar: GoSolarStats;
}

export type PrefetchStatus =
  /** ASSISTANT_PREFETCH=off. */
  | "off"
  /** The message names no course (nor a CRN PantherWatch can place). */
  | "none"
  /** No term to search (empty term list) or the term list failed. */
  | "no_term"
  /** Every search finished in time and at least one is in the request. */
  | "used"
  /** Some searches made it into the request; others failed or ran out of time. */
  | "partial"
  /** Every search failed. */
  | "failed"
  /** The time cap passed before any search finished. */
  | "timeout"
  /** The client left during the prefetch. */
  | "aborted";

export interface PrefetchOutcome {
  status: PrefetchStatus;
  /** Wall time the first model request waited for the prefetch. */
  ms: number;
  /** Course references and CRNs found in the message. */
  courses: number;
  crns: number;
  /** Searches run, and how many of them went into the request. */
  searches: number;
  included: number;
}

export const NO_PREFETCH = (status: "off" | "none"): PrefetchOutcome => ({
  status,
  ms: 0,
  courses: 0,
  crns: 0,
  searches: 0,
  included: 0,
});

/** `timing` of the SSE `done` event (the chat UI may ignore it). */
export interface DoneTiming {
  total: number;
  /** Milliseconds to the first answer text; null when the turn produced none. */
  firstText: number | null;
  /** Each model request's duration, in order. */
  modelRequests: number[];
  /** Prefetch searches ("prefetch:search_sections"), then the model's tool calls as they finished. */
  tools: Array<{ name: string; ms: number }>;
}

export interface TurnTiming extends DoneTiming {
  cold: boolean;
  models: ModelTiming[];
  toolCalls: ToolTiming[];
  prefetch: PrefetchOutcome;
}

export const elapsed = (since: number): number => Math.round(performance.now() - since);

/** Runs a registry tool as `auth` and measures it, GoSolar requests included. */
export async function timedCallTool(
  auth: ToolAuth,
  name: string,
  input: unknown,
  { prefetch = false, stats }: { prefetch?: boolean; stats?: GoSolarStats } = {},
): Promise<{ output: CallToolResult; timing: ToolTiming }> {
  const started = performance.now();
  const { value: output, gosolar } = await measureGoSolar(() => callTool(auth, name, input), stats);
  return {
    output,
    timing: { name, ms: elapsed(started), error: output.isError === true, prefetch, gosolar: rounded(gosolar) },
  };
}

export const rounded = (stats: GoSolarStats): GoSolarStats => ({ ...stats, ms: Math.round(stats.ms) });

export function sumGoSolar(tools: readonly ToolTiming[]): GoSolarStats {
  return tools.reduce(
    (sum, t) => ({ requests: sum.requests + t.gosolar.requests, sessions: sum.sessions + t.gosolar.sessions, ms: sum.ms + t.gosolar.ms }),
    { requests: 0, sessions: 0, ms: 0 },
  );
}

export function doneTiming(timing: TurnTiming): DoneTiming {
  return {
    total: timing.total,
    firstText: timing.firstText,
    modelRequests: timing.modelRequests,
    tools: timing.tools,
  };
}

/** The one structured line per turn. */
export function logTurn(fields: { outcome: string; model: string; timing: TurnTiming }): void {
  const { timing } = fields;
  console.info(
    JSON.stringify({
      msg: "assistant.turn",
      outcome: fields.outcome,
      model: fields.model,
      cold: timing.cold,
      totalMs: timing.total,
      firstTextMs: timing.firstText,
      modelRequests: timing.models,
      tools: timing.toolCalls.map(({ name, ms, error, prefetch, gosolar }) => ({ name, ms, error, prefetch, gosolar })),
      prefetch: timing.prefetch,
      gosolar: sumGoSolar(timing.toolCalls),
    }),
  );
}
