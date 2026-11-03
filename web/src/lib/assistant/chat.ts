import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { SCOPES } from "@/lib/oauth/scopes";
import type { ToolAuth } from "@/lib/tools/registry";
import { anthropicClient, assistantConfig } from "./config";
import { injectPrefetch, prefetch, prefetchedAnswer, type PrefetchResult } from "./prefetch";
import { addUsage, costMicroUsd, ZERO_USAGE, type AssistantEffort, type AssistantModel, type TokenUsage } from "./pricing";
import { contextNote, SYSTEM_PROMPT } from "./prompt";
import {
  elapsed,
  logTurn,
  NO_PREFETCH,
  timedCallTool,
  type ModelTiming,
  type PrefetchOutcome,
  type ToolTiming,
  type TurnTiming,
} from "./timing";
import { apiTools, toolLabel, toolResultText } from "./tools";

/**
 * One assistant turn: the agentic loop between Claude and the shared PantherWatch tools, run as
 * the signed-in user with every scope. Streams text deltas and tool progress through `emit` as
 * they happen; the caller (the chat route) owns the SSE framing, the budget and the final `done`.
 *
 * Cost controls in here: max_tokens 2048 per model request, low effort (ASSISTANT_EFFORT), at
 * most MAX_TOOL_ROUNDS tool rounds per turn (the request after the last round forbids tools, so
 * the turn always ends in an answer), tool results capped in size, and prompt caching (tools +
 * system prompt are a byte-stable prefix; automatic caching covers the growing conversation,
 * which tool rounds re-read).
 *
 * Latency: when the latest message names courses, src/lib/assistant/prefetch.ts searches them
 * before the first model request, so "Which CSC 4350 sections are open?" takes one model request
 * instead of three; a search_sections (or list_terms) call that repeats it is answered from it. Every turn logs one `assistant.turn` timing line (src/lib/assistant/timing.ts).
 */

export const MAX_TOOL_ROUNDS = 6;
const MAX_TOKENS = 4096;
/** Sonnet and Opus decline some requests for policy reasons; the server-side fallback retries those. */
const FALLBACK_BETA = "server-side-fallback-2026-07-01";

export interface ClientMessage {
  role: "user" | "assistant";
  content: string;
}

export type ErrorCode = "budget" | "rate" | "upstream" | "refusal" | "internal";

export type ChatEvent =
  | { event: "text"; data: { delta: string } }
  | { event: "tool"; data: { id: string; name: string; status: "running" | "done" | "error"; label: string } }
  | { event: "error"; data: { code: ErrorCode; message: string } };

export interface TurnResult {
  /** "done" and "max_tokens" end with a `done` event; the others already emitted `error` (or the client left). */
  outcome: "done" | "max_tokens" | "refusal" | "error" | "aborted";
  errorCode?: ErrorCode;
  usage: TokenUsage;
  costMicro: number;
  /** Model requests made (including the one that failed, if any). */
  requests: number;
  timing: TurnTiming;
}

export interface TurnInput {
  userId: string;
  userName: string | null;
  messages: ClientMessage[];
  signal: AbortSignal;
  emit: (event: ChatEvent) => void;
  now?: Date;
}

export const ERROR_MESSAGES: Record<Exclude<ErrorCode, "budget">, string> = {
  rate: "The assistant is busy right now. Try again in a minute.",
  upstream: "The assistant couldn't reach its AI service. Try again in a moment.",
  refusal: "Sorry, I can't help with that one. Try asking about GSU classes, seats or your schedule.",
  internal: "Something went wrong on PantherWatch's side. Try again in a moment.",
};

const MAX_TOKENS_NOTE = "\n\n(I ran out of room for this answer. Ask me to continue, or narrow the question.)";

/**
 * ASSISTANT_EFFORT when set, else low on every model. On Haiku, low measured faster than medium
 * (first text 3.0 s vs 3.5 s for "Which CSC 4350 sections are open?") with the same tool calls
 * and facts; medium/high spent enough on thinking to hit max_tokens on long answers
 * (docs/runbooks/assistant.md, "Effort").
 */
