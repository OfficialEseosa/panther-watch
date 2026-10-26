"use client";

import { Banner } from "@/components/ui/Banner";
import { Button } from "@/components/ui/Button";
import type { Conflict } from "@/lib/schedule/conflicts";
import styles from "./ScheduleExtras.module.css";
import { courseCode } from "@/lib/format";

export type ConflictBannerProps = {
  conflicts: Conflict[];
  /** Scrolls to and focuses the first conflicting block. */
  onShow: () => void;
};

const codeOf = (section: Conflict["sections"][number]) => courseCode(section.subject, section.courseNumber);

/** Danger summary of every overlapping pair (pages.md §6), with [Show]. */
export function ConflictBanner({ conflicts, onShow }: ConflictBannerProps) {
  if (conflicts.length === 0) return null;
  const first = conflicts[0];
  const title =
    conflicts.length === 1
      ? `1 conflict: ${codeOf(first.sections[0])} and ${codeOf(first.sections[1])} overlap ${first.label}.`
      : `${conflicts.length} conflicts`;
  return (
    <Banner
      tone="danger"
      title={title}
      action={
        <Button size="sm" variant="secondary" onClick={onShow}>
          Show
        </Button>
      }
    >
      {conflicts.length > 1 ? (
        <ul className={styles.pairs}>
          {conflicts.map((conflict) => (
            <li key={`${conflict.crns[0]}-${conflict.crns[1]}`}>
              {codeOf(conflict.sections[0])} and {codeOf(conflict.sections[1])} overlap {conflict.label}.
            </li>
          ))}
        </ul>
      ) : null}
    </Banner>
  );
}
