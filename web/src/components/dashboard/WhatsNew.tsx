"use client";

import { useId, useState, useSyncExternalStore } from "react";
import type { ReactNode } from "react";
import { Button } from "@/components/ui/Button";
import { ChartIcon, ExpandIcon, StarIcon } from "@/components/ui/icons";
import { DASHBOARD_KEYS, useStoredFlag } from "./useStoredFlag";
import styles from "./WhatsNew.module.css";

/** Bump when the items change: everyone sees the card once per version. */
export const WHATS_NEW_VERSION = "v2";

const ITEMS: { icon: ReactNode; title: string; body: string }[] = [
  {
    icon: <StarIcon />,
    title: "The all-new PantherWatch",
    body: "Rebuilt to be faster and easier to use, on your laptop or your phone.",
  },
  {
    icon: <ChartIcon />,
    title: "Ratings and grade history, built in",
    body: "See how each professor grades and how students rate them, right on every course card.",
  },
  {
    icon: <ExpandIcon />,
    title: "The full story, one click away",
    body: "Open any section for its overview, grade history, ratings and syllabus in one place.",
  },
];

const noopSubscribe = () => () => {};

/**
 * "What's new" (pages.md §2): a static, dismissible card that shows once per version
 * (`pantherwatch.whatsNew.<version>`), or again via `?whatsnew=1` (the admin trigger).
 * Renders nothing until hydrated.
 */
export function WhatsNew() {
  const titleId = useId();
  const [seen, setSeen] = useStoredFlag(DASHBOARD_KEYS.whatsNew(WHATS_NEW_VERSION));
  const forced = useSyncExternalStore(
    noopSubscribe,
    () => new URLSearchParams(window.location.search).get("whatsnew") === "1",
    () => false,
  );
  const [closedForced, setClosedForced] = useState(false);

  const visible = forced ? !closedForced : seen === false;
  if (!visible) return null;

  const dismiss = () => {
    setSeen(true);
    setClosedForced(true);
    if (forced) {
      const url = new URL(window.location.href);
      url.searchParams.delete("whatsnew");
      window.history.replaceState(window.history.state, "", url);
    }
    document.getElementById("main")?.focus({ preventScroll: true });
  };

  return (
    <section className={styles.card} aria-labelledby={titleId}>
      <div className={styles.header}>
        <p className={styles.eyebrow}>What&rsquo;s new</p>
        <h2 id={titleId} className={styles.title}>
          A closer look at what just changed
        </h2>
      </div>
      <ul className={styles.items}>
        {ITEMS.map((item) => (
          <li key={item.title} className={styles.item}>
            <span className={styles.icon} aria-hidden="true">
              {item.icon}
            </span>
            <div>
              <p className={styles.itemTitle}>{item.title}</p>
              <p className={styles.itemBody}>{item.body}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className={styles.footer}>
        <Button variant="secondary" size="sm" onClick={dismiss}>
          Got it
        </Button>
      </div>
    </section>
  );
}
