import type { NextRequest } from "next/server";
import { z } from "zod";
import { cachedJson, handleRouteErrors, parseInput, queryOf } from "@/lib/account/route";
import { CATALOG_LEVELS, findCourses } from "@/lib/course-meta";
import { DEFAULT_LIMIT, MAX_LIMIT } from "@/lib/course-meta/catalog-lookup";

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

const blank = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value);

const catalogQuerySchema = z.object({
  q: z.string({ message: "q is required" }).trim().min(2, "q must be at least 2 characters").max(120, "q must be at most 120 characters"),
  level: z.preprocess(
    (value) => (typeof blank(value) === "string" ? (value as string).trim().toUpperCase() : undefined),
    z.enum(CATALOG_LEVELS, { message: "level must be US, UA, GS or LW" }).optional(),
  ),
  limit: z.preprocess(blank, z.coerce.number().int().min(1).max(MAX_LIMIT).default(DEFAULT_LIMIT)),
});

/**
 * GET /api/courses/catalog?q=calculus%202&level=US&limit=5 (public)
 * -> 200 { query, level, confidence: "high" | "ambiguous" | "none", matchedBy, matched,
 *          courses: Array<{ subject, courseNumber, title, credits, level, description, score }> }
 * GSU's course catalog (from GoSolar, refreshed nightly), ranked for a course name, nickname or
 * code. Cached an hour at the CDN: the table changes once a night.
 */
export async function GET(request: NextRequest) {
  return withCors(
    await handleRouteErrors("GET /api/courses/catalog", async () => {
      const { q, level, limit } = parseInput(catalogQuerySchema, queryOf(request));
      const found = await findCourses(q, { level, limit });
      return cachedJson(
        {
          query: q,
          level: level ?? null,
          confidence: found.confidence,
          matchedBy: found.matchedBy,
          matched: found.matched || null,
          courses: found.candidates,
        },
        "public, s-maxage=3600",
      );
    }),
  );
}
