import "server-only";
import { env } from "@/lib/env";
import type { AssistantModel } from "./pricing";

/**
 * Assistant settings, from env (see src/lib/env.ts). Tests override them, including the HTTP
 * transport, with `setAssistantConfigForTests`.
 */
export interface AssistantConfig {
  /** Null turns the assistant off. */
  apiKey: string | null;
  model: AssistantModel;
  userDailyMessages: number;
  globalDailyMessages: number;
  globalDailyUsd: number;
  /** Custom fetch for the Anthropic client (tests: a scripted fake). */
  fetch?: typeof fetch;
}

let override: Partial<AssistantConfig> | undefined;

export function assistantConfig(): AssistantConfig {
  return {
    apiKey: env.ANTHROPIC_API_KEY ?? null,
    model: env.ASSISTANT_MODEL,
    userDailyMessages: env.ASSISTANT_USER_DAILY_MESSAGES,
    globalDailyMessages: env.ASSISTANT_GLOBAL_DAILY_MESSAGES,
    globalDailyUsd: env.ASSISTANT_GLOBAL_DAILY_USD,
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
