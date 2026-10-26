"use client";

import { useDeferredValue, useId, useMemo, useState } from "react";
import type { FormEvent } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Chip } from "@/components/ui/Chip";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { MailIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/Input";
import { Textarea } from "@/components/ui/Textarea";
import { useToast } from "@/components/ui/Toast";
import { adminApi, type AdminEmailResult } from "@/lib/client/admin";
import { ApiError, errorMessage, onUnauthorized } from "@/lib/client/http";
import { renderCustomEmail } from "@/lib/email/templates/custom";
import { cn } from "@/lib/ui/cn";
import {
  applyTemplate,
  EMAIL_TEMPLATES,
  fieldFromServerMessage,
  PREVIEW_TEXT_MAX,
  SUBJECT_MAX,
  toEmailPayload,
  validateEmailForm,
  type EmailFormErrors,
  type EmailFormValues,
  type EmailTemplate,
} from "./emailForm";
import styles from "./EmailComposer.module.css";
import { formatNumber, greetingName } from "@/lib/format";

export type EmailRecipient = { email: string; name: string | null; pictureUrl?: string | null };

export type EmailComposerProps = {
  /** Fixed recipient (launched from a user row): shown as a read-only chip. */
  recipient?: EmailRecipient;
  /** Sends left today (Resend's daily window), when known. */
  dailyRemaining?: number | null;
  /** Origin for the preview's logo and links (APP_URL). */
  appUrl: string;
  /** "page": two columns at >= 900 with the preview beside the form. "dialog": stacked. */
  layout?: "page" | "dialog";
  onSent?: (result: AdminEmailResult) => void;
  onCancel?: () => void;
};

type Confirm = { kind: "send" } | { kind: "template"; template: EmailTemplate } | null;

const blank = (to = ""): EmailFormValues => ({ to, subject: "", previewText: "", htmlBody: "" });

/**
 * Custom email composer (pages.md §8.2): recipient, quick templates (the old presets as HTML
 * snippets), subject, inbox preview text, raw HTML body with a live sandboxed preview of the
 * real email layout, and a confirm step before sending.
 */
export function EmailComposer({
  recipient,
  dailyRemaining,
  appUrl,
  layout = "page",
  onSent,
  onCancel,
}: EmailComposerProps) {
  const toast = useToast();
  const formId = useId();
  const [values, setValues] = useState<EmailFormValues>(() => blank(recipient?.email));
  const [errors, setErrors] = useState<EmailFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<Confirm>(null);
  const [sending, setSending] = useState(false);

  const deferred = useDeferredValue(values);
  const previewHtml = useMemo(() => {
    if (!deferred.htmlBody.trim()) return null;
    return renderCustomEmail({
      appUrl,
      subject: deferred.subject,
      htmlBody: deferred.htmlBody,
      previewText: deferred.previewText,
    }).html;
  }, [appUrl, deferred.htmlBody, deferred.subject, deferred.previewText]);

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

  return (
    <div className={cn(styles.composer, layout === "page" && styles.page)}>
      <form id={formId} className={styles.form} onSubmit={onSubmit} noValidate>
        {recipient ? (
          <div className={styles.recipient}>
            <span className={styles.recipientLabel}>To</span>
            <span className={styles.recipientChip}>
              <Avatar src={recipient.pictureUrl} name={recipient.name ?? recipient.email} size={24} />
              <span className={styles.recipientText}>
                {recipient.name ? <span className={styles.recipientName}>{recipient.name}</span> : null}
                <span className={styles.recipientEmail}>{recipient.email}</span>
              </span>
            </span>
          </div>
        ) : (
          <Field label="To" error={errors.to} required>
            <Input
              type="email"
              autoComplete="off"
              spellCheck={false}
              value={values.to}
              onChange={(event) => set("to", event.target.value)}
              placeholder="name@student.gsu.edu"
              data-autofocus=""
            />
          </Field>
        )}

        <div className={styles.templates}>
          <span className={styles.recipientLabel} id={`${formId}-templates`}>
            Quick templates
          </span>
          <div className={styles.chips} role="group" aria-labelledby={`${formId}-templates`}>
            {EMAIL_TEMPLATES.map((template) => (
              <Chip key={template.id} onClick={() => onTemplate(template)} disabled={sending}>
                {template.name}
              </Chip>
            ))}
          </div>
        </div>

        <Field label="Subject" error={errors.subject} required>
          <Input
            value={values.subject}
            maxLength={SUBJECT_MAX}
            onChange={(event) => set("subject", event.target.value)}
            data-autofocus={recipient ? "" : undefined}
          />
        </Field>

        <Field
          label="Preview text"
          hint="Optional. Shown after the subject in most inboxes."
          error={errors.previewText}
        >
          <Input
            value={values.previewText}
            maxLength={PREVIEW_TEXT_MAX}
            onChange={(event) => set("previewText", event.target.value)}
          />
        </Field>

        <Field
          label="Message (HTML)"
          hint="Raw HTML, inserted into the PantherWatch email layout as written. Use <p>, <a>, <strong>, <ul>."
          error={errors.htmlBody}
          required
        >
          <Textarea
            className={styles.body}
            rows={10}
            spellCheck
            value={values.htmlBody}
            onChange={(event) => set("htmlBody", event.target.value)}
          />
        </Field>

        {formError ? (
          <Banner tone="danger" role="alert">
            {formError}
          </Banner>
        ) : null}
        {limitReached ? (
          <Banner tone="warning">The daily email limit is used up. Sends will fail until 00:00 UTC.</Banner>
        ) : null}

        <div className={styles.actions}>
          {dailyRemaining != null ? (
            <Badge tone={dailyRemaining <= 10 ? "warning" : "neutral"} className={styles.budget}>
              {formatNumber(dailyRemaining)} left today
            </Badge>
          ) : null}
          <div className={styles.buttons}>
            {onCancel ? (
              <Button variant="secondary" onClick={onCancel} disabled={sending}>
                Cancel
              </Button>
            ) : null}
            <Button type="submit" leadingIcon={<MailIcon />} loading={sending}>
              Send email
            </Button>
          </div>
        </div>
      </form>

      <section className={styles.preview} aria-label="Email preview">
        <span className={styles.recipientLabel}>Preview</span>
        {previewHtml ? (
          <iframe
            className={styles.frame}
            title="Email preview"
            sandbox=""
            srcDoc={previewHtml}
            referrerPolicy="no-referrer"
          />
        ) : (
          <div className={styles.previewEmpty}>The preview appears here as you write the message.</div>
        )}
      </section>

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
