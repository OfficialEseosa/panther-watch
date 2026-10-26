"use client";

import { useId, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import { adminApi, type AdminAnnouncement, type AnnouncementLevel } from "@/lib/client/admin";
import { useToast } from "@/components/ui/Toast";
import { ApiError, errorMessage, onUnauthorized } from "@/lib/client/http";
import { cn } from "@/lib/ui/cn";
import {
  emptyForm,
  formFromAnnouncement,
  hasErrors,
  LEVELS,
  MESSAGE_MAX,
  toCreatePayload,
  toPatchPayload,
  validateAnnouncementForm,
  type AnnouncementFormErrors,
  type AnnouncementFormValues,
} from "./announcementForm";
import { browserZoneLabel } from "./format";
import styles from "./Announcements.module.css";
import adminStyles from "./admin.module.css";

const noSubscribe = () => () => {};

/** The old select labels name the banner color. */
const LEVEL_OPTION: Record<AnnouncementLevel, string> = {
  info: "Info (Blue)",
  warning: "Warning (Orange)",
  error: "Error (Red)",
};

export type AnnouncementEditorProps = {
  /** null: create. */
  editing: AdminAnnouncement | null;
  onCancel: () => void;
  onSaved: (announcement: AdminAnnouncement, created: boolean) => void;
};

/**
 * The old inline announcement form (AnnouncementManager.jsx): message with a counter, type,
 * start and end (datetime-local, sent as ISO instants), Create / Update and Cancel.
 */
export function AnnouncementEditor({ editing, onCancel, onSaved }: AnnouncementEditorProps) {
  const toast = useToast();
  // The browser's zone, read on the client only (the server's zone would be wrong).
  const zone = useSyncExternalStore(noSubscribe, browserZoneLabel, () => null);
  const id = useId();
  const [values, setValues] = useState<AnnouncementFormValues>(() => (editing ? formFromAnnouncement(editing) : emptyForm()));
  const [errors, setErrors] = useState<AnnouncementFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof AnnouncementFormValues>(key: K, value: AnnouncementFormValues[K]) => {
    setValues((current) => ({ ...current, [key]: value }));
    if (errors[key]) setErrors((current) => ({ ...current, [key]: undefined }));
  };

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const found = validateAnnouncementForm(values);
    setErrors(found);
    setFormError(null);
    if (hasErrors(found)) return;
    setSaving(true);
    try {
      if (editing) {
        const patch = toPatchPayload(editing, values);
        if (!patch) {
          onCancel();
          return;
        }
        const { announcement } = await adminApi.announcements.update(editing.id, patch);
        onSaved(announcement, false);
      } else {
        const { announcement } = await adminApi.announcements.create(toCreatePayload(values));
        onSaved(announcement, true);
      }
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        onUnauthorized(toast);
        return;
      }
      const message = errorMessage(error, "Couldn't reach the server.");
      const field = /^(message|level|startsAt|expiresAt):\s*(.*)$/.exec(message);
      if (field) setErrors((current) => ({ ...current, [field[1] as keyof AnnouncementFormValues]: field[2] }));
      else setFormError(message);
    } finally {
      setSaving(false);
    }
  };

  const length = values.message.trim().length;
  const title = editing ? "Edit announcement" : "New announcement";
  const errorOf = (key: keyof AnnouncementFormValues) =>
    errors[key] ? (
      <p id={`${id}-${key}-error`} className={adminStyles.fieldError}>
        {errors[key]}
      </p>
    ) : null;

  return (
    <form className={styles.form} onSubmit={onSubmit} noValidate aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`} className={styles.formTitle}>
        {title}
      </h3>

      <div className={adminStyles.formGroup}>
        <label className={adminStyles.formLabel} htmlFor={`${id}-message`}>
          Message <span aria-hidden="true">*</span>
        </label>
        <textarea
          id={`${id}-message`}
          className={adminStyles.control}
          rows={3}
          value={values.message}
          onChange={(event) => set("message", event.target.value)}
          placeholder="Enter announcement message…"
          aria-invalid={errors.message ? true : undefined}
          aria-describedby={`${id}-message-count`}
          autoFocus
        />
        <p id={`${id}-message-count`} className={cn(adminStyles.hint, length > MESSAGE_MAX && styles.over)}>
          {length}/{MESSAGE_MAX} characters
        </p>
        {errorOf("message")}
      </div>

      <div className={styles.formRow}>
        <div className={adminStyles.formGroup}>
          <label className={adminStyles.formLabel} htmlFor={`${id}-level`}>
            Type
          </label>
          <select
            id={`${id}-level`}
            className={adminStyles.control}
            value={values.level}
            onChange={(event) => set("level", event.target.value as AnnouncementLevel)}
          >
            {LEVELS.map((level) => (
              <option key={level} value={level}>
                {LEVEL_OPTION[level]}
              </option>
            ))}
          </select>
        </div>
        <div className={adminStyles.formGroup}>
          <label className={adminStyles.formLabel} htmlFor={`${id}-starts`}>
            Starts
          </label>
          <input
            id={`${id}-starts`}
            type="datetime-local"
            className={adminStyles.control}
            value={values.startsAt}
            onChange={(event) => set("startsAt", event.target.value)}
            aria-invalid={errors.startsAt ? true : undefined}
          />
          {errors.startsAt ? errorOf("startsAt") : <p className={adminStyles.hint}>Leave empty to start now.</p>}
        </div>
        <div className={adminStyles.formGroup}>
          <label className={adminStyles.formLabel} htmlFor={`${id}-expires`}>
            Expires
          </label>
          <input
            id={`${id}-expires`}
            type="datetime-local"
            className={adminStyles.control}
            value={values.expiresAt}
            onChange={(event) => set("expiresAt", event.target.value)}
            aria-invalid={errors.expiresAt ? true : undefined}
          />
          {errors.expiresAt ? errorOf("expiresAt") : <p className={adminStyles.hint}>Leave empty to keep it up until deactivated.</p>}
        </div>
      </div>
      <p className={adminStyles.hint}>
        Times are in your time zone{zone ? <>, {zone}</> : null}. The list shows them in Eastern time.
      </p>

      {formError ? (
        <p className={adminStyles.notice} data-tone="danger" role="alert">
          {formError}
        </p>
      ) : null}

      <div className={styles.formActions}>
        <button type="submit" className={cn(adminStyles.btn, adminStyles.btnPrimary)} disabled={saving}>
          {saving ? "Saving…" : editing ? "Update Announcement" : "Create Announcement"}
        </button>
        <button type="button" className={cn(adminStyles.btn, adminStyles.btnSecondary)} onClick={onCancel} disabled={saving}>
          Cancel
        </button>
      </div>
    </form>
  );
}
