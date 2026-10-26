import { DashboardSkeleton } from "@/components/dashboard/DashboardSkeleton";
import styles from "./page.module.css";

/** Shown while a client navigation to /dashboard waits for the page (same boxes as the real one). */
export default function DashboardLoading() {
  return (
    <div className={styles.page}>
      <DashboardSkeleton />
    </div>
  );
}
