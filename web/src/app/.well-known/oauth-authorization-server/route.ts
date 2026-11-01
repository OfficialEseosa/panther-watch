import { connection } from "next/server";
import { authorizationServerMetadata, corsPreflight, OAUTH_CORS_HEADERS } from "@/lib/oauth";

/** GET /.well-known/oauth-authorization-server: RFC 8414 metadata of the MCP connector's authorization server. */
export async function GET() {
  // APP_URL is read at request time (env is validated lazily, so builds work without it).
  await connection();
  return Response.json(authorizationServerMetadata(), {
    headers: { ...OAUTH_CORS_HEADERS, "Cache-Control": "public, max-age=3600" },
  });
}

export function OPTIONS() {
  return corsPreflight();
}
