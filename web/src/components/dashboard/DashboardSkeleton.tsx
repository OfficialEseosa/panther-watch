import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { FeatureCardsSkeleton } from "./FeatureCards";
import { StatSkeleton } from "@/components/ui/Stat";
import styles from "./Dashboard.module.css";

/** Stat row + feature cards, the shape of the member sections while they stream in. */
export function MemberSectionsSkeleton() {
  return (
    <>
      <div className={styles.stats}>
        <StatSkeleton />
        <StatSkeleton />
        <StatSkeleton />
      </div>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Jump back in</h2>
        <FeatureCardsSkeleton />
      </section>
    </>
  );
}

/** The whole dashboard while the session resolves (also the route's loading.tsx). */
export function DashboardSkeleton() {
  return (
    <div className={styles.stack}>
      <SkeletonGroup label="Loading your dashboard" className={styles.headerSkeleton}>
        <Skeleton width="min(320px, 70%)" height={32} radius="sm" />
        <Skeleton width="min(420px, 90%)" height={16} style={{ marginTop: "var(--space-2)" }} />
      </SkeletonGroup>
      <MemberSectionsSkeleton />
    </div>
  );
}
