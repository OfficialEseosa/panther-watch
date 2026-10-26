import { connection } from "next/server";
import { cachedJson, handleRouteErrors } from "@/lib/account/route";
import { getTerms } from "@/lib/courses";

/**
 * GET /api/courses/terms (public)
 * -> 200 { terms: Array<{ code, description, viewOnly }> }, registrable terms first (newest
 *    first), then view-only ones. Served from the `terms` cache (refreshed from GoSolar when
 *    older than an hour). 502 upstream_unavailable only when the cache is empty and GoSolar fails.
 */
export async function GET() {
  // Opt out of build-time prerendering: the list comes from the database at request time.
  await connection();
  return handleRouteErrors("GET /api/courses/terms", async () =>
    cachedJson({ terms: await getTerms() }, "public, s-maxage=300, stale-while-revalidate=600"),
  );
}
