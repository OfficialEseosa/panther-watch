import { unstable_rethrow } from "next/navigation";
import styles from "./admin.module.css";

/**
 * Inline error for a failed admin loader, in the tab's card. Call `rethrowControlFlow(error)`
 * first in the catch so notFound()/redirect() still work.
 */
export function LoadError({ what }: { what: string }) {
  return (
    <section className={styles.section}>
      <p className={styles.notice} data-tone="danger" role="alert">
        Couldn&rsquo;t load {what}. Reload the page to try again; if it keeps failing, check the server logs.
      </p>
    </section>
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
