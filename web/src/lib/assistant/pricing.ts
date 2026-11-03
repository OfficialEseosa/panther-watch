/**
 * Claude API prices for the assistant's spend cap, in US dollars per million tokens (first-party
 * API rates; cache writes are the 5-minute TTL, 1.25x input, the only TTL the assistant uses).
 * Checked against the claude-api skill's model table on 2026-11-01.
 *
 * Fallback models appear when a server-side refusal fallback ran (Sonnet/Opus only); an unknown
 * model is priced at the most expensive row, so the cap errs on the safe side.
 */
export interface Price {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const ASSISTANT_MODELS = ["claude-haiku-5-5", "claude-sonnet-5-5", "claude-opus-5-5"] as const;
export type AssistantModel = (typeof ASSISTANT_MODELS)[number];
/** The output_config.effort levels ASSISTANT_EFFORT accepts. */
export type AssistantEffort = "low" | "medium" | "high";

const PRICES: Record<string, Price> = {
  // Prompts of 100K tokens or fewer; HAIKU_LONG applies above that.
  "claude-haiku-5-5": { input: 0.1, output: 0.5, cacheRead: 0.01, cacheWrite: 0.125 },
  "claude-sonnet-5-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5-5": { input: 4, output: 20, cacheRead: 0.2, cacheWrite: 5 },
  // Server-side fallback targets.
  "claude-sonnet-5": { input: 2, output: 10, cacheRead: 0.2, cacheWrite: 2.5 },
  "claude-opus-5": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
  "claude-opus-4-8": { input: 5, output: 25, cacheRead: 0.5, cacheWrite: 6.25 },
};

/** Claude Haiku 5.5's rate card for prompts over 100K tokens. */
const HAIKU_LONG: Price = { input: 0.5, output: 2.5, cacheRead: 0.05, cacheWrite: 0.625 };
const HAIKU_LONG_THRESHOLD = 100_000;

const MOST_EXPENSIVE: Price = Object.values(PRICES).reduce((a, b) => (a.output >= b.output ? a : b));

export interface TokenUsage {
  input: number;
  output: number;
  cacheRead: number;
  cacheWrite: number;
}

export const ZERO_USAGE: TokenUsage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 };

export const addUsage = (a: TokenUsage, b: TokenUsage): TokenUsage => ({
  input: a.input + b.input,
  output: a.output + b.output,
  cacheRead: a.cacheRead + b.cacheRead,
  cacheWrite: a.cacheWrite + b.cacheWrite,
});

export function priceOf(model: string | null | undefined, usage: TokenUsage): Price {
  const price = (model && PRICES[model]) || MOST_EXPENSIVE;
  if (model === "claude-haiku-5-5" && usage.input + usage.cacheRead + usage.cacheWrite > HAIKU_LONG_THRESHOLD) return HAIKU_LONG;
  return price;
}

/** Cost of one model request (one sampling attempt) in micro-dollars (1e-6 USD), rounded up. */
export function costMicroUsd(model: string | null | undefined, usage: TokenUsage): number {
  const price = priceOf(model, usage);
  // $/MTok * tokens = micro-dollars.
  const micro =
    price.input * usage.input + price.output * usage.output + price.cacheRead * usage.cacheRead + price.cacheWrite * usage.cacheWrite;
  return Math.ceil(micro);
}
