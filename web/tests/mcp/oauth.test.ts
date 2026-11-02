import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/session")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  ...(await import("../helpers/session")).nextServerMock,
}));

import {
  discoverAuthorizationServerMetadata,
  discoverOAuthProtectedResourceMetadata,
  exchangeAuthorization,
  refreshAuthorization,
  registerClient as sdkRegisterClient,
  startAuthorization,
  validateAuthorizationResponseIssuer,
} from "@modelcontextprotocol/client";
import { NextRequest } from "next/server";
import { setDbForTests } from "@/db";
import { oauthClients, oauthCodes, oauthTokens, users, type User } from "@/db/schema";
import { GET as login } from "@/app/api/auth/google/login/route";
import { AUTH_NEXT_COOKIE } from "@/lib/auth/next";
import { createSafeLookup, describeFetchError, isBlockedAddress, setClientMetadataFetchForTests, verifyAccessToken } from "@/lib/oauth";
import { resetRateLimits } from "@/lib/oauth/rate-limit";
import { createTestDb, seedUser, truncateAll, type TestDatabase } from "../helpers/db";
import {
  appFetch,
  authorizeQuery,
  connect,
  decide,
  MCP_URL,
  pkce,
  REDIRECT,
  register,
  startAuthorize,
  tokenRequest,
  type RegisteredClient,
} from "../helpers/oauth";
import { TEST_ORIGIN } from "../helpers/session";

let testDb: TestDatabase;
let alice: User;
let client: RegisteredClient;

beforeAll(async () => {
  testDb = await createTestDb();
  setDbForTests(testDb.db);
});
afterAll(async () => {
  setClientMetadataFetchForTests(undefined);
  setDbForTests(undefined);
  await testDb.close();
});
beforeEach(async () => {
  await truncateAll(testDb.db);
  resetRateLimits();
  alice = await seedUser(testDb.db, { name: "Alice" });
  client = await register({ redirect_uris: [REDIRECT], client_name: "Claude" });
});

const json = async (path: string) => {
  const response = await appFetch(`${TEST_ORIGIN}${path}`);
  return { status: response.status, headers: response.headers, body: (await response.json()) as Record<string, unknown> };
};

/** Authorize + Allow for `client`, returning the code and the PKCE verifier. */
async function getCode(options: { scopes?: string[]; state?: string } = {}) {
  const { verifier, challenge } = pkce();
  const params = authorizeQuery({ clientId: client.client_id, challenge, state: options.state ?? "s1" });
  const response = await decide(alice, params, { scopes: options.scopes });
  expect(response.status).toBe(303);
  const location = new URL(response.headers.get("location")!);
  return { code: location.searchParams.get("code")!, verifier, location };
}

const exchange = (code: string, verifier: string, extra: Record<string, string> = {}) =>
  tokenRequest({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    resource: MCP_URL,
    ...extra,
  });

describe("discovery metadata", () => {
  it("serves RFC 8414 authorization server metadata with PKCE S256, DCR and CIMD", async () => {
    const { status, headers, body } = await json("/.well-known/oauth-authorization-server");
    expect(status).toBe(200);
    expect(headers.get("access-control-allow-origin")).toBe("*");
    expect(body).toMatchObject({
      issuer: TEST_ORIGIN,
      authorization_endpoint: `${TEST_ORIGIN}/api/oauth/authorize`,
      token_endpoint: `${TEST_ORIGIN}/api/oauth/token`,
      registration_endpoint: `${TEST_ORIGIN}/api/oauth/register`,
      revocation_endpoint: `${TEST_ORIGIN}/api/oauth/revoke`,
      code_challenge_methods_supported: ["S256"],
      scopes_supported: ["read", "watches:write", "schedule:write"],
      client_id_metadata_document_supported: true,
      authorization_response_iss_parameter_supported: true,
    });
  });

  it("serves RFC 9728 protected resource metadata at the path-inserted and root locations", async () => {
    for (const path of ["/.well-known/oauth-protected-resource/api/mcp", "/.well-known/oauth-protected-resource"]) {
      const { status, body } = await json(path);
      expect(status).toBe(200);
      expect(body).toMatchObject({ resource: MCP_URL, authorization_servers: [TEST_ORIGIN] });
    }
  });
});

