/**
 * Display helpers shared by every feature (courses, schedule, tracked, dashboard, admin, jobs,
 * email). Pure: no React, no DOM, safe on the server and the client. Feature-specific
 * formatting stays next to its feature; anything needed by two features lives here, once.
 */
import type { CourseData } from "@/lib/gosolar/types";

// ------------------------------------------------------------------ time

/** GSU's time zone. Server-rendered dates use it so server and client markup match. */
export const NY_TZ = "America/New_York";

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"] as const;

const THIN = " ";
const DASH = `${THIN}–${THIN}`;

function clock(minutes: number): { text: string; period: "AM" | "PM" } {
  const hours24 = Math.floor(minutes / 60) % 24;
  const mins = minutes % 60;
  return { text: `${hours24 % 12 || 12}:${String(mins).padStart(2, "0")}`, period: hours24 >= 12 ? "PM" : "AM" };
}

/** "10:00 – 11:15 AM" (one period when shared) or "11:00 AM – 12:15 PM", with thin spaces. */
export function formatTimeRange(start: number, end: number): string {
  const a = clock(start);
  const b = clock(end);
  return a.period === b.period ? `${a.text}${DASH}${b.text} ${b.period}` : `${a.text} ${a.period}${DASH}${b.text} ${b.period}`;
}

/** Calendar parts of `now` in GSU's time zone (1-based month). */
export function nyDateParts(now: Date = new Date()): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: NY_TZ, year: "numeric", month: "numeric", day: "numeric" }).formatToParts(now);
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  return { year: part("year"), month: part("month"), day: part("day") };
}

// ------------------------------------------------------------------ numbers and words

const numberFormat = new Intl.NumberFormat("en-US");

export function formatNumber(value: number): string {
  return numberFormat.format(value);
}

/** Stat tiles count up only for integers 10–999 (motion.md §4.14). */
export function shouldCountUp(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 10 && value <= 999;
}

/** "1 section", "12 sections", "1,204 users". */
export function plural(n: number, one: string, many = `${one}s`): string {
  return `${formatNumber(n)} ${n === 1 ? one : many}`;
}

/** First word of a display name, or null when there is none. */
export function firstName(name: string | null | undefined): string | null {
  return name?.trim().split(/\s+/)[0] || null;
}

/** Who to greet ("Hi Jane"): the first name, else the email's local part, else "there". */
export function greetingName(
  recipient: string | { name?: string | null; email?: string | null } | null | undefined,
): string {
  const { name, email } = typeof recipient === "string" || recipient == null ? { name: recipient, email: null } : recipient;
  return firstName(name) ?? (email?.split("@")[0]?.trim() || "there");
}

// ------------------------------------------------------------------ GoSolar text

/** Words kept in capitals by `titleCase` (acronyms GoSolar titles use). */
const KEEP_UPPER = new Set(["AI", "AP", "CS", "CTW", "CW", "ESL", "GIS", "GSU", "HR", "IT", "MA", "MBA", "MS", "ROTC", "SQL", "STEM", "UI", "US", "USA", "UX"]);
/** Words with their own casing. */
const SPECIAL_CASE: Record<string, string> = { PHD: "PhD" };
/** Lowercase inside a title (never as the first word or right after a colon). */
const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "but", "by", "for", "from", "in", "into", "nor", "of", "on", "or", "per", "the", "to", "via", "vs", "with"]);
/** I–XXXIX: "PRINCIPLES OF COMPUTER SCI II". */
const ROMAN = /^X{0,3}(IX|IV|V?I{0,3})$/;
const ORDINAL = /^(ST|ND|RD|TH)$/;

/**
 * Title case for GoSolar's all-caps course titles: "PRINCIPLES OF COMPUTER SCI II" ->
 * "Principles of Computer Sci II", "HON: ENGLISH COMPOSITION I" -> "Hon: English Composition I",
 * "TOP IN 20TH-C AMER LIT" -> "Top in 20th-C Amer Lit". Acronyms ("CS", "AI", "GSU", "US") and
 * roman numerals stay in capitals; small words are lowercase except first. Titles that already
 * have lowercase letters come back unchanged (someone cased them on purpose).
 */
export function titleCase(text: string): string {
  if (/[a-z]/.test(text)) return text;
  let index = 0;
  let firstWord = "";
  let previousEnd = 0;
  return text.replace(/[A-Z]+(?:'[A-Z]+)?/g, (word, offset: number) => {
    const before = text.slice(previousEnd, offset);
    previousEnd = offset + word.length;
    // First word, after a colon, or after a one-letter prefix ("T THE BRONTE SISTERS").
    const lead = index === 0 || /[:;]\s*$/.test(before) || (index === 1 && firstWord.length === 1);
    if (index === 0) firstWord = word;
    index++;
    // Right after a digit: "20TH" -> "20th", "3D" stays.
    if (/\d$/.test(before)) return ORDINAL.test(word) ? word.toLowerCase() : word;
    if (KEEP_UPPER.has(word) || ROMAN.test(word)) return word;
    if (SPECIAL_CASE[word]) return SPECIAL_CASE[word];
    const lower = word.toLowerCase();
    if (!lead && SMALL_WORDS.has(lower)) return lower;
    return lower.charAt(0).toUpperCase() + lower.slice(1);
  });
}

