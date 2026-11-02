import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";
import { eq } from "drizzle-orm";
import type { JSONWebKeySet } from "jose";
import { Agent, fetch as undiciFetch } from "undici";
import { z } from "zod";
import { getDb } from "@/db";
import { oauthClients, type OAuthClient } from "@/db/schema";
import { constantTimeEqual } from "@/lib/http";
import { hashSecret, randomSecret } from "./crypto";

/**
 * OAuth clients: Dynamic Client Registration (RFC 7591, deprecated by MCP 2026-07-28 but still
 * what many clients use) and Client ID Metadata Documents (the MCP default: `client_id` is an
 * HTTPS URL serving the client's metadata). Both end up as an `oauth_clients` row.
 */

export class ClientError extends Error {
  constructor(
    /** RFC 7591 §3.2.2 / RFC 6749 error code. */
    readonly code: "invalid_redirect_uri" | "invalid_client_metadata" | "invalid_client",
    message: string,
  ) {
    super(message);
    this.name = "ClientError";
  }
}

/**
 * How a client authenticates at the token (and revocation) endpoint: `none` (public, PKCE
 * only), `client_secret` (a registered secret, post or basic) or `private_key_jwt` (an RFC 7523
 * assertion signed with a key from the client's JWKS).
 */
export type TokenAuthMethod = "none" | "client_secret" | "private_key_jwt";

export interface Client {
  id: string;
  name: string;
  redirectUris: string[];
  /** True when the client must authenticate with a secret at the token endpoint. */
  confidential: boolean;
  /** "metadata": a Client ID Metadata Document URL; "registered": dynamically registered. */
  kind: "metadata" | "registered";
  /** The token endpoint auth methods this client may use. */
  authMethods: TokenAuthMethod[];
}

/** Where a private_key_jwt client's public keys come from (its document's jwks_uri / jwks). */
export interface ClientKeys {
  jwksUri: string | null;
  jwks: JSONWebKeySet | null;
  /** The only alg its assertions may use, when its document declares one. */
  signingAlg: string | null;
}

/** A client row as the token endpoint needs it: the client, its secret hash and its keys. */
export type ClientRecord = Client & ClientKeys & { secretHash: string | null };

function authMethodsOf(row: OAuthClient): TokenAuthMethod[] {
  if (row.clientSecretHash !== null) return ["client_secret"];
  if (row.tokenEndpointAuthMethods === null) return ["none"];
  return row.tokenEndpointAuthMethods.filter(
    (method): method is TokenAuthMethod => method === "none" || method === "private_key_jwt",
  );
}

const toClient = (row: OAuthClient): Client => ({
  id: row.id,
  name: row.name,
  redirectUris: row.redirectUris,
  confidential: row.clientSecretHash !== null,
  kind: row.metadataExpiresAt === null ? "registered" : "metadata",
  authMethods: authMethodsOf(row),
});

// ---------------------------------------------------------------------------------------------
// Redirect URIs
// ---------------------------------------------------------------------------------------------

