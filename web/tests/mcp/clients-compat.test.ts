import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/session")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  ...(await import("../helpers/session")).nextServerMock,
}));

import { Client, StreamableHTTPClientTransport, UnauthorizedError, type OAuthClientProvider } from "@modelcontextprotocol/client";
import { setDbForTests } from "@/db";
import type { User } from "@/db/schema";
import { setClientMetadataFetchForTests, verifyAccessToken } from "@/lib/oauth";
import { resetRateLimits } from "@/lib/oauth/rate-limit";
import { createTestDb, seedUser, truncateAll, type TestDatabase } from "../helpers/db";
import { appFetch, decide, MCP_URL, pkce, startAuthorize, tokenRequest, type Tokens } from "../helpers/oauth";
import { TEST_ORIGIN } from "../helpers/session";

/**
 * Client compatibility: each test replays one MCP client's real OAuth requests (registration
 * or Client ID Metadata Document, authorize, token exchange, refresh) and its first MCP calls
 * against our route handlers, with the exact parameters that client sends. Sources (docs,
 * source code, and the live metadata documents, all checked 2026-11-02) are cited per test.
 *
 * The flow under test is always: discovery -> client id -> GET /api/oauth/authorize (signed
 * in: handed to /connect) -> consent "Allow" -> 303 to the client's redirect URI with code,
 * state and iss -> POST /api/oauth/token (form-urlencoded) -> MCP initialize + tools/list
 * with the access token -> refresh_token grant -> MCP again with the refreshed token.
 */

let testDb: TestDatabase;
let alice: User;

/** Client ID Metadata Documents served to our metadata fetcher (URL -> cache-control + JSON). */
const documents = new Map<string, { cacheControl: string | null; body: Record<string, unknown> }>();

beforeAll(async () => {
  testDb = await createTestDb();
  setDbForTests(testDb.db);
  setClientMetadataFetchForTests(async (url) => {
    const doc = documents.get(url);
    if (!doc) return { status: 404, cacheControl: null, body: "not found" };
    return { status: 200, cacheControl: doc.cacheControl, body: JSON.stringify(doc.body) };
  });
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
});

// -------------------------------------------------------------------------------------------
// Steps shared by the hand-replayed clients
// -------------------------------------------------------------------------------------------

const json = async (path: string) => (await (await appFetch(`${TEST_ORIGIN}${path}`)).json()) as Record<string, unknown>;

/** Discovery as every client does it: 401 challenge -> PRM -> AS metadata. */
async function discover() {
  const challenge = await appFetch(MCP_URL, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 0, method: "initialize", params: initializeParams("probe") }),
  });
  expect(challenge.status).toBe(401);
  const header = challenge.headers.get("www-authenticate") ?? "";
  const prmUrl = /resource_metadata="([^"]+)"/.exec(header)?.[1];
  expect(prmUrl).toBe(`${TEST_ORIGIN}/.well-known/oauth-protected-resource/api/mcp`);
  const prm = (await (await appFetch(prmUrl!)).json()) as { resource: string; authorization_servers: string[]; scopes_supported: string[] };
  expect(prm.resource).toBe(MCP_URL);
  const as = await json("/.well-known/oauth-authorization-server");
  expect(as.issuer).toBe(prm.authorization_servers[0]);
  return { prm, as };
}

