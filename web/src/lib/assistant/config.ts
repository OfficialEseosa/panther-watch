import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "@/lib/env";
import type { AssistantEffort, AssistantModel } from "./pricing";

/**
 * Assistant settings, from env (see src/lib/env.ts). Tests override them, including the HTTP
 * transport, with `setAssistantConfigForTests`.
 */
export interface AssistantConfig {
  /** Null turns the assistant off. */
  apiKey: string | null;
  model: AssistantModel;
  /** output_config.effort; null uses the per-model default (src/lib/assistant/chat.ts). */
  effort: AssistantEffort | null;
  userDailyMessages: number;
  globalDailyMessages: number;
  globalDailyUsd: number;
  /** Search the courses a message names before the first model request (src/lib/assistant/prefetch.ts). */
  prefetch: boolean;
  /** Custom fetch for the Anthropic client (tests: a scripted fake). */
  fetch?: typeof fetch;
}

/** The Anthropic client for the assistant's settings (also used for syllabus summaries). */
export function anthropicClient(config: AssistantConfig): Anthropic {
  return new Anthropic({
    apiKey: config.apiKey,
    authToken: null,
    ...(config.fetch ? { fetch: config.fetch } : {}),
    maxRetries: 1,
    timeout: 45_000,
  });
}

let override: Partial<AssistantConfig> | undefined;

export function assistantConfig(): AssistantConfig {
  return {
    apiKey: env.ANTHROPIC_API_KEY ?? null,
    model: env.ASSISTANT_MODEL,
    effort: env.ASSISTANT_EFFORT ?? null,
    userDailyMessages: env.ASSISTANT_USER_DAILY_MESSAGES,
    globalDailyMessages: env.ASSISTANT_GLOBAL_DAILY_MESSAGES,
    globalDailyUsd: env.ASSISTANT_GLOBAL_DAILY_USD,
    prefetch: env.ASSISTANT_PREFETCH === "on",
    ...override,
  };
}

/**
 * Whether the on-site assistant is on (ANTHROPIC_API_KEY is set). Reads the raw variable rather
 * than the validated env, so a page can call it without demanding every runtime secret.
 */
export function assistantEnabled(): boolean {
  if (override && "apiKey" in override) return !!override.apiKey;
  return !!process.env.ANTHROPIC_API_KEY?.trim();
}

export function setAssistantConfigForTests(config: Partial<AssistantConfig> | undefined): void {
  if (process.env.NODE_ENV !== "test") throw new Error("setAssistantConfigForTests() is only allowed when NODE_ENV=test");
  override = config;
}
