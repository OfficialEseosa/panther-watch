/**
 * Typed browser wrappers for the admin API (`/api/admin/*`); fetching is `./http`. The
 * session cookie rides along and the routes enforce admin + same-origin on mutations.
 *
 * Every call resolves with the parsed body or throws `ApiError` (from `./http`) carrying the
 * HTTP status and the server's `{ error: { code, message } }` message (400s name the bad field,
 * e.g. "summary: this is the detailed export; the files look swapped").
 *
 * Types are imported type-only from the server modules (erased at build time), except the job
 * run, whose server type holds `Date`s that travel as ISO strings.
 */
import type { AdminEmailResult, AdminStats, AdminUser, UserPage } from "@/lib/admin";
import type { GradeUploadResult } from "@/lib/admin/grades";
import type { AdminAnnouncement } from "@/lib/announcements";
import { del, getJson, patchJson, postJson, query } from "./http";

export type { AdminEmailResult, AdminUser, UserPage, AdminAnnouncement, GradeUploadResult };

export type AnnouncementLevel = AdminAnnouncement["level"];

/** `job_runs` row as JSON (timestamps are ISO strings). */
export interface JobRunDto {
  id: number;
  job: string;
  startedAt: string;
  finishedAt: string | null;
  ok: boolean | null;
  summary: Record<string, unknown> | null;
}

export type AdminStatsDto = Omit<AdminStats, "lastWatcherRun"> & { lastWatcherRun: JobRunDto | null };

export interface GradeStatusDto {
  terms: string[];
  lastRun: JobRunDto | null;
  running: boolean;
}

export const JOB_NAMES = ["watcher", "cleanup", "syllabi", "grades"] as const;
export type JobName = (typeof JOB_NAMES)[number];

export interface CreateAnnouncementPayload {
  message: string;
  level?: AnnouncementLevel;
  startsAt?: string;
  expiresAt?: string;
}

export interface UpdateAnnouncementPayload {
  message?: string;
  level?: AnnouncementLevel;
  startsAt?: string;
  expiresAt?: string | null;
  active?: boolean;
}

export interface AdminEmailPayload {
  to: string;
  subject: string;
  htmlBody: string;
  previewText?: string;
}

/** `/api/admin/users` query string; omits empty `q` and default paging. */
export function usersQuery({ q, limit, offset }: { q?: string; limit?: number; offset?: number }): string {
  const text = query({ q: q?.trim(), limit, offset: offset || undefined });
  return text ? `?${text}` : "";
}

export const adminApi = {
  users: (params: { q?: string; limit?: number; offset?: number }, signal?: AbortSignal) =>
    getJson<UserPage>(`/api/admin/users${usersQuery(params)}`, signal),

  announcements: {
    create: (payload: CreateAnnouncementPayload) =>
      postJson<{ announcement: AdminAnnouncement }>("/api/admin/announcements", payload),
    update: (id: number, patch: UpdateAnnouncementPayload) =>
      patchJson<{ announcement: AdminAnnouncement }>(`/api/admin/announcements/${id}`, patch),
    remove: (id: number) => del<void>(`/api/admin/announcements/${id}`),
  },

  sendEmail: (payload: AdminEmailPayload) => postJson<{ email: AdminEmailResult }>("/api/admin/email", payload),

  jobs: (job: string, n = 20, signal?: AbortSignal) =>
    getJson<{ job: string; runs: JobRunDto[] }>(`/api/admin/jobs?${query({ job, n })}`, signal),

  grades: {
    status: (signal?: AbortSignal) => getJson<GradeStatusDto>("/api/admin/grades/status", signal),
    /** Multipart upload of one term's two APEX exports. No progress events (plain fetch). */
    upload: ({ term, summary, detailed }: { term: string; summary: File; detailed: File }) => {
      const form = new FormData();
      form.set("term", term.trim());
      form.set("summary", summary);
      form.set("detailed", detailed);
      return postJson<GradeUploadResult>("/api/admin/grades/upload", form);
    },
    remove: (term: string) => del<void>(`/api/admin/grades/${encodeURIComponent(term)}`),
    /** Best effort; usually fails from servers (Cloudflare challenge on APEX). 202/409/502. */
    refresh: () => postJson<{ started: true; runId: number }>("/api/admin/grades/refresh", undefined),
  },
};
