// Dependency-free so proxy.ts can import it without pulling in server-only modules.

/** Session cookie name outside production (http://localhost cannot set `__Host-` cookies). */
export const SESSION_COOKIE = "pw_session";
/**
 * Session cookie name in production. The `__Host-` prefix makes the browser refuse the cookie
 * unless it is Secure, Path=/ and has no Domain, so a sibling subdomain cannot plant or
 * overwrite it. It requires Secure, which is why development uses `SESSION_COOKIE`.
 */
export const HOST_SESSION_COOKIE = "__Host-pw_session";
/** Every name a session cookie may have; proxy.ts accepts either. */
export const SESSION_COOKIE_NAMES = [HOST_SESSION_COOKIE, SESSION_COOKIE] as const;

export const OAUTH_STATE_COOKIE = "pw_oauth_state";
export const SESSION_MAX_AGE_S = 30 * 24 * 60 * 60;

/**
 * Whether cookies are marked Secure. Production only: browsers do accept Secure cookies on
 * http://localhost, but other dev hosts (a LAN IP, a tunnel over http) would silently drop
 * them, so dev keeps plain cookies. Every auth cookie uses this one switch.
 */
export function secureCookies(): boolean {
  return process.env.NODE_ENV === "production";
}

/** The session cookie name for this environment (see HOST_SESSION_COOKIE). */
export function sessionCookieName(): string {
  return secureCookies() ? HOST_SESSION_COOKIE : SESSION_COOKIE;
}
