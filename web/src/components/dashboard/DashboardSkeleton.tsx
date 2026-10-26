import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { FeatureCardsSkeleton } from "./FeatureCards";
import styles from "./Dashboard.module.css";

/** The whole dashboard while the session resolves (also the route's loading.tsx). */
export function DashboardSkeleton() {
  return (
    <div className={styles.dashboard}>
      <div className={styles.header}>
        <SkeletonGroup label="Loading your dashboard" className={styles.headerSkeleton}>
          <Skeleton width={80} height={12} />
          <Skeleton width="min(320px, 80%)" height={32} radius="sm" />
          <Skeleton width="min(480px, 95%)" height={16} />
        </SkeletonGroup>
      </div>
      <FeatureCardsSkeleton />
    </div>
  );
}
