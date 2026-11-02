"use client";

import { useCallback, useSyncExternalStore } from "react";

/** One tool call the assistant made during a reply, shown as a status line in its bubble. */
export type ToolPart = {
  type: "tool";
  id: string;
  name: string;
  status: "running" | "done" | "error";
  label: string;
};

export type TextPart = { type: "text"; text: string };

export type AssistantStatus = "streaming" | "done" | "stopped" | "error";

/** What went wrong with a reply. `retry` is false when sending again cannot help (budget, validation). */
export type ReplyError = { code: string; message: string; retry: boolean; signIn?: boolean };

export type UserMessage = { id: string; role: "user"; content: string };
export type AssistantMessage = {
  id: string;
  role: "assistant";
  /** Text and tool status lines in the order they streamed. */
  parts: (TextPart | ToolPart)[];
  status: AssistantStatus;
  error?: ReplyError;
  /** When the request went out and when the reply settled (ms since epoch): the "Worked for Ns" line. */
  startedAt?: number;
  endedAt?: number;
};
export type ChatMessage = UserMessage | AssistantMessage;

export type ChatState = {
  messages: ChatMessage[];
  /** Messages left today, from the last `done` event (or 0 after a `budget` refusal). */
  remaining: number | null;
  /** The America/New_York day `remaining` was counted on: the caps reset at midnight Eastern. */
  day?: string;
  /** The route's words for a `budget` refusal (per-student or site-wide cap), shown under the composer. */
  limitMessage?: string;
};

/** Today as the route counts it (budget.ts easternDay): YYYY-MM-DD in America/New_York. */
export function easternDay(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/** `remaining` (and the limit wording) only count for the day they were recorded on. */
export function currentRemaining(state: ChatState | null, today = easternDay()): number | null {
  if (!state || state.remaining === null || state.day !== today) return null;
  return state.remaining;
}

const EMPTY: ChatState = { messages: [], remaining: null };

/** sessionStorage key prefix. Per user, so a different account in the same tab never sees it. */
const PREFIX = "pantherwatch.assistant.";
export const chatKey = (userId: string) => `${PREFIX}${userId}`;

const memory = new Map<string, ChatState>();
const listeners = new Set<() => void>();

function readSession(key: string): ChatState {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<ChatState>;
    if (!Array.isArray(parsed.messages)) return EMPTY;
    const messages = parsed.messages.filter(isMessage).map(settle);
    // A count from an earlier Eastern day is stale: the caps have reset since, so drop it (and the
    // "used today's messages" block that came with it) and let the next response re-derive it.
    const fresh = typeof parsed.remaining === "number" && typeof parsed.day === "string" && parsed.day === easternDay();
    if (!fresh) return { messages, remaining: null };
    return {
      messages,
      remaining: parsed.remaining as number,
      day: parsed.day,
      limitMessage: typeof parsed.limitMessage === "string" ? parsed.limitMessage : undefined,
    };
  } catch {
    return EMPTY;
  }
}

function isMessage(value: unknown): value is ChatMessage {
  if (!value || typeof value !== "object") return false;
  const m = value as Record<string, unknown>;
  if (typeof m.id !== "string") return false;
  if (m.role === "user") return typeof m.content === "string";
  return m.role === "assistant" && Array.isArray(m.parts) && typeof m.status === "string";
}

/** A reply that was still streaming when the page went away can't resume: it becomes an error with Retry. */
function settle(message: ChatMessage): ChatMessage {
  if (message.role !== "assistant" || message.status !== "streaming") return message;
  return {
    ...message,
    parts: message.parts.map((part) => (part.type === "tool" && part.status === "running" ? { ...part, status: "error" } : part)),
    status: "error",
    error: { code: "interrupted", message: "This reply was interrupted.", retry: true },
  };
}

function writeSession(key: string, state: ChatState) {
  try {
    if (state.messages.length === 0) window.sessionStorage.removeItem(key);
    else window.sessionStorage.setItem(key, JSON.stringify(state));
  } catch {
    /* storage unavailable or full: the chat just won't survive a reload */
  }
}

function subscribe(onChange: () => void) {
  listeners.add(onChange);
  return () => {
    listeners.delete(onChange);
  };
}

function snapshot(key: string): ChatState {
  let state = memory.get(key);
  if (!state) {
    state = readSession(key);
    memory.set(key, state);
  }
  return state;
}

/**
 * The conversation for `key`: in memory, mirrored to sessionStorage so it survives a reload.
 * Null during SSR and hydration (the server can't see sessionStorage), so the first paint never
 * flashes the empty state over a stored chat. `set(next, persist)`: streaming deltas pass
 * persist=false and the turn's start and end persist, so a long reply isn't re-serialized per token.
 */
export function useChatState(key: string) {
  const state = useSyncExternalStore(
    subscribe,
    () => snapshot(key),
    () => null,
  );
  const set = useCallback(
    (update: (prev: ChatState) => ChatState, persist = true) => {
      const next = update(snapshot(key));
      memory.set(key, next);
      if (persist) writeSession(key, next);
      for (const listener of listeners) listener();
    },
    [key],
  );
  return [state, set] as const;
}

/** Forgets every stored conversation in this tab (sign-out, or a guest render after a session ended). */
export function clearStoredChats() {
  memory.clear();
  try {
    const keys: string[] = [];
    for (let i = 0; i < window.sessionStorage.length; i++) {
      const k = window.sessionStorage.key(i);
      if (k?.startsWith(PREFIX)) keys.push(k);
    }
    for (const k of keys) window.sessionStorage.removeItem(k);
  } catch {
    /* storage unavailable: nothing was stored */
  }
  for (const listener of listeners) listener();
}

export function textOf(message: ChatMessage): string {
  if (message.role === "user") return message.content;
  return message.parts.map((part) => (part.type === "text" ? part.text : "")).join("");
}

/** A reply's words as the student reads them: text parts only, each trimmed, one blank line apart. */
export function plainText(message: AssistantMessage): string {
  return message.parts
    .map((part) => (part.type === "text" ? part.text.trim() : ""))
    .filter(Boolean)
    .join("\n\n");
}
