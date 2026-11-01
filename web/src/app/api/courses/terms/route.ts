import { connection } from "next/server";
import { cachedJson, handleRouteErrors } from "@/lib/account/route";
import { getTerms } from "@/lib/courses";

/** Public read endpoint: browser tools on any origin may call it (documented on /developers). */
const CORS = { "Access-Control-Allow-Origin": "*", Vary: "Origin" } as const;

function withCors(response: Response): Response {
  for (const [name, value] of Object.entries(CORS)) response.headers.set(name, value);
  return response;
}

/** CORS preflight. */
export function OPTIONS() {
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS,
      "Access-Control-Allow-Methods": "GET, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "86400",
    },
  });
}

/**
 * GET /api/courses/terms (public)
 * -> 200 { terms: Array<{ code, description, viewOnly }> }, registrable terms first (newest
 *    first), then view-only ones. Served from the `terms` cache (refreshed from GoSolar when
 *    older than an hour). 502 upstream_unavailable only when the cache is empty and GoSolar fails.
 */
export async function GET() {
  // Opt out of build-time prerendering: the list comes from the database at request time.
  await connection();
  return withCors(
    await handleRouteErrors("GET /api/courses/terms", async () =>
      cachedJson({ terms: await getTerms() }, "public, s-maxage=300, stale-while-revalidate=600"),
    ),
  );
}
