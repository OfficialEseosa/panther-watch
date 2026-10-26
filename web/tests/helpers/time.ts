import { vi } from "vitest";

/**
 * Runs `fn` with `Date` (and `Date.now()`) frozen at `date`, then restores the real clock.
 * Only `Date` is faked: timers keep running, so awaiting PGlite, HTTP or `AbortSignal.timeout`
 * inside `fn` still works. Database `now()` is NOT affected.
 */
export async function withFakeNow<T>(
  date: Date | string | number,
  fn: () => T | Promise<T>,
): Promise<T> {
  vi.useFakeTimers({ toFake: ["Date"] });
  try {
    vi.setSystemTime(date);
    return await fn();
  } finally {
    vi.useRealTimers();
  }
}
