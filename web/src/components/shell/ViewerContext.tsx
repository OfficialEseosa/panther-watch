"use client";

import { createContext, use, useContext } from "react";
import type { ReactNode } from "react";
import type { Viewer } from "./types";

const ViewerContext = createContext<Promise<Viewer> | null>(null);

/**
 * Hands the layout's viewer promise to client components. The promise is created (not awaited)
 * in app/(app)/layout.tsx, so the shell's static parts prerender and only the user-dependent
 * bits stream in behind their own <Suspense> boundaries (Cache Components).
 */
export function ViewerProvider({ viewer, children }: { viewer: Promise<Viewer>; children: ReactNode }) {
  return <ViewerContext value={viewer}>{children}</ViewerContext>;
}

const GUEST: Viewer = { user: null, isAdmin: false };
const GUEST_PROMISE = Promise.resolve(GUEST);

/** The current viewer. Suspends until known: call it only inside a <Suspense> boundary. */
export function useViewer(): Viewer {
  return use(useContext(ViewerContext) ?? GUEST_PROMISE);
}
