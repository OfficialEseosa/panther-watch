"use client";

import { useEffect, useState } from "react";
import type { ReactNode } from "react";
import { NavEntranceContext } from "@/lib/ui/navEntrance";

// Module scope: false on the server and on the first client mount, true afterwards.
let hydrated = false;

/**
 * Tells pages under (app) whether they mounted from a client navigation (true) or the first
 * document load (false), via NavEntranceContext. No page-enter animation: the original app had
 * none, so pages appear in place (restored design, 2026-10-26).
 */
export default function Template({ children }: { children: ReactNode }) {
  const [enter] = useState(() => hydrated);
  useEffect(() => {
    hydrated = true;
  }, []);
  return <NavEntranceContext value={enter}>{children}</NavEntranceContext>;
}
