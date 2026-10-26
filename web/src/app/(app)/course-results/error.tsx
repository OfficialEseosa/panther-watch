"use client";

import { useEffect } from "react";
import pageStyles from "@/components/courses/page.module.css";
import { Button, ButtonLink } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { RefreshIcon } from "@/components/ui/icons";

/** pages.md §4 error state: GoSolar (or our server) failed for the whole page. */
export default function CourseResultsError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className={pageStyles.default}>
      <EmptyState
        variant="error"
        headingAs="h1"
        title="Couldn&rsquo;t reach Georgia State&rsquo;s course system."
        details={error.digest ? `Error ID: ${error.digest}` : undefined}
        actions={
          <>
            <Button leadingIcon={<RefreshIcon />} onClick={reset}>
              Try again
            </Button>
            <ButtonLink href="/course-search" variant="secondary">
              Edit search
            </ButtonLink>
          </>
        }
      >
        This usually clears in a minute.
      </EmptyState>
    </div>
  );
}
