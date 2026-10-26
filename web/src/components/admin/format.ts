/**
 * Pure display helpers for the admin pages. No React, no DOM: safe on the server and the
 * client, and unit-tested. Dates render in GSU's time zone so server and client markup match.
 */

import { formatNumber, NY_TZ } from "@/lib/format";

const ADMIN_TIME_ZONE = NY_TZ;

/** Six-digit term code like 202605. */
export function isTermCode(value: string): boolean {
  return /^\d{6}$/.test(value.trim());
}

const dateFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: ADMIN_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
});

const dateTimeFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: ADMIN_TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
});

const dateTimeZoneFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: ADMIN_TIME_ZONE,
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

const dateTimeYearFormat = new Intl.DateTimeFormat("en-US", {
  timeZone: ADMIN_TIME_ZONE,
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

const toDate = (value: string | Date) => (value instanceof Date ? value : new Date(value));
const valid = (date: Date) => Number.isFinite(date.getTime());

/** "Aug 14, 2026" (ET). */
export function formatDate(value: string | Date): string {
  const date = toDate(value);
  return valid(date) ? dateFormat.format(date) : "";
}

/** "Oct 25, 2:05 PM" (ET). */
export function formatDateTime(value: string | Date): string {
  const date = toDate(value);
  return valid(date) ? dateTimeFormat.format(date) : "";
}

/** "Oct 25, 2:05 PM EDT" (ET, zone labeled): times an admin acts on, like announcement windows. */
export function formatDateTimeZoned(value: string | Date): string {
  const date = toDate(value);
  return valid(date) ? dateTimeZoneFormat.format(date) : "";
}

/** The browser's time zone for labels: "America/Chicago (CDT)". */
export function browserZoneLabel(at: Date = new Date()): string {
  const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
  const short = new Intl.DateTimeFormat("en-US", { timeZone: zone, timeZoneName: "short" })
    .formatToParts(at)
    .find((part) => part.type === "timeZoneName")?.value;
  return short && short !== zone ? `${zone} (${short})` : zone;
}

/** "Oct 25, 2026, 2:05 PM EDT": tooltips and `title`s. */
export function formatDateTimeFull(value: string | Date): string {
  const date = toDate(value);
  return valid(date) ? dateTimeYearFormat.format(date) : "";
}

const relativeFormat = new Intl.RelativeTimeFormat("en-US", { numeric: "auto" });

const UNITS: Array<[Intl.RelativeTimeFormatUnit, number]> = [
  ["year", 365 * 24 * 3600_000],
  ["month", 30 * 24 * 3600_000],
  ["week", 7 * 24 * 3600_000],
  ["day", 24 * 3600_000],
  ["hour", 3600_000],
  ["minute", 60_000],
];

/** "3 minutes ago", "in 2 days", "just now" (under 45 s either way). */
export function formatRelative(value: string | Date, now: Date | number = Date.now()): string {
  const date = toDate(value);
  if (!valid(date)) return "";
  const diff = date.getTime() - (typeof now === "number" ? now : now.getTime());
  const abs = Math.abs(diff);
  if (abs < 45_000) return "just now";
  for (const [unit, ms] of UNITS) {
    if (abs >= ms || unit === "minute") {
      return relativeFormat.format(Math.round(diff / ms) || Math.sign(diff), unit);
    }
  }
  return "";
}

/** 840 -> "840 ms", 12_400 -> "12.4 s", 125_000 -> "2 min 5 s". */
export function formatDuration(ms: number | null | undefined): string {
  if (ms == null || !Number.isFinite(ms) || ms < 0) return "—";
  if (ms < 1000) return `${Math.round(ms)} ms`;
  if (ms < 60_000) return `${(Math.round(ms / 100) / 10).toFixed(1).replace(/\.0$/, "")} s`;
  const minutes = Math.floor(ms / 60_000);
  const seconds = Math.round((ms % 60_000) / 1000);
  return seconds ? `${minutes} min ${seconds} s` : `${minutes} min`;
}

/** Used share of a budget, 0–1, for a bar. */
export function usedShare(used: number, limit: number): number {
  if (!Number.isFinite(used) || !Number.isFinite(limit) || limit <= 0) return 0;
  return Math.min(1, Math.max(0, used / limit));
}

/** Budget tone: under 70% fine, under 90% warning, else danger. */
export function budgetTone(used: number, limit: number): "success" | "warning" | "danger" {
  const share = usedShare(used, limit);
  if (share >= 0.9) return "danger";
  if (share >= 0.7) return "warning";
  return "success";
}

/** Run duration from timestamps (fallback when the summary has no durationMs). */
export function runDurationMs(startedAt: string, finishedAt: string | null): number | null {
  if (!finishedAt) return null;
  const ms = new Date(finishedAt).getTime() - new Date(startedAt).getTime();
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/** "1–25 of 187" for an offset page. */
export function pageRange(offset: number, count: number, total: number): string {
  if (total === 0 || count === 0) return `0 of ${formatNumber(total)}`;
  return `${formatNumber(offset + 1)}–${formatNumber(offset + count)} of ${formatNumber(total)}`;
}
