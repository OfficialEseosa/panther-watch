"use client";

import { useRouter } from "next/navigation";
import { startTransition, useEffect, useId, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Badge } from "@/components/ui/Badge";
import { Banner } from "@/components/ui/Banner";
import { Button, buttonClassName } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Dialog } from "@/components/ui/Dialog";
import { Field } from "@/components/ui/Field";
import { ExternalIcon, RefreshIcon, TrashIcon } from "@/components/ui/icons";
import { Input } from "@/components/ui/Input";
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
import { RUN_STATE_LABEL, RUN_STATE_TONE, runState, summaryErrors } from "./jobs";
import { RelativeTime } from "./RelativeTime";
import { Stat } from "@/components/ui/Stat";
import styles from "./Grades.module.css";
import adminStyles from "./admin.module.css";
import { termLabel } from "@/lib/format";

const POLL_MS = 10_000;
const APEX_URL = "https://dssapex.gsu.edu/ords/f?p=140:184";


type Slots = Record<GradeSlot, { file: File | null; check: SlotCheck }>;
const EMPTY_SLOTS: Slots = { summary: { file: null, check: { kind: null } }, detailed: { file: null, check: { kind: null } } };

/**
 * Grade data tab (pages.md §8.4). Manual upload is the primary path: APEX sits behind a
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
  const dot = status.running ? styles.dotRunning : lastState === "failed" ? styles.dotFailed : styles.dotIdle;

  return (
    <div className={adminStyles.stack}>
      <div className={adminStyles.stats}>
        <Stat label="Terms on file" value={status.terms.length} />
        <div className={cn(adminStyles.wide, styles.statusCard)}>
          <p className={adminStyles.capsLabel}>Automatic refresh</p>
          <p className={styles.statusLine}>
            <span className={cn(styles.dot, dot)} aria-hidden="true" />
            {/* Only the state is live: the relative time ticks every minute and must not be announced. */}
            <span aria-live="polite">{status.running ? "Running" : lastState === "failed" ? "Last run failed" : "Idle"}</span>
            {lastRun ? (
              <span className={adminStyles.muted}>
                {" "}
                · last run <RelativeTime value={lastRun.startedAt} />
              </span>
            ) : (
              <span className={adminStyles.muted}> · never run</span>
            )}
          </p>
          {lastRun && lastState ? (
            <p className={adminStyles.muted}>
              <Badge tone={RUN_STATE_TONE[lastState]}>{RUN_STATE_LABEL[lastState]}</Badge>{" "}
              {lastErrors[0] ? <span className={styles.errorText}>{lastErrors[0]}</span> : null}
            </p>
          ) : null}
        </div>
      </div>

      <Card title="Upload a term">
        <form key={formKey} id={formId} className={styles.form} onSubmit={onUpload} noValidate>
          <Field label="Term code" hint="e.g. 202605 (Summer 2026). Uploading a stored term replaces it." error={termError} required>
            <Input
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              autoComplete="off"
              value={term}
              onChange={(event) => {
                setTerm(event.target.value.replace(/\D/g, ""));
                if (termError) setTermError(null);
              }}
              className={styles.termInput}
            />
          </Field>

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
            <Banner
              key={message.text}
              tone={message.tone}
              action={
                swapped ? (
                  <Button size="sm" variant="secondary" onClick={swap}>
                    Swap files
                  </Button>
                ) : undefined
              }
            >
              {message.text}
            </Banner>
          ))}
          {uploadError ? (
            <Banner tone="danger" role="alert">
              {uploadError}
            </Banner>
          ) : null}

          <div className={styles.formActions}>
            <Button type="submit" loading={uploading}>
              Upload
            </Button>
          </div>
        </form>
      </Card>

      <details className={styles.instructions}>
        <summary className={styles.instructionsSummary}>How to export the two CSVs from APEX</summary>
        <ol className={styles.steps}>
          <li>
            In a normal browser, open GSU&rsquo;s grade distribution site:{" "}
            <a href={APEX_URL} target="_blank" rel="noreferrer noopener" className={styles.link}>
              dssapex.gsu.edu, app 140, page 184 <ExternalIcon size={16} />
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
            Upload both here with the same term code. If no section has a CRS AVG yet, the grades haven&rsquo;t
            posted and nothing is stored.
          </li>
        </ol>
      </details>

      <section className={adminStyles.section} aria-labelledby="grade-terms">
        <h2 id="grade-terms" className={adminStyles.sectionTitle}>
          Terms on file
        </h2>
        {status.terms.length === 0 ? (
          <p className={adminStyles.muted}>No terms stored yet.</p>
        ) : (
          <ul className={adminStyles.list}>
            {status.terms.map((code) => (
              <li key={code} className={adminStyles.row}>
                <div className={adminStyles.rowText}>
                  <span className={adminStyles.rowTitle}>{termLabel(code)}</span>
                  <span className={cn(adminStyles.rowSub, adminStyles.numeric)}>{code}</span>
                </div>
                <div className={styles.rowEnd}>
                  <Button
                    size="sm"
                    variant="danger-ghost"
                    leadingIcon={<TrashIcon />}
                    onClick={() => {
                      setDeleting(code);
                      setDeleteOpen(true);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className={cn(adminStyles.section, styles.fallback)} aria-labelledby="grade-refresh">
        <h2 id="grade-refresh" className={adminStyles.capsLabel}>
          Automatic refresh (fallback)
        </h2>
        <p className={adminStyles.prose}>
          Tries to scrape the next term from APEX on the server. APEX blocks non-browser clients with a Cloudflare
          challenge, so this usually fails from production; use the upload above instead.
        </p>
        <div>
          <Button
            variant="ghost"
            size="sm"
            leadingIcon={<RefreshIcon />}
            loading={refreshing}
            disabled={status.running}
            onClick={() => void onRefresh()}
          >
            {status.running ? "Refresh running…" : "Try automatic refresh"}
          </Button>
        </div>
      </section>

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
          Every section&rsquo;s grades for {deleting ? `${termLabel(deleting)} (${deleting})` : "this term"} are
          removed. Course cards stop showing them until you upload the term again.
        </p>
      </Dialog>
    </div>
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
      <span className={styles.pickerLabel} id={`${id}-label`}>
        {label} <span aria-hidden="true">*</span>
      </span>
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
      <label htmlFor={id} className={buttonClassName({ variant: "secondary", size: "sm", className: styles.fileButton })}>
        {file ? "Change file" : "Choose CSV"}
      </label>
      <span className={styles.fileName}>{file ? file.name : "No file chosen"}</span>
      {status ? <Badge tone={tone}>{status}</Badge> : null}
      <span id={`${id}-hint`} className={styles.pickerHint}>
        {hint}
      </span>
    </div>
  );
}
