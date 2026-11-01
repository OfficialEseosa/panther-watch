import { connection } from "next/server";
import { corsPreflight, OAUTH_CORS_HEADERS, protectedResourceMetadata } from "@/lib/oauth";

/**
 * GET /.well-known/oauth-protected-resource/api/mcp: RFC 9728 metadata for /api/mcp at the
 * path-inserted location (the one clients try first and the 401 challenge names). Same document
 * as the root location.
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
