import type { NextRequest } from "next/server";
import { cachedJson, handleRouteErrors, parseInput, queryOf } from "@/lib/account/route";
import { searchSubjects, searchSubjectsSchema } from "@/lib/courses";

/**
 * GET /api/courses/subjects?term=202608&q=comp (public)
 * -> 200 { subjects: Array<{ code, description }> } (code or description contains q; max 50)
 */
export async function GET(request: NextRequest) {
  return handleRouteErrors("GET /api/courses/subjects", async () => {
    const { term, q } = queryOf(request);
    const input = parseInput(searchSubjectsSchema, { term, query: q ?? "" });
    return cachedJson({ subjects: await searchSubjects(input) }, "public, s-maxage=3600, stale-while-revalidate=86400");
  });
}