const MAX_URI_LENGTH = 2000;
const MAX_REDIRECT_URIS = 10;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Private-use URI schemes (RFC 8252 §7.1) of known MCP clients, accepted as redirect URIs even
 * though they are not reverse-domain names (Cursor registers cursor://anysphere.cursor-mcp/...).
 */
const KNOWN_APP_SCHEMES = new Set(["cursor", "windsurf", "vscode", "vscode-insiders", "cline", "goose", "claude"]);
/** Schemes that run code, read local files or open other apps: never a redirect URI. */
const UNSAFE_SCHEMES = new Set(["javascript", "data", "file", "vbscript", "about", "blob", "filesystem", "view-source"]);
/** A reverse-domain scheme (RFC 8252 §7.1), e.g. com.example.app: dot-separated, non-empty labels. */
const REVERSE_DOMAIN_SCHEME = /^[a-z][a-z0-9+-]*(\.[a-z0-9+-]+)+$/;

/** The scheme of an absolute URI (lowercased), or null when there is none. */
function schemeOf(uri: string): string | null {
  const match = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(uri);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Whether `scheme` is a private-use scheme a native app may receive its redirect on: a known
 * editor / agent scheme, or any reverse-domain scheme. Never javascript:, data:, file:,
 * vbscript:, about:, blob: or an ms-* (Windows app protocol) scheme.
 */
function isPrivateUseScheme(scheme: string): boolean {
  if (UNSAFE_SCHEMES.has(scheme) || scheme.startsWith("ms-")) return false;
  return KNOWN_APP_SCHEMES.has(scheme) || REVERSE_DOMAIN_SCHEME.test(scheme);
}

/**
 * Why `uri` cannot be a redirect URI, or null when it can. MCP (and OAuth 2.1): HTTPS, http on
 * a loopback host for native apps, or a native app's private-use scheme (RFC 8252 §7.1: a
 * known editor / agent scheme such as cursor:, or a reverse-domain scheme such as
 * com.example.app:). No fragment, no credentials.
 */
export function redirectUriProblem(uri: string): string | null {
  if (uri.length > MAX_URI_LENGTH) return "redirect URI is too long";
  let url: URL;
  try {
    url = new URL(uri);
  } catch {
    return `"${uri.slice(0, 100)}" is not an absolute URL`;
  }
  if (url.hash || uri.includes("#")) return "redirect URIs must not contain a fragment";
  if (url.username || url.password) return "redirect URIs must not contain credentials";
  if (url.protocol === "https:") return null;
  if (url.protocol === "http:" && LOOPBACK_HOSTS.has(url.hostname)) return null;
  const scheme = url.protocol.slice(0, -1);
  if (isPrivateUseScheme(scheme)) {
    if (!url.host && (url.pathname === "" || url.pathname === "/")) return "redirect URIs need a path or host after the scheme";
    return null;
  }
  return "redirect URIs must use https, http on localhost, or an app's own scheme (like cursor: or com.example.app:)";
}

/** `uri` with its scheme lowercased (schemes are case-insensitive, RFC 3986 §3.1); the rest as is. */
function normalizeScheme(uri: string): string {
  const scheme = schemeOf(uri);
  return scheme ? scheme + uri.slice(scheme.length) : uri;
}

/**
 * Whether `candidate` is one of `registered`: exact string match (the scheme compared
 * case-insensitively), except that a loopback http URI matches on any port (RFC 8252 §7.3:
 * native apps pick a free port at runtime).
 */
export function redirectUriAllowed(registered: readonly string[], candidate: string): boolean {
  const normalized = normalizeScheme(candidate);
  if (registered.some((entry) => normalizeScheme(entry) === normalized)) return true;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return false;
  }
  if (url.protocol !== "http:" || !LOOPBACK_HOSTS.has(url.hostname)) return false;
  return registered.some((entry) => {
    try {
      const allowed = new URL(entry);
      return (
        allowed.protocol === "http:" &&
        allowed.hostname === url.hostname &&
        allowed.pathname === url.pathname &&
        allowed.search === url.search
      );
    } catch {
      return false;
    }
  });
}

/**
 * True when every redirect URI returns to an app on the user's own device: a loopback host or
 * a private-use scheme. The consent page warns about those, since any app on the computer
 * could be listening on that port or have claimed that scheme.
 */
export function localRedirectOnly(uris: readonly string[]): boolean {
  return uris.every((uri) => {
    try {
      const url = new URL(uri);
      if (LOOPBACK_HOSTS.has(url.hostname)) return true;
      return url.protocol !== "https:" && url.protocol !== "http:" && isPrivateUseScheme(url.protocol.slice(0, -1));
    } catch {
      return false;
    }
  });
}

/** A display name: control characters removed, whitespace collapsed, at most 80 characters. */
export function cleanClientName(name: unknown, fallback: string): string {
  const text = typeof name === "string" ? name.replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩]/g, " ") : "";
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 80).trim();
  return clean || fallback;
}

function checkRedirectUris(uris: readonly string[]): void {
  if (uris.length === 0) throw new ClientError("invalid_redirect_uri", "at least one redirect URI is required");
  if (uris.length > MAX_REDIRECT_URIS) {
    throw new ClientError("invalid_redirect_uri", `at most ${MAX_REDIRECT_URIS} redirect URIs are allowed`);
  }
  for (const uri of uris) {
    const problem = redirectUriProblem(uri);
    if (problem) throw new ClientError("invalid_redirect_uri", problem);
  }
}

// ---------------------------------------------------------------------------------------------
// Dynamic Client Registration (RFC 7591)
// ---------------------------------------------------------------------------------------------