const effortFor = (configured: AssistantEffort | null): AssistantEffort => configured ?? "low";
const supportsFallback = (model: AssistantModel) => model !== "claude-haiku-5-5";

/** The client's conversation as API messages; the context note leads the first user message. */
export function toApiMessages(messages: ClientMessage[], userName: string | null, now: Date): Anthropic.Beta.BetaMessageParam[] {
  const out: Anthropic.Beta.BetaMessageParam[] = [];
  let first = true;
  for (const message of messages) {
    if (message.role === "assistant") {
      // An empty assistant turn (an earlier error) would be a 400; consecutive user turns are fine.
      if (message.content.trim()) out.push({ role: "assistant", content: message.content });
      continue;
    }
    if (first) {
      out.push({
        role: "user",
        content: [
          { type: "text", text: contextNote(userName, now) },
          { type: "text", text: message.content },
        ],
      });
      first = false;
    } else {
      out.push({ role: "user", content: message.content });
    }
  }
  return out;
}

type Usage = Anthropic.Beta.BetaUsage;

/** Tokens and cost of one response. With a fallback, `usage.iterations` is the per-attempt record. */
function accountFor(usage: Usage | undefined, model: string): { usage: TokenUsage; cost: number } {
  if (!usage) return { usage: ZERO_USAGE, cost: 0 };
  const attempts = (usage.iterations ?? []).filter(
    (i): i is Extract<NonNullable<Usage["iterations"]>[number], { type: "message" | "fallback_message" }> =>
      i.type === "message" || i.type === "fallback_message",
  );
  if (attempts.some((i) => i.type === "fallback_message")) {
    let total = ZERO_USAGE;
    let cost = 0;
    for (const attempt of attempts) {
      const u = {
        input: attempt.input_tokens ?? 0,
        output: attempt.output_tokens ?? 0,
        cacheRead: attempt.cache_read_input_tokens ?? 0,
        cacheWrite: attempt.cache_creation_input_tokens ?? 0,
      };
      total = addUsage(total, u);
      cost += costMicroUsd(attempt.model ?? model, u);
    }
    return { usage: total, cost };
  }
  const u = {
    input: usage.input_tokens ?? 0,
    output: usage.output_tokens ?? 0,
    cacheRead: usage.cache_read_input_tokens ?? 0,
    cacheWrite: usage.cache_creation_input_tokens ?? 0,
  };
  return { usage: u, cost: costMicroUsd(model, u) };
}

/** Thinking tokens within a response's output tokens (null when the API doesn't report them). */
const thinkingTokens = (usage: Usage | undefined): number | null => usage?.output_tokens_details?.thinking_tokens ?? null;

/**
 * The assistant content to send back next round. After a mid-output fallback, blocks before the
 * last `fallback` marker that aren't text belong to the declined attempt and must not be echoed
 * (or run); the marker itself is dropped.
 */
function echoable(content: Anthropic.Beta.BetaContentBlock[]): Anthropic.Beta.BetaContentBlock[] {
  const boundary = content.map((b) => b.type).lastIndexOf("fallback");
  if (boundary < 0) return content;
  return content.filter((block, index) => (index > boundary ? true : block.type === "text"));
}

function classify(error: unknown, signal: AbortSignal): Exclude<ErrorCode, "budget" | "refusal"> | "aborted" {
  if (error instanceof Anthropic.APIUserAbortError || signal.aborted) return "aborted";
  if (error instanceof Anthropic.RateLimitError) return "rate";
  if (error instanceof Anthropic.APIConnectionError) return "upstream";
  if (error instanceof Anthropic.APIError && typeof error.status === "number" && error.status >= 500) return "upstream";
  return "internal";
}

/** False until this function instance has run a turn: its first turn is "cold" in the timing log. */
let warm = false;

