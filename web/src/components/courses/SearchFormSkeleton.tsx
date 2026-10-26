import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import styles from "./page.module.css";

function FieldSkeleton() {
  return (
    <div className={styles.skeletonField}>
      <Skeleton width={80} height={12} />
      <Skeleton width="100%" height={40} radius="md" />
    </div>
  );
}

/** Same boxes as CourseSearchForm (terms are still loading). */
export function SearchFormSkeleton() {
  return (
    <SkeletonGroup label="Loading the search form" className={styles.formSkeleton}>
      <div className={styles.skeletonRow}>
        <FieldSkeleton />
        <FieldSkeleton />
      </div>
      <FieldSkeleton />
      <div className={styles.skeletonRow}>
        <FieldSkeleton />
      </div>
    </SkeletonGroup>
  );
}
