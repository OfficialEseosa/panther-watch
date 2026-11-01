import type { NextRequest } from "next/server";
import { z } from "zod";
import { guardUser, handleRouteErrors, parseInput, privateJson, queryOf } from "@/lib/account/route";
import { disconnectApp, listConnectedApps } from "@/lib/oauth";

/** GET /api/account/connected-apps -> 200 { apps: ConnectedApp[] } (Settings -> Connected apps). 401 when signed out. */
export async function GET(request: NextRequest) {
  return handleRouteErrors("GET /api/account/connected-apps", async () => {
    const guard = await guardUser(request);
    if (guard.response) return guard.response;
    return privateJson({ apps: await listConnectedApps(guard.user.id) });
  });
}

const disconnectSchema = z.object({ clientId: z.string().min(1).max(2000) });

/**
 * DELETE /api/account/connected-apps?clientId=... -> 200 { disconnected: boolean }. Revokes
 * every token the user gave that app (it must ask again to reconnect). Same-origin only.
 */
export async function DELETE(request: NextRequest) {
  return handleRouteErrors("DELETE /api/account/connected-apps", async () => {
    const guard = await guardUser(request, { mutation: true });
    if (guard.response) return guard.response;
    const { clientId } = parseInput(disconnectSchema, queryOf(request));
    return privateJson({ disconnected: await disconnectApp(guard.user.id, clientId) });
  });
}
