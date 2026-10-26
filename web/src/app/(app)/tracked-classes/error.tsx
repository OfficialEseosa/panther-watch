"use client";

import { useEffect } from "react";
import buttons from "@/components/courses/buttons.module.css";
import pageStyles from "@/components/courses/page.module.css";
import { ErrorMessage } from "@/components/courses/SectionParts";
import { TrackedHeader } from "@/components/tracked/TrackedClasses";
import styles from "@/components/tracked/TrackedClasses.module.css";
import { cn } from "@/lib/ui/cn";

/** The original error box. Never renders the Error object. */
export default function TrackedClassesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className={cn(pageStyles.default, styles.page)}>
      <TrackedHeader count={0} loading />
      <ErrorMessage
        action={
          <button type="button" className={buttons.secondary} onClick={reset}>
            Try again
          </button>
        }
      >
        Failed to load tracked classes. Your watches are safe; please try again.
        {error.digest ? ` (Error ID: ${error.digest})` : null}
      </ErrorMessage>
    </div>
  );
}
