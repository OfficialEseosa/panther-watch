"use client";

import { useEffect } from "react";
import pageStyles from "@/components/courses/page.module.css";
import { PageHeader } from "@/components/shell/PageHeader";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { RefreshIcon } from "@/components/ui/icons";

/** pages.md §5 error state. Never renders the Error object (audit bug #1). */
export default function TrackedClassesError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div className={pageStyles.default}>
      <PageHeader title="Tracked classes" />
      <EmptyState
        variant="error"
        title="Couldn&rsquo;t load your tracked classes."
        details={error.digest ? `Error ID: ${error.digest}` : undefined}
        actions={
          <Button leadingIcon={<RefreshIcon />} onClick={reset}>
            Try again
          </Button>
        }
      >
        Your watches are safe. This usually clears up in a moment.
      </EmptyState>
    </div>
  );
}