const AUTH_METHODS = ["none", "client_secret_post", "client_secret_basic"] as const;

const registrationSchema = z.object({
  redirect_uris: z.array(z.string()),
  client_name: z.unknown().optional(),
  token_endpoint_auth_method: z.enum(AUTH_METHODS).optional(),
  grant_types: z.array(z.string()).optional(),
  response_types: z.array(z.string()).optional(),
});

export interface RegisteredClient {
  client_id: string;
  client_id_issued_at: number;
  client_name: string;
  redirect_uris: string[];
  grant_types: string[];
  response_types: string[];
  token_endpoint_auth_method: (typeof AUTH_METHODS)[number];
  client_secret?: string;
  client_secret_expires_at?: number;
}

/**
 * Registers a client. Public (PKCE-only) by default; a `client_secret_post` /
 * `client_secret_basic` request gets a secret, returned once and stored hashed. Other client
 * metadata (logo, uri, contacts, ...) is accepted and ignored.
 */
export async function registerClient(body: unknown, { now = new Date() } = {}): Promise<RegisteredClient> {
  const parsed = registrationSchema.safeParse(body);
  if (!parsed.success) {
    const redirectIssue = parsed.error.issues.some((issue) => issue.path[0] === "redirect_uris");
    throw new ClientError(
      redirectIssue ? "invalid_redirect_uri" : "invalid_client_metadata",
      redirectIssue
        ? "redirect_uris must be an array of URLs"
        : "token_endpoint_auth_method must be none, client_secret_post or client_secret_basic",
    );
  }
  const input = parsed.data;
  const redirectUris = [...new Set(input.redirect_uris)];
  checkRedirectUris(redirectUris);
  const grantTypes = input.grant_types ?? ["authorization_code", "refresh_token"];
  if (!grantTypes.includes("authorization_code") || grantTypes.some((g) => g !== "authorization_code" && g !== "refresh_token")) {
    throw new ClientError("invalid_client_metadata", "grant_types must be authorization_code and optionally refresh_token");
  }
  const responseTypes = input.response_types ?? ["code"];
  if (responseTypes.length !== 1 || responseTypes[0] !== "code") {
    throw new ClientError("invalid_client_metadata", 'response_types must be ["code"]');
  }

  const method = input.token_endpoint_auth_method ?? "none";
  const secret = method === "none" ? undefined : randomSecret("pwcs_");
  const clientId = randomSecret("pwc_");
  const name = cleanClientName(input.client_name, "Unnamed app");
  await getDb()
    .insert(oauthClients)
    .values({
      id: clientId,
      name,
      redirectUris,
      clientSecretHash: secret ? hashSecret(secret) : null,
      createdAt: now,
    });
  return {
    client_id: clientId,
    client_id_issued_at: Math.floor(now.getTime() / 1000),
    client_name: name,
    redirect_uris: redirectUris,
    grant_types: grantTypes,
    response_types: responseTypes,
    token_endpoint_auth_method: method,
    ...(secret ? { client_secret: secret, client_secret_expires_at: 0 } : {}),
  };
}

// ---------------------------------------------------------------------------------------------
// Lookup (registered clients and Client ID Metadata Documents)
// ---------------------------------------------------------------------------------------------

/**
 * A URL the guarded fetcher may fetch (a metadata document or a JWKS): https, a real public
 * hostname (not an IP literal, not localhost / .local / .internal), no credentials or fragment.
 */
export function isFetchableHttpsUrl(value: string): boolean {
  if (!value.startsWith("https://") || value.length > MAX_URI_LENGTH) return false;
  try {
    const url = new URL(value);
    const host = url.hostname.replace(/^\[|\]$/g, "");
    return (
      url.protocol === "https:" &&
      !url.hash &&
      !url.username &&
      !url.password &&
      isIP(host) === 0 &&
      host.includes(".") &&
      host !== "localhost" &&
      !host.endsWith(".localhost") &&
      !host.endsWith(".local") &&
      !host.endsWith(".internal")
    );
  } catch {
    return false;
  }
}

/** A Client ID Metadata Document URL: a fetchable https URL with a path. */
export function isMetadataClientId(clientId: string): boolean {
  return isFetchableHttpsUrl(clientId) && new URL(clientId).pathname !== "/";
}

