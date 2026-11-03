import { after } from "next/server";
import { z } from "zod";
import { guardOrigin } from "@/lib/account/route";
import { acquireTurn, releaseMessage, recordUsage, reserveMessage } from "@/lib/assistant/budget";
import { ERROR_MESSAGES, runTurn, type ClientMessage } from "@/lib/assistant/chat";
import { assistantEnabled } from "@/lib/assistant/config";
import { doneTiming } from "@/lib/assistant/timing";
import { getCurrentUser } from "@/lib/auth/session";

// The model call plus up to six tool rounds; each model request times out well inside this.
export const maxDuration = 60;

const MAX_MESSAGES = 30;
const MAX_MESSAGE_CHARS = 4000;
const MAX_TOTAL_CHARS = 24_000;
const MAX_BODY_BYTES = 128 * 1024;

const bodySchema = z
  .object({
    messages: z
      .array(z.object({ role: z.enum(["user", "assistant"]), content: z.string().max(MAX_MESSAGE_CHARS) }))
      .min(1)
      .max(MAX_MESSAGES),
  })
  .superRefine(({ messages }, ctx) => {
    const total = messages.reduce((sum, m) => sum + m.content.length, 0);
    if (total > MAX_TOTAL_CHARS) ctx.addIssue({ code: "custom", message: `the conversation is too long (over ${MAX_TOTAL_CHARS} characters)` });
    const last = messages[messages.length - 1];
    if (last.role !== "user") ctx.addIssue({ code: "custom", message: "the last message must be from the user" });
    else if (!last.content.trim()) ctx.addIssue({ code: "custom", message: "the message is empty" });
  });

/** JSON error: `{ code, message }` (the assistant contract), plus the site's usual `{ error: { code, message } }`. */
function fail(status: number, code: string, message: string, headers?: HeadersInit): Response {
  return Response.json(
    { code, message, error: { code, message } },
    { status, headers: { "Cache-Control": "private, no-store", ...headers } },
  );
}

async function readBody(request: Request): Promise<{ messages: ClientMessage[] } | { error: string }> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) return { error: "request body is too large" };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { error: "request body must be valid JSON" };
  }
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => (i.path.length ? `${i.path.join(".")}: ${i.message}` : i.message)).join("; ") };
  }
  // A greeting or other assistant text before the student's first message isn't sent to the model.
  const firstUser = parsed.data.messages.findIndex((m) => m.role === "user");
  return { messages: parsed.data.messages.slice(firstUser) };
}

/**
 * POST /api/assistant/chat  body { messages: [{ role: "user" | "assistant", content }] }
 *
 * The on-site assistant: one turn of the conversation (the client keeps the history; the last
 * message must be the user's). Signed-in users only. Answers `text/event-stream`:
 *
 *   event: text   data: { delta }                                   streamed answer text
 *   event: tool   data: { id, name, status, label }                  status running | done | error
 *   event: done   data: { usage: { input, output, cacheRead, cacheWrite }, remaining: { today },
 *                         timing: { total, firstText, modelRequests: [ms], tools: [{ name, ms }] } }
 *   event: error  data: { code, message }                            budget | rate | upstream | refusal | internal; the stream ends
 *
 * Before any stream: 503 { code: "disabled" } without ANTHROPIC_API_KEY, 401 signed out, 403
 * cross-origin, 400 invalid body (at most 30 messages, 4000 characters each, 24000 in all),
 * 429 { code: "rate" } (a turn already running, or more than 10 a minute) and
 * 429 { code: "budget" } (daily caps; resets at midnight Eastern), reserved before the model runs.
 */
export async function POST(request: Request): Promise<Response> {
  if (!assistantEnabled()) return fail(503, "disabled", "The assistant is turned off right now.");
  const user = await getCurrentUser();
  if (!user) return fail(401, "unauthorized", "Sign in to use the assistant.");
  if (guardOrigin(request)) return fail(403, "forbidden", "Cross-origin request refused");

  const body = await readBody(request);
  if ("error" in body) return fail(400, "invalid_request", body.error);

  const lock = acquireTurn(user.id);
  if (!lock.ok) return fail(429, "rate", lock.message);
  let reservation: Awaited<ReturnType<typeof reserveMessage>>;
  try {
    reservation = await reserveMessage(user.id);
  } catch (error) {
    lock.release();
    console.error("assistant: budget reservation failed", error);
    return fail(500, "internal", ERROR_MESSAGES.internal);
  }
  if (!reservation.ok) {
    lock.release();
    return fail(429, "budget", reservation.message);
  }
  const { day, remainingToday } = reservation;

  const abort = new AbortController();
  request.signal?.addEventListener("abort", () => abort.abort(), { once: true });
  const encoder = new TextEncoder();
  let closed = false;
  let controller!: ReadableStreamDefaultController<Uint8Array>;

  const send = (event: string, data: unknown) => {
    if (closed) return;
    try {
      controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    } catch {
      closed = true; // the client went away
    }
  };

  const pump = async () => {
    try {
      const result = await runTurn({
        userId: user.id,
        userName: user.name,
        messages: body.messages,
        signal: abort.signal,
        emit: ({ event, data }) => send(event, data),
      });
      try {
        await recordUsage(user.id, day, result.usage, result.costMicro);
        const neverAnswered =
          result.outcome === "error" &&
          (result.errorCode === "rate" || result.errorCode === "upstream") &&
          result.requests === 1 &&
          result.usage.output === 0;
        if (neverAnswered) await releaseMessage(user.id, day);
      } catch (error) {
        console.error("assistant: recording usage failed", error);
      }
      if (result.outcome === "done" || result.outcome === "max_tokens") {
        send("done", {
          usage: {
            input: result.usage.input,
            output: result.usage.output,
            cacheRead: result.usage.cacheRead,
            cacheWrite: result.usage.cacheWrite,
          },
          remaining: { today: remainingToday },
          timing: doneTiming(result.timing),
        });
      }
    } catch (error) {
      console.error("assistant: turn failed", error);
      send("error", { code: "internal", message: ERROR_MESSAGES.internal });
    } finally {
      lock.release();
      if (!closed) {
        closed = true;
        try {
          controller.close();
        } catch {
          // already closed or cancelled
        }
      }
    }
  };

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
    },
    cancel() {
      closed = true;
      abort.abort();
    },
  });
  // Keeps the function alive until usage is recorded, even if the client leaves mid-turn.
  after(pump());

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
