"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { RefreshIcon } from "@/components/ui/icons";
import styles from "./status.module.css";

/**
 * Root error boundary (pages.md §10): EmptyState error + "Try again". Never renders the error
 * object; only the digest goes into the details disclosure for support.
 */
export default function RootError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main id="main" className={styles.main}>
      <EmptyState
        variant="error"
        headingAs="h1"
        title="Something went wrong"
        details={error.digest ? `Error ID: ${error.digest}` : undefined}
        actions={
          <Button leadingIcon={<RefreshIcon />} onClick={reset}>
            Try again
          </Button>
        }
      >
        This page couldn&rsquo;t load. It usually clears up in a moment.
      </EmptyState>
    </main>
  );
}
