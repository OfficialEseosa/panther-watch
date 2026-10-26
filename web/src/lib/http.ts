import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import { env } from "@/lib/env";

export function json<T>(data: T, init?: ResponseInit): Response {
  return Response.json(data, init);
}

export function badRequest(message: string): Response {
  return json({ error: message }, { status: 400 });
}

export function unauthorized(): Response {
  return json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden(): Response {
  return json({ error: "Forbidden" }, { status: 403 });
}

/**
 * CSRF check for cookie-authenticated mutations (POST/PUT/PATCH/DELETE). Passes when the
 * browser says the request came from our own origin: `Origin` equals APP_URL's origin, or
 * `Sec-Fetch-Site: same-origin` (both are forbidden headers that page scripts cannot set).
 * Requests with neither (old browsers, curl) are refused. Returns a 403 to send back, or null:
 *   const denied = assertSameOrigin(request); if (denied) return denied;
 * SameSite=Lax on the session cookie already stops most cross-site POSTs; this closes the
 * remaining gaps (same-site subdomains, top-level form posts in older browsers).
 */
export function assertSameOrigin(request: Request): Response | null {
  const origin = request.headers.get("origin");
  if (origin !== null && origin === new URL(env.APP_URL).origin) return null;
  if (request.headers.get("sec-fetch-site") === "same-origin") return null;
  return forbidden();
}

/**
 * Constant-time string comparison. Both sides are hashed first so the buffers handed to
 * timingSafeEqual always have equal length and the comparison leaks neither content nor length.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const digest = (value: string) => createHash("sha256").update(value, "utf8").digest();
  return timingSafeEqual(digest(a), digest(b));
}

/**
 * Checks `Authorization: Bearer <CRON_SECRET>`. Returns a 401 response to send back, or
 * null when the caller is authorized:
 *   const denied = requireCronSecret(request); if (denied) return denied;
 */
export function requireCronSecret(request: Request): Response | null {
  const header = request.headers.get("authorization") ?? "";
  return constantTimeEqual(header, `Bearer ${env.CRON_SECRET}`) ? null : unauthorized();
}
