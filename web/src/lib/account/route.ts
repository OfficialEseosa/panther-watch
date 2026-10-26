import "server-only";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { isUpstreamError } from "@/lib/courses/errors";
import { assertSameOrigin } from "@/lib/http";
import { ScheduleError } from "@/lib/schedule";
import { WatchError } from "@/lib/watches";

/**
 * Plumbing shared by the user-facing route handlers (courses, watches, schedule, account).
 * Same error body as the admin routes: `{ error: { code, message } }`. Internal error
 * messages are never sent to the client.
 */

export const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export function apiError(status: number, code: string, message: string, init?: ResponseInit): Response {
  const headers = new Headers(init?.headers);
  if (!headers.has("Cache-Control")) headers.set("Cache-Control", NO_STORE["Cache-Control"]);
  return Response.json({ error: { code, message } }, { ...init, status, headers });
}

/** JSON for per-user data: never stored by any cache. */
export function privateJson(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", NO_STORE["Cache-Control"]);
  return Response.json(data, { ...init, headers });
}

/** JSON with an explicit Cache-Control (public data). */
export function cachedJson(data: unknown, cacheControl: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", cacheControl);
  return Response.json(data, { ...init, headers });
}

/** Bad input; `handleRouteErrors` answers 400 `invalid_request` with this message. */
export class BadRequestError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BadRequestError";
  }
}

/** One line per zod issue, prefixed with its path: `crn: crn must be 5 digits`. */
export function describeZodError(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length ? `${issue.path.join(".")}: ${issue.message}` : issue.message))
    .join("; ");
}

/** `schema.parse(input)`, but failures throw BadRequestError (400). */
export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (!result.success) throw new BadRequestError(describeZodError(result.error));
  return result.data;
}

/** Query-string params as a plain object (last value wins). */
export function queryOf(request: Request): Record<string, string> {
  return Object.fromEntries(new URL(request.url).searchParams);
}

const MAX_BODY_BYTES = 64 * 1024;

/** Parses a JSON body; missing, oversized or malformed bodies throw BadRequestError. */
export async function readJson(request: Request): Promise<unknown> {
  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) throw new BadRequestError("request body is too large");
  if (text.trim() === "") throw new BadRequestError("request body must be JSON");
  try {
    return JSON.parse(text);
  } catch {
    throw new BadRequestError("request body must be valid JSON");
  }
}

export type UserGuard = { user: CurrentUser; response?: undefined } | { user?: undefined; response: Response };

/**
 * Auth gate for user routes: 401 without a valid session (or when the account no longer
 * exists), then, for `mutation: true`, 403 unless the request is same-origin (CSRF).
 *
 *   const guard = await guardUser(request, { mutation: true });
 *   if (guard.response) return guard.response;
 */
export async function guardUser(request: Request, { mutation = false } = {}): Promise<UserGuard> {
  const user = await getCurrentUser();
  if (!user) return { response: apiError(401, "unauthorized", "Sign in required") };
  if (mutation) {
    const denied = guardOrigin(request);
    if (denied) return { response: denied };
  }
  return { user };
}

/** 403 `forbidden` unless same-origin; null when allowed. */
export function guardOrigin(request: Request): Response | null {
  return assertSameOrigin(request) ? apiError(403, "forbidden", "Cross-origin request refused") : null;
}

/**
 * Runs a handler body and maps known failures: bad input -> 400, closed term -> 409,
 * GoSolar trouble -> 502, anything else -> 500 (logged, message not leaked).
 */
export async function handleRouteErrors(label: string, fn: () => Promise<Response>): Promise<Response> {
  try {
    return await fn();
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof BadRequestError) return apiError(400, "invalid_request", error.message);
    if (error instanceof z.ZodError) return apiError(400, "invalid_request", describeZodError(error));
    if (error instanceof WatchError || error instanceof ScheduleError) {
      return apiError(409, error.code, error.message);
    }
    if (isUpstreamError(error)) {
      console.error(`${label}: GoSolar request failed`, error);
      return apiError(502, "upstream_unavailable", "GoSolar is not responding right now. Try again in a minute.");
    }
    console.error(`${label}: unhandled error`, error);
    return apiError(500, "internal_error", "Internal server error");
  }
}
