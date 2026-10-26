/**
 * The one browser-side fetch client for PantherWatch's route handlers. The feature modules
 * (`courses.ts`, `schedule.ts`, `admin.ts`) are thin typed wrappers over these helpers.
 *
 * - Same-origin, `cache: "no-store"`, JSON in and out (FormData bodies pass through as is).
 * - Every failure throws `ApiError` (status 0 + code "network" when the request never got an
 *   answer), carrying the route's `{ error: { code, message } }` message when there is one, so
 *   callers can branch on `status` / `code` and show the server's own words.
 * - A cancelled request rethrows the AbortError untouched: check it with `isAbortError`.
 * - `onUnauthorized(toast)` is the shared 401 response: a toast with a Sign in action.
 */
import { SIGN_IN_HREF } from "@/components/shell/nav";
import type { ToastApi } from "@/components/ui/Toast";

/** A failed API call: HTTP status (0 = no response), server error code, user-facing message. */
export class ApiError extends Error {
  constructor(
    readonly status: number,
    /** Server error code (`term_closed`, `upstream_unavailable`, ...), or `network` / `http_<status>`. */
    readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

/** True for a fetch cancelled through its AbortSignal (never worth reporting). */
export function isAbortError(error: unknown): boolean {
  return (error instanceof DOMException || error instanceof Error) && error.name === "AbortError";
}

const NETWORK_MESSAGE = "Couldn't reach PantherWatch. Check your connection and try again.";

/** Fallback text per status when the body carries no message. */
function fallbackMessage(status: number): string {
  if (status === 401) return "Your session has ended. Sign in again.";
  if (status === 403) return "The request was refused. Reload the page and try again.";
  if (status === 404) return "Not found.";
  if (status === 409) return "That conflicts with a change that already happened. Reload and try again.";
  if (status === 413) return "The upload is too large.";
  if (status === 429) return "Too many requests. Wait a moment and try again.";
  if (status >= 500) return "The server had a problem. Try again in a moment.";
  return "Something went wrong. Try again.";
}

/** Reads `{ error: { code, message } }` (or a legacy `{ error: "..." }`) from a failed response. */
export async function errorFromResponse(response: Response): Promise<ApiError> {
  let code: string | undefined;
  let message: string | undefined;
  try {
    const body: unknown = await response.json();
    if (body && typeof body === "object" && "error" in body) {
      const error = (body as { error: unknown }).error;
      if (typeof error === "string") message = error;
      else if (error && typeof error === "object") {
        const record = error as { code?: unknown; message?: unknown };
        if (typeof record.code === "string") code = record.code;
        if (typeof record.message === "string") message = record.message;
      }
    }
  } catch (error) {
    if (isAbortError(error)) throw error;
    // Not JSON (e.g. a platform error page): use the fallback.
  }
  return new ApiError(response.status, code ?? `http_${response.status}`, message || fallbackMessage(response.status));
}

type Method = "GET" | "POST" | "PATCH" | "DELETE";

async function request<T>(method: Method, url: string, body?: unknown, signal?: AbortSignal): Promise<T> {
  const form = typeof FormData !== "undefined" && body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(url, {
      method,
      // No Content-Type on GET/DELETE: keeps them simple requests (no preflight).
      headers: body === undefined || form ? { Accept: "application/json" } : { Accept: "application/json", "Content-Type": "application/json" },
      body: body === undefined ? undefined : form ? (body as FormData) : JSON.stringify(body),
      credentials: "same-origin",
      cache: "no-store",
      signal,
    });
  } catch (error) {
    if (isAbortError(error)) throw error;
    throw new ApiError(0, "network", NETWORK_MESSAGE);
  }
  if (!response.ok) throw await errorFromResponse(response);
  if (response.status === 204) return undefined as T;
  const text = await response.text();
  if (!text) return undefined as T;
  try {
    return JSON.parse(text) as T;
  } catch {
    throw new ApiError(response.status, "bad_json", fallbackMessage(500));
  }
}

export const getJson = <T>(url: string, signal?: AbortSignal) => request<T>("GET", url, undefined, signal);
/** `body` is JSON-encoded, except a FormData (multipart, the browser sets the boundary). */
export const postJson = <T>(url: string, body: unknown, signal?: AbortSignal) => request<T>("POST", url, body, signal);
export const patchJson = <T>(url: string, body: unknown, signal?: AbortSignal) => request<T>("PATCH", url, body, signal);
export const del = <T>(url: string, signal?: AbortSignal) => request<T>("DELETE", url, undefined, signal);

/** A query string from the non-empty params (no leading "?"). */
export function query(params: Record<string, string | number | null | undefined>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== null && value !== undefined && value !== "") search.set(key, String(value));
  }
  return search.toString();
}

/** The OAuth start URL (absolute, for `location.assign`). */
function signInUrl(): string {
  return new URL(SIGN_IN_HREF, window.location.origin).href;
}

/**
 * The shared response to a 401 (or a guest trying a member action): a toast with a Sign in
 * action. Sign-in is a route handler (OAuth redirect), so it's a full navigation.
 */
export function onUnauthorized(
  toast: Pick<ToastApi, "info">,
  { title = "Your session has ended", body = "Sign in again to keep going." }: { title?: string; body?: string } = {},
): void {
  toast.info(title, { body, action: { label: "Sign in", onClick: () => window.location.assign(signInUrl()) } });
}

/**
 * The message to show for a failed call: the server's own message for an `ApiError` (4xx
 * messages name what was wrong), the connection hint for network failures, else `fallback`.
 */
export function errorMessage(error: unknown, fallback = "Try again in a moment."): string {
  if (error instanceof ApiError) return error.message || fallback;
  return fallback;
}

/**
 * Standard error toast for a failed call: ignores aborts, sends 401s to `onUnauthorized`,
 * otherwise `toast.error(title, { body: errorMessage })`.
 */
export function reportApiError(toast: Pick<ToastApi, "info" | "error">, error: unknown, title: string): void {
  if (isAbortError(error)) return;
  if (error instanceof ApiError && error.status === 401) {
    onUnauthorized(toast);
    return;
  }
  toast.error(title, { body: errorMessage(error) });
}
