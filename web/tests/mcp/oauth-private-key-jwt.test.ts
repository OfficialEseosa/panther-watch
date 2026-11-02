import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", async () => (await import("../helpers/session")).nextHeadersMock);
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  ...(await import("../helpers/session")).nextServerMock,
}));

import { Client, StreamableHTTPClientTransport } from "@modelcontextprotocol/client";
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey, type JWK } from "jose";
import { setDbForTests } from "@/db";
import { oauthAssertionJtis, oauthClients, type User } from "@/db/schema";
import { runCleanup } from "@/lib/jobs/cleanup";
import { checkAuthorizeRequest, JWT_BEARER_ASSERTION_TYPE, setClientMetadataFetchForTests, verifyAccessToken } from "@/lib/oauth";
import { resetRateLimits } from "@/lib/oauth/rate-limit";
import { createTestDb, seedUser, truncateAll, type TestDatabase } from "../helpers/db";
import { appFetch, authorizeQuery, decide, MCP_URL, pkce, register, startAuthorize, tokenRequest } from "../helpers/oauth";
import { TEST_ORIGIN } from "../helpers/session";

/**
 * private_key_jwt (RFC 7523) for Client ID Metadata Document clients, the way ChatGPT connects:
 * its document names a jwks_uri, and its token requests carry a signed client assertion.
 */

const CLIENT_ID = "https://chatgpt.example/oauth/client.json";
const JWKS_URI = "https://chatgpt.example/oauth/jwks.json";
const REDIRECT = "https://chatgpt.example/connector_platform_oauth_redirect";
const TOKEN_URL = `${TEST_ORIGIN}/api/oauth/token`;

let testDb: TestDatabase;
let alice: User;
const mcpClients: Client[] = [];

type KeyPair = { privateKey: CryptoKey; publicJwk: JWK };
let k1: KeyPair;
let k2: KeyPair;
let ec: KeyPair;

async function keyPair(alg: "RS256" | "ES256", kid: string): Promise<KeyPair> {
  const { privateKey, publicKey } = await generateKeyPair(alg, { extractable: true });
  return { privateKey, publicJwk: { ...(await exportJWK(publicKey)), kid, alg, use: "sig" } };
}

/** What the fake chatgpt.example serves; tests change it. */
let doc: Record<string, unknown>;
let jwks: { keys: JWK[] };
const fetches: string[] = [];

/** ChatGPT's real document (2026-11-02), moved to chatgpt.example. */
function chatGptDocument(): Record<string, unknown> {
  return {
    client_id: CLIENT_ID,
    client_uri: "https://chatgpt.example/",
    redirect_uris: [REDIRECT],
    token_endpoint_auth_method: "private_key_jwt",
    token_endpoint_auth_methods_supported: ["none", "private_key_jwt"],
    grant_types: ["authorization_code", "refresh_token"],
    response_types: ["code"],
    client_name: "ChatGPT",
    logo_uri: "https://chatgpt.example/openai-logo.png",
    token_endpoint_auth_signing_alg: "RS256",
    jwks_uri: JWKS_URI,
  };
}

beforeAll(async () => {
  testDb = await createTestDb();
  setDbForTests(testDb.db);
  [k1, k2, ec] = await Promise.all([keyPair("RS256", "k1"), keyPair("RS256", "k2"), keyPair("ES256", "e1")]);
});
afterAll(async () => {
  for (const client of mcpClients) await client.close().catch(() => {});
  setClientMetadataFetchForTests(undefined);
  setDbForTests(undefined);
  await testDb.close();
});
beforeEach(async () => {
  await truncateAll(testDb.db);
  resetRateLimits();
  alice = await seedUser(testDb.db, { name: "Alice" });
  // Default: a client that may ONLY use private_key_jwt.
  doc = { ...chatGptDocument(), token_endpoint_auth_methods_supported: ["private_key_jwt"] };
  jwks = { keys: [k1.publicJwk] };
  fetches.length = 0;
  setClientMetadataFetchForTests(async (url) => {
    fetches.push(url);
    if (url === CLIENT_ID) return { status: 200, cacheControl: "max-age=600", body: JSON.stringify(doc) };
    if (url === JWKS_URI) return { status: 200, cacheControl: "max-age=600", body: JSON.stringify(jwks) };
    return { status: 404, cacheControl: null, body: "" };
  });
});

/** A client assertion; `claims` override (undefined removes) the defaults. */
async function assertion(
  claims: Record<string, unknown> = {},
  { key = k1.privateKey, kid = "k1", alg = "RS256" }: { key?: CryptoKey; kid?: string; alg?: string } = {},
): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const payload: Record<string, unknown> = { iss: CLIENT_ID, sub: CLIENT_ID, aud: TOKEN_URL, jti: randomUUID(), iat: now, exp: now + 300 };
  for (const [name, value] of Object.entries(claims)) {
    if (value === undefined) delete payload[name];
    else payload[name] = value;
  }
  return new SignJWT(payload).setProtectedHeader({ alg, kid, typ: "JWT" }).sign(key);
}

