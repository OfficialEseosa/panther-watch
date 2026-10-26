"use client";

import Link from "next/link";
import { useId } from "react";
import { IconButton } from "@/components/ui/IconButton";
import { CheckIcon, XIcon } from "@/components/ui/icons";
import { cn } from "@/lib/ui/cn";
import { DASHBOARD_KEYS, useStoredFlag } from "./useStoredFlag";
import styles from "./GettingStarted.module.css";

export type GettingStartedProps = {
  /** At least one watched section. */
  tracked: boolean;
  /** At least one class on a schedule (any term). */
  scheduled: boolean;
};

/**
 * "Getting started" checklist (pages.md §2), replacing the old coach-mark tutorial. Steps come
 * from the member's real data; "Search a course" also counts once they follow its link, or
 * once they've tracked or scheduled anything (both need a search first). Hidden for good once
 * all three are done or when dismissed (localStorage). Renders nothing until hydrated, so a
 * dismissed checklist never flashes.
 */
export function GettingStarted({ tracked, scheduled }: GettingStartedProps) {
  const titleId = useId();
  const [dismissed, setDismissed] = useStoredFlag(DASHBOARD_KEYS.gettingStartedDismissed);
  const [searchedFlag, setSearched] = useStoredFlag(DASHBOARD_KEYS.gettingStartedSearched);
  const searched = tracked || scheduled || searchedFlag === true;

  const steps = [
    {
      key: "search",
      title: "Search a course",
      body: "Pick a term and subject to see live seats for every section.",
      href: "/course-search",
      action: "Search classes",
      done: searched,
      onFollow: () => setSearched(true),
    },
    {
      key: "track",
      title: "Track a class",
      body: "Watch a full section and we’ll email you when a seat opens.",
      href: "/course-search",
      action: "Find a section",
      done: tracked,
    },
    {
      key: "schedule",
      title: "Build your schedule",
      body: "Add sections to see your week and catch time conflicts.",
      href: "/schedule-builder",
      action: "Open schedule builder",
      done: scheduled,
    },
  ];
  const doneCount = steps.filter((step) => step.done).length;

  if (dismissed !== false || doneCount === steps.length) return null;

  const dismiss = () => {
    setDismissed(true);
    // The card is about to unmount with focus on its button; keep focus in the page.
    document.getElementById("main")?.focus({ preventScroll: true });
  };

  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <div className={styles.header}>
        <div>
          <h2 id={titleId} className={styles.title}>
            Getting started
          </h2>
          <p className={styles.progress}>
            {doneCount} of {steps.length} done
          </p>
        </div>
        <IconButton label="Dismiss getting started" icon={<XIcon />} size="sm" onClick={dismiss} />
      </div>
      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step.key} className={cn(styles.step, step.done && styles.done)}>
            <span className={styles.mark} aria-hidden="true">
              {step.done ? <CheckIcon size={16} strokeWidth={2.25} /> : null}
            </span>
            <div className={styles.stepText}>
              <p className={styles.stepTitle}>
                {step.title}
                <span className="sr-only">{step.done ? " (done)" : " (not done yet)"}</span>
              </p>
              {step.done ? null : (
                <>
                  <p className={styles.stepBody}>{step.body}</p>
                  <Link href={step.href} className={styles.stepLink} onClick={step.onFollow}>
                    {step.action}
                  </Link>
                </>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
