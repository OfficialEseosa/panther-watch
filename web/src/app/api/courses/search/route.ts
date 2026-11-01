import type { NextRequest } from "next/server";
import { handleRouteErrors, parseInput, privateJson, queryOf } from "@/lib/account/route";
import { searchSections, searchSectionsSchema } from "@/lib/courses";

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
 * GET /api/courses/search?term=202608&subject=CSC[&courseNumber=1301][&level=US] (public)
 * -> 200 { sections: CourseData[] }
 *    400 invalid_request; 502 upstream_unavailable when GoSolar fails.
 * Seat counts are live, so the response is never cached.
 */
export async function GET(request: NextRequest) {
  return withCors(
    await handleRouteErrors("GET /api/courses/search", async () => {
      const input = parseInput(searchSectionsSchema, queryOf(request));
      return privateJson({ sections: await searchSections(input) });
    }),
  );
}
