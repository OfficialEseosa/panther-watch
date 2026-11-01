import { MCP_CORS_HEADERS, mcpHandler } from "@/lib/mcp/handler";

/**
 * /api/mcp: PantherWatch's remote MCP server (Streamable HTTP, stateless). Every request needs
 * `Authorization: Bearer <access token>` from the OAuth flow at /api/oauth/*; without one it
 * answers 401 with a `WWW-Authenticate` challenge pointing at the protected resource metadata.
 * Tools: src/lib/mcp/tools.ts. GET and DELETE answer 405 (no sessions to stream or end).
 */
async function handle(request: Request): Promise<Response> {
  return mcpHandler()(request);
}

export { handle as GET, handle as POST, handle as DELETE };

export function OPTIONS() {
  return new Response(null, { status: 204, headers: MCP_CORS_HEADERS });
}
