import { GoSolarError } from "@/lib/gosolar";

/**
 * True for failures that mean "GoSolar is unreachable or misbehaving" (HTTP errors, lost F5
 * affinity, timeouts, connection errors), as opposed to bugs in our code. Routes answer
 * these with 502 and a generic message.
 */
export function isUpstreamError(error: unknown): boolean {
  if (error instanceof GoSolarError) return true;
  if (error instanceof Error) {
    if (error.name === "TimeoutError" || error.name === "AbortError") return true;
    // undici: `TypeError: fetch failed` with the socket error as `cause`.
    if (error instanceof TypeError && error.message === "fetch failed") return true;
  }
  return false;
}