/** The client row only (token endpoint, revocation): never fetches anything. */
export async function findClient(clientId: string): Promise<ClientRecord | null> {
  if (!clientId || clientId.length > MAX_URI_LENGTH) return null;
  const [row] = await getDb().select().from(oauthClients).where(eq(oauthClients.id, clientId)).limit(1);
  return row
    ? {
        ...toClient(row),
        secretHash: row.clientSecretHash,
        jwksUri: row.jwksUri,
        jwks: row.jwks as JSONWebKeySet | null,
        signingAlg: row.tokenEndpointAuthSigningAlg,
      }
    : null;
}

/**
 * The client for an authorization request. A metadata-document client is (re)fetched when its
 * cached copy has expired; a registered client is read from the table. Null when unknown.
 * Throws ClientError("invalid_client") when a metadata document cannot be used.
 */
export async function resolveClient(clientId: string, { now = new Date() } = {}): Promise<Client | null> {
  if (isMetadataClientId(clientId)) {
    const [row] = await getDb().select().from(oauthClients).where(eq(oauthClients.id, clientId)).limit(1);
    if (row?.metadataExpiresAt && row.metadataExpiresAt > now) return toClient(row);
    return toClient(await refreshMetadataClient(clientId, now));
  }
  const found = await findClient(clientId);
  return found && found.kind === "registered" ? found : null;
}

/** Verifies a client secret (confidential clients only). */
export function clientSecretMatches(secretHash: string, secret: string | null): boolean {
  return secret !== null && constantTimeEqual(hashSecret(secret), secretHash);
}

// ---------------------------------------------------------------------------------------------
// Client ID Metadata Documents
// ---------------------------------------------------------------------------------------------

export type MetadataFetch = (url: string) => Promise<{ status: number; cacheControl: string | null; body: string }>;

const METADATA_TIMEOUT_MS = 5_000;
const METADATA_MAX_BYTES = 64 * 1024;
const DEFAULT_TTL_S = 60 * 60;
const MIN_TTL_S = 5 * 60;
const MAX_TTL_S = 24 * 60 * 60;

/**
 * Addresses a metadata fetch must never reach (SSRF): private, loopback, link-local, CGNAT,
 * multicast, reserved. One list per family: a BlockList checks an IPv4 address against IPv6
 * rules too (as ::ffff:a.b.c.d), so the ::ffff:0:0/96 rule in a shared list blocked every IPv4
 * address, which refused every real client metadata host.
 */
const blockedV4 = new BlockList();
for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedV4.addSubnet(network, prefix, "ipv4");
}
const blockedV6 = new BlockList();
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blockedV6.addSubnet(network, prefix, "ipv6");
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blockedV4.check(address, "ipv4");
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return blockedV4.check(mapped[1], "ipv4");
    return blockedV6.check(address, "ipv6");
  }
  return true;
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;
type Resolver = (
  hostname: string,
  options: { family: number; all: true },
  callback: (error: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void,
) => void;

/**
 * IPv4 addresses first, then the rest, each family keeping its resolver order. Vercel Functions
 * have no outbound IPv6, so a dual-stack host that resolves AAAA-first must not be tried over
 * IPv6 first; IPv6 addresses stay as later fallbacks for IPv6-only hosts.
 */
export function orderAddresses(addresses: readonly LookupAddress[]): LookupAddress[] {
  return [...addresses.filter((entry) => entry.family === 4), ...addresses.filter((entry) => entry.family !== 4)];
}

/**
 * DNS lookup for the metadata fetch: refuses any hostname that resolves to a blocked address
 * (any one blocked address refuses the whole host), and hands the connector IPv4 first.
 */
export function createSafeLookup(resolve: Resolver = dnsLookup as unknown as Resolver) {
  return (hostname: string, options: { all?: boolean; family?: number }, callback: LookupCallback): void => {
    resolve(hostname, { family: options.family ?? 0, all: true }, (error, addresses) => {
      if (error) return callback(error, []);
      if (addresses.length === 0 || addresses.some((entry) => isBlockedAddress(entry.address))) {
        const refused = Object.assign(new Error(`refusing to fetch client metadata from ${hostname}`), { code: "EREFUSED" });
        return callback(refused, []);
      }
      const ordered = orderAddresses(addresses);
      if (options.all) return callback(null, ordered);
      return callback(null, ordered[0].address, ordered[0].family);
    });
  };
}

const safeLookup = createSafeLookup();

let metadataAgent: Agent | undefined;

const defaultMetadataFetch: MetadataFetch = async (url) => {
  metadataAgent ??= new Agent({
    // autoSelectFamily: Happy Eyeballs (RFC 8305) over the addresses safeLookup returns, so an
    // unreachable family falls through to the next address instead of failing the fetch.
    connect: { lookup: safeLookup as never, timeout: METADATA_TIMEOUT_MS, autoSelectFamily: true },
    headersTimeout: METADATA_TIMEOUT_MS,
    bodyTimeout: METADATA_TIMEOUT_MS,
  });
  const response = await undiciFetch(url, {
    dispatcher: metadataAgent,
    redirect: "manual",
    headers: { Accept: "application/json", "User-Agent": "PantherWatch-OAuth/1.0" },
    signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
  });
  const reader = response.body?.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > METADATA_MAX_BYTES) {
        await reader.cancel();
        throw new Error("client metadata document is too large");
      }
      chunks.push(value);
    }
  }
  return {
    status: response.status,
    cacheControl: response.headers.get("cache-control"),
    body: Buffer.concat(chunks).toString("utf8"),
  };
};

