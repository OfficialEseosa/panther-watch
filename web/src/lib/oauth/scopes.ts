/**
 * OAuth scopes of the PantherWatch connector, and how the consent page and Settings describe
 * them. Pure: safe to import from client components.
 */

export const SCOPES = ["read", "watches:write", "schedule:write"] as const;
export type Scope = (typeof SCOPES)[number];

/** Always granted: every connection can read. The write scopes are opt-in on the consent page. */
export const REQUIRED_SCOPE: Scope = "read";

export const SCOPE_INFO: Record<Scope, { label: string; description: string }> = {
  read: {
    label: "See your classes",
    description: "Search courses and read your tracked classes and schedule.",
  },
  "watches:write": {
    label: "Manage tracked classes",
    description: "Start and stop seat alerts for you. Alerts still go only to your email.",
  },
  "schedule:write": {
    label: "Edit your schedule",
    description: "Add classes to and remove classes from your schedule.",
  },
};

const isScope = (value: string): value is Scope => (SCOPES as readonly string[]).includes(value);

/**
 * A requested `scope` string as known scopes, in canonical order, always including `read`.
 * Unknown scopes (`openid`, `offline_access`, ...) are ignored rather than refused: RFC 6749
 * §3.3 lets the server grant a different set, and the token response says what was granted.
 * A missing or empty scope means every scope (the consent page lets the user narrow it).
 */
export function parseScopes(raw: string | null | undefined): Scope[] {
  const words = (raw ?? "").split(/\s+/).filter(Boolean);
  if (words.length === 0) return [...SCOPES];
  const wanted = new Set(words.filter(isScope));
  wanted.add(REQUIRED_SCOPE);
  return SCOPES.filter((scope) => wanted.has(scope));
}

/** Stored / wire form: space-separated, canonical order. */
export function formatScopes(scopes: readonly string[]): string {
  const set = new Set(scopes);
  return SCOPES.filter((scope) => set.has(scope)).join(" ");
}

/** Space-separated stored scopes back to known scopes (unknown words dropped). */
export function splitScopes(stored: string): Scope[] {
  const set = new Set(stored.split(/\s+/));
  return SCOPES.filter((scope) => set.has(scope));
}
