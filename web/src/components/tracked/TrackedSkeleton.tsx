import { LoadingBar } from "@/components/courses/LoadingBar";
import { TrackedHeader } from "./TrackedClasses";
import styles from "./TrackedClasses.module.css";

/** Tracked classes while live seat counts stream in (can take a while on a cold GoSolar). */
export function TrackedSkeleton() {
  return (
    <div className={styles.page}>
      <TrackedHeader count={0} loading />
      <LoadingBar message="Loading tracked classes..." />
    </div>
  );
}
