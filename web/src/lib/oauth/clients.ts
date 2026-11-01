import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { BlockList, isIP } from "node:net";
import { eq } from "drizzle-orm";
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

export interface Client {
  id: string;
  name: string;
  redirectUris: string[];
  /** True when the client must authenticate with a secret at the token endpoint. */
  confidential: boolean;
  /** "metadata": a Client ID Metadata Document URL; "registered": dynamically registered. */
  kind: "metadata" | "registered";
}

const toClient = (row: OAuthClient): Client => ({
  id: row.id,
  name: row.name,
  redirectUris: row.redirectUris,
  confidential: row.clientSecretHash !== null,
  kind: row.metadataExpiresAt === null ? "registered" : "metadata",
});

// ---------------------------------------------------------------------------------------------
// Redirect URIs
// ---------------------------------------------------------------------------------------------

const MAX_URI_LENGTH = 2000;
const MAX_REDIRECT_URIS = 10;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

/**
 * Why `uri` cannot be a redirect URI, or null when it can. MCP (and OAuth 2.1): HTTPS, or
 * http on a loopback host for native apps. No fragment, no credentials.
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
  return "redirect URIs must use https, or http on localhost";
}

/**
 * Whether `candidate` is one of `registered`: exact string match, except that a loopback
 * http URI matches on any port (RFC 8252 §7.3: native apps pick a free port at runtime).
 */
export function redirectUriAllowed(registered: readonly string[], candidate: string): boolean {
  if (registered.includes(candidate)) return true;
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

/** True when every redirect URI is a loopback one (the consent page warns: anyone can claim those). */
export function loopbackOnly(uris: readonly string[]): boolean {
  return uris.every((uri) => {
    try {
      return LOOPBACK_HOSTS.has(new URL(uri).hostname);
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

/** A Client ID Metadata Document URL: https, a real hostname (not an IP literal), a path. */
export function isMetadataClientId(clientId: string): boolean {
  if (!clientId.startsWith("https://") || clientId.length > MAX_URI_LENGTH) return false;
  try {
    const url = new URL(clientId);
    const host = url.hostname.replace(/^\[|\]$/g, "");
    return (
      url.protocol === "https:" &&
      url.pathname !== "/" &&
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

/** The client row only (token endpoint, revocation): never fetches anything. */
export async function findClient(clientId: string): Promise<(Client & { secretHash: string | null }) | null> {
  if (!clientId || clientId.length > MAX_URI_LENGTH) return null;
  const [row] = await getDb().select().from(oauthClients).where(eq(oauthClients.id, clientId)).limit(1);
  return row ? { ...toClient(row), secretHash: row.clientSecretHash } : null;
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

/** Addresses a metadata fetch must never reach (SSRF): private, loopback, link-local, CGNAT, multicast, reserved. */
const blocked = new BlockList();
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
  blocked.addSubnet(network, prefix, "ipv4");
}
for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["::ffff:0:0", 96],
  ["64:ff9b::", 96],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
] as const) {
  blocked.addSubnet(network, prefix, "ipv6");
}

export function isBlockedAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return blocked.check(address, "ipv4");
  if (family === 6) {
    const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(address);
    if (mapped) return blocked.check(mapped[1], "ipv4");
    return blocked.check(address, "ipv6");
  }
  return true;
}

type LookupCallback = (error: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void;

/** DNS lookup for the metadata fetch: refuses any hostname that resolves to a blocked address. */
function safeLookup(hostname: string, options: { all?: boolean; family?: number }, callback: LookupCallback): void {
  dnsLookup(hostname, { family: options.family ?? 0, all: true }, (error, addresses) => {
    if (error) return callback(error, []);
    if (addresses.length === 0 || addresses.some((entry) => isBlockedAddress(entry.address))) {
      const refused = Object.assign(new Error(`refusing to fetch client metadata from ${hostname}`), { code: "EREFUSED" });
      return callback(refused, []);
    }
    if (options.all) return callback(null, addresses);
    return callback(null, addresses[0].address, addresses[0].family);
  });
}

let metadataAgent: Agent | undefined;

const defaultMetadataFetch: MetadataFetch = async (url) => {
  metadataAgent ??= new Agent({
    connect: { lookup: safeLookup as never, timeout: METADATA_TIMEOUT_MS },
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

/** Replaces the metadata fetcher (tests serve documents without https). Throws outside tests. */
export function setClientMetadataFetchForTests(fetcher: MetadataFetch | undefined): void {
  if (process.env.NODE_ENV !== "test") throw new Error("setClientMetadataFetchForTests() is only allowed when NODE_ENV=test");
  metadataFetch = fetcher ?? defaultMetadataFetch;
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
});

async function refreshMetadataClient(clientId: string, now: Date): Promise<OAuthClient> {
  let fetched: Awaited<ReturnType<MetadataFetch>>;
  try {
    fetched = await metadataFetch(clientId);
  } catch (error) {
    console.warn("oauth: client metadata fetch failed", error instanceof Error ? error.message : error);
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
  if (doc.token_endpoint_auth_method !== undefined && doc.token_endpoint_auth_method !== "none") {
    throw new ClientError("invalid_client", "Only public clients (token_endpoint_auth_method none) are supported.");
  }
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
  };
  const [row] = await getDb()
    .insert(oauthClients)
    .values({ id: clientId, ...values })
    .onConflictDoUpdate({ target: oauthClients.id, set: values })
    .returning();
  return row;
}
