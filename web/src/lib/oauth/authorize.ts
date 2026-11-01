import "server-only";
import { getDb } from "@/db";
import { oauthCodes } from "@/db/schema";
import { ClientError, resolveClient, redirectUriAllowed, type Client } from "./clients";
import { CODE_TTL_MS, isOurResource, issuer } from "./config";
import { hashSecret, randomSecret, S256_CHALLENGE } from "./crypto";
import { formatScopes, parseScopes, REQUIRED_SCOPE, type Scope } from "./scopes";

/**
 * The authorization endpoint's request validation, shared by `GET /api/oauth/authorize`, the
 * consent page (`/connect`) and `POST /api/oauth/authorize/decision`, so all three judge the
 * same query string the same way.
 *
 * Order follows RFC 6749 §4.1.2.1: a bad or unknown client or redirect URI is shown to the user
 * and never redirected (it could be an open redirector); every later problem is sent back to
 * the client's redirect URI as `error=...` with `state` and `iss`.
 */

export interface AuthorizationRequest {
  client: Client;
  redirectUri: string;
  /** Requested scopes (known ones, always including `read`). */
  scopes: Scope[];
  state: string | null;
  codeChallenge: string;
  resource: string | null;
}

export type AuthorizeCheck =
  | { ok: true; request: AuthorizationRequest }
  /** Show `message` on our own page; do not redirect. */
  | { ok: false; kind: "fatal"; message: string }
  /** Send the browser to `location` (the client's redirect URI with an error). */
  | { ok: false; kind: "redirect"; location: string };

const PARAMS = [
  "response_type",
  "client_id",
  "redirect_uri",
  "scope",
  "state",
  "code_challenge",
  "code_challenge_method",
  "resource",
] as const;

/** Builds a URLSearchParams from Next's `searchParams` object (keeps repeated keys). */
export function toSearchParams(raw: Record<string, string | string[] | undefined>): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(raw)) {
    for (const item of Array.isArray(value) ? value : value === undefined ? [] : [value]) params.append(key, item);
  }
  return params;
}

/** The client's redirect URI with `params` added, plus `iss` (RFC 9207). */
function withParams(redirectUri: string, params: Record<string, string | null>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) if (value !== null) url.searchParams.set(key, value);
  url.searchParams.set("iss", issuer());
  return url.toString();
}

export function errorRedirect(redirectUri: string, error: string, description: string, state: string | null): string {
  return withParams(redirectUri, { error, error_description: description, state });
}

export function codeRedirect(redirectUri: string, code: string, state: string | null): string {
  return withParams(redirectUri, { code, state });
}

export async function checkAuthorizeRequest(params: URLSearchParams): Promise<AuthorizeCheck> {
  const fatal = (message: string): AuthorizeCheck => ({ ok: false, kind: "fatal", message });

  for (const name of PARAMS) {
    if (params.getAll(name).length > 1) return fatal(`The request repeats the ${name} parameter.`);
  }
  const clientId = params.get("client_id");
  if (!clientId) return fatal("The request has no client_id.");

  let client: Client | null;
  try {
    client = await resolveClient(clientId);
  } catch (error) {
    if (error instanceof ClientError) return fatal(error.message);
    throw error;
  }
  if (!client) return fatal("This app isn't registered with PantherWatch. Try connecting again from the app.");

  const requestedRedirect = params.get("redirect_uri");
  let redirectUri: string;
  if (requestedRedirect) {
    if (!redirectUriAllowed(client.redirectUris, requestedRedirect)) {
      return fatal("The app asked to return to an address it didn't register.");
    }
    redirectUri = requestedRedirect;
  } else if (client.redirectUris.length === 1) {
    redirectUri = client.redirectUris[0];
  } else {
    return fatal("The request has no redirect_uri.");
  }

  const state = params.get("state");
  const fail = (error: string, description: string): AuthorizeCheck => ({
    ok: false,
    kind: "redirect",
    location: errorRedirect(redirectUri, error, description, state),
  });

  if (params.get("response_type") !== "code") {
    return fail("unsupported_response_type", "response_type must be code");
  }
  const codeChallenge = params.get("code_challenge");
  if (!codeChallenge) return fail("invalid_request", "PKCE is required: send code_challenge with code_challenge_method=S256");
  if (params.get("code_challenge_method") !== "S256") {
    return fail("invalid_request", "code_challenge_method must be S256");
  }
  if (!S256_CHALLENGE.test(codeChallenge)) return fail("invalid_request", "code_challenge is not a valid S256 challenge");
  const resource = params.get("resource");
  if (resource !== null && !isOurResource(resource)) {
    return fail("invalid_target", "resource must be this server's MCP endpoint");
  }
  if (state !== null && state.length > 1024) return fail("invalid_request", "state is too long");

  return {
    ok: true,
    request: { client, redirectUri, scopes: parseScopes(params.get("scope")), state, codeChallenge, resource },
  };
}

/**
 * The scopes to grant: the requested ones the user left ticked on the consent page, plus
 * `read`, which every connection gets.
 */
export function grantedScopes(requested: readonly Scope[], approved: readonly string[]): Scope[] {
  const keep = new Set<string>([...approved, REQUIRED_SCOPE]);
  return requested.filter((scope) => keep.has(scope));
}

/** Issues a 10-minute, single-use code for an approved request. Returns the plaintext code. */
export async function issueAuthorizationCode(
  userId: string,
  request: AuthorizationRequest,
  scopes: readonly Scope[],
  { now = new Date() }: { now?: Date } = {},
): Promise<string> {
  const code = randomSecret("pwac_");
  await getDb()
    .insert(oauthCodes)
    .values({
      codeHash: hashSecret(code),
      clientId: request.client.id,
      userId,
      redirectUri: request.redirectUri,
      scope: formatScopes(scopes),
      codeChallenge: request.codeChallenge,
      codeChallengeMethod: "S256",
      expiresAt: new Date(now.getTime() + CODE_TTL_MS),
      createdAt: now,
    });
  return code;
}
