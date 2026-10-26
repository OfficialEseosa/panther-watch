/**
 * Client-side sniffing of the two APEX grade exports before upload (pure, unit-tested).
 * The server re-validates everything; this only catches the common mistakes early:
 * swapped files, a non-CSV (an HTML error page saved as .csv), or the same file twice.
 *
 *   summary  header: CRN,Course,Professor,A  (90-100),...,CRS AVG,Other ,Total,...
 *   detailed header: CRN,A+,A,A-,B+,...,Total,...
 */

export type GradeFileKind = "summary" | "detailed";
export type GradeSlot = GradeFileKind;

const cells = (line: string) =>
  line
    .replace(/^﻿/, "")
    .split(",")
    .map((cell) => cell.replace(/^"|"$/g, "").replace(/\s+/g, " ").trim().toUpperCase());

/** First line of a CSV text (handles \r\n). */
export function firstLine(text: string): string {
  const end = text.search(/\r?\n/);
  return end === -1 ? text : text.slice(0, end);
}

/** Which export a header line belongs to, or null when it's neither. */
export function sniffGradeHeader(line: string): GradeFileKind | null {
  const header = cells(line);
  if (header[0] !== "CRN") return null;
  if (header.includes("PROFESSOR") || (header.includes("COURSE") && header.includes("CRS AVG"))) return "summary";
  if (header.includes("A+")) return "detailed";
  return null;
}

export interface SlotCheck {
  /** null: no file chosen yet. */
  kind: GradeFileKind | null | "unknown";
  fileName?: string;
}

export interface GradeFileMessage {
  tone: "warning" | "danger";
  text: string;
}

const LABEL: Record<GradeSlot, string> = { summary: "Summary", detailed: "Detailed" };

/**
 * Messages for the two chosen files. `kind: "unknown"` means a file is chosen but its header
 * matched neither export. Returns [] when both look right (or nothing is chosen).
 */
export function checkGradeFiles(summary: SlotCheck, detailed: SlotCheck): GradeFileMessage[] {
  const messages: GradeFileMessage[] = [];
  if (summary.kind === "detailed" && detailed.kind === "summary") {
    return [{ tone: "warning", text: "The files look swapped: the summary slot has the detailed export and vice versa." }];
  }
  if (
    summary.fileName &&
    detailed.fileName &&
    summary.fileName === detailed.fileName &&
    summary.kind !== null &&
    summary.kind === detailed.kind
  ) {
    messages.push({ tone: "warning", text: "Both slots have the same file." });
    return messages;
  }
  for (const slot of ["summary", "detailed"] as const) {
    const check = slot === "summary" ? summary : detailed;
    if (check.kind === null || check.kind === slot) continue;
    if (check.kind === "unknown") {
      messages.push({
        tone: "danger",
        text: `${LABEL[slot]}: this doesn't look like an APEX grade CSV (the first column should be CRN).`,
      });
    } else {
      messages.push({
        tone: "warning",
        text: `${LABEL[slot]}: this is the ${check.kind} export (${check.kind === "summary" ? 'has "Professor"' : 'has "A+"'}).`,
      });
    }
  }
  return messages;
}

/** True when an upload should be blocked (an unreadable file); swaps only warn. */
export function blocksUpload(messages: readonly GradeFileMessage[]): boolean {
  return messages.some((message) => message.tone === "danger");
}

/** Reads the head of a File (browser) and sniffs it. */
export async function sniffGradeFile(file: File): Promise<GradeFileKind | "unknown"> {
  try {
    const head = await file.slice(0, 4096).text();
    return sniffGradeHeader(firstLine(head)) ?? "unknown";
  } catch {
    return "unknown";
  }
}

/** Upload result -> toast copy. */
export function uploadResultMessage(result: { term: string; rows: number; posted: boolean }, label: string): {
  tone: "success" | "warning";
  title: string;
  body: string;
} {
  if (!result.posted) {
    return {
      tone: "warning",
      title: `${label}: grades not posted yet`,
      body: "No section has a course average yet, so nothing was stored. Try again after grades post.",
    };
  }
  return {
    tone: "success",
    title: `${label} uploaded`,
    body: `${result.rows.toLocaleString("en-US")} sections stored.`,
  };
}
