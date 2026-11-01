import { corsPreflight, oauthError, oauthJson, registerClient } from "@/lib/oauth";
import { handleOAuthErrors, readJsonObject } from "@/lib/oauth/http";
import { clientIp, registrationLimiter } from "@/lib/oauth/rate-limit";

/**
 * POST /api/oauth/register: RFC 7591 Dynamic Client Registration (no initial access token).
 * Body `{ redirect_uris, client_name?, token_endpoint_auth_method? }` -> 201 with the client
 * (`client_secret` only for client_secret_post/basic). Redirect URIs must be https or
 * http://localhost. 400 `invalid_redirect_uri` / `invalid_client_metadata`; 429 when an IP
 * registers too often.
 */
export async function POST(request: Request) {
  return handleOAuthErrors("POST /api/oauth/register", async () => {
    const wait = registrationLimiter.take(clientIp(request));
    if (wait > 0) {
      return oauthError(429, "too_many_requests", "Too many registrations; try again later.", {
        headers: { "Retry-After": String(wait) },
      });
    }
    const client = await registerClient(await readJsonObject(request));
    return oauthJson(client, { status: 201 });
  });
}

export function OPTIONS() {
  return corsPreflight();
}
