"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDownIcon, ClockIcon, RefreshIcon } from "@/components/ui/icons";
import { adminApi, JOB_NAMES, type JobName, type JobRunDto } from "@/lib/client/admin";
import { useToast } from "@/components/ui/Toast";
import { ApiError, errorMessage, onUnauthorized } from "@/lib/client/http";
import { cn } from "@/lib/ui/cn";
import { formatDuration } from "./format";
import { prettySummary, RUN_STATE_LABEL, runDuration, runHeadline, runState } from "./jobs";
import { RelativeTime } from "./RelativeTime";
import { createSequence } from "./sequence";
import styles from "./Jobs.module.css";
import adminStyles from "./admin.module.css";

const JOB_LABEL: Record<JobName, string> = {
  watcher: "Watcher",
  cleanup: "Cleanup",
  syllabi: "Syllabi",
  grades: "Grades",
};

export type JobsPanelProps = {
  initialJob: JobName;
  initialRuns: JobRunDto[];
  n: number;
};

/**
 * Jobs tab (not in the old app): recent `job_runs` per job, styled like the other tabs' cards.
 * Each run expands to its raw summary.
 */
export function JobsPanel({ initialJob, initialRuns, n }: JobsPanelProps) {
  const toast = useToast();
  const id = useId();
  const [job, setJob] = useState<JobName>(initialJob);
  const [runs, setRuns] = useState(initialRuns);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(createSequence());
  const abort = useRef<AbortController | null>(null);

  const load = async (name: JobName) => {
    abort.current?.abort();
    const controller = new AbortController();
    abort.current = controller;
    const ticket = seq.current.next();
    setLoading(true);
    try {
      const result = await adminApi.jobs(name, n, controller.signal);
      if (!seq.current.isLatest(ticket)) return;
      setRuns(result.runs);
      setError(null);
    } catch (caught) {
      if (!seq.current.isLatest(ticket) || controller.signal.aborted) return;
      if (caught instanceof ApiError && caught.status === 401) onUnauthorized(toast);
      setError(errorMessage(caught, "Couldn't reach the server."));
    } finally {
      if (seq.current.isLatest(ticket)) setLoading(false);
    }
  };

  useEffect(() => {
    const sequence = seq.current;
    return () => {
      sequence.cancel();
      abort.current?.abort();
    };
  }, []);

  return (
    <section className={adminStyles.section} aria-labelledby={`${id}-title`}>
      <div className={adminStyles.sectionHead}>
        <h2 id={`${id}-title`} className={adminStyles.sectionHeading}>
          <ClockIcon size={22} />
          Background jobs
        </h2>
        <div className={styles.controls}>
          <label className="sr-only" htmlFor={`${id}-job`}>
            Job
          </label>
          <select
            id={`${id}-job`}
            className={cn(adminStyles.control, styles.select)}
            value={job}
            onChange={(event) => {
              const name = event.target.value as JobName;
              setJob(name);
              void load(name);
            }}
          >
            {JOB_NAMES.map((name) => (
              <option key={name} value={name}>
                {JOB_LABEL[name]}
              </option>
            ))}
          </select>
          <button type="button" className={cn(adminStyles.btn, adminStyles.btnSecondary)} disabled={loading} onClick={() => void load(job)}>
            <RefreshIcon />
            {loading ? "Loading…" : "Reload"}
          </button>
        </div>
      </div>

      {error ? (
        <p className={adminStyles.notice} data-tone="danger" role="alert">
          Couldn&rsquo;t load job runs: {error}
        </p>
      ) : runs.length === 0 ? (
        <p className={styles.empty}>
          No {JOB_LABEL[job].toLowerCase()} runs yet. Runs appear here once the cron (or an admin action) starts this job.
        </p>
      ) : (
        <section aria-label={`${JOB_LABEL[job]} runs`} aria-busy={loading || undefined}>
          <ul className={styles.runs}>
            {runs.map((run) => {
              const state = runState(run);
              return (
                <li key={run.id} className={styles.run}>
                  <details>
                    <summary className={styles.summary}>
                      <span className={styles.status}>
                        <span className={styles.pill} data-state={state}>
                          {RUN_STATE_LABEL[state]}
                        </span>
                        <span className={styles.id}>#{run.id}</span>
                      </span>
                      <span className={styles.cell}>
                        <RelativeTime value={run.startedAt} />
                        {" · "}
                        {formatDuration(runDuration(run))}
                      </span>
                      <span className={styles.headline}>{runHeadline(run)}</span>
                      <ChevronDownIcon size={16} className={styles.chevron} />
                    </summary>
                    <pre className={cn(adminStyles.code, styles.code)}>{prettySummary(run.summary)}</pre>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </section>
  );
}
