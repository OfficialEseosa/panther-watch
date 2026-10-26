import { PageHeader } from "@/components/shell/PageHeader";
import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import { CourseCardSkeleton } from "./CourseCard";
import styles from "./CourseResults.module.css";

/** Course results while the search streams: header, filter bar and 6 card skeletons. */
export function ResultsSkeleton({ title = "Course results" }: { title?: string }) {
  return (
    <>
      <PageHeader title={title} description="Loading live seat counts…" />
      <SkeletonGroup label="Loading filters" className={styles.bar}>
        <div className={styles.barInner}>
          <Skeleton width={260} height={40} radius="md" />
          <Skeleton width={120} height={32} radius="full" />
          <Skeleton width={220} height={32} radius="full" />
        </div>
      </SkeletonGroup>
      <CardGridSkeleton count={6} />
    </>
  );
}

export function CardGridSkeleton({ count, label = "Loading sections" }: { count: number; label?: string }) {
  return (
    <ul className={styles.grid} aria-busy="true">
      {Array.from({ length: count }, (_, i) => (
        <li key={i} className={styles.item} aria-hidden={i > 0 || undefined}>
          <CourseCardSkeleton label={label} />
        </li>
      ))}
    </ul>
  );
}
