import type { GoSolarOptions } from "./http";

/**
 * GoSolar options every app caller starts from. Empty (the client then uses the real
 * GOSOLAR_BASE_URL) unless the `GOSOLAR_BASE_URL` env var is set, which points the whole app
 * at another Banner SSB root, e.g. the e2e rig's fake (e2e/fake-gosolar-server.ts).
 *
 * Reads `process.env` directly rather than `@/lib/env`, so the GoSolar client keeps working in
 * scripts that do not have the app's full env. `src/lib/env.ts` validates the same variable.
 */
export function defaultGoSolarOptions(): GoSolarOptions {
  const raw = process.env.GOSOLAR_BASE_URL?.trim();
  if (!raw) return {};
  const url = new URL(raw);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("GOSOLAR_BASE_URL must be an http(s) URL");
  }
  return { baseUrl: raw.replace(/\/+$/, "") };
}
