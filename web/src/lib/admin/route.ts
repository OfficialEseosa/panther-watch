import "server-only";
import { unstable_rethrow } from "next/navigation";
import { getCurrentUser, isAdminEmail, type CurrentUser } from "@/lib/auth/session";
import { EmailSendError } from "@/lib/email";
import { assertSameOrigin } from "@/lib/http";
import { AdminRequestError, InvalidInputError } from "./errors";

/**
 * Shared plumbing for the announcements and admin route handlers: the error body shape,
 * the admin guard and the error-to-status mapping.
 */

/** `{ error: { code, message } }` with `status`. */
export function apiError(status: number, code: string, message: string, init?: ResponseInit): Response {
  return Response.json({ error: { code, message } }, { ...init, status });
}

/** Admin responses are per-user and must never sit in a shared cache. */
export const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export function adminJson(data: unknown, init: ResponseInit = {}): Response {
  return Response.json(data, { ...init, headers: { ...NO_STORE, ...init.headers } });
}

export type AdminGuard = { user: CurrentUser; response?: undefined } | { user?: undefined; response: Response };

/**
 * Admin gate for every `/api/admin/*` route:
 *   - no valid session (or the user row is gone) -> 401
 *   - signed in but not in ADMIN_EMAILS -> 404, so the admin surface is not advertised
 *   - `mutation: true` and the request is not same-origin -> 403 (CSRF)
 * The origin check runs after the admin check so a non-admin always sees 404.
 *
 *   const guard = await guardAdmin(request, { mutation: true });
 *   if (guard.response) return guard.response;
 */
export async function guardAdmin(request: Request, { mutation = false } = {}): Promise<AdminGuard> {
  const user = await getCurrentUser();
  if (!user) return { response: apiError(401, "unauthorized", "Sign in required", { headers: NO_STORE }) };
  if (!isAdminEmail(user.email)) return { response: notFound() };
  if (mutation && assertSameOrigin(request)) {
    return { response: apiError(403, "forbidden", "Cross-origin request refused", { headers: NO_STORE }) };
  }
  return { user };
}

export function notFound(): Response {
  return apiError(404, "not_found", "Not found", { headers: NO_STORE });
}

/** Parses a JSON body; a missing or malformed one becomes `InvalidInputError` (400). */
export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    throw new InvalidInputError("request body must be valid JSON");
  }
}

/** Positive integer path id, or null (callers answer 404). */
export function parseId(raw: string): number | null {
  if (!/^[1-9]\d{0,15}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) ? id : null;
}

/**
 * Runs a handler body and maps known failures: `InvalidInputError` -> 400, `AdminRequestError`
 * -> its own status, `EmailSendError`
 * -> 429 (provider quota) or 502, anything else -> 500 (logged, message not leaked).
 */
export async function handleErrors(fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof InvalidInputError) {
      return apiError(400, "invalid_request", error.message, { headers: NO_STORE });
    }
    if (error instanceof AdminRequestError) {
      return apiError(error.status, error.code, error.message, { headers: NO_STORE });
    }
    if (error instanceof EmailSendError) {
      console.error("Admin email send failed", error.code, error.statusCode);
      return error.statusCode === 429
        ? apiError(429, "email_quota_exceeded", "The email provider's sending limit was reached", { headers: NO_STORE })
        : apiError(502, "email_send_failed", "The email provider refused the message", { headers: NO_STORE });
    }
    console.error("Unhandled error in announcements/admin route", error);
    return apiError(500, "internal_error", "Internal server error", { headers: NO_STORE });
  }
}
