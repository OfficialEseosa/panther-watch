import type { NextRequest } from "next/server";
import { cachedJson, handleRouteErrors, parseInput, queryOf } from "@/lib/account/route";
import { getSectionMeta, sectionMetaSchema } from "@/lib/courses";

/**
 * GET /api/courses/meta?term=202608&subject=CSC&courseNumber=1301&crn=80001[&instructor=...] (public)
 * -> 200 { grades: GradeDistributionResponse | null, rating: ProfessorRating | null,
 *          syllabus: { url } | null }  (each part null when unavailable; never 5xx for lookups)
 */
export async function GET(request: NextRequest) {
  return handleRouteErrors("GET /api/courses/meta", async () => {
    const input = parseInput(sectionMetaSchema, queryOf(request));
    return cachedJson(await getSectionMeta(input), "public, s-maxage=600, stale-while-revalidate=3600");
  });
}
