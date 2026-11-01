import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/session")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  ...(await import("../helpers/session")).nextServerMock,
}));

import { setDbForTests } from "@/db";
import { oauthTokens, type User } from "@/db/schema";
import { DELETE as disconnect, GET as list } from "@/app/api/account/connected-apps/route";
import { runCleanup } from "@/lib/jobs/cleanup";
import { verifyAccessToken, type ConnectedApp } from "@/lib/oauth";
import { resetRateLimits } from "@/lib/oauth/rate-limit";
import { createTestDb, seedUser, truncateAll, type TestDatabase } from "../helpers/db";
import { connect, REDIRECT, register, tokenRequest, type RegisteredClient } from "../helpers/oauth";
import { apiRequest, call } from "../helpers/session";

let testDb: TestDatabase;
let alice: User;
let bob: User;
let claude: RegisteredClient;
let other: RegisteredClient;

beforeAll(async () => {
  testDb = await createTestDb();
  setDbForTests(testDb.db);
});
afterAll(async () => {
  setDbForTests(undefined);
  await testDb.close();
});
beforeEach(async () => {
  await truncateAll(testDb.db);
  resetRateLimits();
  alice = await seedUser(testDb.db, { name: "Alice" });
  bob = await seedUser(testDb.db, { name: "Bob" });
  claude = await register({ redirect_uris: [REDIRECT], client_name: "Claude" });
  other = await register({ redirect_uris: [REDIRECT], client_name: "Other Assistant" });
});

async function apps(as: User): Promise<ConnectedApp[]> {
  const response = await call(list, await apiRequest("/api/account/connected-apps", { as }));
  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("private, no-store");
  return ((await response.json()) as { apps: ConnectedApp[] }).apps;
}

const disconnectRequest = async (as: User | undefined, clientId: string, origin?: string | null) =>
  call(
    disconnect,
    await apiRequest(`/api/account/connected-apps?clientId=${encodeURIComponent(clientId)}`, { method: "DELETE", as, origin }),
  );

describe("Settings → Connected apps", () => {
  it("lists each connected app once, with its scopes, connection time and last use", async () => {
    expect(await apps(alice)).toEqual([]);
    const first = await connect(alice, claude, { scopes: ["watches:write"] });
    // A refresh (rotation) and a second grant to the same app still show one entry.
    await tokenRequest({ grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: claude.client_id });
    await connect(alice, claude, { scopes: ["schedule:write"] });
    const used = await connect(alice, other, { scopes: [] });
    await verifyAccessToken(used.access_token);

    const listed = await apps(alice);
    expect(listed.map((app) => app.name)).toEqual(["Other Assistant", "Claude"]);
    expect(listed[1]).toMatchObject({
      clientId: claude.client_id,
      scopes: ["read", "watches:write", "schedule:write"],
      lastUsedAt: null,
    });
    expect(listed[0]).toMatchObject({ scopes: ["read"], lastUsedAt: expect.any(String) });
    expect(Date.parse(listed[1].connectedAt)).not.toBeNaN();
    expect(await apps(bob)).toEqual([]);
  });

  it("Disconnect revokes every token of that app only, and it disappears from the list", async () => {
    const a = await connect(alice, claude);
    const b = await connect(alice, claude);
    const keep = await connect(alice, other);
    const bobs = await connect(bob, claude);

    const response = await disconnectRequest(alice, claude.client_id);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ disconnected: true });
    for (const tokens of [a, b]) {
      expect(await verifyAccessToken(tokens.access_token)).toBeNull();
      const refresh = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: claude.client_id });
      expect(refresh.body).toMatchObject({ error: "invalid_grant" });
    }
    expect(await verifyAccessToken(keep.access_token)).not.toBeNull();
    expect(await verifyAccessToken(bobs.access_token)).not.toBeNull();
    expect((await apps(alice)).map((app) => app.name)).toEqual(["Other Assistant"]);

    const again = await disconnectRequest(alice, claude.client_id);
    expect(await again.json()).toEqual({ disconnected: false });
  });

  it("requires a session, same origin and a clientId", async () => {
    await connect(alice, claude);
    expect((await call(list, await apiRequest("/api/account/connected-apps"))).status).toBe(401);
    expect((await disconnectRequest(undefined, claude.client_id)).status).toBe(401);
    expect((await disconnectRequest(alice, claude.client_id, "https://evil.test")).status).toBe(403);
    expect((await disconnectRequest(alice, claude.client_id, null)).status).toBe(403);
    const missing = await call(disconnect, await apiRequest("/api/account/connected-apps", { method: "DELETE", as: alice }));
    expect(missing.status).toBe(400);
    expect(await apps(alice)).toHaveLength(1);
  });

  it("the daily cleanup keeps live grants and prunes expired tokens and idle clients", async () => {
    const live = await connect(alice, claude);
    await connect(alice, other);
    // Only Other Assistant's grant has run out.
    await testDb.db
      .update(oauthTokens)
      .set({ refreshExpiresAt: new Date(Date.now() - 1000) })
      .where(eq(oauthTokens.clientId, other.client_id));
    const now = new Date(Date.now() + 8 * 24 * 60 * 60_000);
    const run = await runCleanup({ now: new Date() });
    expect(run).toMatchObject({ oauthTokensDeleted: 1, oauthClientsDeleted: 0 });
    // A week later, the client with nothing left is removed; the connected one stays.
    await testDb.db.update(oauthTokens).set({ refreshExpiresAt: new Date(now.getTime() + 60_000) });
    const later = await runCleanup({ now });
    expect(later).toMatchObject({ oauthCodesDeleted: 2, oauthClientsDeleted: 1 });
    expect((await apps(alice)).map((app) => app.name)).toEqual(["Claude"]);
    expect(await verifyAccessToken(live.access_token)).not.toBeNull();
  });
});
