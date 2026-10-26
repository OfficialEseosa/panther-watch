import styles from "./SchedulePlanner.module.css";

/** The old page's loading state ("Loading schedule..."), for loading.tsx and the Suspense fallback. */
export function ScheduleLoading() {
  return (
    <div className={styles.page}>
      <div className={styles.loadingState} role="status">
        Loading schedule…
      </div>
    </div>
  );
}
