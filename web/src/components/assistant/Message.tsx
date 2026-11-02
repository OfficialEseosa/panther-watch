"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ButtonAnchor, Button } from "@/components/ui/Button";
import {
  AlertCircleIcon,
  CheckIcon,
  ChevronDownIcon,
  CopyIcon,
  RefreshIcon,
  SparkleIcon,
} from "@/components/ui/icons";
import { Spinner } from "@/components/ui/Spinner";
import { useToast } from "@/components/ui/Toast";
import { SIGN_IN_HREF } from "@/components/shell/nav";
import { cn } from "@/lib/ui/cn";
import { plainText, type AssistantMessage, type ChatMessage, type ToolPart } from "./chatStore";
import { RichText } from "./RichText";
import { pastTense } from "./stream";
import styles from "./AssistantChat.module.css";

/** A tool-less reply that settles faster than this gets no "Worked for" line: no noise on quick answers. */
const QUICK_MS = 2000;

type MessageProps = {
  message: ChatMessage;
  appOrigins: readonly string[];
  /** Retry this reply (only offered on the last one). */
  onRetry?: () => void;
};

/** One turn in the log: the student's message (right, tinted) or the assistant's reply (left, with its mark). */
export function Message({ message, appOrigins, onRetry }: MessageProps) {
  if (message.role === "user") {
    return (
      <li className={cn(styles.row, styles.userRow)}>
        <span className="sr-only">You said:</span>
        <p className={styles.userBubble}>{message.content}</p>
      </li>
    );
  }
  const streaming = message.status === "streaming";
  return (
    <li className={cn(styles.row, styles.assistantRow, streaming && styles.inFlight)}>
      <span className={styles.mark} aria-hidden="true">
        <SparkleIcon size={16} />
      </span>
      <div className={styles.reply} aria-busy={streaming || undefined}>
        <span className="sr-only">Assistant said:</span>
        <WorkLog message={message} />
        <ReplyText message={message} appOrigins={appOrigins} />
        {message.status === "stopped" ? <p className={styles.meta}>Stopped</p> : null}
        {message.status === "error" && message.error ? (
          <div className={styles.error}>
            <AlertCircleIcon size={16} aria-hidden="true" className={styles.errorIcon} />
            <p className={styles.errorText}>{message.error.message}</p>
            {message.error.signIn ? (
              <ButtonAnchor href={SIGN_IN_HREF} size="sm" variant="secondary">
                Sign in
              </ButtonAnchor>
            ) : message.error.retry && onRetry ? (
              <Button size="sm" variant="secondary" leadingIcon={<RefreshIcon />} onClick={onRetry}>
                Retry
              </Button>
            ) : null}
          </div>
        ) : null}
        {message.status === "done" || message.status === "stopped" ? (
          <ReplyActions message={message} />
        ) : null}
      </div>
    </li>
  );
}

function ReplyText({ message, appOrigins }: { message: AssistantMessage; appOrigins: readonly string[] }) {
  return message.parts.map((part, i) =>
    part.type === "text" && part.text.trim() ? (
      <p key={i} className={styles.text}>
        {/* Text after a tool step arrives with a leading blank line; the <p> gap already separates it. */}
        <RichText text={part.text.replace(/^\s*\n/, "").trimEnd()} appOrigins={appOrigins} />
      </p>
    ) : null,
  );
}

/**
 * The reply's working state, above its text. In flight: one line, "Thinking… 4s" (or the running
 * tool's label), with the finished steps under it. Settled: "Worked for 6s", a toggle that folds
 * the steps away. A quick tool-less reply settles with no line at all.
 */
