"use client";

import { useCallback, useLayoutEffect, useRef, useState } from "react";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { PlusIcon } from "@/components/ui/icons";
import { cn } from "@/lib/ui/cn";
import {
  chatKey,
  currentRemaining,
  easternDay,
  useChatState,
  type AssistantMessage,
  type ChatMessage,
  type ChatState,
  type ReplyError,
  type ToolPart,
} from "./chatStore";
import { ChatShell } from "./ChatShell";
import { SUGGESTIONS, UNAVAILABLE_TEXT } from "./copy";
import { Composer } from "./Composer";
import { Message } from "./Message";
import { buildRequest, readEvents, type WireMessage } from "./stream";
import styles from "./AssistantChat.module.css";

const ENDPOINT = "/api/assistant/chat";

type AssistantChatProps = {
  userId: string;
  /** Origins whose URLs render as in-app links (APP_URL's, plus the production hosts). */
  appOrigins: readonly string[];
};

let seq = 0;
const newId = (prefix: string) => `${prefix}-${Date.now().toString(36)}-${(++seq).toString(36)}`;
/** An empty reply about to stream, stamped with when it was asked (the "Thinking… 4s" timer). */
const newReply = (): AssistantMessage => ({
  id: newId("a"),
  role: "assistant",
  parts: [],
  status: "streaming",
  startedAt: Date.now(),
});

/**
 * The on-page assistant: a conversation with POST /api/assistant/chat, streamed over SSE. The
 * conversation lives in sessionStorage (chatStore) so it survives a reload; New chat and sign-out
 * clear it. While a reply streams the composer is disabled and Send becomes Stop (aborts the fetch).
 */
