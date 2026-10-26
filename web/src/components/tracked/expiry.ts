/**
 * Tracking expiry, mirrored from lib/jobs/terms.ts (termExpiryMonth / isTermExpired): a watch
 * is cleared on the 1st of the month two months after its term starts (YYYYMM codes), in
 * GSU's time zone. The card warns during the last 14 days. Pure and client-safe.
 */
import { MONTHS, nyDateParts } from "@/lib/format";

const EXPIRY_MONTHS_AFTER_START = 2;
const WARN_LEAD_DAYS = 14;

function expiryParts(term: string): { year: number; month: number } | null {
  if (!/^\d{6}$/.test(term)) return null;
  const year = Number(term.slice(0, 4));
  const month = Number(term.slice(4, 6));
  if (month < 1 || month > 12) return null;
  const index = year * 12 + (month - 1) + EXPIRY_MONTHS_AFTER_START;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

function gsuToday(now: Date): number {
  const { year, month, day } = nyDateParts(now);
  return Date.UTC(year, month - 1, day);
}

/** "Tracking ends Oct 1" text when the term's watches expire within 14 days, else null. */
export function expiryNotice(term: string, now: Date = new Date()): string | null {
  const expiry = expiryParts(term);
  if (!expiry) return null;
  const expiryDay = Date.UTC(expiry.year, expiry.month - 1, 1);
  const today = gsuToday(now);
  const days = (expiryDay - today) / 86_400_000;
  if (days <= 0 || days > WARN_LEAD_DAYS) return null;
  return `Tracking ends ${MONTHS[expiry.month - 1]} 1`;
}