/**
 * GoSolar's `partOfTerm` code for the "Part of term" detail. Only "1" is mapped ("Full term"):
 * live 202701 CSC/ENGL data has it on every full-length section (Jan 11 – May 4). Other codes
 * ("E" was a one-week session) have no published meaning, so the code itself is shown
 * ("Part of term: E"). Null when there is no code.
 */
export function partOfTermName(code: string | null | undefined): string | null {
  const clean = code?.trim();
  if (!clean) return null;
  return clean === "1" ? "Full term" : clean;
}

// ------------------------------------------------------------------ terms

const SEASONS: Record<string, string> = { "01": "Spring", "05": "Summer", "08": "Fall" };

/** "202608" -> "Fall 2026". Unknown months and malformed codes come back unchanged; null -> "". */
export function termLabel(code: string | null | undefined): string {
  if (!code) return "";
  const season = /^\d{6}$/.test(code) ? SEASONS[code.slice(4)] : undefined;
  return season ? `${season} ${code.slice(0, 4)}` : code;
}

/** GoSolar's term description without "(View only)", else the code-derived label. */
export function termName(code: string, description?: string | null): string {
  const clean = description?.replace(/\(view only\)/i, "").trim();
  return clean || termLabel(code);
}

// ------------------------------------------------------------------ sections

/** Watch/schedule/meta key: CRNs repeat across terms, so always pair them with the term. */
export const sectionKey = (term: string | null | undefined, crn: string | null | undefined) => `${term ?? ""}|${crn ?? ""}`;

export const keyOf = (section: Pick<CourseData, "term" | "courseReferenceNumber">) =>
  sectionKey(section.term, section.courseReferenceNumber);

type CodeParts = { subject?: string | null; courseNumber?: string | null };

/** "CSC 2720", from a section or a schedule entry, or from the two parts. */
export function courseCode(section: CodeParts): string;
export function courseCode(subject: string | null | undefined, courseNumber: string | null | undefined): string;
export function courseCode(a: CodeParts | string | null | undefined, b?: string | null): string {
  const { subject, courseNumber } = typeof a === "object" && a !== null ? a : { subject: a, courseNumber: b };
  return [subject?.trim(), courseNumber?.trim()].filter(Boolean).join(" ");
}

/** Instructors, primary first. */
export function instructorsOf(section: Pick<CourseData, "faculty">): string[] {
  const faculty = [...(section.faculty ?? [])].sort(
    (a, b) => Number(Boolean(b?.primaryIndicator)) - Number(Boolean(a?.primaryIndicator)),
  );
  // Banner leaves a lone "." where a missing middle initial goes ("Charlton, Ryan .").
  return faculty.map((f) => f?.displayName?.trim().replace(/\s+\.$/, "") ?? "").filter(Boolean);
}

/** The primary (or first) instructor, or null for TBA. */
export const instructorOf = (section: Pick<CourseData, "faculty">): string | null => instructorsOf(section)[0] ?? null;

type CreditFields = Pick<CourseData, "creditHours" | "creditHourLow" | "creditHourHigh">;

const finite = (n: number | null | undefined): n is number => n != null && Number.isFinite(n);

/**
 * "3 credits", "1 credit", "1–4 credits" (variable credit), summed over several sections
 * ("13–15 credits"). Uses creditHourLow, falling back to creditHours. Null when unknown.
 */
export function creditsLabel(sections: CreditFields | readonly CreditFields[]): string | null {
  const list: readonly CreditFields[] = Array.isArray(sections) ? sections : [sections as CreditFields];
  let low = 0;
  let high = 0;
  let known = false;
  for (const section of list) {
    const base = finite(section.creditHourLow) && section.creditHourLow > 0 ? section.creditHourLow : finite(section.creditHours) ? section.creditHours : null;
    if (base === null) continue;
    known = true;
    low += base;
    high += finite(section.creditHourHigh) && section.creditHourHigh > base ? section.creditHourHigh : base;
  }
  if (!known) return null;
  const fmt = (n: number) => String(Math.round(n * 10) / 10);
  const value = high > low ? `${fmt(low)}–${fmt(high)}` : fmt(low);
  return `${value} ${high === 1 && low === 1 ? "credit" : "credits"}`;
}

const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

/** Course order: subject, course number, section, CRN (numeric-aware). */
export function compareSections(
  a: Pick<CourseData, "subject" | "courseNumber" | "sequenceNumber" | "courseReferenceNumber">,
  b: Pick<CourseData, "subject" | "courseNumber" | "sequenceNumber" | "courseReferenceNumber">,
): number {
  return (
    collator.compare(a.subject ?? "", b.subject ?? "") ||
    collator.compare(a.courseNumber ?? "", b.courseNumber ?? "") ||
    collator.compare(a.sequenceNumber ?? "", b.sequenceNumber ?? "") ||
    collator.compare(a.courseReferenceNumber ?? "", b.courseReferenceNumber ?? "")
  );
}

export const compareText = (a: string, b: string) => collator.compare(a, b);