interface Trace {
  firstText: number | null;
  models: ModelTiming[];
  tools: ToolTiming[];
  prefetch: PrefetchOutcome;
}

/** One turn, timed: the result carries `timing`, and one `assistant.turn` line is logged however it ends. */
export async function runTurn(input: TurnInput): Promise<TurnResult> {
  const cold = !warm;
  warm = true;
  const started = performance.now();
  const trace: Trace = { firstText: null, models: [], tools: [], prefetch: NO_PREFETCH("none") };
  const timing = (): TurnTiming => ({
    cold,
    total: elapsed(started),
    firstText: trace.firstText,
    modelRequests: trace.models.map((m) => m.ms),
    tools: trace.tools.map((t) => ({ name: t.prefetch ? `prefetch:${t.name}` : t.dedupe ? `dedupe:${t.name}` : t.name, ms: t.ms })),
    models: trace.models,
    toolCalls: trace.tools,
    prefetch: trace.prefetch,
  });
  const emit = (event: ChatEvent) => {
    if (event.event === "text" && trace.firstText === null) trace.firstText = elapsed(started);
    input.emit(event);
  };
  let outcome = "thrown";
  try {
    const result = await turn({ ...input, emit }, trace, (r) => ({ ...r, timing: timing() }));
    outcome = result.outcome;
    return result;
  } finally {
    logTurn({ outcome, model: assistantConfig().model, timing: timing() });
  }
}

