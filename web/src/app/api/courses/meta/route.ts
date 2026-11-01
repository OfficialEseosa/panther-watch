import type { NextRequest } from "next/server";
import { cachedJson, handleRouteErrors, parseInput, queryOf } from "@/lib/account/route";
import { getSectionMeta, sectionMetaSchema } from "@/lib/courses";

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
 * GET /api/courses/meta?term=202608&subject=CSC&courseNumber=1301&crn=80001[&instructor=...] (public)
 * -> 200 { grades: GradeDistributionResponse | null, rating: ProfessorRating | null,
 *          syllabus: { url } | null }  (each part null when unavailable; never 5xx for lookups)
 */
export async function GET(request: NextRequest) {
  return withCors(
    await handleRouteErrors("GET /api/courses/meta", async () => {
      const input = parseInput(sectionMetaSchema, queryOf(request));
      return cachedJson(await getSectionMeta(input), "public, s-maxage=600, stale-while-revalidate=3600");
    }),
  );
}
