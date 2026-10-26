import type { GoSolarOptions } from "@/lib/gosolar";
import { defaultGoSolarOptions } from "@/lib/gosolar/config";

let testOptions: GoSolarOptions | undefined;

/**
 * GoSolar options the cron jobs use when the caller passes none. Route handlers cannot take
 * options, so integration tests point them at the fake GoSolar with
 * `setJobsGoSolarOptionsForTests({ baseUrl: gs.url })`.
 */
export function defaultJobsGoSolarOptions(): GoSolarOptions {
  return testOptions ?? defaultGoSolarOptions();
}

/** Test-only override (throws outside NODE_ENV=test, like `setDbForTests`). */
export function setJobsGoSolarOptionsForTests(options: GoSolarOptions | undefined): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("setJobsGoSolarOptionsForTests() is only allowed when NODE_ENV=test");
  }
  testOptions = options;
}
