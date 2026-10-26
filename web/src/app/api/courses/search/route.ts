import type { NextRequest } from "next/server";
import { handleRouteErrors, parseInput, privateJson, queryOf } from "@/lib/account/route";
import { searchSections, searchSectionsSchema } from "@/lib/courses";

/**
 * GET /api/courses/search?term=202608&subject=CSC[&courseNumber=1301][&level=US] (public)
 * -> 200 { sections: CourseData[] }
 *    400 invalid_request; 502 upstream_unavailable when GoSolar fails.
 * Seat counts are live, so the response is never cached.
 */
export async function GET(request: NextRequest) {
  return handleRouteErrors("GET /api/courses/search", async () => {
    const input = parseInput(searchSectionsSchema, queryOf(request));
    return privateJson({ sections: await searchSections(input) });
  });
}
