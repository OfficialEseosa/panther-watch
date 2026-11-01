import "server-only";
import { env } from "@/lib/env";
import { SCOPES } from "./scopes";

/** Authorization codes live 10 minutes. */
export const CODE_TTL_MS = 10 * 60_000;
/** Access tokens live 1 hour. */
export const ACCESS_TOKEN_TTL_S = 60 * 60;
/** Refresh tokens live 30 days (each refresh issues a new one). */
export const REFRESH_TOKEN_TTL_S = 30 * 24 * 60 * 60;

export const MCP_PATH = "/api/mcp";
export const PROTECTED_RESOURCE_METADATA_PATH = `/.well-known/oauth-protected-resource${MCP_PATH}`;

/** The authorization server's issuer: APP_URL's origin, e.g. https://www.pantherwatch.app. */
export function issuer(): string {
  return new URL(env.APP_URL).origin;
}

/** The MCP server's canonical URI (RFC 8707 resource), e.g. https://www.pantherwatch.app/api/mcp. */
export function mcpResourceUrl(): string {
  return `${issuer()}${MCP_PATH}`;
}

/** Where the MCP server's RFC 9728 metadata is served (path-inserted form). */
export function protectedResourceMetadataUrl(): string {
  return `${issuer()}${PROTECTED_RESOURCE_METADATA_PATH}`;
}

/**
 * True when a client's `resource` parameter names this MCP server. Scheme and host compare
 * case-insensitively and one trailing slash is ignored; anything else must match exactly.
 */
export function isOurResource(resource: string): boolean {
  let url: URL;
  try {
    url = new URL(resource);
  } catch {
    return false;
  }
  if (url.hash || url.search) return false;
  const path = url.pathname.replace(/\/$/, "");
  return url.origin === issuer() && path === MCP_PATH;
}

/** RFC 8414 authorization server metadata. */
export function authorizationServerMetadata() {
  const base = issuer();
  return {
    issuer: base,
    authorization_endpoint: `${base}/api/oauth/authorize`,
    token_endpoint: `${base}/api/oauth/token`,
    registration_endpoint: `${base}/api/oauth/register`,
    revocation_endpoint: `${base}/api/oauth/revoke`,
    scopes_supported: [...SCOPES],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    revocation_endpoint_auth_methods_supported: ["none", "client_secret_post", "client_secret_basic"],
    client_id_metadata_document_supported: true,
    authorization_response_iss_parameter_supported: true,
    service_documentation: `${base}/developers#mcp`,
  };
}

/** RFC 9728 protected resource metadata for the MCP endpoint. */
export function protectedResourceMetadata() {
  return {
    resource: mcpResourceUrl(),
    authorization_servers: [issuer()],
    scopes_supported: [...SCOPES],
    bearer_methods_supported: ["header"],
    resource_name: "PantherWatch",
    resource_documentation: `${issuer()}/developers#mcp`,
  };
}

/** CORS for the public OAuth endpoints: no cookies are involved, so any origin may call them. */
export const OAUTH_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, MCP-Protocol-Version",
  "Access-Control-Max-Age": "86400",
} as const;

/** 204 answer to a CORS preflight. */
export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

/** JSON with CORS and `no-store` (token endpoint responses must not be cached, RFC 6749 §5.1). */
export function oauthJson(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  for (const [key, value] of Object.entries(OAUTH_CORS_HEADERS)) headers.set(key, value);
  headers.set("Cache-Control", "no-store");
  headers.set("Pragma", "no-cache");
  return Response.json(data, { ...init, headers });
}

/** An RFC 6749 §5.2 error body. */
export function oauthError(status: number, error: string, description: string, init: ResponseInit = {}): Response {
  return oauthJson({ error, error_description: description }, { ...init, status });
}
