import { unstable_rethrow } from "next/navigation";
import { EmptyState } from "@/components/ui/EmptyState";

/**
 * Inline error for a failed admin loader (pages.md §8.1: EmptyState `error`). Call
 * `rethrowControlFlow(error)` first in the catch so notFound()/redirect() still work.
 */
export function LoadError({ what }: { what: string }) {
  return (
    <EmptyState variant="error" title={`Couldn't load ${what}`} headingAs="h2">
      Reload the page to try again. If it keeps failing, check the server logs.
    </EmptyState>
  );
}

export function rethrowControlFlow(error: unknown): void {
  unstable_rethrow(error);
  console.error("admin: loader failed", error instanceof Error ? error.name : typeof error);
}

export type Loaded<T> = { ok: true; data: T } | { ok: false };

/** Awaits a loader; control-flow errors (notFound, redirect) rethrow, anything else -> { ok: false }. */
export async function settle<T>(promise: Promise<T>): Promise<Loaded<T>> {
  try {
    return { ok: true, data: await promise };
  } catch (error) {
    rethrowControlFlow(error);
    return { ok: false };
  }
}