async function turn(
  { userId, userName, messages, signal, emit, now = new Date() }: TurnInput,
  trace: Trace,
  finish: (result: Omit<TurnResult, "timing">) => TurnResult,
): Promise<TurnResult> {
  const config = assistantConfig();
  const model = config.model;
  const anthropic = anthropicClient(config);
  const auth: ToolAuth = { userId, scopes: SCOPES, site: true };
  const convo = toApiMessages(messages, userName, now);
  const base = {
    model,
    max_tokens: MAX_TOKENS,
    system: [{ type: "text" as const, text: SYSTEM_PROMPT, cache_control: { type: "ephemeral" as const } }],
    tools: apiTools(),
    output_config: { effort: effortFor(config.effort) },
    cache_control: { type: "ephemeral" as const },
    metadata: { user_id: userId },
    ...(supportsFallback(model) ? { betas: [FALLBACK_BETA], fallbacks: "default" as const } : {}),
  };

  let usage = ZERO_USAGE;
  let costMicro = 0;
  let requests = 0;
  let toolRounds = 0;
  let wroteText = false;
  const result = (outcome: TurnResult["outcome"], errorCode?: ErrorCode): TurnResult =>
    finish({
      outcome,
      ...(errorCode ? { errorCode } : {}),
      usage,
      costMicro,
      requests,
    });

  // The courses the latest message names, searched before the model asks for them.
  let fetched: PrefetchResult | null = null;
  if (config.prefetch) {
    const latest = messages.findLast((m) => m.role === "user")?.content ?? "";
    fetched = await prefetch({ auth, text: latest, signal, emit });
    trace.prefetch = fetched.outcome;
    trace.tools.push(...fetched.tools);
    injectPrefetch(convo, fetched);
  } else {
    trace.prefetch = NO_PREFETCH("off");
  }

  while (true) {
    if (signal.aborted) return result("aborted");
    const lastRound = toolRounds >= MAX_TOOL_ROUNDS;
    requests++;
    const requestStarted = performance.now();
    const stream = anthropic.beta.messages.stream(
      { ...base, messages: convo, ...(lastRound ? { tool_choice: { type: "none" as const } } : {}) },
      { signal },
    );
    let separate = wroteText; // a later round's text starts a new paragraph
    stream.on("text", (delta) => {
      if (!delta) return;
      emit({ event: "text", data: { delta: separate ? `\n\n${delta}` : delta } });
      separate = false;
      wroteText = true;
    });

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
    } catch (error) {
      const partial = accountFor(stream.currentMessage?.usage, stream.currentMessage?.model ?? model);
      usage = addUsage(usage, partial.usage);
      costMicro += partial.cost;
      trace.models.push({ ms: elapsed(requestStarted), ...partial.usage, thinking: thinkingTokens(stream.currentMessage?.usage), stop: "error" });
      const code = classify(error, signal);
      if (code === "aborted") return result("aborted");
      if (code === "internal") {
        const api = error instanceof Anthropic.APIError ? error : undefined;
        // The message and the API's error body never contain the key; both are needed to tell an
        // in-stream `error` event (status undefined) from a client-side failure.
        console.error("assistant: model request failed", {
          status: api?.status,
          type: error instanceof Error ? error.constructor.name : typeof error,
          message: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
          body: api?.error ? JSON.stringify(api.error).slice(0, 500) : undefined,
        });
      }
      emit({ event: "error", data: { code, message: ERROR_MESSAGES[code] } });
      return result("error", code);
    }

    const spent = accountFor(message.usage, message.model ?? model);
    usage = addUsage(usage, spent.usage);
    costMicro += spent.cost;
    trace.models.push({ ms: elapsed(requestStarted), ...spent.usage, thinking: thinkingTokens(message.usage), stop: message.stop_reason ?? null });

    if (message.stop_reason === "refusal") {
      emit({ event: "error", data: { code: "refusal", message: ERROR_MESSAGES.refusal } });
      return result("refusal", "refusal");
    }
    if (message.stop_reason === "max_tokens") {
      // A tool call cut off mid-input is never run.
      emit({ event: "text", data: { delta: MAX_TOKENS_NOTE } });
      return result("max_tokens");
    }

    const content = echoable(message.content);
    const toolUses = content.filter((b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use");
    if (message.stop_reason !== "tool_use" || toolUses.length === 0 || lastRound) return result("done");

    toolRounds++;
    // A search the prefetch already ran (the model sometimes asks again; production logs showed the
    // same search_sections call twice) is answered from it, and list_terms after a prefetch from the
    // in-process term list; neither hits GoSolar nor shows a second line in the UI.
    const prefetched = fetched?.searches.length ? fetched : null;
    const repeated = (call: Anthropic.Beta.BetaToolUseBlock) =>
      prefetched !== null && (call.name === "list_terms" || prefetchedAnswer(prefetched, call.name, call.input) !== null);
    for (const call of toolUses) {
      if (repeated(call)) continue;
      emit({ event: "tool", data: { id: call.id, name: call.name, status: "running", label: toolLabel(call.name, call.input) } });
    }
    // Parallel calls run concurrently; every result goes back in ONE user message.
    const results = await Promise.all(
      toolUses.map(async (call): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        const known = prefetched && prefetchedAnswer(prefetched, call.name, call.input);
        if (known) {
          trace.tools.push({ name: call.name, ms: 0, error: false, prefetch: false, dedupe: true, gosolar: { requests: 0, sessions: 0, ms: 0 } });
          return { type: "tool_result", tool_use_id: call.id, content: known };
        }
        const { output, timing } = await timedCallTool(auth, call.name, call.input);
        const failed = output.isError === true;
        if (repeated(call)) {
          trace.tools.push({ ...timing, dedupe: true });
          return { type: "tool_result", tool_use_id: call.id, content: toolResultText(output), ...(failed ? { is_error: true } : {}) };
        }
        trace.tools.push(timing);
        emit({
          event: "tool",
          data: { id: call.id, name: call.name, status: failed ? "error" : "done", label: toolLabel(call.name, call.input) },
        });
        return { type: "tool_result", tool_use_id: call.id, content: toolResultText(output), ...(failed ? { is_error: true } : {}) };
      }),
    );
    convo.push({ role: "assistant", content: content as unknown as Anthropic.Beta.BetaContentBlockParam[] });
    convo.push({ role: "user", content: results });
  }
}
