import {
  authenticateClient,
  corsPreflight,
  exchangeAuthorizationCode,
  oauthError,
  oauthJson,
  refreshAccessToken,
} from "@/lib/oauth";
import { handleOAuthErrors, readForm } from "@/lib/oauth/http";
import { clientIp, tokenLimiter } from "@/lib/oauth/rate-limit";

/**
 * POST /api/oauth/token (form-encoded):
 * - `grant_type=authorization_code&code&code_verifier&client_id[&redirect_uri][&resource]`
 * - `grant_type=refresh_token&refresh_token&client_id[&scope][&resource]` (rotates the refresh token)
 * -> 200 `{ access_token, token_type: "Bearer", expires_in: 3600, refresh_token, scope }`.
 * Errors follow RFC 6749 §5.2 (`invalid_grant`, `invalid_client` 401, ...).
 */
export async function POST(request: Request) {
  return handleOAuthErrors("POST /api/oauth/token", async () => {
    const wait = tokenLimiter.take(clientIp(request));
    if (wait > 0) {
      return oauthError(429, "too_many_requests", "Too many token requests; try again shortly.", {
        headers: { "Retry-After": String(wait) },
      });
    }
    const form = await readForm(request);
    const client = await authenticateClient(request, form);
    const grantType = form.get("grant_type");
    const resource = form.get("resource");
    if (grantType === "authorization_code") {
      return oauthJson(
        await exchangeAuthorizationCode(client, {
          code: form.get("code"),
          codeVerifier: form.get("code_verifier"),
          redirectUri: form.get("redirect_uri"),
          resource,
        }),
      );
    }
    if (grantType === "refresh_token") {
      return oauthJson(
        await refreshAccessToken(client, { refreshToken: form.get("refresh_token"), scope: form.get("scope"), resource }),
      );
    }
    return oauthError(400, "unsupported_grant_type", "grant_type must be authorization_code or refresh_token");
  });
}

export function OPTIONS() {
  return corsPreflight();
}
