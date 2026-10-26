"use client";

import { useEffect } from "react";
import buttons from "@/components/courses/buttons.module.css";
import pageStyles from "@/components/courses/page.module.css";
import { ResultsToolbar } from "@/components/courses/ResultsToolbar";
import { ErrorMessage } from "@/components/courses/SectionParts";
import { cn } from "@/lib/ui/cn";

/** GoSolar (or our server) failed for the whole page: the original error box. Never shows the error. */
export default function CourseResultsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className={cn(pageStyles.default, pageStyles.stack)}>
      <ResultsToolbar title="Course results" />
      <ErrorMessage
        action={
          <button type="button" className={buttons.secondary} onClick={reset}>
            Try again
          </button>
        }
      >
        Failed to load courses. Georgia State&rsquo;s course system didn&rsquo;t answer; this usually clears in a minute.
        {error.digest ? ` (Error ID: ${error.digest})` : null}
      </ErrorMessage>
    </div>
  );
}