export function AssistantChat({ userId, appOrigins }: AssistantChatProps) {
  const [chat, setChat] = useChatState(chatKey(userId));
  const [draft, setDraft] = useState("");
  const [inFlight, setInFlight] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  const abortRef = useRef<AbortController | null>(null);
  const logRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const stickRef = useRef(true);
  const refocusRef = useRef(false);

  const messages = chat?.messages ?? [];
  // Null once the Eastern day it was counted on has passed (a tab left open over midnight).
  const remaining = currentRemaining(chat);
  const tooLong = messages.length > 0 && !buildRequest([...messages, { id: "probe", role: "user", content: "?" }]).ok;
  const outOfMessages = remaining === 0;
  const blocked = unavailable || outOfMessages || tooLong;

  // Follow the reply as it streams, unless the student scrolled up to read.
  useLayoutEffect(() => {
    const log = logRef.current;
    if (log && stickRef.current) log.scrollTop = log.scrollHeight;
  }, [chat]);

  const updateReply = useCallback(
    (id: string, change: (reply: AssistantMessage) => AssistantMessage, persist = false, extra?: Partial<ChatState>) => {
      setChat(
        (prev) => ({
          ...prev,
          ...extra,
          messages: prev.messages.map((m) => (m.id === id && m.role === "assistant" ? change(m) : m)),
        }),
        persist,
      );
    },
    [setChat],
  );

  const finish = useCallback(
    (id: string, status: AssistantMessage["status"], error?: ReplyError, extra?: Partial<ChatState>) => {
      updateReply(
        id,
        (reply) => ({
          ...reply,
          status,
          error,
          endedAt: Date.now(),
          parts: reply.parts.map((part) =>
            part.type === "tool" && part.status === "running" ? { ...part, status: status === "done" ? "done" : "error" } : part,
          ),
        }),
        true,
        extra,
      );
    },
    [updateReply],
  );

  const run = useCallback(
    async (wire: WireMessage[], replyId: string) => {
      const controller = new AbortController();
      abortRef.current = controller;
      stickRef.current = true;
      setInFlight(true);
      setAnnouncement("");
      let settled = false;
      try {
        const response = await fetch(ENDPOINT, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ messages: wire }),
          signal: controller.signal,
        });
        if (!response.ok || !response.body) {
          const { error, disabled, budget } = await errorFor(response);
          if (disabled) setUnavailable(true);
          finish(replyId, "error", error, budget ? limited(error.message) : undefined);
          settled = true;
          return;
        }
        for await (const event of readEvents(response.body)) {
          if (event.event === "text") {
            if (!event.delta) continue;
            updateReply(replyId, (reply) => {
              const parts = [...reply.parts];
              const last = parts.at(-1);
              if (last?.type === "text") parts[parts.length - 1] = { type: "text", text: last.text + event.delta };
              else parts.push({ type: "text", text: event.delta });
              return { ...reply, parts };
            });
          } else if (event.event === "tool") {
            const part: ToolPart = { type: "tool", id: event.id, name: event.name, status: event.status, label: event.label };
            let isNew = false;
            updateReply(replyId, (reply) => {
              const index = reply.parts.findIndex((p) => p.type === "tool" && p.id === part.id);
              if (index === -1) {
                isNew = true;
                return { ...reply, parts: [...reply.parts, part] };
              }
              const parts = [...reply.parts];
              const prev = parts[index] as ToolPart;
              parts[index] = { ...prev, status: part.status, label: part.label || prev.label };
              return { ...reply, parts };
            });
            // Announced once, when the step starts (the log itself is busy until the reply ends).
            if (isNew && part.status === "running") setAnnouncement(part.label);
          } else if (event.event === "done") {
            finish(
              replyId,
              "done",
              undefined,
              event.remaining === null ? undefined : { remaining: event.remaining, day: easternDay(), limitMessage: undefined },
            );
            settled = true;
          } else if (event.event === "error") {
            const budget = event.code === "budget";
            finish(
              replyId,
              "error",
              { code: event.code, message: event.message, retry: !budget && event.code !== "invalid" },
              budget ? limited(event.message) : undefined,
            );
            settled = true;
          }
        }
        if (!settled) {
          finish(replyId, "error", { code: "cut_off", message: "The reply was cut off before it finished.", retry: true });
          settled = true;
        }
      } catch {
        if (settled) return;
        if (controller.signal.aborted) finish(replyId, "stopped");
        else
          finish(replyId, "error", {
            code: "network",
            message: "Couldn’t reach PantherWatch. Check your connection and try again.",
            retry: true,
          });
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        setInFlight(false);
        if (refocusRef.current) {
          refocusRef.current = false;
          // The textarea was disabled mid-turn, which dropped its focus; give it back without scrolling
          // the page (the composer stays where the student left it).
          requestAnimationFrame(() => textareaRef.current?.focus({ preventScroll: true }));
        }
      }
    },
    [finish, updateReply],
  );

  function send(raw: string) {
    const content = raw.trim();
    if (!content || inFlight || blocked) return;
    const user: ChatMessage = { id: newId("u"), role: "user", content };
    const built = buildRequest([...messages, user]);
    if (!built.ok) {
      setNotice(built.reason);
      return;
    }
    const reply = newReply();
    refocusRef.current = document.activeElement === textareaRef.current;
    setNotice(null);
    setDraft("");
    setChat((prev) => ({ ...prev, messages: [...prev.messages, user, reply] }));
    void run(built.messages, reply.id);
  }

  function retry(replyId: string) {
    if (inFlight) return;
    const index = messages.findIndex((m) => m.id === replyId);
    if (index === -1) return;
    const built = buildRequest(messages.slice(0, index));
    if (!built.ok) {
      setNotice(built.reason);
      return;
    }
    const reply = newReply();
    setChat((prev) => ({ ...prev, messages: [...prev.messages.slice(0, index), reply] }));
    void run(built.messages, reply.id);
  }

  /** Drops the last reply and asks again with the conversation up to the student's message before it. */
  function regenerate(replyId: string) {
    if (inFlight || blocked) return;
    // The button goes away with the reply; keep focus in the conversation rather than on <body>.
    logRef.current?.focus({ preventScroll: true });
    refocusRef.current = false;
    retry(replyId);
  }

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const newChat = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    // A new chat always re-enables the composer: a cap may have reset (midnight Eastern, or an
    // operator), and if it hasn't the route refuses the next message with a fresh 429.
    setChat((prev) => (prev.remaining === 0 ? { messages: [], remaining: null } : { ...prev, messages: [] }));
    setNotice(null);
    setAnnouncement("");
    setDraft("");
    stickRef.current = true;
    textareaRef.current?.focus();
  }, [setChat]);

  const lastId = messages.at(-1)?.id;
  const composerNotice =
    notice ??
    (unavailable
      ? "The assistant isn’t available right now."
      : outOfMessages
        ? (chat?.limitMessage ?? "You’ve used today’s messages. Come back tomorrow.")
        : tooLong
          ? "This chat is too long to continue. Start a new chat to keep going."
          : null);

  return (
    <ChatShell
      actions={
        <Button
          variant="ghost"
          size="sm"
          leadingIcon={<PlusIcon />}
          onClick={newChat}
          disabled={chat === null || (messages.length === 0 && !inFlight)}
        >
          <span className={styles.newChatText}>New chat</span>
        </Button>
      }
    >
      <div
        ref={logRef}
        className={cn(styles.log, messages.length > 0 && styles.logActive)}
        role="log"
        aria-live="polite"
        aria-label="Conversation"
        aria-busy={inFlight || undefined}
        // Scrollable, so it must be reachable by keyboard (axe: scrollable-region-focusable).
        tabIndex={0}
        onScroll={(event) => {
          const el = event.currentTarget;
          stickRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
        }}
      >
        {chat !== null && messages.length === 0 ? (
          <div className={styles.empty}>
            <p className={styles.intro}>
              Ask about open sections, the classes you track or your schedule. It can also track sections and add
              classes to your schedule for you.
            </p>
            {unavailable ? null : (
              <ul className={styles.suggestions} aria-label="Suggestions">
                {SUGGESTIONS.map((prompt) => (
                  <li key={prompt}>
                    <Chip onClick={() => send(prompt)} disabled={blocked}>
                      {prompt}
                    </Chip>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <ol className={styles.messages}>
            {messages.map((message) => (
              <Message
                key={message.id}
                message={message}
                appOrigins={appOrigins}
                onRetry={message.id === lastId && !blocked ? () => retry(message.id) : undefined}
                onRegenerate={message.id === lastId && !blocked && !inFlight ? () => regenerate(message.id) : undefined}
              />
            ))}
          </ol>
        )}
      </div>
      <p className="sr-only" role="status">
        {announcement}
      </p>
      {unavailable ? (
        <Banner tone="info" className={styles.unavailable}>
          {UNAVAILABLE_TEXT}
        </Banner>
      ) : null}
      <Composer
        value={draft}
        onChange={(value) => {
          setDraft(value);
          if (notice) setNotice(null);
        }}
        onSend={() => send(draft)}
        onStop={stop}
        busy={inFlight}
        blocked={blocked}
        notice={composerNotice}
        remaining={remaining}
        textareaRef={textareaRef}
      />
    </ChatShell>
  );
}

/** State after a `budget` refusal: nothing left today, in the route's words (per-student or site-wide cap). */
function limited(message: string): Partial<ChatState> {
  return { remaining: 0, day: easternDay(), limitMessage: message };
}

async function errorFor(response: Response): Promise<{ error: ReplyError; disabled?: boolean; budget?: boolean }> {
  let body: { code?: unknown; message?: unknown } = {};
  try {
    body = (await response.json()) as typeof body;
  } catch {
    /* not JSON */
  }
  const code = typeof body.code === "string" ? body.code : "";
  const message = typeof body.message === "string" && body.message ? body.message : null;
  switch (response.status) {
    case 401:
      return {
        error: {
          code: "unauthorized",
          message: "You’re signed out. Sign in again to keep chatting.",
          retry: false,
          signIn: true,
        },
      };
    case 503:
      if (code === "disabled") {
        return { error: { code, message: "The assistant isn’t available right now.", retry: false }, disabled: true };
      }
      return {
        error: { code: code || "unavailable", message: "The assistant is busy right now. Try again in a moment.", retry: true },
      };
    case 429:
      if (code === "budget") {
        return {
          error: { code, message: message ?? "You’ve used today’s messages. Come back tomorrow.", retry: false },
          budget: true,
        };
      }
      return {
        error: {
          code: code || "rate_limited",
          message: message ?? "That was a lot of messages at once. Wait a moment and try again.",
          retry: true,
        },
      };
    case 400:
      return {
        // The route's 400 text is for developers ("messages.0.content: ..."); students get plain words.
        error: {
          code: code || "invalid",
          message: "That message couldn’t be sent. Try a shorter message, or start a new chat.",
          retry: false,
        },
      };
    default:
      return {
        error: { code: code || `http_${response.status}`, message: "Something went wrong on our side. Try again.", retry: true },
      };
  }
}
