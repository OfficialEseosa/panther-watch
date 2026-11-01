import "server-only";
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import { issuer, mcpResourceUrl, PROTECTED_RESOURCE_METADATA_PATH, verifyAccessToken } from "@/lib/oauth";
import { registerTools, SERVER_INSTRUCTIONS } from "./tools";

/** CORS for /api/mcp: bearer tokens only (no cookies), so any origin may call it. */
export const MCP_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Authorization, Content-Type, Accept, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "WWW-Authenticate, Mcp-Session-Id, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
} as const;

let handler: ((request: Request) => Promise<Response>) | undefined;

/**
 * The authenticated MCP request handler (Streamable HTTP, stateless; mcp-handler serves the
 * 2026-07-28 protocol and falls back to 2025-era clients). Built on first use, not at import,
 * because it reads APP_URL and env is validated lazily (builds run without secrets).
 *
 * withMcpAuth answers a missing, unknown, expired or revoked token with 401 and
 * `WWW-Authenticate: Bearer error="invalid_token", resource_metadata=".../.well-known/
 * oauth-protected-resource/api/mcp"`. No `scope` is put in that challenge, so clients request
 * every scope in the metadata's `scopes_supported`; the user narrows it on the consent page.
 */
export function mcpHandler(): (request: Request) => Promise<Response> {
  if (handler) return handler;
  const mcp = createMcpHandler(registerTools, {
    serverInfo: { name: "PantherWatch", version: "1.0.0" },
    instructions: SERVER_INSTRUCTIONS,
  });
  const resource = new URL(mcpResourceUrl());
  const authed = withMcpAuth(
    mcp,
    async (_request, bearerToken) => {
      const verified = await verifyAccessToken(bearerToken);
      if (!verified) return undefined;
      return {
        token: bearerToken!,
        clientId: verified.clientId,
        scopes: verified.scopes,
        expiresAt: verified.expiresAt,
        resource,
        extra: { userId: verified.userId },
      };
    },
    { required: true, resourceMetadataPath: PROTECTED_RESOURCE_METADATA_PATH, resourceUrl: issuer() },
  );
  handler = async (request: Request) => {
    const response = await authed(request);
    const headers = new Headers(response.headers);
    for (const [key, value] of Object.entries(MCP_CORS_HEADERS)) headers.set(key, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
  return handler;
}

/** Forgets the built handler (tests change APP_URL between files). */
export function resetMcpHandlerForTests(): void {
  handler = undefined;
}
