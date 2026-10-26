import { Skeleton, SkeletonGroup } from "@/components/ui/Skeleton";
import styles from "./admin.module.css";

/** Generic admin list placeholder: a toolbar line and `rows` rows. */
export function ListSkeleton({ label, rows = 5 }: { label: string; rows?: number }) {
  return (
    <div className={styles.stack}>
      <div className={styles.section}>
        <Skeleton width="min(320px, 70%)" height={16} />
        <SkeletonGroup label={label} className={styles.list}>
          {Array.from({ length: rows }, (_, i) => (
            <div key={i} className={styles.row}>
              <div className={`${styles.rowText} ${styles.skeletonText}`}>
                <Skeleton width="20%" height={14} />
                <Skeleton width="70%" height={12} />
              </div>
            </div>
          ))}
        </SkeletonGroup>
      </div>
    </div>
  );
}
