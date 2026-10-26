"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { NavEntranceContext } from "@/lib/ui/navEntrance";
import styles from "./template.module.css";

// Module scope: false on the server and on the first client mount, true afterwards.
let hydrated = false;

/**
 * Page enter (motion.md §4.1): pages under (app) rise in on client navigations only, never on
 * the first document load (keeps LCP honest). No exit animation.
 */
export default function Template({ children }: { children: ReactNode }) {
  const [enter] = useState(() => hydrated);
  useEffect(() => {
    hydrated = true;
  }, []);
  return (
    <NavEntranceContext value={enter}>
      <div className={styles.page} data-enter={enter || undefined}>
        {children}
      </div>
    </NavEntranceContext>
  );
}
