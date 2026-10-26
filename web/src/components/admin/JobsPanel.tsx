"use client";

import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ChartIcon, ChevronDownIcon, RefreshIcon } from "@/components/ui/icons";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { adminApi, JOB_NAMES, type JobName, type JobRunDto } from "@/lib/client/admin";
import { useToast } from "@/components/ui/Toast";
import { ApiError, errorMessage, onUnauthorized } from "@/lib/client/http";
import { formatDuration } from "./format";
import { prettySummary, RUN_STATE_LABEL, RUN_STATE_TONE, runDuration, runHeadline, runState } from "./jobs";
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

/** Jobs tab: recent `job_runs` per job with state, timing, a digest and the raw summary. */
export function JobsPanel({ initialJob, initialRuns, n }: JobsPanelProps) {
  const toast = useToast();
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
    <div className={adminStyles.stack}>
      <div className={adminStyles.toolbar}>
        <SegmentedControl
          label="Job"
          options={JOB_NAMES.map((name) => ({ value: name, label: JOB_LABEL[name] }))}
          value={job}
          onChange={(name) => {
            setJob(name);
            void load(name);
          }}
        />
        <Button variant="secondary" size="sm" leadingIcon={<RefreshIcon />} loading={loading} onClick={() => void load(job)}>
          Reload
        </Button>
      </div>

      {error ? (
        <EmptyState
          variant="error"
          title="Couldn't load job runs"
          actions={
            <Button variant="secondary" onClick={() => void load(job)}>
              Try again
            </Button>
          }
        >
          {error}
        </EmptyState>
      ) : runs.length === 0 ? (
        <EmptyState icon={<ChartIcon size={24} />} title={`No ${JOB_LABEL[job].toLowerCase()} runs yet`}>
          Runs appear here once the cron (or an admin action) starts this job.
        </EmptyState>
      ) : (
        <section aria-label={`${JOB_LABEL[job]} runs`} aria-busy={loading || undefined}>
          <div className={styles.head} aria-hidden="true">
            <span>Status</span>
            <span>Started</span>
            <span>Duration</span>
            <span>Summary</span>
          </div>
          <ul className={styles.runs} data-loading={loading || undefined}>
            {runs.map((run) => {
              const state = runState(run);
              return (
                <li key={run.id} className={styles.run}>
                  <details>
                    <summary className={styles.summary}>
                      <span className={styles.status}>
                        <Badge tone={RUN_STATE_TONE[state]}>{RUN_STATE_LABEL[state]}</Badge>
                        <span className={styles.id}>#{run.id}</span>
                      </span>
                      <span className={styles.cell}>
                        <span className={styles.cellLabel}>Started </span>
                        <RelativeTime value={run.startedAt} />
                      </span>
                      <span className={styles.cell}>
                        <span className={styles.cellLabel}>Duration </span>
                        {formatDuration(runDuration(run))}
                      </span>
                      <span className={styles.headline}>{runHeadline(run)}</span>
                      <ChevronDownIcon size={16} className={styles.chevron} />
                    </summary>
                    <pre className={adminStyles.code}>{prettySummary(run.summary)}</pre>
                  </details>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
