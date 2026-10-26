import type { NextRequest } from "next/server";
import { guardUser, handleRouteErrors, parseInput, privateJson, queryOf, readJson } from "@/lib/account/route";
import { addEntry, addEntrySchema, entryKeySchema, listSchedule, removeEntry } from "@/lib/schedule";

/**
 * GET /api/schedule -> 200 { schedule: Record<term, ScheduleEntry[]> } (terms newest first,
 * entries in the order added). The server is the source of truth: render exactly this.
 */
export async function GET(request: NextRequest) {
  return handleRouteErrors("GET /api/schedule", async () => {
    const guard = await guardUser(request);
    if (guard.response) return guard.response;
    return privateJson({ schedule: await listSchedule(guard.user.id) });
  });
}

/**
 * POST /api/schedule  body { term, crn, subject, courseNumber, courseTitle?, color? }
 * -> 201 { entry, created: true } | 200 { entry, created: false } (already scheduled; identity
 *    and, if given, color updated). 409 term_closed | term_unknown.
 */
export async function POST(request: NextRequest) {
  return handleRouteErrors("POST /api/schedule", async () => {
    const guard = await guardUser(request, { mutation: true });
    if (guard.response) return guard.response;
    const input = parseInput(addEntrySchema, await readJson(request));
    const result = await addEntry(guard.user.id, input);
    return privateJson(result, { status: result.created ? 201 : 200 });
  });
}

/** DELETE /api/schedule?term=202608&crn=80001 -> 200 { removed: boolean }. */
export async function DELETE(request: NextRequest) {
  return handleRouteErrors("DELETE /api/schedule", async () => {
    const guard = await guardUser(request, { mutation: true });
    if (guard.response) return guard.response;
    const { term, crn } = parseInput(entryKeySchema, queryOf(request));
    return privateJson({ removed: await removeEntry(guard.user.id, term, crn) });
  });
}
