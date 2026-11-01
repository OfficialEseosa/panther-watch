import { authenticateClient, corsPreflight, oauthError, oauthJson, revokeToken } from "@/lib/oauth";
import { handleOAuthErrors, readForm } from "@/lib/oauth/http";

/**
 * POST /api/oauth/revoke (RFC 7009, form-encoded): `token&client_id[&token_type_hint]`.
 * Revokes the grant row the access or refresh token belongs to (both tokens of the pair stop
 * working). Always 200 for a well-formed request, whether or not the token was known.
 */
export async function POST(request: Request) {
  return handleOAuthErrors("POST /api/oauth/revoke", async () => {
    const form = await readForm(request);
    const client = await authenticateClient(request, form);
    const token = form.get("token");
    if (!token) return oauthError(400, "invalid_request", "token is required");
    await revokeToken(client, token);
    return oauthJson({});
  });
}

export function OPTIONS() {
  return corsPreflight();
}
