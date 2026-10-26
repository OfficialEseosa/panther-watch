"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Button } from "@/components/ui/Button";
import { Dialog } from "@/components/ui/Dialog";
import { ChartIcon, ExternalIcon, XIcon } from "@/components/ui/icons";
import { useToast } from "@/components/ui/Toast";
import { adminApi, type GradeStatusDto } from "@/lib/client/admin";
import { ApiError, errorMessage, onUnauthorized, reportApiError } from "@/lib/client/http";
import { cn } from "@/lib/ui/cn";
import { isTermCode } from "./format";
import {
  blocksUpload,
  checkGradeFiles,
  sniffGradeFile,
  uploadResultMessage,
  type GradeFileKind,
  type GradeSlot,
  type SlotCheck,
} from "./gradeFiles";
import { runState, summaryErrors } from "./jobs";
import { RelativeTime } from "./RelativeTime";
import styles from "./Grades.module.css";
import adminStyles from "./admin.module.css";
import { termLabel } from "@/lib/format";

const POLL_MS = 10_000;
const APEX_URL = "https://dssapex.gsu.edu/ords/f?p=140:184";


type Slots = Record<GradeSlot, { file: File | null; check: SlotCheck }>;
const EMPTY_SLOTS: Slots = { summary: { file: null, check: { kind: null } }, detailed: { file: null, check: { kind: null } } };

/**
 * Grade data tab, laid out like the old GradeDataManager.jsx: title + Refresh now, the stat
 * tiles, the stored terms as chips, then the upload form. Manual upload is the reliable path: APEX sits behind a
 * Cloudflare challenge, so the admin exports the two CSVs in a browser. Files are sniffed
 * client-side (swapped / not a grade CSV) before upload; the server re-validates. The
 * automatic refresh is kept as a de-emphasized fallback and polls status every 10 s while a
 * run is active.
 */
