/**
 * A transport-level fake of the Claude Messages API for the assistant tests: a `fetch` to hand
 * the Anthropic SDK (via setAssistantConfigForTests), answering each request with the next
 * scripted reply as a real SSE stream (message_start, content blocks, message_delta,
 * message_stop). No network, no key.
 *
 *   const claude = fakeAnthropic();
 *   setAssistantConfigForTests({ apiKey: "sk-ant-test-dummy", fetch: claude.fetch });
 *   claude.reply({ text: ["Hi ", "there"] });
 *   claude.reply({ tools: [{ name: "list_terms", input: {} }] });
 *   ... run the route ...
 *   claude.requests[0].body.messages
 */

export interface FakeToolUse {
  id?: string;
  name: string;
  input: Record<string, unknown>;
}

export interface FakeUsage {
  input?: number;
  output?: number;
  cacheRead?: number;
  cacheWrite?: number;
}

export type FakeReply =
  | {
      /** Text deltas, streamed in order (before any tool calls). */
      text?: string[];
      tools?: FakeToolUse[];
      /** Defaults: "tool_use" when there are tools, else "end_turn". */
      stopReason?: "end_turn" | "tool_use" | "max_tokens" | "refusal";
      usage?: FakeUsage;
      model?: string;
    }
  /** An HTTP error from the API (not retried by the SDK). */
  | { status: number; errorType: string; message?: string }
  /** Streams message_start and `text`, then never finishes until the request is aborted. */
  | { hang: true; text?: string[]; usage?: FakeUsage };

export interface FakeRequest {
  url: string;
  headers: Headers;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  body: any;
}

export interface FakeAnthropic {
  fetch: typeof fetch;
  requests: FakeRequest[];
  reply(reply: FakeReply): void;
  /** Every later request gets this reply once the queue is empty. */
  replyAlways(reply: FakeReply): void;
  /** Set when a hanging reply saw its request aborted. */
  readonly aborted: boolean;
  reset(): void;
}

const sse = (event: string, data: unknown) => `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;

let ids = 0;

function messageStart(model: string, usage: FakeUsage) {
  return sse("message_start", {
    type: "message_start",
    message: {
      id: `msg_fake_${++ids}`,
      type: "message",
      role: "assistant",
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: usage.input ?? 0,
        output_tokens: 1,
        cache_read_input_tokens: usage.cacheRead ?? 0,
        cache_creation_input_tokens: usage.cacheWrite ?? 0,
      },
    },
  });
}

function textBlock(index: number, deltas: string[]): string {
  return (
    sse("content_block_start", { type: "content_block_start", index, content_block: { type: "text", text: "" } }) +
    deltas.map((text) => sse("content_block_delta", { type: "content_block_delta", index, delta: { type: "text_delta", text } })).join("") +
    sse("content_block_stop", { type: "content_block_stop", index })
  );
}

export function fakeAnthropic(): FakeAnthropic {
  const queue: FakeReply[] = [];
  let fallback: FakeReply | undefined;
  let aborted = false;
  const requests: FakeRequest[] = [];

  const fakeFetch = async (input: RequestInfo | URL, init?: RequestInit): Promise<Response> => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : null;
    requests.push({ url, headers: new Headers(init?.headers), body });
    const reply = queue.shift() ?? fallback;
    if (!reply) throw new Error(`fake Anthropic: no reply scripted for request ${requests.length}`);

    if ("status" in reply) {
      return new Response(JSON.stringify({ type: "error", error: { type: reply.errorType, message: reply.message ?? reply.errorType } }), {
        status: reply.status,
        headers: { "content-type": "application/json", "x-should-retry": "false", "request-id": "req_fake" },
      });
    }

    const model = ("model" in reply && reply.model) || body?.model || "claude-haiku-5-5";
    const usage = reply.usage ?? {};
    const encoder = new TextEncoder();

    if ("hang" in reply) {
      const signal = init?.signal;
      const stream = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(encoder.encode(messageStart(model, usage)));
          controller.enqueue(
            encoder.encode(
              sse("content_block_start", { type: "content_block_start", index: 0, content_block: { type: "text", text: "" } }) +
                (reply.text ?? []).map((text) => sse("content_block_delta", { type: "content_block_delta", index: 0, delta: { type: "text_delta", text } })).join(""),
            ),
          );
          const onAbort = () => {
            aborted = true;
            try {
              controller.error(new DOMException("aborted", "AbortError"));
            } catch {
              // already closed
            }
          };
          if (signal?.aborted) onAbort();
          else signal?.addEventListener("abort", onAbort, { once: true });
        },
      });
      return new Response(stream, { status: 200, headers: { "content-type": "text/event-stream" } });
    }

    const tools = reply.tools ?? [];
    const stopReason = reply.stopReason ?? (tools.length ? "tool_use" : "end_turn");
    let out = messageStart(model, usage);
    let index = 0;
    if (reply.text?.length) out += textBlock(index++, reply.text);
    for (const tool of tools) {
      const id = tool.id ?? `toolu_fake_${++ids}`;
      out +=
        sse("content_block_start", { type: "content_block_start", index, content_block: { type: "tool_use", id, name: tool.name, input: {} } }) +
        sse("content_block_delta", { type: "content_block_delta", index, delta: { type: "input_json_delta", partial_json: JSON.stringify(tool.input) } }) +
        sse("content_block_stop", { type: "content_block_stop", index });
      index++;
    }
    out += sse("message_delta", {
      type: "message_delta",
      delta: {
        stop_reason: stopReason,
        stop_sequence: null,
        ...(stopReason === "refusal" ? { stop_details: { type: "refusal", category: "general_harms", explanation: null } } : {}),
      },
      usage: { output_tokens: usage.output ?? 0 },
    });
    out += sse("message_stop", { type: "message_stop" });
    return new Response(encoder.encode(out), { status: 200, headers: { "content-type": "text/event-stream" } });
  };

  return {
    fetch: fakeFetch as typeof fetch,
    requests,
    reply: (reply) => void queue.push(reply),
    replyAlways: (reply) => {
      fallback = reply;
    },
    get aborted() {
      return aborted;
    },
    reset() {
      queue.length = 0;
      fallback = undefined;
      aborted = false;
      requests.length = 0;
    },
  };
}

export interface SseEvent {
  event: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data: any;
}

/** Parses a whole `text/event-stream` body. */
export function parseSse(text: string): SseEvent[] {
  return text
    .split("\n\n")
    .filter((chunk) => chunk.trim())
    .map((chunk) => {
      const event = /^event: (.*)$/m.exec(chunk)?.[1] ?? "message";
      const data = /^data: (.*)$/m.exec(chunk)?.[1];
      return { event, data: data ? JSON.parse(data) : null };
    });
}
