"use client";

import { createContext, useContext } from "react";

/**
 * True when the current (app) page mounted from a client navigation rather than the first
 * document load (motion.md §4.1). Lists use it to decide whether to stagger in (§4.2).
 */
export const NavEntranceContext = createContext(false);

export function useNavEntrance(): boolean {
  return useContext(NavEntranceContext);
}