const withAssertion = (jwt: string) => ({ client_assertion_type: JWT_BEARER_ASSERTION_TYPE, client_assertion: jwt });

/** authorize (to /connect) -> Allow -> code, as ChatGPT drives it. */
async function getCode() {
  const { verifier, challenge } = pkce();
  const params = authorizeQuery({ clientId: CLIENT_ID, redirectUri: REDIRECT, challenge });
  expect((await startAuthorize(params, alice)).pathname).toBe("/connect");
  const response = await decide(alice, params);
  expect(response.status).toBe(303);
  const code = new URL(response.headers.get("location")!).searchParams.get("code");
  expect(code).toMatch(/^pwac_/);
  return { code: code!, verifier };
}

const exchange = (code: string, verifier: string, extra: Record<string, string> = {}) =>
  tokenRequest({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT,
    resource: MCP_URL,
    ...extra,
  });

const refresh = (refreshToken: string, extra: Record<string, string> = {}) =>
  tokenRequest({ grant_type: "refresh_token", refresh_token: refreshToken, client_id: CLIENT_ID, resource: MCP_URL, ...extra });

async function listWatches(accessToken: string) {
  const client = new Client({ name: "chatgpt-test", version: "1.0.0" });
  const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
    fetch: appFetch,
    requestInit: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  await client.connect(transport);
  mcpClients.push(client);
  const result = (await client.callTool({ name: "list_watches", arguments: {} })) as { isError?: boolean; content: unknown[] };
  expect(result.content.length).toBeGreaterThan(0);
  return { isError: result.isError ?? false };
}

/** A code exchanged with a valid assertion: the starting point of the refresh tests. */
async function connected() {
  const { code, verifier } = await getCode();
  const tokens = await exchange(code, verifier, withAssertion(await assertion()));
  expect(tokens.status).toBe(200);
  return tokens.body as { access_token: string; refresh_token: string };
}

function expectInvalidClient(result: { status: number; body: Record<string, unknown> }, description: RegExp) {
  expect(result.status).toBe(401);
  expect(result.body.error).toBe("invalid_client");
  expect(String(result.body.error_description)).toMatch(description);
}

