/**
 * Calling App Router route handlers directly in Vitest, signed in as a seeded user.
 *
 * Route code reads the session through `cookies()` from `next/headers` (getCurrentUser) and
 * may call `connection()` / `after()` from `next/server`; all of them throw outside a Next
 * request scope. Test files mock both modules onto this helper:
 *
 *   vi.mock("next/headers", async () => (await import("../helpers/session")).nextHeadersMock);
 *   vi.mock("next/server", async (importOriginal) => ({
 *     ...(await importOriginal<typeof import("next/server")>()),
 *     ...(await import("../helpers/session")).nextServerMock,
 *   }));
 *
 * then build requests with `apiRequest(path, { method, as: user, body, origin })` and call
 * handlers through `call(handler, request)`, which points `cookies()` / `headers()` at that
 * request for the duration of the call. `sessionCookie(user)` gives the raw `Cookie` value,
 * `params({ id: "3" })` builds the route context for a dynamic segment, and mocked `after()`
 * tasks queue up in `afterTasks` until `flushAfter()` runs them.
 */
// Not from "next/server": test files mock that module with a factory that imports this file,
// and importing it here would deadlock that factory.
import { NextRequest } from "next/dist/server/web/spec-extension/request";
import type { User } from "@/db/schema";
import { sessionCookieName } from "@/lib/auth/constants";
import { signSession } from "@/lib/auth/jwt";

/** Must match APP_URL in tests/setup.ts so `assertSameOrigin` passes. */
export const TEST_ORIGIN = "http://localhost:3000";

export type SessionUser = Pick<User, "id" | "email" | "name" | "pictureUrl">;

let current: NextRequest | null = null;

export const nextHeadersMock = {
  cookies: async () => {
    if (!current) throw new Error("cookies() called outside call(); use call(handler, request)");
    return current.cookies;
  },
  headers: async () => {
    if (!current) throw new Error("headers() called outside call(); use call(handler, request)");
    return current.headers;
  },
};

/** Tasks queued with the mocked `after()`; run them with `flushAfter()`. */
export const afterTasks: Array<() => unknown> = [];

export const nextServerMock = {
  after: (task: (() => unknown) | Promise<unknown>) => {
    afterTasks.push(typeof task === "function" ? task : () => task);
  },
  connection: async () => undefined,
};

export async function flushAfter(): Promise<void> {
  while (afterTasks.length) await afterTasks.shift()!();
}

/** A signed session JWT for `user` (the same token the OAuth callback issues). */
export function sessionToken(user: SessionUser): Promise<string> {
  return signSession({ sub: user.id, email: user.email, name: user.name, picture: user.pictureUrl });
}

/** `name=value` for a valid session cookie of `user`, ready for a `Cookie` header. */
export async function sessionCookie(user: SessionUser): Promise<string> {
  return `${sessionCookieName()}=${await sessionToken(user)}`;
}

export interface ApiRequestOptions {
  method?: string;
  /** Signed in as this user; omit for signed out. */
  as?: SessionUser;
  /** Raw `Cookie` header instead of `as` (e.g. a cookie captured before the user was deleted). */
  cookie?: string;
  /** Sent as-is if a string or FormData (multipart), otherwise JSON-encoded. */
  body?: unknown;
  /** `Origin` header. Defaults to TEST_ORIGIN; pass null to omit it. */
  origin?: string | null;
}

export async function apiRequest(path: string, options: ApiRequestOptions = {}): Promise<NextRequest> {
  const { method = "GET", as, cookie, body, origin = TEST_ORIGIN } = options;
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  else if (as) headers.set("cookie", await sessionCookie(as));
  if (origin !== null) headers.set("origin", origin);
  let payload: string | FormData | undefined;
  if (body instanceof FormData) {
    payload = body; // fetch sets the multipart content-type with its boundary
  } else if (body !== undefined) {
    payload = typeof body === "string" ? body : JSON.stringify(body);
    headers.set("content-type", "application/json");
  }
  return new NextRequest(new URL(path, TEST_ORIGIN), { method, headers, body: payload });
}

/** Calls a route handler with `cookies()` / `headers()` bound to `request`. */
export async function call<C extends unknown[]>(
  handler: (request: NextRequest, ...context: C) => Promise<Response> | Response,
  request: NextRequest,
  ...context: C
): Promise<Response> {
  current = request;
  try {
    return await handler(request, ...context);
  } finally {
    current = null;
  }
}

/** Route context for a dynamic segment, e.g. `params({ id: "3" })`. */
export function params<P extends Record<string, string>>(value: P): { params: Promise<P> } {
  return { params: Promise.resolve(value) };
}
