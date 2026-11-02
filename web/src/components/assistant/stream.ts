import { textOf, type ChatMessage, type ToolPart } from "./chatStore";

/** The route's limits (POST /api/assistant/chat), checked here first so the student gets plain words. */
export const LIMITS = { messages: 30, perMessage: 4000, total: 24000 } as const;

export type WireMessage = { role: "user" | "assistant"; content: string };

export type BuildResult = { ok: true; messages: WireMessage[] } | { ok: false; reason: string };

/**
 * The conversation as the route wants it: text only, empty replies (stopped or failed before any
 * text) dropped, same-role neighbours merged so turns alternate, and long assistant replies cut to
 * the per-message limit (the start of a reply is what the model needs to keep the thread).
 */
export function buildRequest(history: ChatMessage[]): BuildResult {
  const messages: WireMessage[] = [];
  for (const message of history) {
    let content = textOf(message).trim();
    if (!content) continue;
    if (message.role === "assistant" && content.length > LIMITS.perMessage) {
      content = `${content.slice(0, LIMITS.perMessage - 1)}…`;
    }
    const last = messages.at(-1);
    if (last && last.role === message.role) {
      last.content = `${last.content}\n\n${content}`.slice(0, LIMITS.perMessage);
    } else {
      messages.push({ role: message.role, content });
    }
  }
  while (messages.length && messages[0].role !== "user") messages.shift();
  const last = messages.at(-1);
  if (!last || last.role !== "user") return { ok: false, reason: "Type a message first." };
  if (last.content.length > LIMITS.perMessage) {
    return { ok: false, reason: `Messages can be up to ${LIMITS.perMessage.toLocaleString("en-US")} characters.` };
  }
  const total = messages.reduce((sum, m) => sum + m.content.length, 0);
  if (messages.length > LIMITS.messages || total > LIMITS.total) {
    return { ok: false, reason: "This chat is too long to continue. Start a new chat to keep going." };
  }
  return { ok: true, messages };
}

export type StreamEvent =
  | { event: "text"; delta: string }
  | ({ event: "tool" } & Omit<ToolPart, "type">)
  | { event: "done"; remaining: number | null }
  | { event: "error"; code: string; message: string };

/** Reads a `text/event-stream` body and yields the route's events. Unknown events are skipped. */
export async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<StreamEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true }).replace(/\r\n?/g, "\n");
      let end: number;
      while ((end = buffer.indexOf("\n\n")) !== -1) {
        const block = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        const parsed = parseBlock(block);
        if (parsed) yield parsed;
      }
    }
    const tail = parseBlock(buffer);
    if (tail) yield tail;
  } finally {
    reader.releaseLock();
  }
}

function parseBlock(block: string): StreamEvent | null {
  let name = "message";
  const data: string[] = [];
  for (const line of block.split("\n")) {
    if (line.startsWith("event:")) name = line.slice(6).trim();
    else if (line.startsWith("data:")) data.push(line.slice(5).replace(/^ /, ""));
  }
  if (data.length === 0) return null;
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(data.join("\n")) as Record<string, unknown>;
  } catch {
    return null;
  }
  const str = (v: unknown, fallback = "") => (typeof v === "string" ? v : fallback);
  switch (name) {
    case "text":
      return { event: "text", delta: str(payload.delta) };
    case "tool": {
      const status = payload.status === "done" || payload.status === "error" ? payload.status : "running";
      return { event: "tool", id: str(payload.id), name: str(payload.name), status, label: str(payload.label, "Working…") };
    }
    case "done": {
      const remaining = (payload.remaining as { today?: unknown } | undefined)?.today;
      return { event: "done", remaining: typeof remaining === "number" ? remaining : null };
    }
    case "error":
      return { event: "error", code: str(payload.code, "error"), message: str(payload.message, "Something went wrong.") };
    default:
      return null;
  }
}

/** Present-participle stems whose past tense isn't stem + "ed". */
const IRREGULAR: Record<string, string> = {
  Find: "Found",
  Read: "Read",
  Gett: "Got",
  Mak: "Made",
  Writ: "Wrote",
  Remov: "Removed",
  Compar: "Compared",
  Updat: "Updated",
  Sav: "Saved",
  Schedul: "Scheduled",
  Mov: "Moved",
  Us: "Used",
};

/**
 * The tool line once the call finished: "Searching CSC 4350 in Spring 2027…" becomes "Searched CSC
 * 4350 in Spring 2027". A label that is already past tense (the route may send one with `done`)
 * keeps its words and only loses the trailing ellipsis.
 */
export function pastTense(label: string): string {
  const trimmed = label.replace(/\s*(…|\.\.\.)$/, "");
  const match = /^([A-Z][a-z]*?)ing\b(.*)$/.exec(trimmed);
  if (!match) return trimmed;
  const [, stem, rest] = match;
  return `${IRREGULAR[stem] ?? `${stem}ed`}${rest}`;
}
