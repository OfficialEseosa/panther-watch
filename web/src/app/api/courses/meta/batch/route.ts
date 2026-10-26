import type { NextRequest } from "next/server";
import { guardOrigin, handleRouteErrors, parseInput, privateJson, readJson } from "@/lib/account/route";
import { batchMetaSchema, getBatchMeta } from "@/lib/courses";

/**
 * POST /api/courses/meta/batch (public, same-origin only)
 * body { items: Array<{ term, subject, courseNumber, crn, instructor? }> } (1-50 items)
 * -> 200 { items: SectionMeta[] } in request order (see GET /api/courses/meta).
 * Lookups are deduplicated across items (grades per course, ratings per instructor).
 */
export async function POST(request: NextRequest) {
  return handleRouteErrors("POST /api/courses/meta/batch", async () => {
    // Not a mutation, but each call can fan out to RateMyProfessors; keep it to our pages.
    const denied = guardOrigin(request);
    if (denied) return denied;
    const { items } = parseInput(batchMetaSchema, await readJson(request));
    return privateJson({ items: await getBatchMeta(items) });
  });
}
