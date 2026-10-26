"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { RefreshIcon } from "@/components/ui/icons";

/** Segment error boundary: EmptyState error + Try again (pages.md §6). Never renders the error. */
export default function ScheduleBuilderError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <EmptyState
      variant="error"
      headingAs="h1"
      title="Couldn't load your schedule."
      details={error.digest ? `Error ID: ${error.digest}` : undefined}
      actions={
        <Button leadingIcon={<RefreshIcon />} onClick={reset}>
          Try again
        </Button>
      }
    >
      It usually clears up in a moment.
    </EmptyState>
  );
}
