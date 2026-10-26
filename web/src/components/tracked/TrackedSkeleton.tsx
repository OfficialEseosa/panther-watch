import { CardGridSkeleton } from "@/components/courses/ResultsSkeleton";
import { PageHeader } from "@/components/shell/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import styles from "./TrackedClasses.module.css";

/** Tracked classes while live seat counts stream in (can take a while on a cold GoSolar). */
export function TrackedSkeleton() {
  return (
    <>
      <PageHeader title="Tracked classes" description="Checking live seat counts…" />
      <div className={styles.skeletonTitle} aria-hidden="true">
        <Skeleton width={140} height={20} />
      </div>
      <CardGridSkeleton count={4} label="Loading tracked classes" />
    </>
  );
}
