import { describe, expect, it } from "vitest";
import type { AdminAnnouncement, JobRunDto } from "@/lib/client/admin";
import { usersQuery } from "@/lib/client/admin";
import { errorFromResponse } from "@/lib/client/http";
import {
  announcementGroup,
  formFromAnnouncement,
  fromLocalInput,
  groupAnnouncements,
  toCreatePayload,
  toLocalInput,
  toPatchPayload,
  validateAnnouncementForm,
} from "../announcementForm";
import {
  applyTemplate,
  EMAIL_TEMPLATES,
  fieldFromServerMessage,
  toEmailPayload,
  validateEmailForm,
} from "../emailForm";
import { budgetTone, formatDuration, formatRelative, isTermCode, pageRange, usedShare } from "../format";
import { blocksUpload, checkGradeFiles, firstLine, sniffGradeHeader, uploadResultMessage } from "../gradeFiles";
import { prettySummary, runHeadline, runState, summaryErrors, watcherFacts } from "../jobs";
import { createSequence } from "../sequence";
import { greetingName, shouldCountUp, termLabel } from "@/lib/format";

const SUMMARY_HEADER =
  "CRN,Course,Professor,A  (90-100),B  (80-89),C  (70-79),D  (60-69),F <60,WF,A- WF,DWF,W,CRS AVG,Other ,Total,Instruction Method";
const DETAILED_HEADER = "CRN,A+,A,A-,B+,B,B-,C+,C,C-,D,F,WF,A-WF,DWF,W,Other,Total,Instruction Method";

function announcement(overrides: Partial<AdminAnnouncement> = {}): AdminAnnouncement {
  return {
    id: 1,
    message: "Registration opens Nov 3.",
    level: "info",
    startsAt: "2026-10-20T14:00:00.000Z",
    expiresAt: null,
    active: true,
    live: true,
    createdAt: "2026-10-19T12:00:00.000Z",
    createdBy: null,
    ...overrides,
  };
}

describe("format", () => {
  it("labels term codes", () => {
    expect(termLabel("202608")).toBe("Fall 2026");
    expect(termLabel("202601")).toBe("Spring 2026");
    expect(termLabel("202605")).toBe("Summer 2026");
    expect(termLabel("202603")).toBe("202603");
    expect(termLabel("abc")).toBe("abc");
    expect(isTermCode(" 202605 ")).toBe(true);
    expect(isTermCode("20265")).toBe(false);
  });

  it("counts up only 10–999 integers", () => {
    expect(shouldCountUp(9)).toBe(false);
    expect(shouldCountUp(10)).toBe(true);
    expect(shouldCountUp(999)).toBe(true);
    expect(shouldCountUp(1000)).toBe(false);
    expect(shouldCountUp(2.3)).toBe(false);
  });

  it("formats relative times", () => {
    const now = new Date("2026-10-26T12:00:00Z");
    expect(formatRelative("2026-10-26T11:59:30Z", now)).toBe("just now");
    expect(formatRelative("2026-10-26T11:57:00Z", now)).toBe("3 minutes ago");
    expect(formatRelative("2026-10-26T09:00:00Z", now)).toBe("3 hours ago");
    expect(formatRelative("2026-10-25T12:00:00Z", now)).toBe("yesterday");
    expect(formatRelative("2026-10-28T12:00:00Z", now)).toBe("in 2 days");
    expect(formatRelative("nope", now)).toBe("");
  });

  it("formats durations", () => {
    expect(formatDuration(840)).toBe("840 ms");
    expect(formatDuration(12_400)).toBe("12.4 s");
    expect(formatDuration(3_000)).toBe("3 s");
    expect(formatDuration(125_000)).toBe("2 min 5 s");
    expect(formatDuration(null)).toBe("—");
  });

  it("computes budget share and tone", () => {
    expect(usedShare(50, 100)).toBe(0.5);
    expect(usedShare(150, 100)).toBe(1);
    expect(usedShare(1, 0)).toBe(0);
    expect(budgetTone(10, 100)).toBe("success");
    expect(budgetTone(75, 100)).toBe("warning");
    expect(budgetTone(95, 100)).toBe("danger");
  });

  it("describes a page range", () => {
    expect(pageRange(0, 25, 187)).toBe("1–25 of 187");
    expect(pageRange(175, 12, 187)).toBe("176–187 of 187");
    expect(pageRange(0, 0, 0)).toBe("0 of 0");
  });
});

