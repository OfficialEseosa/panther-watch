import { connection } from "next/server";
import { corsPreflight, OAUTH_CORS_HEADERS, protectedResourceMetadata } from "@/lib/oauth";

/**
 * GET /.well-known/oauth-protected-resource: RFC 9728 metadata for the MCP endpoint, at the
 * root location. The path-inserted copy (`/.well-known/oauth-protected-resource/api/mcp`, which
 * clients try first and which the 401 challenge names) serves the same document.
 */
export async function GET() {
  await connection();
  return Response.json(protectedResourceMetadata(), {
    headers: { ...OAUTH_CORS_HEADERS, "Cache-Control": "public, max-age=3600" },
  });
}

export function OPTIONS() {
  return corsPreflight();
}