export function GradesPanel({ initial }: { initial: GradeStatusDto }) {
  const router = useRouter();
  const toast = useToast();
  const formId = useId();
  const [status, setStatus] = useState(initial);
  const [source, setSource] = useState(initial);
  const [term, setTerm] = useState("");
  const [termError, setTermError] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slots>(EMPTY_SLOTS);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [formKey, setFormKey] = useState(0);

  if (initial !== source) {
    setSource(initial);
    setStatus(initial);
  }

  const reloadStatus = async () => {
    try {
      setStatus(await adminApi.grades.status());
    } catch {
      // Keep the last known status; the next poll or action retries.
    }
  };

  // Poll while a run is active (client-only), stop when idle.
  const running = status.running;
  const pollRef = useRef(reloadStatus);
  useEffect(() => {
    pollRef.current = reloadStatus;
  });
  useEffect(() => {
    if (!running) return;
    const timer = window.setInterval(() => void pollRef.current(), POLL_MS);
    return () => window.clearInterval(timer);
  }, [running]);

  const onFile = (slot: GradeSlot) => async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    setUploadError(null);
    if (!file) {
      setSlots((current) => ({ ...current, [slot]: { file: null, check: { kind: null } } }));
      return;
    }
    setSlots((current) => ({ ...current, [slot]: { file, check: { kind: null, fileName: file.name } } }));
    const kind = await sniffGradeFile(file);
    setSlots((current) =>
      current[slot].file === file ? { ...current, [slot]: { file, check: { kind, fileName: file.name } } } : current,
    );
  };

  const messages = checkGradeFiles(slots.summary.check, slots.detailed.check);
  const swapped = slots.summary.check.kind === "detailed" && slots.detailed.check.kind === "summary";

  const swap = () =>
    setSlots((current) => ({ summary: current.detailed, detailed: current.summary }));

  const onUpload = async (event: FormEvent) => {
    event.preventDefault();
    const code = term.trim();
    setUploadError(null);
    if (!isTermCode(code)) {
      setTermError("Enter a 6-digit term code, like 202605.");
      return;
    }
    setTermError(null);
    const { summary, detailed } = slots;
    if (!summary.file || !detailed.file) {
      setUploadError("Choose both CSV files.");
      return;
    }
    if (blocksUpload(messages)) {
      setUploadError("Fix the file problems above first.");
      return;
    }
    setUploading(true);
    try {
      const result = await adminApi.grades.upload({ term: code, summary: summary.file, detailed: detailed.file });
      const message = uploadResultMessage(result, termLabel(result.term));
      toast.show({ tone: message.tone, title: message.title, body: message.body });
      setTerm("");
      setSlots(EMPTY_SLOTS);
      setFormKey((k) => k + 1);
      await reloadStatus();
      startTransition(() => router.refresh());
    } catch (error) {
      const text = errorMessage(error, "Couldn't reach the server.");
      setUploadError(text);
      if (error instanceof ApiError && error.status === 401) onUnauthorized(toast);
      else toast.error("Upload failed", { body: text });
    } finally {
      setUploading(false);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await adminApi.grades.refresh();
      toast.info("Refresh started", { body: "Checking status every 10 seconds while it runs." });
      setStatus((current) => ({ ...current, running: true }));
      void reloadStatus();
    } catch (error) {
      if (error instanceof ApiError && error.status === 409) {
        toast.info("A grade refresh is already running");
        setStatus((current) => ({ ...current, running: true }));
      } else {
        reportApiError(toast, error, "Refresh failed");
      }
    } finally {
      setRefreshing(false);
    }
  };

  const onDelete = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    try {
      await adminApi.grades.remove(deleting);
      toast.success(`${termLabel(deleting)} deleted`);
      setStatus((current) => ({ ...current, terms: current.terms.filter((t) => t !== deleting) }));
      setDeleteOpen(false);
      startTransition(() => router.refresh());
    } catch (error) {
      reportApiError(toast, error, "Couldn't delete the term");
    } finally {
      setDeleteBusy(false);
    }
  };

  const lastRun = status.lastRun;
  const lastState = lastRun ? runState(lastRun) : null;
  const lastErrors = lastRun ? summaryErrors(lastRun.summary) : [];
  const busy = status.running || refreshing;
  const scraper = status.running ? "Refreshing" : lastState === "failed" ? "Last run failed" : "Idle";

  return (
    <section className={adminStyles.section} aria-labelledby="grade-data-title">
      <div className={styles.head}>
        <div className={styles.title}>
          <ChartIcon size={22} />
          <div>
            <h2 id="grade-data-title">Grade data</h2>
            <p>Historical course grade distributions from GSU APEX.</p>
          </div>
        </div>
        <button type="button" className={styles.refresh} onClick={() => void onRefresh()} disabled={busy}>
          {busy ? (
            <>
              <span className={styles.spinner} aria-hidden="true" /> Refreshing…
            </>
          ) : (
            "Refresh now"
          )}
        </button>
      </div>

      <div className={styles.stats}>
        <div className={styles.stat}>
          <span className={styles.statValue}>{status.terms.length}</span>
          <span className={styles.statLabel}>Terms on file</span>
        </div>
        <div className={styles.stat}>
          {/* Only the state is live: the relative time ticks every minute and must not be announced. */}
          <span className={styles.pill} data-state={status.running ? "running" : lastState === "failed" ? "failed" : "idle"} aria-live="polite">
            {scraper}
          </span>
          <span className={styles.statLabel}>
            Scraper · {lastRun ? <>last run <RelativeTime value={lastRun.startedAt} /></> : "never run"}
          </span>
        </div>
      </div>

      <section className={styles.terms} aria-labelledby="grade-terms">
        <h3 id="grade-terms" className={styles.termsLabel}>
          Terms on file
        </h3>
        {status.terms.length === 0 ? (
          <p className={adminStyles.muted}>No terms stored yet. Upload one below.</p>
        ) : (
          <ul className={styles.chips}>
            {status.terms.map((code) => (
              <li key={code} className={styles.chip}>
                <span title={code}>{termLabel(code)}</span>
                <button
                  type="button"
                  className={styles.chipRemove}
                  aria-label={`Delete ${termLabel(code)}`}
                  onClick={() => {
                    setDeleting(code);
                    setDeleteOpen(true);
                  }}
                >
                  <XIcon size={14} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {status.running ? (
        <p className={styles.note}>A refresh is in progress. Recent terms are scraped first; the status updates every 10 seconds.</p>
      ) : null}
      {!status.running && lastState === "failed" && lastErrors[0] ? (
        <p className={adminStyles.notice} data-tone="danger">
          The last automatic refresh failed: {lastErrors[0]} APEX usually blocks server requests, so upload the CSVs instead.
        </p>
      ) : null}

      <form key={formKey} id={formId} className={styles.upload} onSubmit={onUpload} noValidate aria-labelledby={`${formId}-title`}>
        <h3 id={`${formId}-title`} className={styles.uploadTitle}>
          Upload a term
        </h3>
        <div className={cn(adminStyles.formGroup, styles.termField)}>
          <label className={adminStyles.formLabel} htmlFor={`${formId}-term`}>
            Term code <span aria-hidden="true">*</span>
          </label>
          <input
            id={`${formId}-term`}
            className={adminStyles.control}
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            autoComplete="off"
            value={term}
            aria-invalid={termError ? true : undefined}
            aria-describedby={`${formId}-term-hint`}
            onChange={(event) => {
              setTerm(event.target.value.replace(/\D/g, ""));
              if (termError) setTermError(null);
            }}
          />
          <p id={`${formId}-term-hint`} className={termError ? adminStyles.fieldError : adminStyles.hint}>
            {termError ?? "e.g. 202605 (Summer 2026). Uploading a stored term replaces it."}
          </p>
        </div>

        <div className={styles.files}>
          <FilePicker
            slot="summary"
            label="Summary export"
            hint="The region with Professor and CRS AVG."
            file={slots.summary.file}
            kind={slots.summary.check.kind}
            onChange={onFile("summary")}
          />
          <FilePicker
            slot="detailed"
            label="Detailed export"
            hint="The region with A+, A, A- … columns."
            file={slots.detailed.file}
            kind={slots.detailed.check.kind}
            onChange={onFile("detailed")}
          />
        </div>

        {messages.map((message) => (
          <div
            key={message.text}
            className={cn(adminStyles.notice, styles.fileMessage)}
            data-tone={message.tone === "danger" ? "danger" : "warning"}
          >
            <span>{message.text}</span>
            {swapped ? (
              <button type="button" className={cn(adminStyles.btn, adminStyles.btnSecondary, adminStyles.btnSmall)} onClick={swap}>
                Swap files
              </button>
            ) : null}
          </div>
        ))}
        {uploadError ? (
          <p className={adminStyles.notice} data-tone="danger" role="alert">
            {uploadError}
          </p>
        ) : null}

        <div className={styles.formActions}>
          <button type="submit" className={cn(adminStyles.btn, adminStyles.btnPrimary)} disabled={uploading}>
            {uploading ? "Uploading…" : "Upload"}
          </button>
        </div>

        <details className={styles.instructions}>
          <summary>How to export the two CSVs from APEX</summary>
          <ol className={styles.steps}>
            <li>
              In a normal browser, open GSU&rsquo;s grade distribution site:{" "}
              <a href={APEX_URL} target="_blank" rel="noreferrer noopener" className={styles.link}>
                dssapex.gsu.edu, app 140, page 184 <ExternalIcon size={14} />
              </a>{" "}
              (&ldquo;Grade Distributions By Course Sections&rdquo;). Pass the Cloudflare check if it asks.
            </li>
            <li>
              Choose the <strong>term</strong> and leave the subject prefix as <strong>All</strong>, then apply it.
            </li>
            <li>
              The page has two report regions. Click the <strong>Excel?</strong> link on each one to download its CSV:
              the <strong>summary</strong> region (columns Course, Professor, A–F, CRS AVG) and the{" "}
              <strong>detailed</strong> region (columns A+, A, A-, …).
            </li>
            <li>
              Upload both here with the same term code. If no section has a CRS AVG yet, the grades haven&rsquo;t posted
              and nothing is stored.
            </li>
          </ol>
        </details>
      </form>

      <Dialog
        open={deleteOpen}
        onClose={() => {
          if (!deleteBusy) setDeleteOpen(false);
        }}
        size="sm"
        title={deleting ? `Delete ${termLabel(deleting)}?` : "Delete term?"}
        footer={
          <>
            <Button variant="secondary" onClick={() => setDeleteOpen(false)} disabled={deleteBusy}>
              Cancel
            </Button>
            <Button variant="danger" data-autofocus="" loading={deleteBusy} onClick={() => void onDelete()}>
              Delete term
            </Button>
          </>
        }
      >
        <p className={styles.confirmText}>
          Every section&rsquo;s grades for {deleting ? `${termLabel(deleting)} (${deleting})` : "this term"} are removed.
          Course cards stop showing them until you upload the term again.
        </p>
      </Dialog>
    </section>
  );
}

function FilePicker({
  slot,
  label,
  hint,
  file,
  kind,
  onChange,
}: {
  slot: GradeSlot;
  label: string;
  hint: string;
  file: File | null;
  kind: GradeFileKind | null | "unknown";
  onChange: (event: ChangeEvent<HTMLInputElement>) => void;
}) {
  const id = useId();
  const status =
    !file ? null : kind === null ? "Checking…" : kind === slot ? "Looks right" : kind === "unknown" ? "Not a grade CSV" : `Looks like the ${kind} export`;
  const tone = !file || kind === null ? "neutral" : kind === slot ? "success" : kind === "unknown" ? "danger" : "warning";
  return (
    <div className={styles.picker}>
      <span className={adminStyles.formLabel} id={`${id}-label`}>
        {label} <span aria-hidden="true">*</span>
      </span>
      <div className={styles.pickerRow}>
        <input
          id={id}
          type="file"
          accept=".csv,text/csv"
          className={styles.fileInput}
          aria-labelledby={`${id}-label`}
          aria-describedby={`${id}-hint`}
          required
          onChange={onChange}
        />
        <label htmlFor={id} className={cn(adminStyles.btn, adminStyles.btnSecondary, adminStyles.btnSmall, styles.fileButton)}>
          {file ? "Change file" : "Choose CSV"}
        </label>
        <span className={styles.fileName}>{file ? file.name : "No file chosen"}</span>
        {status ? (
          <span className={styles.fileStatus} data-tone={tone}>
            {status}
          </span>
        ) : null}
      </div>
      <span id={`${id}-hint`} className={adminStyles.hint}>
        {hint}
      </span>
    </div>
  );
}
