"use client";

import { useState } from "react";
import { OldIcon } from "./icons";
import buttons from "./buttons.module.css";
import styles from "./CourseResults.module.css";
import own from "./ResultsPagination.module.css";

export type ResultsPaginationProps = {
  page: number;
  pageCount: number;
  onPage: (page: number) => void;
};

/**
 * The original pagination card (Previous · Page x of n · Next) where x is a small number field:
 * typing a page and pressing Enter (or leaving the field) jumps there, clamped to 1..n.
 */
export function ResultsPagination({ page, pageCount, onPage }: ResultsPaginationProps) {
  // The field's text while it is being edited; null shows the current page.
  const [draft, setDraft] = useState<string | null>(null);

  const commit = () => {
    if (draft === null) return;
    const value = Number.parseInt(draft, 10);
    setDraft(null);
    if (!Number.isFinite(value)) return;
    const next = Math.min(Math.max(1, value), pageCount);
    if (next !== page) onPage(next);
  };

  return (
    <nav className={styles.pagination} aria-label="Pages">
      <button type="button" className={buttons.secondary} disabled={page <= 1} onClick={() => onPage(page - 1)}>
        <OldIcon name="chevronLeft" size={16} />
        Previous
      </button>
      <p className={`${styles.pageInfo} ${own.info}`}>
        Page{" "}
        <input
          type="text"
          inputMode="numeric"
          pattern="[0-9]*"
          autoComplete="off"
          className={own.input}
          aria-label="Page number"
          value={draft ?? String(page)}
          onFocus={(event) => event.currentTarget.select()}
          onChange={(event) => setDraft(event.target.value.replace(/\D/g, "").slice(0, 4))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commit();
            } else if (event.key === "Escape" && draft !== null) {
              event.preventDefault();
              setDraft(null);
            }
          }}
          onBlur={commit}
        />{" "}
        of {pageCount}
      </p>
      {/* The page change, announced (the field itself is not a live region). */}
      <p className="sr-only" aria-live="polite">
        Page {page} of {pageCount}
      </p>
      <button type="button" className={buttons.secondary} disabled={page >= pageCount} onClick={() => onPage(page + 1)}>
        Next
        <OldIcon name="chevronRight" size={16} />
      </button>
    </nav>
  );
}
