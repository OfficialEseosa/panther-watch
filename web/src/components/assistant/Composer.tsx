"use client";

import { useId } from "react";
import type { KeyboardEvent, Ref } from "react";
import { Button } from "@/components/ui/Button";
import { ArrowRightIcon } from "@/components/ui/icons";
import { Textarea } from "@/components/ui/Textarea";
import { LIMITS } from "./stream";
import styles from "./AssistantChat.module.css";

type ComposerProps = {
  value: string;
  onChange: (value: string) => void;
  onSend: () => void;
  onStop: () => void;
  /** A reply is streaming: the textarea is disabled and Send becomes Stop. */
  busy: boolean;
  /** Sending isn't possible (daily limit, chat too long, feature off). */
  blocked: boolean;
  /** Shown under the textarea instead of the keyboard hint. */
  notice?: string | null;
  remaining: number | null;
  textareaRef: Ref<HTMLTextAreaElement>;
};

/** The message box: Enter sends, Shift+Enter adds a line; Stop aborts the reply in flight. */
export function Composer({ value, onChange, onSend, onStop, busy, blocked, notice, remaining, textareaRef }: ComposerProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const near = value.length >= LIMITS.perMessage - 200;

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    if (!busy && !blocked && value.trim()) onSend();
  }

  return (
    <form
      className={styles.composer}
      onSubmit={(event) => {
        event.preventDefault();
        if (!busy && !blocked && value.trim()) onSend();
      }}
    >
      <label htmlFor={`${id}-input`} className="sr-only">
        Message the PantherWatch Assistant
      </label>
      <div className={styles.inputRow}>
        <Textarea
          ref={textareaRef}
          id={`${id}-input`}
          className={styles.input}
          rows={1}
          value={value}
          maxLength={LIMITS.perMessage}
          placeholder="Ask a question"
          disabled={busy || blocked}
          aria-describedby={hintId}
          onChange={(event) => onChange(event.target.value)}
          onKeyDown={onKeyDown}
          enterKeyHint="send"
        />
        {busy ? (
          <Button variant="secondary" onClick={onStop} className={styles.sendButton}>
            Stop
          </Button>
        ) : (
          <Button
            type="submit"
            className={styles.sendButton}
            disabled={blocked || !value.trim()}
            trailingIcon={<ArrowRightIcon />}
          >
            Send
          </Button>
        )}
      </div>
      <div className={styles.footer}>
        <p id={hintId} className={styles.hint}>
          {notice ??
            (near
              ? `${value.length.toLocaleString("en-US")} / ${LIMITS.perMessage.toLocaleString("en-US")} characters`
              : (
                <>
                  <span className={styles.keys}>Enter to send, Shift+Enter for a new line. </span>
                  Answers can be wrong, so check before you register.
                </>
              ))}
        </p>
        {remaining !== null && remaining <= 10 ? (
          <p className={styles.remaining}>
            {remaining === 1 ? "1 message left today" : `${remaining} messages left today`}
          </p>
        ) : null}
      </div>
    </form>
  );
}