describe("announcement form", () => {
  it("round-trips datetime-local values through ISO", () => {
    const iso = fromLocalInput("2026-11-03T09:30");
    expect(iso).toMatch(/Z$/);
    expect(toLocalInput(iso)).toBe("2026-11-03T09:30");
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("garbage")).toBeNull();
    expect(toLocalInput(null)).toBe("");
  });

  it("builds a create payload with ISO instants and omits empty dates", () => {
    expect(toCreatePayload({ message: "  Hi  ", level: "warning", startsAt: "", expiresAt: "" })).toEqual({
      message: "Hi",
      level: "warning",
    });
    const payload = toCreatePayload({
      message: "Hi",
      level: "info",
      startsAt: "2026-11-01T08:00",
      expiresAt: "2026-11-10T08:00",
    });
    expect(payload.startsAt).toBe(new Date("2026-11-01T08:00").toISOString());
    expect(payload.expiresAt).toBe(new Date("2026-11-10T08:00").toISOString());
    expect(Object.keys(payload).sort()).toEqual(["expiresAt", "level", "message", "startsAt"]);
  });

  it("validates message length and the window", () => {
    expect(validateAnnouncementForm({ message: " ", level: "info", startsAt: "", expiresAt: "" }).message).toBeTruthy();
    expect(
      validateAnnouncementForm({ message: "x".repeat(501), level: "info", startsAt: "", expiresAt: "" }).message,
    ).toMatch(/500/);
    expect(
      validateAnnouncementForm({
        message: "ok",
        level: "info",
        startsAt: "2026-11-10T08:00",
        expiresAt: "2026-11-01T08:00",
      }).expiresAt,
    ).toBe("Must be after the start.");
    expect(
      validateAnnouncementForm({ message: "ok", level: "info", startsAt: "", expiresAt: "2000-01-01T00:00" }).expiresAt,
    ).toBe("Must be in the future.");
    expect(validateAnnouncementForm({ message: "ok", level: "info", startsAt: "", expiresAt: "" })).toEqual({});
  });

  it("patches only changed fields and clears expiry with null", () => {
    const original = announcement({ expiresAt: "2026-11-10T14:00:00.000Z" });
    const values = formFromAnnouncement(original);
    expect(toPatchPayload(original, values)).toBeNull();
    expect(toPatchPayload(original, { ...values, level: "error" })).toEqual({ level: "error" });
    expect(toPatchPayload(original, { ...values, expiresAt: "" })).toEqual({ expiresAt: null });
    expect(toPatchPayload(original, { ...values, startsAt: "" })).toBeNull();
    expect(toPatchPayload(original, { ...values, message: " New " })).toEqual({ message: "New" });
  });

  it("groups by state", () => {
    const now = new Date("2026-10-26T12:00:00Z").getTime();
    expect(announcementGroup(announcement(), now)).toBe("live");
    expect(announcementGroup(announcement({ active: false }), now)).toBe("paused");
    expect(announcementGroup(announcement({ startsAt: "2026-11-01T00:00:00Z", live: false }), now)).toBe("scheduled");
    expect(announcementGroup(announcement({ expiresAt: "2026-10-25T00:00:00Z", live: false }), now)).toBe("expired");
    const groups = groupAnnouncements([announcement(), announcement({ id: 2, active: false })], now);
    expect(groups.live).toHaveLength(1);
    expect(groups.paused).toHaveLength(1);
  });
});

describe("grade file sniffing", () => {
  it("recognizes both headers", () => {
    expect(sniffGradeHeader(SUMMARY_HEADER)).toBe("summary");
    expect(sniffGradeHeader(`﻿${DETAILED_HEADER}`)).toBe("detailed");
    expect(sniffGradeHeader('"CRN","Course","Professor"')).toBe("summary");
    expect(sniffGradeHeader("<!DOCTYPE html>")).toBeNull();
    expect(firstLine(`${SUMMARY_HEADER}\r\n12345,CSC 1301,Smith`)).toBe(SUMMARY_HEADER);
  });

  it("warns on swapped files", () => {
    const messages = checkGradeFiles({ kind: "detailed" }, { kind: "summary" });
    expect(messages).toHaveLength(1);
    expect(messages[0]?.text).toMatch(/swapped/);
    expect(blocksUpload(messages)).toBe(false);
  });

  it("warns when one slot has the other kind", () => {
    const messages = checkGradeFiles({ kind: "detailed", fileName: "a.csv" }, { kind: "detailed", fileName: "b.csv" });
    expect(messages.map((m) => m.text)).toEqual(['Summary: this is the detailed export (has "A+").']);
  });

  it("flags the same file twice and unreadable files", () => {
    expect(checkGradeFiles({ kind: "summary", fileName: "x.csv" }, { kind: "summary", fileName: "x.csv" })[0]?.text).toBe(
      "Both slots have the same file.",
    );
    const bad = checkGradeFiles({ kind: "unknown" }, { kind: null });
    expect(bad[0]?.tone).toBe("danger");
    expect(blocksUpload(bad)).toBe(true);
    expect(checkGradeFiles({ kind: "summary" }, { kind: "detailed" })).toEqual([]);
    expect(checkGradeFiles({ kind: null }, { kind: null })).toEqual([]);
  });

  it("describes upload results", () => {
    expect(uploadResultMessage({ term: "202605", rows: 4210, posted: true }, "Summer 2026")).toEqual({
      tone: "success",
      title: "Summer 2026 uploaded",
      body: "4,210 sections stored.",
    });
    expect(uploadResultMessage({ term: "202608", rows: 0, posted: false }, "Fall 2026").tone).toBe("warning");
  });
});

