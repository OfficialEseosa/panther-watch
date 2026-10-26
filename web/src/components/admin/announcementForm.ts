import type {
  AdminAnnouncement,
  AnnouncementLevel,
  CreateAnnouncementPayload,
  UpdateAnnouncementPayload,
} from "@/lib/client/admin";

/**
 * Announcement editor form <-> API payload conversion (pure, unit-tested).
 *
 * The form holds `<input type="datetime-local">` values: naive "YYYY-MM-DDTHH:mm" strings in
 * the browser's zone. The API wants ISO instants with an offset, so every value goes through
 * `new Date(local).toISOString()` (the browser parses a naive date-time as local time).
 */

export const MESSAGE_MAX = 500;
export const LEVELS: readonly AnnouncementLevel[] = ["info", "warning", "error"];

export const LEVEL_LABEL: Record<AnnouncementLevel, string> = {
  info: "Info",
  warning: "Warning",
  error: "Error",
};

export const LEVEL_TONE: Record<AnnouncementLevel, "accent" | "warning" | "danger"> = {
  info: "accent",
  warning: "warning",
  error: "danger",
};

export interface AnnouncementFormValues {
  message: string;
  level: AnnouncementLevel;
  /** datetime-local value; "" means "now" on create (the server default). */
  startsAt: string;
  /** datetime-local value; "" means no expiry. */
  expiresAt: string;
}

export type AnnouncementFormErrors = Partial<Record<keyof AnnouncementFormValues, string>>;

const pad = (n: number) => String(n).padStart(2, "0");

/** ISO instant -> datetime-local value in the runtime's local zone ("" for null/invalid). */
export function toLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (!Number.isFinite(date.getTime())) return "";
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/** datetime-local value -> ISO instant with Z, or null when empty/invalid. */
export function fromLocalInput(local: string): string | null {
  const value = local.trim();
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

export function emptyForm(): AnnouncementFormValues {
  return { message: "", level: "info", startsAt: "", expiresAt: "" };
}

export function formFromAnnouncement(announcement: AdminAnnouncement): AnnouncementFormValues {
  return {
    message: announcement.message,
    level: announcement.level,
    startsAt: toLocalInput(announcement.startsAt),
    expiresAt: toLocalInput(announcement.expiresAt),
  };
}

/** Field errors, empty when the form can be submitted. */
export function validateAnnouncementForm(values: AnnouncementFormValues): AnnouncementFormErrors {
  const errors: AnnouncementFormErrors = {};
  const message = values.message.trim();
  if (!message) errors.message = "Write a message.";
  else if (message.length > MESSAGE_MAX) errors.message = `Keep it under ${MESSAGE_MAX} characters.`;
  if (!LEVELS.includes(values.level)) errors.level = "Choose a type.";

  const starts = values.startsAt.trim() ? fromLocalInput(values.startsAt) : undefined;
  const expires = values.expiresAt.trim() ? fromLocalInput(values.expiresAt) : undefined;
  if (starts === null) errors.startsAt = "Enter a valid date and time.";
  if (expires === null) errors.expiresAt = "Enter a valid date and time.";
  if (expires) {
    const startMs = starts ? new Date(starts).getTime() : Date.now();
    if (new Date(expires).getTime() <= startMs) {
      errors.expiresAt = starts ? "Must be after the start." : "Must be in the future.";
    }
  }
  return errors;
}

export function hasErrors(errors: AnnouncementFormErrors): boolean {
  return Object.values(errors).some(Boolean);
}

/** POST body. Empty start = server default (now); empty expiry = none. */
export function toCreatePayload(values: AnnouncementFormValues): CreateAnnouncementPayload {
  const payload: CreateAnnouncementPayload = { message: values.message.trim(), level: values.level };
  const startsAt = fromLocalInput(values.startsAt);
  const expiresAt = fromLocalInput(values.expiresAt);
  if (startsAt) payload.startsAt = startsAt;
  if (expiresAt) payload.expiresAt = expiresAt;
  return payload;
}

/**
 * PATCH body with only the fields that changed (minute precision, since the input drops
 * seconds). A cleared expiry becomes `null`. A cleared start is left alone (the column is
 * required). Returns null when nothing changed.
 */
export function toPatchPayload(
  original: AdminAnnouncement,
  values: AnnouncementFormValues,
): UpdateAnnouncementPayload | null {
  const patch: UpdateAnnouncementPayload = {};
  const message = values.message.trim();
  if (message !== original.message) patch.message = message;
  if (values.level !== original.level) patch.level = values.level;

  if (values.startsAt.trim() && values.startsAt !== toLocalInput(original.startsAt)) {
    const startsAt = fromLocalInput(values.startsAt);
    if (startsAt) patch.startsAt = startsAt;
  }
  if (values.expiresAt !== toLocalInput(original.expiresAt)) {
    patch.expiresAt = fromLocalInput(values.expiresAt);
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

export type AnnouncementGroup = "live" | "scheduled" | "paused" | "expired";

/** Where an announcement sits in the list, at `now`. */
export function announcementGroup(announcement: AdminAnnouncement, now: number = Date.now()): AnnouncementGroup {
  if (!announcement.active) return "paused";
  if (announcement.expiresAt && new Date(announcement.expiresAt).getTime() <= now) return "expired";
  if (new Date(announcement.startsAt).getTime() > now) return "scheduled";
  return "live";
}

export const GROUP_ORDER: readonly AnnouncementGroup[] = ["live", "scheduled", "paused", "expired"];

export const GROUP_LABEL: Record<AnnouncementGroup, string> = {
  live: "Live",
  scheduled: "Scheduled",
  paused: "Paused",
  expired: "Expired",
};

export function groupAnnouncements(
  list: readonly AdminAnnouncement[],
  now: number = Date.now(),
): Record<AnnouncementGroup, AdminAnnouncement[]> {
  const groups: Record<AnnouncementGroup, AdminAnnouncement[]> = { live: [], scheduled: [], paused: [], expired: [] };
  for (const item of list) groups[announcementGroup(item, now)].push(item);
  return groups;
}