let metadataFetch: MetadataFetch = defaultMetadataFetch;

/**
 * Replaces the metadata fetcher (tests serve documents and JWKS without https) and empties the
 * JWKS cache. Throws outside tests.
 */
export function setClientMetadataFetchForTests(fetcher: MetadataFetch | undefined): void {
  if (process.env.NODE_ENV !== "test") throw new Error("setClientMetadataFetchForTests() is only allowed when NODE_ENV=test");
  metadataFetch = fetcher ?? defaultMetadataFetch;
  jwksCache.clear();
}

function ttlSeconds(cacheControl: string | null): number {
  const maxAge = /max-age=(\d+)/i.exec(cacheControl ?? "");
  const value = maxAge ? Number(maxAge[1]) : DEFAULT_TTL_S;
  return Math.min(MAX_TTL_S, Math.max(MIN_TTL_S, value));
}

const metadataDocumentSchema = z.object({
  client_id: z.string(),
  client_name: z.unknown().optional(),
  redirect_uris: z.array(z.string()),
  token_endpoint_auth_method: z.string().optional(),
  // Optional extras: a malformed one is ignored rather than refusing the whole document.
  token_endpoint_auth_methods_supported: z.array(z.string()).optional().catch(undefined),
  jwks_uri: z.string().optional().catch(undefined),
  jwks: z.unknown().optional(),
  token_endpoint_auth_signing_alg: z.string().optional().catch(undefined),
});

type MetadataDocument = z.infer<typeof metadataDocumentSchema>;

/** JWS algs a private_key_jwt client may declare (asymmetric only: never `none` or HS*). */
const DECLARABLE_SIGNING_ALGS = new Set([
  "RS256",
  "RS384",
  "RS512",
  "PS256",
  "PS384",
  "PS512",
  "ES256",
  "ES384",
  "ES512",
  "EdDSA",
  "Ed25519",
]);
/** Private or symmetric key members: a JWKS carrying any of them is refused. */
const PRIVATE_JWK_MEMBERS = ["d", "p", "q", "dp", "dq", "qi", "k", "oth"];
const MAX_JWKS_KEYS = 20;

/** Why `value` is not a usable public JWKS, or null when it is. */
export function jwksProblem(value: unknown): string | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "is not a JSON object";
  const keys = (value as { keys?: unknown }).keys;
  if (!Array.isArray(keys) || keys.length === 0) return "has no keys";
  if (keys.length > MAX_JWKS_KEYS) return `has more than ${MAX_JWKS_KEYS} keys`;
  for (const key of keys) {
    if (!key || typeof key !== "object" || Array.isArray(key) || typeof (key as { kty?: unknown }).kty !== "string") {
      return "has a key without kty";
    }
    if (PRIVATE_JWK_MEMBERS.some((member) => member in key)) return "contains private or symmetric key material";
  }
  return null;
}

type DocumentAuth = Pick<OAuthClient, "tokenEndpointAuthMethods" | "jwksUri" | "jwks" | "tokenEndpointAuthSigningAlg">;

