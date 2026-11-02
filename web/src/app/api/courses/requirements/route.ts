import type { NextRequest } from "next/server";
import { cachedJson, handleRouteErrors, parseInput, queryOf } from "@/lib/account/route";
import { getSectionRequirements, sectionRequirementsSchema } from "@/lib/courses";

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
 * GET /api/courses/requirements?term=202701&crn=19010 (public)
 * -> 200 SectionRequirements { term, crn, description, prerequisites, corequisites, restrictions[, unparsed] }
 *    400 invalid_request; 502 upstream_unavailable when GoSolar fails.
 * Requirements change rarely, so the CDN keeps them for an hour.
 */
export async function GET(request: NextRequest) {
  return withCors(
    await handleRouteErrors("GET /api/courses/requirements", async () => {
      const input = parseInput(sectionRequirementsSchema, queryOf(request));
      return cachedJson(
        await getSectionRequirements(input),
        "public, s-maxage=3600, stale-while-revalidate=86400",
      );
    }),
  );
}
