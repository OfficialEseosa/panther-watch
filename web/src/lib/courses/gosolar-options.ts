import type { GoSolarOptions } from "@/lib/gosolar";
import { defaultGoSolarOptions } from "@/lib/gosolar/config";

let override: GoSolarOptions | undefined;

/**
 * GoSolar client options for user-facing lookups (search, terms, subjects, tracked-class
 * details). Empty unless GOSOLAR_BASE_URL is set, so the client uses the real GoSolar base URL.
 */
export function gosolarOptions(): GoSolarOptions | undefined {
  return override ?? defaultGoSolarOptions();
}

/**
 * Points every user-facing GoSolar call at `options` (e.g. the fake GoSolar's `baseUrl`), or
 * restores the defaults with `undefined`. Throws outside `NODE_ENV=test`.
 */
export function setGoSolarOptionsForTests(options: GoSolarOptions | undefined): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("setGoSolarOptionsForTests() is only allowed when NODE_ENV=test");
  }
  override = options;
}
