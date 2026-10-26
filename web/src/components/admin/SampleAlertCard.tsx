"use client";

import { useId, useState } from "react";
import type { FormEvent } from "react";
import { BellIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { adminApi, type SampleAlertPayload } from "@/lib/client/admin";
import { ApiError, errorMessage, onUnauthorized } from "@/lib/client/http";
import { cn } from "@/lib/ui/cn";
import adminStyles from "./admin.module.css";
import styles from "./SampleAlertCard.module.css";

type Fields = Required<SampleAlertPayload>;

const FIELDS: { key: keyof Fields; label: string; placeholder: string; inputMode?: "numeric" }[] = [
  { key: "term", label: "Term", placeholder: "202608", inputMode: "numeric" },
  { key: "subject", label: "Subject", placeholder: "CSC" },
  { key: "courseNumber", label: "Number", placeholder: "1301" },
  { key: "crn", label: "CRN", placeholder: "83410", inputMode: "numeric" },
];

const EMPTY: Fields = { term: "", subject: "", courseNumber: "", crn: "" };

/**
 * "Send me a sample seat alert": emails the signed-in admin the real seat-alert email with a
 * "[TEST]" subject. Leave the fields blank for a sample section, or fill all four to use a
 * real section's live numbers.
 */
export function SampleAlertCard() {
  const toast = useToast();
  const id = useId();
  const [values, setValues] = useState<Fields>(EMPTY);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const filled = FIELDS.filter(({ key }) => values[key].trim() !== "").length;
  const partial = filled > 0 && filled < FIELDS.length;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (partial) {
      setError("Fill in all four fields for a real section, or leave them all blank for a sample.");
      return;
    }
    setError(null);
    setSending(true);
    try {
      const payload: SampleAlertPayload = filled === 0 ? {} : Object.fromEntries(FIELDS.map(({ key }) => [key, values[key].trim()]));
      const { email } = await adminApi.sendSampleAlert(payload);
      toast.success(`Sample alert sent to ${email.to}`, {
        body: `${email.live ? "Live GoSolar numbers." : "Sample section."} Logged as #${email.logId}.`,
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        onUnauthorized(toast);
        return;
      }
      const message = errorMessage(err, "Couldn't reach the server.");
      setError(message);
      toast.error("Sample alert not sent", { body: message });
    } finally {
      setSending(false);
    }
  };

  return (
    <form className={styles.card} onSubmit={onSubmit} noValidate aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className={styles.title}>
        <BellIcon size={18} />
        Send me a sample seat alert
      </h3>
      <p className={adminStyles.muted}>
        Emails you the seat-alert email exactly as students get it, with &ldquo;[TEST]&rdquo; in the subject. Leave
        the fields blank for a sample section, or fill all four to use a real section&rsquo;s live numbers.
      </p>
      <div className={styles.fields}>
        {FIELDS.map(({ key, label, placeholder, inputMode }) => (
          <div key={key} className={adminStyles.formGroup}>
            <label className={adminStyles.formLabel} htmlFor={`${id}-${key}`}>
              {label}
            </label>
            <input
              id={`${id}-${key}`}
              className={adminStyles.control}
              value={values[key]}
              placeholder={placeholder}
              inputMode={inputMode}
              autoComplete="off"
              spellCheck={false}
              onChange={(event) => {
                const value = event.target.value;
                setValues((current) => ({ ...current, [key]: value }));
                setError(null);
              }}
              disabled={sending}
            />
          </div>
        ))}
      </div>
      {error ? (
        <p className={adminStyles.notice} data-tone="danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className={styles.actions}>
        <button type="submit" className={cn(adminStyles.btn, adminStyles.btnPrimary)} disabled={sending}>
          <BellIcon />
          {sending ? "Sending…" : "Send"}
        </button>
      </div>
    </form>
  );
}