/**
 * The token endpoint auth a metadata document allows (OIDC Core 9 / RFC 7523):
 * - `none` when the document's method is `none` (or absent), or its
 *   `token_endpoint_auth_methods_supported` lists `none`;
 * - `private_key_jwt` when the document's method is (or it supports) `private_key_jwt` and it
 *   names a usable `jwks_uri` (https, same SSRF rules as the document fetch) or inline `jwks`.
 * A document whose own method is private_key_jwt with unusable keys is refused, and so is one
 * that allows neither method (client secrets cannot come from a metadata document).
 */
function documentAuth(doc: MetadataDocument): DocumentAuth {
  const declared = doc.token_endpoint_auth_method ?? "none";
  const supported = new Set([declared, ...(doc.token_endpoint_auth_methods_supported ?? [])]);
  const methods: TokenAuthMethod[] = supported.has("none") ? ["none"] : [];
  let keys: Omit<DocumentAuth, "tokenEndpointAuthMethods"> = { jwksUri: null, jwks: null, tokenEndpointAuthSigningAlg: null };

  if (supported.has("private_key_jwt")) {
    let problem: string | null = null;
    const alg = doc.token_endpoint_auth_signing_alg ?? null;
    if (alg !== null && !DECLARABLE_SIGNING_ALGS.has(alg)) {
      problem = `token_endpoint_auth_signing_alg ${alg.slice(0, 20)} is not supported`;
    } else if (doc.jwks_uri !== undefined) {
      if (isFetchableHttpsUrl(doc.jwks_uri)) keys = { jwksUri: doc.jwks_uri, jwks: null, tokenEndpointAuthSigningAlg: alg };
      else problem = "jwks_uri must be a public https URL";
    } else if (doc.jwks !== undefined) {
      const jwksIssue = jwksProblem(doc.jwks);
      if (jwksIssue) problem = `jwks ${jwksIssue}`;
      else keys = { jwksUri: null, jwks: doc.jwks as DocumentAuth["jwks"], tokenEndpointAuthSigningAlg: alg };
    } else {
      problem = "private_key_jwt needs a jwks_uri or jwks";
    }
    if (problem === null) methods.push("private_key_jwt");
    else if (declared === "private_key_jwt") {
      throw new ClientError("invalid_client", `The app's client metadata document is unusable: ${problem}.`);
    }
  }
  if (methods.length === 0) {
    throw new ClientError(
      "invalid_client",
      `The app authenticates with ${declared.slice(0, 40)}, which PantherWatch doesn't support (it supports none and private_key_jwt).`,
    );
  }
  return { tokenEndpointAuthMethods: methods, ...keys };
}

/**
 * One log line for a failed fetch: undici reports every network failure as "fetch failed" and
 * puts the reason (ENETUNREACH, ECONNREFUSED, EREFUSED from safeLookup, a timeout) in `cause`,
 * possibly an AggregateError when several addresses were tried.
 */
export function describeFetchError(error: unknown): string {
  const describe = (value: unknown): string => {
    if (!(value instanceof Error)) return String(value);
    const code = (value as NodeJS.ErrnoException).code;
    const own = code ? `${code}: ${value.message}` : `${value.name}: ${value.message}`;
    const inner = value instanceof AggregateError ? ` [${value.errors.map(describe).join("; ")}]` : "";
    return own + inner;
  };
  let text = describe(error);
  if (error instanceof Error && error.cause !== undefined) text += ` (cause: ${describe(error.cause)})`;
  return text.length > 500 ? `${text.slice(0, 500)}...` : text;
}