describe("dynamic client registration", () => {
  it("registers a public client with https and loopback redirect URIs", async () => {
    const registered = await register({
      redirect_uris: ["https://claude.ai/api/mcp/auth_callback", "http://localhost:6274/callback"],
      client_name: "  Claude\u0000 Desktop  ",
    });
    expect(registered).toMatchObject({ client_name: "Claude Desktop", token_endpoint_auth_method: "none" });
    expect(registered.client_secret).toBeUndefined();
    const [row] = await testDb.db.select().from(oauthClients).where(eq(oauthClients.id, registered.client_id));
    expect(row).toMatchObject({ name: "Claude Desktop", clientSecretHash: null, metadataExpiresAt: null });
  });

  it("rejects plain-http, fragment and junk redirect URIs", async () => {
    for (const uris of [["http://evil.test/cb"], ["https://ok.test/cb#frag"], ["javascript:alert(1)"], [], "nope"]) {
      const response = await appFetch(`${TEST_ORIGIN}/api/oauth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redirect_uris: uris }),
      });
      expect(response.status).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalid_redirect_uri" });
    }
  });

  it("accepts native apps' private-use schemes (RFC 8252 §7.1): known editor schemes and reverse-domain ones", async () => {
    for (const uris of [
      ["cursor://anysphere.cursor-mcp/oauth/callback"],
      ["com.example.app://callback"],
      ["com.example.app:/oauth2redirect/example-provider"],
      ["vscode://vscode.github-authentication/did-authenticate", "windsurf://codeium.windsurf/oauth"],
      ["Cursor://anysphere.cursor-mcp/oauth/callback"],
    ]) {
      const registered = await register({ redirect_uris: uris });
      expect(registered.redirect_uris).toEqual(uris);
    }
  });

  it("rejects dangerous and unknown schemes, and private-use URIs with a fragment or credentials", async () => {
    for (const uri of [
      "javascript:alert(1)",
      "data:text/html,<script>alert(1)</script>",
      "file:///etc/passwd",
      "vbscript:msgbox(1)",
      "about:blank",
      "blob:https://evil.test/1234",
      "ms-word:ofe|u|https://evil.test/x.docx",
      "ms-settings:privacy",
      "ms-word.app://callback",
      "myapp://callback",
      "ftp://files.test/cb",
      "cursor://anysphere.cursor-mcp/oauth/callback#frag",
      "com.example.app://callback#",
      "cursor://user:pass@anysphere.cursor-mcp/oauth/callback",
      "cursor:",
      "com.example.app:/",
    ]) {
      const response = await appFetch(`${TEST_ORIGIN}/api/oauth/register`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ redirect_uris: [uri] }),
      });
      expect(response.status, uri).toBe(400);
      expect(await response.json()).toMatchObject({ error: "invalid_redirect_uri" });
    }
  });

  it("issues a secret for client_secret_post clients and requires it at the token endpoint", async () => {
    const confidential = await register({ redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_post" });
    expect(confidential.client_secret).toMatch(/^pwcs_/);
    client = confidential;
    const { code, verifier } = await getCode();
    expect((await exchange(code, verifier)).body).toMatchObject({ error: "invalid_client" });
    const ok = await exchange(code, verifier, { client_secret: confidential.client_secret! });
    expect(ok.status).toBe(200);
  });
});

describe("authorization code flow", () => {
  it("signed out: authorize sends the user to sign in, and sign-in returns to the same authorize URL", async () => {
    const params = authorizeQuery({ clientId: client.client_id });
    const location = await startAuthorize(params);
    expect(location.pathname).toBe("/");
    const next = location.searchParams.get("next")!;
    expect(next).toBe(`/api/oauth/authorize?${params}`);

    const response = await login(new NextRequest(`${TEST_ORIGIN}/api/auth/google/login?next=${encodeURIComponent(next)}`));
    expect(response.cookies.get(AUTH_NEXT_COOKIE)).toMatchObject({ value: next, httpOnly: true, path: "/api/auth/google" });
    const unsafe = await login(new NextRequest(`${TEST_ORIGIN}/api/auth/google/login?next=${encodeURIComponent("https://evil.test/")}`));
    expect(unsafe.cookies.get(AUTH_NEXT_COOKIE)?.value).toBe("");
  });

  it("signed in: authorize hands the request to the consent page unchanged", async () => {
    const params = authorizeQuery({ clientId: client.client_id });
    const location = await startAuthorize(params, alice);
    expect(location.pathname).toBe("/connect");
    expect(location.searchParams.toString()).toBe(params.toString());
  });

  it("Allow -> code (with state and iss) -> tokens; a wrong verifier is refused; a reused code is refused and revokes", async () => {
    const { code, verifier, location } = await getCode({ state: "xyz" });
    expect(`${location.origin}${location.pathname}`).toBe(REDIRECT);
    expect(location.searchParams.get("state")).toBe("xyz");
    expect(location.searchParams.get("iss")).toBe(TEST_ORIGIN);
    expect(code).toMatch(/^pwac_/);

    const wrong = await exchange(code, pkce().verifier);
    expect(wrong).toMatchObject({ status: 400, body: { error: "invalid_grant" } });

    const ok = await exchange(code, verifier);
    expect(ok.status).toBe(200);
    expect(ok.headers.get("cache-control")).toBe("no-store");
    expect(ok.body).toMatchObject({ token_type: "Bearer", expires_in: 3600, scope: "read watches:write schedule:write" });
    const access = String(ok.body.access_token);
    expect(await verifyAccessToken(access)).toMatchObject({ userId: alice.id, clientId: client.client_id });

    // Stored hashed only.
    const [row] = await testDb.db.select().from(oauthTokens);
    expect(JSON.stringify(row)).not.toContain(access);
    expect(JSON.stringify(await testDb.db.select().from(oauthCodes))).not.toContain(code);

    const reused = await exchange(code, verifier);
    expect(reused).toMatchObject({ status: 400, body: { error: "invalid_grant" } });
    expect(await verifyAccessToken(access)).toBeNull();
  });

  it("refuses an expired code, a code for another client, and a mismatched redirect_uri", async () => {
    const other = await register({ redirect_uris: [REDIRECT] });
    const first = await getCode();
    expect((await exchange(first.code, first.verifier, { client_id: other.client_id })).body).toMatchObject({ error: "invalid_grant" });
    expect((await exchange(first.code, first.verifier, { redirect_uri: "https://assistant.example/other" })).body).toMatchObject({
      error: "invalid_grant",
    });
    await testDb.db.update(oauthCodes).set({ expiresAt: new Date(Date.now() - 1000) });
    expect((await exchange(first.code, first.verifier)).body).toMatchObject({ error: "invalid_grant" });
  });

  it("a resource other than this MCP server is refused at authorize and token", async () => {
    const location = await startAuthorize(authorizeQuery({ clientId: client.client_id, resource: "https://other.example/mcp" }), alice);
    expect(location.searchParams.get("error")).toBe("invalid_target");
    const { code, verifier } = await getCode();
    expect((await exchange(code, verifier, { resource: "https://other.example/mcp" })).body).toMatchObject({ error: "invalid_target" });
  });

  it("unticked write scopes are not granted; read always is", async () => {
    const tokens = await connect(alice, client, { scopes: ["schedule:write"] });
    expect(tokens.scope).toBe("read schedule:write");
    expect((await verifyAccessToken(tokens.access_token))?.scopes).toEqual(["read", "schedule:write"]);
    const readOnly = await connect(alice, client, { scopes: [], scope: "read watches:write" });
    expect(readOnly.scope).toBe("read");
  });

  it("Deny sends access_denied back to the app", async () => {
    const response = await decide(alice, authorizeQuery({ clientId: client.client_id, state: "s9" }), { decision: "deny" });
    const location = new URL(response.headers.get("location")!);
    expect(location.searchParams.get("error")).toBe("access_denied");
    expect(location.searchParams.get("state")).toBe("s9");
    expect(await testDb.db.select().from(oauthCodes)).toHaveLength(0);
  });

  it("the consent form refuses cross-origin posts", async () => {
    for (const origin of ["https://evil.test", null]) {
      const response = await decide(alice, authorizeQuery({ clientId: client.client_id }), { origin });
      expect(response.status).toBe(403);
    }
    expect(await testDb.db.select().from(oauthCodes)).toHaveLength(0);
  });

  it("bad client or redirect URI is shown on /connect, never redirected; later errors go back to the app", async () => {
    const unknown = await startAuthorize(authorizeQuery({ clientId: "pwc_nope" }), alice);
    expect(unknown.pathname).toBe("/connect");
    const badRedirect = await startAuthorize(authorizeQuery({ clientId: client.client_id, redirectUri: "https://evil.test/cb" }), alice);
    expect(badRedirect.pathname).toBe("/connect");

    const noPkce = await startAuthorize(authorizeQuery({ clientId: client.client_id, challenge: null, state: "st" }), alice);
    expect(`${noPkce.origin}${noPkce.pathname}`).toBe(REDIRECT);
    expect(noPkce.searchParams.get("error")).toBe("invalid_request");
    expect(noPkce.searchParams.get("state")).toBe("st");
    expect(noPkce.searchParams.get("iss")).toBe(TEST_ORIGIN);

    const plain = await startAuthorize(authorizeQuery({ clientId: client.client_id, extra: { code_challenge_method: "plain" } }), alice);
    expect(plain.searchParams.get("error")).toBe("invalid_request");
    const token = await startAuthorize(authorizeQuery({ clientId: client.client_id, extra: { response_type: "token" } }), alice);
    expect(token.searchParams.get("error")).toBe("unsupported_response_type");
  });

  it("private-use scheme redirect URIs must match a registered one exactly (scheme case-insensitive)", async () => {
    const CURSOR = "cursor://anysphere.cursor-mcp/oauth/callback";
    client = await register({ redirect_uris: [CURSOR, "https://www.cursor.com/agents/mcp/oauth/callback"] });

    for (const redirectUri of [CURSOR, "CURSOR://anysphere.cursor-mcp/oauth/callback"]) {
      expect((await startAuthorize(authorizeQuery({ clientId: client.client_id, redirectUri }), alice)).pathname).toBe("/connect");
    }
    // Not registered: another app's scheme, another host or path, a case change after the scheme.
    for (const redirectUri of [
      "windsurf://anysphere.cursor-mcp/oauth/callback",
      "com.evil.app://anysphere.cursor-mcp/oauth/callback",
      "cursor://anysphere.cursor-mcp/oauth/callback2",
      "cursor://evil.cursor-mcp/oauth/callback",
      "cursor://Anysphere.cursor-mcp/oauth/callback",
      "cursor://anysphere.cursor-mcp/oauth/callback?x=1",
    ]) {
      const response = await decide(alice, authorizeQuery({ clientId: client.client_id, redirectUri, state: "st" }));
      expect(response.status, redirectUri).toBe(303);
      const location = new URL(response.headers.get("location")!);
      expect(`${location.origin}${location.pathname}`, redirectUri).toBe(`${TEST_ORIGIN}/connect`);
      expect(location.searchParams.get("code")).toBeNull();
    }
    expect(await testDb.db.select().from(oauthCodes)).toHaveLength(0);

    // Registered: Allow sends the code to the app's own scheme, and the token exchange works.
    const { verifier, challenge } = pkce();
    const response = await decide(alice, authorizeQuery({ clientId: client.client_id, redirectUri: CURSOR, challenge, state: "cs" }));
    const location = new URL(response.headers.get("location")!);
    expect(location.href.replace(/\?.*$/, "")).toBe(CURSOR);
    expect(location.searchParams.get("state")).toBe("cs");
    expect(location.searchParams.get("iss")).toBe(TEST_ORIGIN);
    const ok = await tokenRequest({
      grant_type: "authorization_code",
      code: location.searchParams.get("code")!,
      code_verifier: verifier,
      client_id: client.client_id,
      redirect_uri: CURSOR,
      resource: MCP_URL,
    });
    expect(ok.status).toBe(200);
  });

  it("loopback redirect URIs match on any port (RFC 8252)", async () => {
    client = await register({ redirect_uris: ["http://127.0.0.1:1111/callback"] });
    const location = await startAuthorize(
      authorizeQuery({ clientId: client.client_id, redirectUri: "http://127.0.0.1:53412/callback" }),
      alice,
    );
    expect(location.pathname).toBe("/connect");
  });
});

describe("refresh, revocation and verification", () => {
  it("rotates refresh tokens; replaying an old one revokes the whole grant", async () => {
    const first = await connect(alice, client);
    const refreshed = await tokenRequest({ grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: client.client_id });
    expect(refreshed.status).toBe(200);
    const second = refreshed.body as unknown as { access_token: string; refresh_token: string; scope: string };
    expect(second.refresh_token).not.toBe(first.refresh_token);
    expect(second.scope).toBe(first.scope);
    expect(await verifyAccessToken(first.access_token)).toBeNull();
    expect(await verifyAccessToken(second.access_token)).not.toBeNull();

    const replay = await tokenRequest({ grant_type: "refresh_token", refresh_token: first.refresh_token, client_id: client.client_id });
    expect(replay).toMatchObject({ status: 400, body: { error: "invalid_grant" } });
    expect(await verifyAccessToken(second.access_token)).toBeNull();
    const after = await tokenRequest({ grant_type: "refresh_token", refresh_token: second.refresh_token, client_id: client.client_id });
    expect(after.body).toMatchObject({ error: "invalid_grant" });
  });

  it("a refresh may narrow scope but never widen it", async () => {
    const tokens = await connect(alice, client, { scopes: ["watches:write"] });
    const wider = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: client.client_id,
      scope: "read schedule:write",
    });
    expect(wider.body).toMatchObject({ error: "invalid_scope" });
    const narrower = await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: tokens.refresh_token,
      client_id: client.client_id,
      scope: "read",
    });
    expect(narrower.body).toMatchObject({ scope: "read" });
  });

  it("another client cannot use a refresh token", async () => {
    const tokens = await connect(alice, client);
    const other = await register({ redirect_uris: [REDIRECT] });
    const stolen = await tokenRequest({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: other.client_id });
    expect(stolen.body).toMatchObject({ error: "invalid_grant" });
    expect(await verifyAccessToken(tokens.access_token)).not.toBeNull();
  });

  it("revoking the refresh token stops the access token too; unknown tokens still answer 200", async () => {
    const tokens = await connect(alice, client);
    const revoke = (value: string) =>
      appFetch(`${TEST_ORIGIN}/api/oauth/revoke`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ token: value, client_id: client.client_id, token_type_hint: "refresh_token" }).toString(),
      });
    expect((await revoke(tokens.refresh_token)).status).toBe(200);
    expect(await verifyAccessToken(tokens.access_token)).toBeNull();
    expect((await revoke("pwrt_unknown")).status).toBe(200);
  });

  it("verification fails for expired tokens and when the user is deleted; last_used_at is recorded", async () => {
    const tokens = await connect(alice, client);
    expect(await verifyAccessToken(tokens.access_token)).not.toBeNull();
    const [row] = await testDb.db.select().from(oauthTokens);
    expect(row.lastUsedAt).toBeInstanceOf(Date);
    expect(await verifyAccessToken(tokens.access_token, { now: new Date(Date.now() + 3601_000) })).toBeNull();
    expect(await verifyAccessToken("pwat_not-a-token")).toBeNull();
    expect(await verifyAccessToken(undefined)).toBeNull();

    await testDb.db.delete(users).where(eq(users.id, alice.id));
    expect(await verifyAccessToken(tokens.access_token)).toBeNull();
  });
});

describe("Client ID Metadata Documents", () => {
  const CIMD = "https://assistant.example/oauth/client-metadata.json";
  let fetched = 0;

  beforeEach(() => {
    fetched = 0;
    setClientMetadataFetchForTests(async (url) => {
      fetched++;
      expect(url).toBe(CIMD);
      return {
        status: 200,
        cacheControl: "max-age=600",
        body: JSON.stringify({ client_id: CIMD, client_name: "Example Assistant", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" }),
      };
    });
  });

  it("an HTTPS client_id is fetched, cached and usable end to end without registration", async () => {
    const { verifier, challenge } = pkce();
    const params = authorizeQuery({ clientId: CIMD, challenge });
    expect((await startAuthorize(params, alice)).pathname).toBe("/connect");
    const response = await decide(alice, params);
    const code = new URL(response.headers.get("location")!).searchParams.get("code")!;
    expect(fetched).toBe(1); // cached between the authorize and the decision
    const tokens = await tokenRequest({ grant_type: "authorization_code", code, code_verifier: verifier, client_id: CIMD, redirect_uri: REDIRECT });
    expect(tokens.status).toBe(200);
    const [row] = await testDb.db.select().from(oauthClients).where(eq(oauthClients.id, CIMD));
    expect(row.name).toBe("Example Assistant");
    expect(row.metadataExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 500_000);
  });

  it("a document naming a different client_id, or an unregistered redirect URI, is refused on /connect", async () => {
    setClientMetadataFetchForTests(async () => ({
      status: 200,
      cacheControl: null,
      body: JSON.stringify({ client_id: "https://attacker.example/x.json", client_name: "X", redirect_uris: [REDIRECT] }),
    }));
    expect((await startAuthorize(authorizeQuery({ clientId: CIMD }), alice)).pathname).toBe("/connect");
    const response = await decide(alice, authorizeQuery({ clientId: CIMD }));
    expect(new URL(response.headers.get("location")!).pathname).toBe("/connect");
    expect(await testDb.db.select().from(oauthCodes)).toHaveLength(0);
  });
});

describe("Client ID Metadata Document fetch: DNS guard", () => {
  // claude.ai's real answer: AAAA first, then A. Vercel Functions cannot reach IPv6.
  const CLAUDE = [
    { address: "2607:6bc0::10", family: 6 },
    { address: "160.79.104.10", family: 4 },
  ];

  /** Runs the guarded lookup over a fake resolver, the way undici's connector calls it. */
  function lookup(answer: { address: string; family: number }[], options: { all?: boolean } = {}) {
    const safeLookup = createSafeLookup((_host, _opts, callback) => callback(null, answer));
    return new Promise<{ error: NodeJS.ErrnoException | null; address: unknown; family?: number }>((resolve) =>
      safeLookup("claude.ai", options, (error, address, family) => resolve({ error, address, family })),
    );
  }

  it("public IPv4 hosts are allowed (an IPv4-mapped IPv6 rule once blocked every IPv4 address)", async () => {
    expect(await lookup([CLAUDE[1]])).toEqual({ error: null, address: "160.79.104.10", family: 4 });
    expect(isBlockedAddress("8.8.8.8")).toBe(false);
    expect(isBlockedAddress("::ffff:160.79.104.10")).toBe(false);
    for (const address of ["10.0.0.5", "127.0.0.1", "169.254.169.254", "::1", "::ffff:10.0.0.5", "::ffff:a00:5", "fe80::1"]) {
      expect(isBlockedAddress(address), address).toBe(true);
    }
  });

  it("a host answering AAAA then A is tried over IPv4 first, keeping IPv6 as a fallback", async () => {
    const all = await lookup(CLAUDE, { all: true });
    expect(all.error).toBeNull();
    expect(all.address).toEqual([CLAUDE[1], CLAUDE[0]]);

    const single = await lookup(CLAUDE);
    expect(single).toEqual({ error: null, address: "160.79.104.10", family: 4 });
  });

  it("one private address among public ones refuses the whole host", async () => {
    const result = await lookup([...CLAUDE, { address: "10.0.0.5", family: 4 }], { all: true });
    expect(result.error?.code).toBe("EREFUSED");
    expect((await lookup([{ address: "fd00::1", family: 6 }, CLAUDE[1]])).error?.code).toBe("EREFUSED");
  });

  it("an IPv6-only public host still resolves", async () => {
    const v6 = [
      { address: "2607:6bc0::10", family: 6 },
      { address: "2607:6bc0::11", family: 6 },
    ];
    expect((await lookup(v6, { all: true })).address).toEqual(v6);
    expect(await lookup(v6)).toEqual({ error: null, address: "2607:6bc0::10", family: 6 });
  });

  it("a failed fetch is logged with its underlying cause", () => {
    const unreachable = Object.assign(new Error("connect ENETUNREACH 2607:6bc0::10:443"), { code: "ENETUNREACH" });
    const failed = new TypeError("fetch failed", { cause: unreachable });
    expect(describeFetchError(failed)).toBe("TypeError: fetch failed (cause: ENETUNREACH: connect ENETUNREACH 2607:6bc0::10:443)");
  });
});

describe("interop: the official MCP client SDK's OAuth helpers", () => {
  it("discovers, registers, authorizes, exchanges and refreshes against our endpoints", async () => {
    const prm = await discoverOAuthProtectedResourceMetadata(MCP_URL, {}, appFetch);
    expect(prm.resource).toBe(MCP_URL);
    const metadata = await discoverAuthorizationServerMetadata(prm.authorization_servers![0], { fetchFn: appFetch });
    expect(metadata?.issuer).toBe(TEST_ORIGIN);

    const info = await sdkRegisterClient(TEST_ORIGIN, {
      metadata,
      clientMetadata: { client_name: "SDK client", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" },
      fetchFn: appFetch,
    });
    const { authorizationUrl, codeVerifier } = await startAuthorization(TEST_ORIGIN, {
      metadata,
      clientInformation: info,
      redirectUrl: REDIRECT,
      scope: prm.scopes_supported!.join(" "),
      state: "sdk-state",
      resource: new URL(MCP_URL),
    });
    expect(authorizationUrl.searchParams.get("code_challenge_method")).toBe("S256");

    const consent = await startAuthorize(authorizationUrl.searchParams, alice);
    expect(consent.pathname).toBe("/connect");
    const response = await decide(alice, consent.searchParams);
    const callback = new URL(response.headers.get("location")!);
    validateAuthorizationResponseIssuer({
      iss: callback.searchParams.get("iss") ?? undefined,
      expectedIssuer: metadata!.issuer,
      issParameterSupported: metadata!.authorization_response_iss_parameter_supported === true,
    });

    const tokens = await exchangeAuthorization(TEST_ORIGIN, {
      metadata,
      clientInformation: info,
      authorizationCode: callback.searchParams.get("code")!,
      iss: callback.searchParams.get("iss") ?? undefined,
      codeVerifier,
      redirectUri: REDIRECT,
      resource: new URL(MCP_URL),
      fetchFn: appFetch,
    });
    expect(tokens).toMatchObject({ token_type: "Bearer", scope: "read watches:write schedule:write" });
    const refreshed = await refreshAuthorization(TEST_ORIGIN, {
      metadata,
      clientInformation: info,
      refreshToken: tokens.refresh_token!,
      resource: new URL(MCP_URL),
      fetchFn: appFetch,
    });
    expect(refreshed.access_token).not.toBe(tokens.access_token);
    expect(await verifyAccessToken(refreshed.access_token)).toMatchObject({ userId: alice.id });
  });
});
