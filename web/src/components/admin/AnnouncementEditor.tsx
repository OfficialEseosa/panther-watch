"use client";

import { useId, useState, useSyncExternalStore } from "react";
import type { FormEvent } from "react";
import { AnnouncementBanner } from "@/components/shell/AnnouncementBanner";
import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { Input } from "@/components/ui/Input";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Textarea } from "@/components/ui/Textarea";
import { adminApi, type AdminAnnouncement } from "@/lib/client/admin";
import { useToast } from "@/components/ui/Toast";
import { ApiError, errorMessage, onUnauthorized } from "@/lib/client/http";
import { cn } from "@/lib/ui/cn";
import {
  emptyForm,
  formFromAnnouncement,
  hasErrors,
  LEVEL_LABEL,
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

const noSubscribe = () => () => {};

export type AnnouncementEditorProps = {
  open: boolean;
  /** null: create. */
  editing: AdminAnnouncement | null;
  onClose: () => void;
  onSaved: (announcement: AdminAnnouncement, created: boolean) => void;
};

/**
 * New/Edit announcement Dialog (pages.md §8.3): type, message with a counter, start/end as
 * datetime-local (sent as ISO instants), and a live preview of the real banner.
 */
export function AnnouncementEditor({ open, editing, onClose, onSaved }: AnnouncementEditorProps) {
  const toast = useToast();
  // The browser's zone, read on the client only (the server's zone would be wrong).
  const zone = useSyncExternalStore(noSubscribe, browserZoneLabel, () => null);
  const formId = useId();
  const [values, setValues] = useState<AnnouncementFormValues>(() =>
    editing ? formFromAnnouncement(editing) : emptyForm(),
  );
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
          onClose();
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
  const previewMessage = values.message.trim() || "Your announcement appears here.";

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!saving) onClose();
      }}
      title={editing ? "Edit announcement" : "New announcement"}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={formId} loading={saving}>
            {editing ? "Save changes" : "Publish"}
          </Button>
        </>
      }
    >
      <form id={formId} className={styles.form} onSubmit={onSubmit} noValidate>
        <div className={styles.field}>
          <span className={styles.label} id={`${formId}-level`}>
            Type
          </span>
          <SegmentedControl
            label="Type"
            options={LEVELS.map((level) => ({ value: level, label: LEVEL_LABEL[level] }))}
            value={values.level}
            onChange={(level) => set("level", level)}
          />
        </div>

        <Field
          label="Message"
          required
          error={errors.message}
          hint={
            <span className={cn(styles.counter, length > MESSAGE_MAX && styles.over)}>
              {length}/{MESSAGE_MAX}
            </span>
          }
        >
          <Textarea
            rows={4}
            value={values.message}
            onChange={(event) => set("message", event.target.value)}
            data-autofocus=""
          />
        </Field>

        <div className={styles.dates}>
          <Field label="Starts" hint="Leave empty to start now." error={errors.startsAt}>
            <Input
              type="datetime-local"
              value={values.startsAt}
              onChange={(event) => set("startsAt", event.target.value)}
            />
          </Field>
          <Field label="Ends" hint="Leave empty to keep it up until paused." error={errors.expiresAt}>
            <Input
              type="datetime-local"
              value={values.expiresAt}
              onChange={(event) => set("expiresAt", event.target.value)}
            />
          </Field>
        </div>
        <p className={styles.tzNote}>
          Times are in your time zone{zone ? <>, {zone}</> : null}. The list shows them in Eastern time.
        </p>

        <div className={styles.field}>
          <span className={styles.label}>Preview</span>
          {/* The real banner, inert: no dismiss, no paging, nothing remembered. */}
          <div className={styles.preview} inert aria-hidden="true">
            <AnnouncementBanner announcements={[{ id: "admin-preview", message: previewMessage, level: values.level }]} />
          </div>
        </div>

        {formError ? (
          <Banner tone="danger" role="alert">
            {formError}
          </Banner>
        ) : null}
      </form>
    </Dialog>
  );
}