/** POST /api/oauth/register with the client's exact JSON body; returns status + body. */
async function registerRaw(body: Record<string, unknown>) {
  const response = await appFetch(`${TEST_ORIGIN}/api/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  return { status: response.status, body: (await response.json()) as Record<string, unknown> };
}

/**
 * Authorize with exactly `query` as `alice`, Allow on the consent page (ticking `scopes`), and
 * return the redirect the browser is sent to. Asserts the request reached the consent page.
 */
async function authorizeAndAllow(query: URLSearchParams, scopes = ["watches:write", "schedule:write"]): Promise<URL> {
  const consent = await startAuthorize(query, alice);
  expect(consent.pathname, `authorize answered ${consent}`).toBe("/connect");
  const response = await decide(alice, query, { scopes });
  expect(response.status).toBe(303);
  return new URL(response.headers.get("location")!);
}

/** Checks the callback lands on `redirectUri` with code, the same state, and our iss. */
function expectCallback(callback: URL, redirectUri: string, state: string): string {
  // href, not origin + pathname: a private-use scheme (cursor://...) has an opaque "null" origin.
  expect(callback.href.replace(/[?#].*$/, "")).toBe(redirectUri.replace(/\?.*$/, ""));
  expect(callback.searchParams.get("error")).toBeNull();
  expect(callback.searchParams.get("state")).toBe(state);
  expect(callback.searchParams.get("iss")).toBe(TEST_ORIGIN);
  const code = callback.searchParams.get("code")!;
  // VS Code reads the code with /[?&]code=([^&]+)/ and does not URL-decode it.
  expect(code).toMatch(/^[A-Za-z0-9_-]+$/);
  return code;
}

function initializeParams(name: string, protocolVersion = "2025-11-25") {
  return { protocolVersion, capabilities: {}, clientInfo: { name, version: "1.0.0" } };
}

/** Reads a JSON-RPC response from a JSON or SSE (Streamable HTTP) body. */
async function rpcResult(response: Response): Promise<Record<string, unknown>> {
  const text = await response.text();
  const type = response.headers.get("content-type") ?? "";
  const payload = type.includes("text/event-stream")
    ? text
        .split("\n")
        .filter((line) => line.startsWith("data:"))
        .map((line) => line.slice(5).trim())
        .join("")
    : text;
  const message = JSON.parse(payload) as { result?: Record<string, unknown>; error?: unknown };
  if (!message.result) throw new Error(`JSON-RPC error: ${JSON.stringify(message.error)}`);
  return message.result;
}

/** One MCP session's opening, raw: initialize, notifications/initialized, tools/list. */
async function mcpInitializeAndList(accessToken: string, clientName: string): Promise<string[]> {
  const post = (body: unknown, extra: Record<string, string> = {}) =>
    appFetch(MCP_URL, {
      method: "POST",
      headers: {
        authorization: `Bearer ${accessToken}`,
        "content-type": "application/json",
        accept: "application/json, text/event-stream",
        ...extra,
      },
      body: JSON.stringify(body),
    });
  const init = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: initializeParams(clientName) });
  expect(init.status).toBe(200);
  const session = init.headers.get("mcp-session-id");
  const result = await rpcResult(init);
  expect(result.serverInfo).toMatchObject({ name: "PantherWatch" });
  const version = String(result.protocolVersion);
  const headers: Record<string, string> = { "mcp-protocol-version": version, ...(session ? { "mcp-session-id": session } : {}) };

  const initialized = await post({ jsonrpc: "2.0", method: "notifications/initialized" }, headers);
  expect(initialized.status).toBe(202);
  const list = await post({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} }, headers);
  expect(list.status).toBe(200);
  const tools = (await rpcResult(list)).tools as Array<{ name: string }>;
  expect(tools.length).toBeGreaterThan(5);
  return tools.map((tool) => tool.name);
}

async function expectTokensWork(tokens: Tokens, clientId: string, clientName: string) {
  expect(tokens).toMatchObject({ token_type: "Bearer", expires_in: 3600 });
  expect(tokens.refresh_token).toMatch(/^pwrt_/);
  expect(await verifyAccessToken(tokens.access_token)).toMatchObject({ userId: alice.id, clientId });
  expect(await mcpInitializeAndList(tokens.access_token, clientName)).toContain("search_sections");
}

/** POST /api/oauth/token as the client sends it: form-urlencoded, these fields, these headers. */
async function token(fields: Record<string, string>, headers: Record<string, string> = {}): Promise<Tokens> {
  const result = await tokenRequest(fields, headers);
  expect(result.status, JSON.stringify(result.body)).toBe(200);
  expect(result.headers.get("cache-control")).toBe("no-store");
  return result.body as unknown as Tokens;
}

// -------------------------------------------------------------------------------------------
// Cursor
// -------------------------------------------------------------------------------------------

describe("Cursor", () => {
  // https://cursor.com/docs/context/mcp ("OAuth"): authorization code + PKCE, RFC 9728 PRM for
  // the AS and the RFC 8707 resource, DCR as a public client; scopes from the AS metadata's
  // scopes_supported; desktop callback http://localhost:8787/callback, web / Cloud Agents
  // callback https://www.cursor.com/agents/mcp/oauth/callback.
  // DCR body (Cursor staff, forum.cursor.com/t/171867, 2026-09-16, Cursor 3.19; and
  // forum.cursor.com/t/167608, Cursor 3.14.27): all three redirect URIs in one registration,
  // including the private-use scheme cursor://anysphere.cursor-mcp/oauth/callback.
  const CURSOR_DCR = {
    client_name: "Cursor",
    redirect_uris: [
      "cursor://anysphere.cursor-mcp/oauth/callback",
      "https://www.cursor.com/agents/mcp/oauth/callback",
      "http://localhost:8787/callback",
    ],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    token_endpoint_auth_method: "none",
  };
  const APP_REDIRECT = "cursor://anysphere.cursor-mcp/oauth/callback";
  const DESKTOP_REDIRECT = "http://localhost:8787/callback";

  async function cursorFlow(redirectUri: string) {
    const { prm, as } = await discover();
    const registered = await registerRaw(CURSOR_DCR);
    expect(registered.status, JSON.stringify(registered.body)).toBe(201);
    expect(registered.body).toMatchObject({ redirect_uris: CURSOR_DCR.redirect_uris, token_endpoint_auth_method: "none" });
    expect(registered.body.client_secret).toBeUndefined();
    const clientId = String(registered.body.client_id);

    const { verifier, challenge } = pkce();
    const state = "cursor-state-user-pantherwatch";
    const query = new URLSearchParams({
      response_type: "code",
      client_id: clientId,
      code_challenge: challenge,
      code_challenge_method: "S256",
      redirect_uri: redirectUri,
      state,
      scope: (as.scopes_supported as string[]).join(" "),
      resource: prm.resource,
    });
    const code = expectCallback(await authorizeAndAllow(query), redirectUri, state);
    const tokens = await token({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: redirectUri,
      client_id: clientId,
      resource: prm.resource,
    });
    expect(tokens.scope).toBe("read watches:write schedule:write");
    await expectTokensWork(tokens, clientId, "cursor-vscode");

    const refreshed = await token({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: clientId, resource: prm.resource });
    await expectTokensWork(refreshed, clientId, "cursor-vscode");
  }

  it("Cursor desktop: DCR with its three redirect URIs (incl. cursor://) -> cursor:// callback -> tokens -> MCP -> refresh", async () => {
    await cursorFlow(APP_REDIRECT);
  });

  it("Cursor desktop: the same registration -> localhost:8787 callback -> tokens -> MCP -> refresh", async () => {
    await cursorFlow(DESKTOP_REDIRECT);
  });
});

// -------------------------------------------------------------------------------------------
// VS Code
// -------------------------------------------------------------------------------------------

describe("VS Code", () => {
  // https://code.visualstudio.com/api/extension-guides/ai/mcp ("Authorization"): DCR, else a
  // client id the user types; redirect URIs http://127.0.0.1:33418 and https://vscode.dev/redirect.
  // Source (microsoft/vscode main, 2026-11-02):
  // - src/vs/workbench/api/browser/mainThreadAuthentication.ts: with no stored client and
  //   `client_id_metadata_document_supported`, the client id is product.json's
  //   authClientIdMetadataUrl = https://vscode.dev/oauth/client-metadata.json (CIMD).
  // - src/vs/base/common/oauth.ts fetchDynamicRegistration: the DCR body (builds without CIMD).
  // - src/vs/workbench/api/node/extHostAuthentication.ts _createWithLoopbackServer (desktop,
  //   tried first): redirect http://127.0.0.1:<33418 or a free port>/, state = 16 random bytes
  //   base64; src/vs/workbench/api/common/extHostAuthentication.ts _createWithUrlHandler
  //   (remote / web): redirect https://vscode.dev/redirect, state = a vscode:// URI.
  //   Both: scope = PRM scopes_supported (+ offline_access only if the AS lists it),
  //   resource = PRM resource at authorize, token and refresh; token body form-urlencoded with
  //   client_id, grant_type, code, redirect_uri, code_verifier, resource; refresh sends
  //   client_id, grant_type, refresh_token, resource (no scope). A narrower granted scope is
  //   tolerated (the session keeps the requested scopes).
  const VSCODE_CIMD = "https://vscode.dev/oauth/client-metadata.json";

  beforeEach(() => {
    // The live document, fetched 2026-11-02 (Cache-Control: no-store,no-cache,max-age=0).
    documents.set(VSCODE_CIMD, {
      cacheControl: "no-store,no-cache,max-age=0",
      body: {
        client_name: "Visual Studio Code",
        logo_uri: "https://code.visualstudio.com/assets/branding/code-stable.png",
        grant_types: ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
        application_type: "native",
        client_id: VSCODE_CIMD,
        client_uri: "https://vscode.dev/product",
        redirect_uris: ["http://127.0.0.1:33418/", "https://vscode.dev/redirect"],
      },
    });
  });

  async function vscodeFlow(clientId: string, redirectUri: string, state: string, prm: { resource: string; scopes_supported: string[] }) {
    const { verifier, challenge } = pkce();
    // Parameter order as VS Code appends them.
    const query = new URLSearchParams();
    query.append("client_id", clientId);
    query.append("response_type", "code");
    query.append("state", state);
    query.append("code_challenge", challenge);
    query.append("code_challenge_method", "S256");
    query.append("scope", prm.scopes_supported.join(" "));
    query.append("resource", prm.resource);
    query.append("redirect_uri", redirectUri);

    // The user unticks "Edit your schedule": VS Code keeps working with the narrower grant.
    const code = expectCallback(await authorizeAndAllow(query, ["watches:write"]), redirectUri, state);
    const accept = { accept: "application/json" };
    const tokens = await token(
      { client_id: clientId, grant_type: "authorization_code", code, redirect_uri: redirectUri, code_verifier: verifier, resource: prm.resource },
      accept,
    );
    expect(tokens.scope).toBe("read watches:write");
    await expectTokensWork(tokens, clientId, "Visual Studio Code");

    const refreshed = await token({ client_id: clientId, grant_type: "refresh_token", refresh_token: tokens.refresh_token, resource: prm.resource }, accept);
    expect(refreshed.scope).toBe("read watches:write");
    await expectTokensWork(refreshed, clientId, "Visual Studio Code");
  }

  it("VS Code desktop (CIMD): vscode.dev client metadata -> loopback 127.0.0.1:33418 -> tokens -> MCP -> refresh", async () => {
    const { prm, as } = await discover();
    expect(as.client_id_metadata_document_supported).toBe(true);
    await vscodeFlow(VSCODE_CIMD, "http://127.0.0.1:33418/", "q7Yb+4hT0n/9xKc2LmP1zA==", prm);
  });

  it("VS Code desktop (CIMD): port 33418 busy, a free loopback port is used instead", async () => {
    const { prm } = await discover();
    await vscodeFlow(VSCODE_CIMD, "http://127.0.0.1:51734/", "Zm9vYmFyYmF6cXV4MTIzNA==", prm);
  });

  it("VS Code remote / vscode.dev (CIMD): https://vscode.dev/redirect with a vscode:// state -> tokens -> MCP -> refresh", async () => {
    const { prm } = await discover();
    const state = "vscode://dynamicauthprovider/localhost%3A3000/authorize?nonce=6f1c0a9b2d4e8f7a6c5b4a3d2e1f0a9b";
    await vscodeFlow(VSCODE_CIMD, "https://vscode.dev/redirect", state, prm);
  });

  it("VS Code without a CIMD URL (OSS builds, or a stored DCR client): its exact DCR body -> loopback -> tokens -> MCP -> refresh", async () => {
    const { prm, as } = await discover();
    const grantTypesSupported = ["authorization_code", "refresh_token", "urn:ietf:params:oauth:grant-type:device_code"];
    const registered = await registerRaw({
      client_name: "Code - OSS",
      client_uri: "https://code.visualstudio.com",
      grant_types: (as.grant_types_supported as string[]).filter((grant) => grantTypesSupported.includes(grant)),
      response_types: ["code"],
      redirect_uris: ["https://insiders.vscode.dev/redirect", "https://vscode.dev/redirect", "http://127.0.0.1/", "http://127.0.0.1:33418/"],
      scope: prm.scopes_supported.join(" "),
      token_endpoint_auth_method: "none",
      application_type: "native",
    });
    expect(registered.status, JSON.stringify(registered.body)).toBe(201);
    expect(registered.body.client_secret).toBeUndefined();
    await vscodeFlow(String(registered.body.client_id), "http://127.0.0.1:40123/", "c3RhdGUtZm9yLXRoZS1kY3I=", prm);
  });
});

// -------------------------------------------------------------------------------------------
// Claude Code
// -------------------------------------------------------------------------------------------

describe("Claude Code", () => {
  // https://code.claude.com/docs/en/mcp ("Authenticate with remote MCP servers"): PRM then AS
  // metadata discovery; CIMD when the server supports it, else DCR; redirect
  // http://localhost:PORT/callback on a random port (fixed with --callback-port); with no
  // oauth.scopes configured it does NOT request the scopes_supported catalog; it appends
  // offline_access only when the AS lists it; the v2 runtime rejects a callback whose iss is
  // unexpected. Client id (CIMD), live 2026-11-02 (Cache-Control: public, max-age=300):
  // https://claude.ai/oauth/claude-code-client-metadata with redirect_uris
  // http://localhost/callback and http://127.0.0.1/callback (port-agnostic loopback match).
  // `resource` is not documented; Claude Code sends the PRM resource like the MCP SDK does, so
  // it is sent here (the no-resource case is covered by the refresh below and oauth.test.ts).
  const CLAUDE_CODE_CIMD = "https://claude.ai/oauth/claude-code-client-metadata";

  beforeEach(() => {
    documents.set(CLAUDE_CODE_CIMD, {
      cacheControl: "public, max-age=300",
      body: {
        client_id: CLAUDE_CODE_CIMD,
        client_name: "Claude Code",
        client_uri: "https://claude.ai",
        redirect_uris: ["http://localhost/callback", "http://127.0.0.1/callback"],
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        token_endpoint_auth_method: "none",
      },
    });
  });

  it("Claude Code (CIMD): claude.ai client metadata -> localhost:<random port>/callback, no scope -> tokens -> MCP -> refresh", async () => {
    const { prm } = await discover();
    for (const redirectUri of ["http://localhost:49821/callback", "http://127.0.0.1:8080/callback"]) {
      await truncateAll(testDb.db);
      alice = await seedUser(testDb.db, { name: "Alice" });
      const { verifier, challenge } = pkce();
      const state = "cc-" + pkce().verifier.slice(0, 20);
      const query = new URLSearchParams({
        response_type: "code",
        client_id: CLAUDE_CODE_CIMD,
        code_challenge: challenge,
        code_challenge_method: "S256",
        redirect_uri: redirectUri,
        state,
        resource: prm.resource,
      });
      // No scope requested: the server offers every scope and the user narrows on consent.
      const code = expectCallback(await authorizeAndAllow(query, ["schedule:write"]), redirectUri, state);
      const tokens = await token({
        grant_type: "authorization_code",
        code,
        code_verifier: verifier,
        redirect_uri: redirectUri,
        client_id: CLAUDE_CODE_CIMD,
        resource: prm.resource,
      });
      expect(tokens.scope).toBe("read schedule:write");
      await expectTokensWork(tokens, CLAUDE_CODE_CIMD, "claude-code");

      const refreshed = await token({ grant_type: "refresh_token", refresh_token: tokens.refresh_token, client_id: CLAUDE_CODE_CIMD });
      await expectTokensWork(refreshed, CLAUDE_CODE_CIMD, "claude-code");
    }
  });
});

// -------------------------------------------------------------------------------------------
// MCP Inspector (the generic "other" client): driven by the real MCP client SDK
// -------------------------------------------------------------------------------------------

describe("MCP Inspector", () => {
  // modelcontextprotocol/inspector v2.13.0 (2026-10-28), built on @modelcontextprotocol/client
  // 2.4.0 (the version installed here). core/auth/providers.ts clientMetadata: DCR as
  // { redirect_uris, token_endpoint_auth_method: "none", grant_types: [authorization_code,
  // refresh_token], response_types: ["code"], client_name: "MCP Inspector", client_uri:
  // "https://github.com/modelcontextprotocol/inspector", scope: "", application_type: "native" };
  // core/auth/browser/providers.ts: redirect `${window.location.origin}/oauth/callback` =
  // http://localhost:6274/oauth/callback. CIMD only when the user configures a clientMetadataUrl.
  // The SDK's transport drives the whole flow from the 401: PRM, AS metadata, DCR, authorize
  // (resource, PKCE S256, scope from PRM), token exchange with iss validation, refresh.
  const REDIRECT = "http://localhost:6274/oauth/callback";

  class InspectorProvider implements OAuthClientProvider {
    client?: Record<string, unknown>;
    stored?: Record<string, unknown>;
    verifier = "";
    authorizationUrl?: URL;
    registrations: Record<string, unknown>[] = [];
    flowState = "";

    get redirectUrl() {
      return REDIRECT;
    }
    get clientMetadata() {
      return {
        redirect_uris: [REDIRECT],
        token_endpoint_auth_method: "none",
        grant_types: ["authorization_code", "refresh_token"],
        response_types: ["code"],
        client_name: "MCP Inspector",
        client_uri: "https://github.com/modelcontextprotocol/inspector",
        scope: "",
        application_type: "native",
      };
    }
    state() {
      this.flowState = `insp-${pkce().verifier.slice(0, 16)}`;
      return this.flowState;
    }
    clientInformation() {
      return this.client as never;
    }
    saveClientInformation(info: Record<string, unknown>) {
      this.client = info;
      this.registrations.push(info);
    }
    tokens() {
      return this.stored as never;
    }
    saveTokens(tokens: Record<string, unknown>) {
      this.stored = tokens;
    }
    redirectToAuthorization(url: URL) {
      this.authorizationUrl = url;
    }
    saveCodeVerifier(verifier: string) {
      this.verifier = verifier;
    }
    codeVerifier() {
      return this.verifier;
    }
  }

  it("MCP Inspector: 401 -> discovery -> DCR -> authorize (localhost:6274) -> finishAuth -> initialize + tools/list -> refresh", async () => {
    const provider = new InspectorProvider();
    const transport = () => new StreamableHTTPClientTransport(new URL(MCP_URL), { authProvider: provider, fetch: appFetch });

    // First connect: 401 -> the SDK registers and "opens the browser" (redirectToAuthorization).
    await expect(new Client({ name: "inspector-client", version: "2.13.0" }).connect(transport())).rejects.toBeInstanceOf(UnauthorizedError);
    expect(provider.registrations).toHaveLength(1);
    expect(provider.client).toMatchObject({ client_name: "MCP Inspector", redirect_uris: [REDIRECT], token_endpoint_auth_method: "none" });
    const url = provider.authorizationUrl!;
    expect(`${url.origin}${url.pathname}`).toBe(`${TEST_ORIGIN}/api/oauth/authorize`);
    expect(url.searchParams.get("redirect_uri")).toBe(REDIRECT);
    expect(url.searchParams.get("resource")).toBe(MCP_URL);
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");

    // The user signs in and allows; the browser comes back to the Inspector's callback page.
    const callback = await authorizeAndAllow(url.searchParams);
    expectCallback(callback, REDIRECT, provider.flowState);
    const finishing = transport();
    await finishing.finishAuth(callback.searchParams);
    const tokens = provider.stored as unknown as Tokens;
    expect(tokens.scope).toBe("read watches:write schedule:write");

    const client = new Client({ name: "inspector-client", version: "2.13.0" });
    await client.connect(transport());
    expect((await client.listTools()).tools.map((tool) => tool.name)).toContain("list_terms");
    await client.close();
    await expectTokensWork(tokens, String(provider.client!.client_id), "inspector-client");

    // Access token rejected (expired / revoked) -> the SDK refreshes with the refresh token.
    const before = tokens.refresh_token;
    provider.stored = { ...provider.stored, access_token: "pwat_expired" };
    const again = new Client({ name: "inspector-client", version: "2.13.0" });
    await again.connect(transport());
    expect((await again.listTools()).tools.length).toBeGreaterThan(5);
    await again.close();
    expect((provider.stored as unknown as Tokens).refresh_token).not.toBe(before);
    expect(provider.registrations).toHaveLength(1);
  });
});
