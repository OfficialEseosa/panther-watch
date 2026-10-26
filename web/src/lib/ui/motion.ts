/**
 * Motion helpers (docs/design/motion.md §3.3). Client-only: call from effects or event handlers.
 */

export const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

let running: ViewTransition | null = null;

/**
 * Runs `update` inside a same-document View Transition when supported and allowed; otherwise
 * runs it directly. `update` must apply the DOM change synchronously (wrap React state in
 * `flushSync`). Sets `html[data-vt=<kind>]` for the duration so CSS can suppress competing
 * entrances. Only one transition runs at a time: a running one is skipped first.
 */
export function withViewTransition(kind: string, update: () => void): Promise<void> {
  if (typeof document === "undefined" || !document.startViewTransition || prefersReducedMotion()) {
    update();
    return Promise.resolve();
  }
  running?.skipTransition();
  const root = document.documentElement;
  root.dataset.vt = kind;
  const vt = document.startViewTransition(update);
  running = vt;
  return vt.finished
    .catch(() => undefined)
    .finally(() => {
      if (running === vt) {
        running = null;
        delete root.dataset.vt;
      }
    });
}

/**
 * Plays a CSS exit: sets `data-closing` on `el` and resolves on its `animationend`, or after a
 * 300 ms safety timeout (no animation, reduced motion, element detached). Removes the attribute
 * unless `keep` is true (callers that unmount the element right after can keep it).
 */
export function playExit(el: HTMLElement, { keep = false }: { keep?: boolean } = {}): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      el.removeEventListener("animationend", onEnd);
      window.clearTimeout(timer);
      if (!keep) delete el.dataset.closing;
      resolve();
    };
    const onEnd = (event: AnimationEvent) => {
      if (event.target === el) finish();
    };
    el.addEventListener("animationend", onEnd);
    const timer = window.setTimeout(finish, 300);
    el.dataset.closing = "";
  });
}
