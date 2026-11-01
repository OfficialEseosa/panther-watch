// Dependency-free so proxy.ts and client code can import it.

/** The OAuth authorization endpoint (an app asking to connect to the user's account). */
export const AUTHORIZE_PATH = "/api/oauth/authorize";

/** Cookie holding where to land after Google sign-in (set by the login route, read by the callback). */
export const AUTH_NEXT_COOKIE = "pw_auth_next";

/**
 * Whether `next` is a safe place to return to after sign-in. Only the OAuth authorization
 * endpoint qualifies (an app connection that was interrupted by signing in); every other
 * sign-in lands on /dashboard. A same-origin path, never a URL, so it cannot redirect off-site.
 */
export function isSafeNext(next: string | null | undefined): next is string {
  if (!next || next.length > 4096) return false;
  if (!next.startsWith(`${AUTHORIZE_PATH}?`)) return false;
  return !/[\\\s]/.test(next) && !next.includes("//");
}

/** The sign-in link that returns to `next` afterwards (falls back to plain sign-in). */
export function signInHref(next?: string | null): string {
  const base = "/api/auth/google/login";
  return isSafeNext(next) ? `${base}?next=${encodeURIComponent(next)}` : base;
}