describe("email form", () => {
  const blank = { to: "", subject: "", previewText: "", htmlBody: "" };

  it("picks a greeting name", () => {
    expect(greetingName({ name: "Jane Doe", email: "jdoe1@student.gsu.edu" })).toBe("Jane");
    expect(greetingName({ name: null, email: "jdoe1@student.gsu.edu" })).toBe("jdoe1");
    expect(greetingName(null)).toBe("there");
  });

  it("applies a template, escaping the name and keeping a custom subject", () => {
    const welcome = EMAIL_TEMPLATES[0]!;
    const applied = applyTemplate(blank, welcome, "<Jane>");
    expect(applied.subject).toBe(welcome.subject);
    expect(applied.htmlBody).toContain("Hi &lt;Jane&gt;,");
    const custom = applyTemplate({ ...blank, subject: "My subject" }, welcome, "Jane");
    expect(custom.subject).toBe("My subject");
    const swapped = applyTemplate(applied, EMAIL_TEMPLATES[1]!, "Jane");
    expect(swapped.subject).toBe(EMAIL_TEMPLATES[1]!.subject);
  });

  it("validates and builds the payload", () => {
    expect(Object.keys(validateEmailForm(blank)).sort()).toEqual(["htmlBody", "subject", "to"]);
    expect(validateEmailForm({ ...blank, to: "a@b.co, c@d.co", subject: "s", htmlBody: "b" }).to).toBeTruthy();
    const values = { to: " a@b.co ", subject: " Hi ", previewText: "  ", htmlBody: " <p>x</p> " };
    expect(validateEmailForm(values)).toEqual({});
    expect(toEmailPayload(values)).toEqual({ to: "a@b.co", subject: "Hi", htmlBody: "<p>x</p>" });
    expect(toEmailPayload({ ...values, previewText: " Peek " }).previewText).toBe("Peek");
  });

  it("maps server messages to fields", () => {
    expect(fieldFromServerMessage("subject: must not be empty")).toBe("subject");
    expect(fieldFromServerMessage("Something else")).toBeNull();
  });
});

describe("job runs", () => {
  const run = (overrides: Partial<JobRunDto> = {}): JobRunDto => ({
    id: 7,
    job: "watcher",
    startedAt: "2026-10-26T12:00:00.000Z",
    finishedAt: "2026-10-26T12:00:12.400Z",
    ok: true,
    summary: { watches: 40, sectionsChecked: 31, emailsSent: 2, errors: ["GoSolar timeout"] },
    ...overrides,
  });

  it("derives state", () => {
    expect(runState(run())).toBe("ok");
    expect(runState(run({ ok: false }))).toBe("failed");
    expect(runState(run({ finishedAt: null, ok: null }))).toBe("running");
  });

  it("summarizes watcher runs", () => {
    expect(runHeadline(run())).toBe("2 emails · 31 sections · 40 watches · 1 error");
    const facts = watcherFacts(run());
    expect(facts.find((f) => f.label === "Duration")?.value).toBe("12.4 s");
    expect(facts.find((f) => f.label === "Errors")?.value).toBe("1");
    expect(summaryErrors({ fatal: "boom" })).toEqual(["boom"]);
    expect(runHeadline(run({ job: "cleanup", summary: { deleted: 3, durationMs: 5 } }))).toBe("deleted 3");
    expect(runHeadline(run({ summary: null, finishedAt: null }))).toBe("In progress");
    expect(prettySummary({ a: 1 })).toBe('{\n  "a": 1\n}');
  });
});

describe("request sequence", () => {
  it("only the latest ticket wins", () => {
    const seq = createSequence();
    const first = seq.next();
    const second = seq.next();
    expect(seq.isLatest(first)).toBe(false);
    expect(seq.isLatest(second)).toBe(true);
    seq.cancel();
    expect(seq.isLatest(second)).toBe(false);
  });
});

describe("client api", () => {
  it("builds the users query", () => {
    expect(usersQuery({})).toBe("");
    expect(usersQuery({ q: "  jane ", limit: 25, offset: 0 })).toBe("?q=jane&limit=25");
    expect(usersQuery({ offset: 50 })).toBe("?offset=50");
  });

  it("reads the error envelope", async () => {
    const error = await errorFromResponse(
      Response.json({ error: { code: "invalid_request", message: "summary: swapped" } }, { status: 400 }),
    );
    expect(error.status).toBe(400);
    expect(error.code).toBe("invalid_request");
    expect(error.message).toBe("summary: swapped");
    const fallback = await errorFromResponse(new Response("<html>", { status: 502 }));
    expect(fallback.message).toMatch(/server/);
  });
});
