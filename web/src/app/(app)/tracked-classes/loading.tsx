import pageStyles from "@/components/courses/page.module.css";
import { TrackedSkeleton } from "@/components/tracked/TrackedSkeleton";

export default function Loading() {
  return (
    <div className={pageStyles.default}>
      <TrackedSkeleton />
    </div>
  );
}
