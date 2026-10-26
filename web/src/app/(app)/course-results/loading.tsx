import pageStyles from "@/components/courses/page.module.css";
import { ResultsSkeleton } from "@/components/courses/ResultsSkeleton";

export default function Loading() {
  return (
    <div className={pageStyles.default}>
      <ResultsSkeleton />
    </div>
  );
}