describe("private_key_jwt Client ID Metadata Document clients", () => {
  it("authorize -> consent -> code -> token with an assertion -> MCP call -> refresh with a new assertion", async () => {
    const check = await checkAuthorizeRequest(authorizeQuery({ clientId: CLIENT_ID, redirectUri: REDIRECT }));
    expect(check.ok && check.request.client.name).toBe("ChatGPT");

    const tokens = await connected();
    const [row] = await testDb.db.select().from(oauthClients).where(eq(oauthClients.id, CLIENT_ID));
    expect(row).toMatchObject({
      name: "ChatGPT",
      clientSecretHash: null,
      tokenEndpointAuthMethods: ["private_key_jwt"],
      jwksUri: JWKS_URI,
      tokenEndpointAuthSigningAlg: "RS256",
    });
    expect((await listWatches(tokens.access_token)).isError).toBe(false);

    const refreshed = await refresh(tokens.refresh_token, withAssertion(await assertion()));
    expect(refreshed.status).toBe(200);
    const second = refreshed.body as { access_token: string };
    expect(await verifyAccessToken(tokens.access_token)).toBeNull();
    expect(await verifyAccessToken(second.access_token)).toMatchObject({ userId: alice.id, clientId: CLIENT_ID });
    expect((await listWatches(second.access_token)).isError).toBe(false);

    // The document was fetched once (cached across authorize and consent), the JWKS once (cached across both grants).
    expect(fetches).toEqual([CLIENT_ID, JWKS_URI]);
    expect(await testDb.db.select().from(oauthAssertionJtis)).toHaveLength(2);
  });

  it("the client_id form field is optional with an assertion; the issuer is an accepted aud too", async () => {
    const { code, verifier } = await getCode();
    const tokens = await tokenRequest({
      grant_type: "authorization_code",
      code,
      code_verifier: verifier,
      redirect_uri: REDIRECT,
      ...withAssertion(await assertion({ aud: [TEST_ORIGIN, "https://someone-else.example"] })),
    });
    expect(tokens.status).toBe(200);
  });

  it("a client that may only use private_key_jwt must send an assertion (code and refresh)", async () => {
    const { code, verifier } = await getCode();
    expectInvalidClient(await exchange(code, verifier), /private_key_jwt/);
    const tokens = await connected();
    expectInvalidClient(await refresh(tokens.refresh_token), /private_key_jwt/);
    expect(await verifyAccessToken(tokens.access_token)).not.toBeNull();
  });

  it("refuses a bad signature, a wrong aud, an expired or far-future exp, and iss != client_id", async () => {
    const { code, verifier } = await getCode();
    const now = Math.floor(Date.now() / 1000);
    const refused: Array<[string, RegExp]> = [
      [await assertion({}, { key: k2.privateKey, kid: "k1" }), /signature/],
      [await assertion({ aud: "https://other.example/token" }), /aud/],
      [await assertion({ aud: MCP_URL }), /aud/],
      [await assertion({ exp: now - 120, iat: now - 420 }), /expired/],
      [await assertion({ exp: now + 3 * 60 * 60 }), /too far in the future/],
      [await assertion({ iat: now + 600 }), /iat/],
      [await assertion({ nbf: now + 600 }), /nbf/],
      [await assertion({ iss: "https://evil.example/client.json" }), /iss and sub/],
      [await assertion({ jti: undefined }), /jti/],
      [await assertion({ exp: undefined }), /exp/],
      [await assertion({}, { key: ec.privateKey, kid: "k1", alg: "ES256" }), /algorithm|key/],
    ];
    for (const [jwt, description] of refused) {
      expectInvalidClient(await exchange(code, verifier, withAssertion(jwt)), description);
    }
    // None of them consumed the code.
    expect((await exchange(code, verifier, withAssertion(await assertion()))).status).toBe(200);
  });

  it("an assertion is single-use: a replayed jti is refused", async () => {
    const jwt = await assertion();
    const { code, verifier } = await getCode();
    expect((await exchange(code, verifier, withAssertion(jwt))).status).toBe(200);
    const again = await getCode();
    expectInvalidClient(await exchange(again.code, again.verifier, withAssertion(jwt)), /already used/);
  });

  it("refuses a client_id that differs from the assertion's, and a wrong assertion type", async () => {
    const { code, verifier } = await getCode();
    expectInvalidClient(
      await exchange(code, verifier, { client_id: "https://other.example/client.json", ...withAssertion(await assertion()) }),
      /does not match/,
    );
    expectInvalidClient(
      await exchange(code, verifier, { client_assertion_type: "urn:example:other", client_assertion: await assertion() }),
      /client_assertion_type/,
    );
    const both = await exchange(code, verifier, { client_secret: "x", ...withAssertion(await assertion()) });
    expect(both).toMatchObject({ status: 400, body: { error: "invalid_request" } });
  });

  it("an unknown kid refetches the JWKS once: a rotated key is then accepted, a still-unknown one refused", async () => {
    const tokens = await connected();
    expect(fetches.filter((url) => url === JWKS_URI)).toHaveLength(1);

    // Still-unknown kid: one refetch, then refused.
    expectInvalidClient(
      await refresh(tokens.refresh_token, withAssertion(await assertion({}, { key: k2.privateKey, kid: "k2" }))),
      /no key/,
    );
    expect(fetches.filter((url) => url === JWKS_URI)).toHaveLength(2);

    // The client rotates to k2: the refetch picks it up.
    jwks = { keys: [k2.publicJwk] };
    const rotated = await refresh(tokens.refresh_token, withAssertion(await assertion({}, { key: k2.privateKey, kid: "k2" })));
    expect(rotated.status).toBe(200);
    expect(fetches.filter((url) => url === JWKS_URI)).toHaveLength(3);
  });

  it("ChatGPT's document (methods_supported lists none): connects as ChatGPT, with or without an assertion", async () => {
    doc = chatGptDocument();
    const check = await checkAuthorizeRequest(authorizeQuery({ clientId: CLIENT_ID, redirectUri: REDIRECT }));
    expect(check.ok && check.request.client).toMatchObject({ name: "ChatGPT", authMethods: ["none", "private_key_jwt"] });

    const plain = await getCode();
    const tokens = await exchange(plain.code, plain.verifier);
    expect(tokens.status).toBe(200);

    const signed = await getCode();
    expect((await exchange(signed.code, signed.verifier, withAssertion(await assertion()))).status).toBe(200);

    // An assertion that is sent must still be valid.
    const bad = await getCode();
    expectInvalidClient(
      await exchange(bad.code, bad.verifier, withAssertion(await assertion({}, { key: k2.privateKey, kid: "k1" }))),
      /signature/,
    );
    expect((await refresh(String(tokens.body.refresh_token))).status).toBe(200);
  });

  it("inline jwks and a declared ES256 alg: only ES256 assertions from that key are accepted", async () => {
    doc = {
      ...chatGptDocument(),
      token_endpoint_auth_methods_supported: undefined,
      jwks_uri: undefined,
      jwks: { keys: [ec.publicJwk] },
      token_endpoint_auth_signing_alg: "ES256",
    };
    const { code, verifier } = await getCode();
    expectInvalidClient(await exchange(code, verifier, withAssertion(await assertion())), /algorithm/);
    expect((await exchange(code, verifier, withAssertion(await assertion({}, { key: ec.privateKey, kid: "e1", alg: "ES256" })))).status).toBe(200);
    expect(fetches).toEqual([CLIENT_ID]);
  });

  it("documents PantherWatch cannot use are refused on /connect", async () => {
    const cases: Array<[Record<string, unknown>, RegExp]> = [
      [{ ...chatGptDocument(), token_endpoint_auth_method: "client_secret_basic", token_endpoint_auth_methods_supported: ["client_secret_basic"] }, /client_secret_basic/],
      [{ ...chatGptDocument(), token_endpoint_auth_methods_supported: undefined, jwks_uri: "http://chatgpt.example/jwks.json" }, /jwks_uri/],
      [{ ...chatGptDocument(), token_endpoint_auth_methods_supported: undefined, jwks_uri: "https://10.0.0.5/jwks.json" }, /jwks_uri/],
      [{ ...chatGptDocument(), token_endpoint_auth_methods_supported: undefined, jwks_uri: undefined }, /jwks_uri or jwks/],
      [{ ...chatGptDocument(), token_endpoint_auth_methods_supported: undefined, token_endpoint_auth_signing_alg: "HS256" }, /HS256/],
      [{ ...chatGptDocument(), token_endpoint_auth_methods_supported: undefined, jwks_uri: undefined, jwks: { keys: [{ kty: "oct", k: "c2VjcmV0" }] } }, /private or symmetric/],
    ];
    for (const [document, message] of cases) {
      doc = document;
      await truncateAll(testDb.db);
      const check = await checkAuthorizeRequest(authorizeQuery({ clientId: CLIENT_ID, redirectUri: REDIRECT }));
      expect(check.ok).toBe(false);
      expect(!check.ok && check.kind === "fatal" && check.message).toMatch(message);
    }
    // A client_secret method alongside none is fine: the client is treated as public.
    doc = { ...chatGptDocument(), token_endpoint_auth_method: "client_secret_basic", token_endpoint_auth_methods_supported: ["none"] };
    await truncateAll(testDb.db);
    const check = await checkAuthorizeRequest(authorizeQuery({ clientId: CLIENT_ID, redirectUri: REDIRECT }));
    expect(check.ok && check.request.client.authMethods).toEqual(["none"]);
  });

  it("a registered public client cannot authenticate with an assertion; a failed Basic login gets WWW-Authenticate", async () => {
    const registered = await register({ redirect_uris: [REDIRECT], client_name: "Other" });
    const jwt = await assertion({ iss: registered.client_id, sub: registered.client_id });
    expectInvalidClient(
      await tokenRequest({ grant_type: "refresh_token", refresh_token: "pwrt_x", client_id: registered.client_id, ...withAssertion(jwt) }),
      /not registered for private_key_jwt/,
    );

    const confidential = await register({ redirect_uris: [REDIRECT], token_endpoint_auth_method: "client_secret_basic" });
    const basic = Buffer.from(`${encodeURIComponent(confidential.client_id)}:wrong`).toString("base64");
    const failed = await tokenRequest({ grant_type: "refresh_token", refresh_token: "pwrt_x" }, { authorization: `Basic ${basic}` });
    expect(failed.status).toBe(401);
    expect(failed.headers.get("www-authenticate")).toMatch(/^Basic /);
  });

  it("the revocation endpoint accepts an assertion too; cleanup drops expired jti records", async () => {
    const tokens = await connected();
    const response = await appFetch(`${TEST_ORIGIN}/api/oauth/revoke`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        token: tokens.refresh_token,
        ...withAssertion(await assertion({ aud: `${TEST_ORIGIN}/api/oauth/revoke` })),
      }).toString(),
    });
    expect(response.status).toBe(200);
    expect(await verifyAccessToken(tokens.access_token)).toBeNull();

    const later = await runCleanup({ now: new Date(Date.now() + 2 * 60 * 60_000) });
    expect(later).toMatchObject({ oauthAssertionJtisDeleted: 2 });
    expect(await testDb.db.select().from(oauthAssertionJtis)).toHaveLength(0);
  });
});

describe("discovery", () => {
  it("advertises none and private_key_jwt with RS256/ES256/PS256, and CIMD support", async () => {
    const response = await appFetch(`${TEST_ORIGIN}/.well-known/oauth-authorization-server`);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.token_endpoint_auth_methods_supported).toEqual(expect.arrayContaining(["none", "private_key_jwt"]));
    expect(body.token_endpoint_auth_signing_alg_values_supported).toEqual(["RS256", "ES256", "PS256"]);
    expect(body.client_id_metadata_document_supported).toBe(true);
  });
});
