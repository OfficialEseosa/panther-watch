import Link from "next/link";
import { cn } from "@/lib/ui/cn";
import { OldIcon } from "./icons";
import buttons from "./buttons.module.css";
import styles from "./CourseResults.module.css";

/**
 * The original results toolbar: "New search" on the left (back to the form, prefilled with this
 * search) and the search summary on the right. The summary is the page's h1.
 */
export function ResultsToolbar({ title, editHref = "/course-search" }: { title: string; editHref?: string }) {
  return (
    <div className={styles.toolbar}>
      <Link href={editHref} className={cn(buttons.primary, styles.newSearch)}>
        <OldIcon name="search" />
        New search
      </Link>
      <div className={styles.summary}>
        <span className={styles.summaryLabel} aria-hidden="true">
          Search
        </span>
        <h1 className={styles.summaryValue}>{title}</h1>
      </div>
    </div>
  );
}