async function refreshMetadataClient(clientId: string, now: Date): Promise<OAuthClient> {
  let fetched: Awaited<ReturnType<MetadataFetch>>;
  try {
    fetched = await metadataFetch(clientId);
  } catch (error) {
    console.warn("oauth: client metadata fetch failed", describeFetchError(error));
    throw new ClientError("invalid_client", "The app's client metadata document could not be fetched.");
  }
  if (fetched.status !== 200) {
    throw new ClientError("invalid_client", `The app's client metadata document answered HTTP ${fetched.status}.`);
  }
  let json: unknown;
  try {
    json = JSON.parse(fetched.body);
  } catch {
    throw new ClientError("invalid_client", "The app's client metadata document is not valid JSON.");
  }
  const parsed = metadataDocumentSchema.safeParse(json);
  if (!parsed.success) {
    throw new ClientError("invalid_client", "The app's client metadata document is missing client_id or redirect_uris.");
  }
  const doc = parsed.data;
  if (doc.client_id !== clientId) {
    throw new ClientError("invalid_client", "The app's client metadata document names a different client_id.");
  }
  const auth = documentAuth(doc);
  const redirectUris = [...new Set(doc.redirect_uris)];
  try {
    checkRedirectUris(redirectUris);
  } catch (error) {
    throw new ClientError("invalid_client", error instanceof Error ? error.message : "invalid redirect URIs");
  }
  const values = {
    name: cleanClientName(doc.client_name, new URL(clientId).hostname),
    redirectUris,
    clientSecretHash: null,
    metadataExpiresAt: new Date(now.getTime() + ttlSeconds(fetched.cacheControl) * 1000),
    ...auth,
  };
  const [row] = await getDb()
    .insert(oauthClients)
    .values({ id: clientId, ...values })
    .onConflictDoUpdate({ target: oauthClients.id, set: values })
    .returning();
  return row;
}

// ---------------------------------------------------------------------------------------------
// JWKS (private_key_jwt clients)
// ---------------------------------------------------------------------------------------------

const JWKS_DEFAULT_TTL_S = 10 * 60;
const JWKS_MIN_TTL_S = 60;
const JWKS_MAX_TTL_S = 60 * 60;
const JWKS_CACHE_MAX_ENTRIES = 200;

/**
 * Fetched JWKS per (client, jwks_uri), in memory (per serverless instance). An entry lives for
 * the response's max-age clamped to 1 minute .. 1 hour (10 minutes without one); an assertion
 * whose `kid` is not in the cached set triggers one refetch (key rotation).
 */
const jwksCache = new Map<string, { jwks: JSONWebKeySet; expiresAt: number }>();

/**
 * The client's public keys: its inline `jwks`, or its `jwks_uri` fetched through the same
 * guarded fetcher as metadata documents (https, no private addresses, 64 KB, 5 s, no
 * redirects) and cached. `fresh` is true when refetching cannot give newer keys (just fetched,
 * or inline). Throws an Error when the keys cannot be fetched or are malformed.
 */
export async function clientJwks(
  client: Pick<ClientRecord, "id" | "jwksUri" | "jwks">,
  { refresh = false, now = Date.now() }: { refresh?: boolean; now?: number } = {},
): Promise<{ jwks: JSONWebKeySet; fresh: boolean }> {
  if (client.jwks) return { jwks: client.jwks, fresh: true };
  if (!client.jwksUri) throw new Error("the client has no jwks_uri");
  const key = `${client.id} ${client.jwksUri}`;
  const cached = jwksCache.get(key);
  if (cached && !refresh && cached.expiresAt > now) return { jwks: cached.jwks, fresh: false };

  let fetched: Awaited<ReturnType<MetadataFetch>>;
  try {
    fetched = await metadataFetch(client.jwksUri);
  } catch (error) {
    console.warn("oauth: client JWKS fetch failed", describeFetchError(error));
    throw new Error("the client's JWKS could not be fetched");
  }
  if (fetched.status !== 200) throw new Error(`the client's JWKS answered HTTP ${fetched.status}`);
  let json: unknown;
  try {
    json = JSON.parse(fetched.body);
  } catch {
    throw new Error("the client's JWKS is not valid JSON");
  }
  const problem = jwksProblem(json);
  if (problem) throw new Error(`the client's JWKS ${problem}`);
  const jwks = json as JSONWebKeySet;
  const maxAge = /max-age=(\d+)/i.exec(fetched.cacheControl ?? "");
  const ttl = Math.min(JWKS_MAX_TTL_S, Math.max(JWKS_MIN_TTL_S, maxAge ? Number(maxAge[1]) : JWKS_DEFAULT_TTL_S));
  jwksCache.delete(key);
  jwksCache.set(key, { jwks, expiresAt: now + ttl * 1000 });
  if (jwksCache.size > JWKS_CACHE_MAX_ENTRIES) {
    const oldest = jwksCache.keys().next().value;
    if (oldest !== undefined) jwksCache.delete(oldest);
  }
  return { jwks, fresh: true };
}
