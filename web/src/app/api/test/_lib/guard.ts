import "server-only";
import { constantTimeEqual } from "@/lib/http";

/**
 * Gate for the e2e-only routes under /api/test (see web/e2e/README.md). They exist only when
 * ALL of these hold, so a production deployment can never serve them:
 * - `E2E_TEST_SECRET` is set (the e2e rig sets it; no deployed environment should),
 * - `NODE_ENV` is not "production" (`next build` / `next start` always set it), and
 * - `VERCEL_ENV` is not "production".
 * Otherwise every route answers a bare 404, as if it did not exist.
 *
 * Reads `process.env` directly: the production checks must not depend on the rest of the env
 * validating.
 */
export function testRoutesEnabled(): boolean {
  const secret = process.env.E2E_TEST_SECRET;
  return (
    typeof secret === "string" &&
    secret.length >= 16 &&
    process.env.NODE_ENV !== "production" &&
    process.env.VERCEL_ENV !== "production"
  );
}

export const SECRET_HEADER = "x-e2e-secret";

export function notFound(): Response {
  return new Response("Not Found", { status: 404, headers: { "Cache-Control": "no-store" } });
}

/** Constant-time check of a caller-supplied secret against `E2E_TEST_SECRET`. */
export function secretMatches(candidate: unknown): boolean {
  const secret = process.env.E2E_TEST_SECRET;
  return typeof candidate === "string" && typeof secret === "string" && constantTimeEqual(candidate, secret);
}

/**
 * Runs `handler` only when the test routes are enabled (else 404) and the request carries
 * `x-e2e-secret: <E2E_TEST_SECRET>` (else 403). Errors come back as 500 with the message,
 * which is fine for a route that only exists on a developer's machine.
 */
export async function guarded(request: Request, handler: () => Promise<Response>): Promise<Response> {
  if (!testRoutesEnabled()) return notFound();
  if (!secretMatches(request.headers.get(SECRET_HEADER))) {
    return Response.json({ error: "bad e2e secret" }, { status: 403 });
  }
  try {
    return await handler();
  } catch (error) {
    console.error("e2e test route failed", error);
    return Response.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

/** `db.execute()` rows for either driver (node-postgres returns `{ rows }`, PGlite too). */
export function rowsOf<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  return ((result as { rows?: T[] } | null)?.rows ?? []) as T[];
}
