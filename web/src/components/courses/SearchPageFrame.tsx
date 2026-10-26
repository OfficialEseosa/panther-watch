import type { ReactNode } from "react";
import { cn } from "@/lib/ui/cn";
import formStyles from "./CourseSearchForm.module.css";
import pageStyles from "./page.module.css";

/** The original search page: header card ("Search for Classes"), then the form card. */
export function SearchPageFrame({ children }: { children: ReactNode }) {
  return (
    <div className={cn(pageStyles.default, formStyles.page)}>
      <header className={formStyles.header}>
        <h1 className={formStyles.title}>Search for Classes</h1>
        <p className={formStyles.description}>Find and explore available courses for the semester</p>
      </header>
      <div className={formStyles.container}>{children}</div>
    </div>
  );
}
