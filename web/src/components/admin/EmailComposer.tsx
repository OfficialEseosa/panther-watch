"use client";

import { useId, useState } from "react";
import type { FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { MailIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { adminApi, type AdminEmailResult } from "@/lib/client/admin";
import { ApiError, errorMessage, onUnauthorized } from "@/lib/client/http";
import { cn } from "@/lib/ui/cn";
import {
  applyTemplate,
  EMAIL_TEMPLATES,
  fieldFromServerMessage,
  SUBJECT_MAX,
  toEmailPayload,
  validateEmailForm,
  type EmailFormErrors,
  type EmailFormValues,
  type EmailTemplate,
} from "./emailForm";
import styles from "./EmailComposer.module.css";
import adminStyles from "./admin.module.css";
import { formatNumber, greetingName } from "@/lib/format";

export type EmailRecipient = { email: string; name: string | null; pictureUrl?: string | null };

export type EmailComposerProps = {
  /** Fixed recipient (launched from a user card): shown in the recipient strip. */
  recipient?: EmailRecipient;
  /** Sends left today (Resend's daily window), when known. */
  dailyRemaining?: number | null;
  /** "page": inside the Email tab card. "dialog": inside the Compose email dialog. */
  layout?: "page" | "dialog";
  onSent?: (result: AdminEmailResult) => void;
  onCancel?: () => void;
};

type Confirm = { kind: "send" } | { kind: "template"; template: EmailTemplate } | null;

const blank = (to = ""): EmailFormValues => ({ to, subject: "", previewText: "", htmlBody: "" });

/**
 * The old email composer (EmailComposer.jsx): recipient strip, quick templates, subject and
 * message, status line, Cancel / Send email. The message is HTML inserted into the PantherWatch
 * email layout; sending asks for confirmation first.
 */
export function EmailComposer({ recipient, dailyRemaining, layout = "page", onSent, onCancel }: EmailComposerProps) {
  const toast = useToast();
  const id = useId();
  const [values, setValues] = useState<EmailFormValues>(() => blank(recipient?.email));
  const [errors, setErrors] = useState<EmailFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [sending, setSending] = useState(false);

  const set = <K extends keyof EmailFormValues>(key: K, value: EmailFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const name = greetingName(recipient ?? { email: values.to });
  const limitReached = dailyRemaining === 0;

  const onTemplate = (template: EmailTemplate) => {
    if (values.htmlBody.trim()) setConfirm({ kind: "template", template });
    else setValues((current) => applyTemplate(current, template, name));
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateEmailForm(values);
    setErrors(found);
    setFormError(null);
    if (Object.values(found).some(Boolean)) return;
    setConfirm({ kind: "send" });
  };

  const send = async () => {
    setSending(true);
    try {
      const { email } = await adminApi.sendEmail(toEmailPayload(values));
      setConfirm(null);
      toast.success(`Email sent to ${recipient?.name || email.to}`, { body: `Logged as #${email.logId}.` });
      setValues(blank(recipient?.email));
      setErrors({});
      onSent?.(email);
    } catch (error) {
      setConfirm(null);
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized(toast);
        return;
      }
      const message = errorMessage(error, "Couldn't reach the server.");
      const field = fieldFromServerMessage(message);
      if (field) setErrors((current) => ({ ...current, [field]: message.replace(/^\w+:\s*/, "") }));
      else setFormError(message);
      toast.error("Email not sent", { body: message });
    } finally {
      setSending(false);
    }
  };

  const recipientLabel = recipient ? recipient.name || recipient.email : values.to.trim();
  const fieldError = (key: keyof EmailFormValues) =>
    errors[key] ? (
      <p id={`${id}-${key}-error`} className={adminStyles.fieldError}>
        {errors[key]}
      </p>
    ) : null;

  return (
    <div className={cn(styles.composer, layout === "dialog" && styles.inDialog)}>
      {recipient ? (
        <div className={styles.recipient}>
          <div className={adminStyles.avatar} aria-hidden="true">
            {recipient.pictureUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- remote Google avatar, decorative
              <img src={recipient.pictureUrl} alt="" referrerPolicy="no-referrer" />
            ) : (
              (recipient.name || recipient.email).charAt(0).toUpperCase()
            )}
          </div>
          <div className={styles.recipientDetails}>
            <p className={styles.recipientName}>
              <span className="sr-only">To: </span>
              {recipient.name || recipient.email.split("@")[0]}
            </p>
            <p className={styles.recipientEmail}>{recipient.email}</p>
          </div>
        </div>
      ) : null}

      <div className={styles.templates}>
        <h4 id={`${id}-templates`}>Quick templates</h4>
        <div className={styles.templateButtons} role="group" aria-labelledby={`${id}-templates`}>
          {EMAIL_TEMPLATES.map((template) => (
            <button key={template.id} type="button" className={styles.templateBtn} onClick={() => onTemplate(template)} disabled={sending}>
              {template.name}
            </button>
          ))}
        </div>
      </div>

      <form className={styles.form} onSubmit={onSubmit} noValidate>
        {recipient ? null : (
          <div className={adminStyles.formGroup}>
            <label className={adminStyles.formLabel} htmlFor={`${id}-to`}>
              To
            </label>
            <input
              id={`${id}-to`}
              type="email"
              className={adminStyles.control}
              autoComplete="off"
              spellCheck={false}
              value={values.to}
              onChange={(event) => set("to", event.target.value)}
              placeholder="name@student.gsu.edu"
              aria-invalid={errors.to ? true : undefined}
              aria-describedby={errors.to ? `${id}-to-error` : undefined}
            />
            {fieldError("to")}
          </div>
        )}

        <div className={adminStyles.formGroup}>
          <label className={adminStyles.formLabel} htmlFor={`${id}-subject`}>
            Subject
          </label>
          <input
            id={`${id}-subject`}
            className={adminStyles.control}
            value={values.subject}
            maxLength={SUBJECT_MAX}
            onChange={(event) => set("subject", event.target.value)}
            placeholder="Enter email subject"
            aria-invalid={errors.subject ? true : undefined}
            aria-describedby={errors.subject ? `${id}-subject-error` : undefined}
            disabled={sending}
          />
          {fieldError("subject")}
        </div>

        <div className={adminStyles.formGroup}>
          <label className={adminStyles.formLabel} htmlFor={`${id}-body`}>
            Message (HTML)
          </label>
          <textarea
            id={`${id}-body`}
            className={cn(adminStyles.control, styles.body)}
            rows={10}
            value={values.htmlBody}
            onChange={(event) => set("htmlBody", event.target.value)}
            placeholder="<p>Write your message</p>"
            aria-invalid={errors.htmlBody ? true : undefined}
            aria-describedby={`${id}-body-hint`}
            disabled={sending}
          />
          {errors.htmlBody ? (
            fieldError("htmlBody")
          ) : (
            <p id={`${id}-body-hint`} className={adminStyles.hint}>
              Inserted into the PantherWatch email layout as written. Use &lt;p&gt;, &lt;a&gt;, &lt;strong&gt;, &lt;ul&gt;.
            </p>
          )}
        </div>

        {formError ? (
          <p className={adminStyles.notice} data-tone="danger" role="alert">
            {formError}
          </p>
        ) : null}
        {limitReached ? (
          <p className={adminStyles.notice} data-tone="warning">
            The daily email limit is used up. Sends will fail until 00:00 UTC.
          </p>
        ) : null}

        <div className={styles.actions}>
          {dailyRemaining != null ? <span className={adminStyles.muted}>{formatNumber(dailyRemaining)} left today</span> : <span />}
          <div className={styles.buttons}>
            {onCancel ? (
              <button type="button" className={cn(adminStyles.btn, adminStyles.btnSecondary)} onClick={onCancel} disabled={sending}>
                Cancel
              </button>
            ) : null}
            <button type="submit" className={cn(adminStyles.btn, adminStyles.btnPrimary)} disabled={sending}>
              <MailIcon />
              {sending ? "Sending…" : "Send email"}
            </button>
          </div>
        </div>
      </form>

      <Dialog
        open={confirm !== null}
        onClose={() => {
          if (!sending) setConfirm(null);
        }}
        size="sm"
        title={confirm?.kind === "template" ? "Replace the message?" : "Send this email?"}
        footer={
          confirm?.kind === "template" ? (
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)}>
                Keep my message
              </Button>
              <Button
                data-autofocus=""
                onClick={() => {
                  const template = confirm.template;
                  setValues((current) => applyTemplate(current, template, name));
                  setConfirm(null);
                }}
              >
                Replace
              </Button>
            </>
          ) : (
            <>
              <Button variant="secondary" onClick={() => setConfirm(null)} disabled={sending}>
                Cancel
              </Button>
              <Button data-autofocus="" leadingIcon={<MailIcon />} loading={sending} onClick={send}>
                Send email
              </Button>
            </>
          )
        }
      >
        {confirm?.kind === "template" ? (
          <p className={styles.confirmText}>
            &ldquo;{confirm.template.name}&rdquo; replaces the message you&rsquo;ve written. This can&rsquo;t be undone.
          </p>
        ) : (
          <p className={styles.confirmText}>
            <strong>{values.subject.trim()}</strong> goes to <strong>{recipientLabel}</strong> right away. Emails
            can&rsquo;t be recalled.
          </p>
        )}
      </Dialog>
    </div>
  );
}
