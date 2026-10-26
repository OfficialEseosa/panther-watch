import type { JobRunDto } from "@/lib/client/admin";
import { formatDuration, runDurationMs } from "./format";
import { formatNumber } from "@/lib/format";

/** Pure helpers for job_runs rows (Overview's last watcher run, the Jobs tab). */

export type RunState = "running" | "ok" | "failed" | "unknown";

export function runState(run: Pick<JobRunDto, "finishedAt" | "ok">): RunState {
  if (run.finishedAt === null) return "running";
  if (run.ok === true) return "ok";
  if (run.ok === false) return "failed";
  return "unknown";
}

export const RUN_STATE_LABEL: Record<RunState, string> = {
  running: "Running",
  ok: "OK",
  failed: "Failed",
  unknown: "Unknown",
};

export const RUN_STATE_TONE: Record<RunState, "accent" | "success" | "danger" | "neutral"> = {
  running: "accent",
  ok: "success",
  failed: "danger",
  unknown: "neutral",
};

const num = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) ? value : null);

/** `summary.errors` as strings (watcher: string[]; others may differ). */
export function summaryErrors(summary: Record<string, unknown> | null): string[] {
  const errors = summary?.errors;
  if (Array.isArray(errors)) return errors.map((item) => (typeof item === "string" ? item : JSON.stringify(item)));
  const fatal = summary?.fatal ?? summary?.error;
  return typeof fatal === "string" && fatal ? [fatal] : [];
}

/** Duration: `summary.durationMs` when present, else finishedAt − startedAt. */
export function runDuration(run: JobRunDto): number | null {
  return num(run.summary?.durationMs) ?? runDurationMs(run.startedAt, run.finishedAt);
}

/** Watcher summary fields the Overview card shows. */
export function watcherFacts(run: JobRunDto): { label: string; value: string }[] {
  const s = run.summary;
  const facts: { label: string; value: string }[] = [];
  const add = (label: string, value: number | null) => {
    if (value !== null) facts.push({ label, value: formatNumber(value) });
  };
  add("Emails sent", num(s?.emailsSent));
  add("Emails failed", num(s?.emailsFailed));
  add("Sections checked", num(s?.sectionsChecked));
  add("Watches", num(s?.watches));
  add("Skipped (budget)", num(s?.skippedBudget));
  facts.push({ label: "Errors", value: formatNumber(summaryErrors(s).length) });
  facts.push({ label: "Duration", value: formatDuration(runDuration(run)) });
  return facts;
}

/** One-line digest of a run for the Jobs table, per job. */
export function runHeadline(run: JobRunDto): string {
  const s = run.summary;
  if (!s) return run.finishedAt === null ? "In progress" : "No summary";
  const parts: string[] = [];
  const push = (value: unknown, one: string, many = `${one}s`) => {
    const n = num(value);
    if (n !== null) parts.push(`${formatNumber(n)} ${n === 1 ? one : many}`);
  };
  switch (run.job) {
    case "watcher":
      push(s.emailsSent, "email");
      push(s.sectionsChecked, "section");
      push(s.watches, "watch", "watches");
      break;
    case "grades":
      if (typeof s.term === "string") parts.push(`term ${s.term}`);
      push(s.rows, "row");
      if (typeof s.trigger === "string") parts.push(`via ${s.trigger}`);
      break;
    default:
      for (const [key, value] of Object.entries(s)) {
        if (parts.length >= 3) break;
        if (key === "durationMs") continue;
        const n = num(value);
        if (n !== null) parts.push(`${key} ${formatNumber(n)}`);
      }
  }
  const errors = summaryErrors(s).length;
  if (errors) parts.push(`${formatNumber(errors)} ${errors === 1 ? "error" : "errors"}`);
  return parts.join(" · ") || "No counts";
}

/** Pretty JSON for the expandable summary. */
export function prettySummary(summary: Record<string, unknown> | null): string {
  return summary === null ? "null" : JSON.stringify(summary, null, 2);
}
