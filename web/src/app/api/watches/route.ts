import type { NextRequest } from "next/server";
import { guardUser, handleRouteErrors, parseInput, privateJson, queryOf, readJson } from "@/lib/account/route";
import { addWatch, addWatchSchema, listWatches, removeWatch, watchKeySchema } from "@/lib/watches";

/** GET /api/watches -> 200 { watches: Watch[], count } (newest first). 401 when signed out. */
export async function GET(request: NextRequest) {
  return handleRouteErrors("GET /api/watches", async () => {
    const guard = await guardUser(request);
    if (guard.response) return guard.response;
    const watches = await listWatches(guard.user.id);
    return privateJson({ watches, count: watches.length });
  });
}

/**
 * POST /api/watches  body { term, crn, subject, courseNumber, courseTitle?, instructor? }
 * -> 201 { watch, created: true, openNow } | 200 { watch, created: false, openNow: false } (already watching)
 *    400 invalid_request; 409 term_closed | term_unknown; 401; 403 (cross-origin).
 * `openNow: true` means the section had open seats when tracked: no alert for that opening,
 * the first one comes after it fills and reopens (see addWatch).
 */
export async function POST(request: NextRequest) {
  return handleRouteErrors("POST /api/watches", async () => {
    const guard = await guardUser(request, { mutation: true });
    if (guard.response) return guard.response;
    const input = parseInput(addWatchSchema, await readJson(request));
    const result = await addWatch(guard.user.id, input);
    return privateJson(result, { status: result.created ? 201 : 200 });
  });
}

/** DELETE /api/watches?term=202608&crn=80001 -> 200 { removed: boolean }. */
export async function DELETE(request: NextRequest) {
  return handleRouteErrors("DELETE /api/watches", async () => {
    const guard = await guardUser(request, { mutation: true });
    if (guard.response) return guard.response;
    const { term, crn } = parseInput(watchKeySchema, queryOf(request));
    return privateJson({ removed: await removeWatch(guard.user.id, term, crn) });
  });
}