function WorkLog({ message }: { message: AssistantMessage }) {
  const stepsId = useId();
  const [toggled, setToggled] = useState<boolean | null>(null);
  const streaming = message.status === "streaming";
  const tools = message.parts.filter((part): part is ToolPart => part.type === "tool");
  const duration =
    message.startedAt !== undefined && message.endedAt !== undefined ? message.endedAt - message.startedAt : null;

  if (!streaming && tools.length === 0 && (duration === null || duration < QUICK_MS)) return null;

  // Steps stay open while the reply works; once it settles they fold, unless one of them failed.
  const open = streaming || (toggled ?? tools.some((tool) => tool.status === "error"));
  // In flight, the running step is the header itself; the lines under it are the finished ones.
  const shown = streaming ? tools.filter((tool) => tool.status !== "running") : tools;
  const worked = duration === null ? "Worked" : `Worked for ${Math.max(1, Math.floor(duration / 1000))}s`;

  let header;
  if (streaming) {
    const running = tools.findLast((tool) => tool.status === "running");
    const hasText = message.parts.some((part) => part.type === "text" && part.text.trim());
    const label = running ? withEllipsis(running.label) : hasText ? "Working…" : "Thinking…";
    header = (
      <p className={cn(styles.tool, styles.toolRunning, styles.workHeader)} data-status="running">
        <Spinner size={14} />
        <span>{label}</span>
        <Elapsed startedAt={message.startedAt} />
      </p>
    );
  } else if (tools.length === 0) {
    header = (
      <p className={cn(styles.tool, styles.workHeader)}>
        <CheckIcon size={14} aria-hidden="true" />
        <span>{worked}</span>
      </p>
    );
  } else {
    header = (
      <button
        type="button"
        className={cn(styles.tool, styles.workHeader, styles.workToggle)}
        aria-expanded={open}
        aria-controls={stepsId}
        onClick={() => setToggled(!open)}
      >
        <CheckIcon size={14} aria-hidden="true" />
        <span>{worked}</span>
        <ChevronDownIcon size={14} aria-hidden="true" className={styles.workChevron} />
      </button>
    );
  }

  return (
    <div className={styles.work}>
      {header}
      {shown.length > 0 ? (
        <div id={stepsId} className={styles.steps} data-open={open || undefined}>
          <div className={styles.stepsClip}>
            <div className={styles.stepsList}>
              {shown.map((part, i) => (
                <ToolLine key={part.id || i} part={part} />
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * Live seconds since the request went out, re-rendered on each whole second. Hidden from screen
 * readers: the log would otherwise read every tick (steps are announced by the status region).
 */
function Elapsed({ startedAt }: { startedAt?: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (startedAt === undefined) return;
    let timer = 0;
    const schedule = () => {
      timer = window.setTimeout(
        () => {
          setNow(Date.now());
          schedule();
        },
        1000 - ((Date.now() - startedAt) % 1000) + 10,
      );
    };
    schedule();
    return () => window.clearTimeout(timer);
  }, [startedAt]);
  if (startedAt === undefined) return null;
  const seconds = Math.floor((now - startedAt) / 1000);
  if (seconds < 1) return null;
  return (
    <span className={styles.elapsed} aria-hidden="true">
      {seconds}s
    </span>
  );
}

/** Copy (the reply's plain text). Under settled replies only. */
function ReplyActions({ message }: { message: AssistantMessage }) {
  const toast = useToast();
  const [copied, setCopied] = useState(false);
  const timer = useRef(0);
  const text = plainText(message);
  useEffect(() => () => window.clearTimeout(timer.current), []);
  if (!text) return null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.clearTimeout(timer.current);
      timer.current = window.setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.info("Couldn’t copy the reply", { body: "Select the text and copy it by hand." });
    }
  };

  return (
    <div className={styles.actions}>
      <Button
        variant="ghost"
        size="sm"
        className={styles.action}
        leadingIcon={copied ? <CheckIcon size={16} /> : <CopyIcon size={16} />}
        onClick={copy}
      >
        {copied ? "Copied" : "Copy"}
      </Button>
    </div>
  );
}

const withEllipsis = (label: string) => (/(…|\.\.\.)$/.test(label) ? label : `${label}…`);

function ToolLine({ part }: { part: ToolPart }) {
  if (part.status === "running") {
    return (
      <p className={cn(styles.tool, styles.toolRunning)} data-status="running">
        <Spinner size={14} />
        <span>{withEllipsis(part.label)}</span>
      </p>
    );
  }
  return (
    <p className={styles.tool} data-status={part.status}>
      {part.status === "error" ? (
        <AlertCircleIcon size={14} aria-hidden="true" />
      ) : (
        <CheckIcon size={14} aria-hidden="true" />
      )}
      <span>{part.status === "error" ? `Couldn’t finish: ${part.label.replace(/\s*(…|\.\.\.)$/, "")}` : pastTense(part.label)}</span>
    </p>
  );
}
