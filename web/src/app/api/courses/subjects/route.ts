import type { NextRequest } from "next/server";
import { cachedJson, handleRouteErrors, parseInput, queryOf } from "@/lib/account/route";
import { searchSubjects, searchSubjectsSchema } from "@/lib/courses";

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
 * GET /api/courses/subjects?term=202608&q=comp (public)
 * -> 200 { subjects: Array<{ code, description }> } (code or description contains q; max 50)
 */
export async function GET(request: NextRequest) {
  return withCors(
    await handleRouteErrors("GET /api/courses/subjects", async () => {
      const { term, q } = queryOf(request);
      const input = parseInput(searchSubjectsSchema, { term, query: q ?? "" });
      return cachedJson({ subjects: await searchSubjects(input) }, "public, s-maxage=3600, stale-while-revalidate=86400");
    }),
  );
}
