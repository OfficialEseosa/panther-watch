/**
 * Driving the OAuth authorization server and the MCP endpoint through their real route
 * handlers, in-process. Test files must mock `next/headers` and `next/server` onto
 * `./session` (see that file) before importing this one.
 *
 *   const fetch = appFetch;                      // a FetchLike that dispatches to route handlers
 *   const client = await register({ redirect_uris: [REDIRECT] });
 *   const tokens = await connect(user, client);  // DCR'd client -> consent "Allow" -> token
 */
import { createHash, randomBytes } from "node:crypto";
import { NextRequest } from "next/dist/server/web/spec-extension/request";
import { GET as asMetadata } from "@/app/.well-known/oauth-authorization-server/route";
import { GET as prmRoot } from "@/app/.well-known/oauth-protected-resource/route";
import { GET as prmMcp } from "@/app/.well-known/oauth-protected-resource/api/mcp/route";
import { GET as authorize } from "@/app/api/oauth/authorize/route";
import { POST as decision } from "@/app/api/oauth/authorize/decision/route";
import { POST as register_ } from "@/app/api/oauth/register/route";
import { POST as revoke } from "@/app/api/oauth/revoke/route";
import { POST as token } from "@/app/api/oauth/token/route";
import { DELETE as mcpDelete, GET as mcpGet, POST as mcpPost } from "@/app/api/mcp/route";
import { sessionCookie, TEST_ORIGIN, call, type SessionUser } from "./session";

export const REDIRECT = "https://assistant.example/oauth/callback";
export const MCP_URL = `${TEST_ORIGIN}/api/mcp`;

type Handler = (request: NextRequest) => Promise<Response> | Response;

const ROUTES: Record<string, Partial<Record<string, Handler>>> = {
  "/.well-known/oauth-authorization-server": { GET: asMetadata },
  "/.well-known/oauth-protected-resource": { GET: prmRoot },
  "/.well-known/oauth-protected-resource/api/mcp": { GET: prmMcp },
  "/api/oauth/authorize": { GET: authorize },
  "/api/oauth/authorize/decision": { POST: decision },
  "/api/oauth/register": { POST: register_ },
  "/api/oauth/token": { POST: token },
  "/api/oauth/revoke": { POST: revoke },
  "/api/mcp": { GET: mcpGet, POST: mcpPost, DELETE: mcpDelete },
};

/** All requests the in-process app has served, oldest first (path + method + status). */
export const served: Array<{ method: string; path: string; status: number }> = [];

/**
 * A `fetch` that serves TEST_ORIGIN URLs from the route handlers above (404 for anything else
 * on that origin) and refuses every other origin, so nothing leaves the process.
 */
export async function appFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
  const request = input instanceof Request ? new Request(input, init) : new Request(input, init);
  const url = new URL(request.url);
  if (url.origin !== TEST_ORIGIN) throw new Error(`appFetch: refusing to fetch ${url.origin}`);
  const handler = ROUTES[url.pathname]?.[request.method];
  const body = request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer();
  const next = new NextRequest(url, { method: request.method, headers: request.headers, body });
  const response = handler ? await call(handler, next) : new Response("not found", { status: 404 });
  served.push({ method: request.method, path: url.pathname, status: response.status });
  return response;
}

export function pkce(): { verifier: string; challenge: string } {
  const verifier = randomBytes(32).toString("base64url");
  return { verifier, challenge: createHash("sha256").update(verifier).digest("base64url") };
}

export interface RegisteredClient {
  client_id: string;
  client_secret?: string;
  client_name: string;
  redirect_uris: string[];
}

export async function register(metadata: Record<string, unknown>): Promise<RegisteredClient> {
  const response = await appFetch(`${TEST_ORIGIN}/api/oauth/register`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(metadata),
  });
  if (response.status !== 201) throw new Error(`register: ${response.status} ${await response.text()}`);
  return (await response.json()) as RegisteredClient;
}

export interface AuthorizeOptions {
  clientId: string;
  redirectUri?: string | null;
  challenge?: string | null;
  scope?: string | null;
  state?: string | null;
  resource?: string | null;
  extra?: Record<string, string>;
}

export function authorizeQuery({
  clientId,
  redirectUri = REDIRECT,
  challenge,
  scope = "read watches:write schedule:write",
  state = "state-123",
  resource = MCP_URL,
  extra = {},
}: AuthorizeOptions): URLSearchParams {
  const params = new URLSearchParams({ response_type: "code", client_id: clientId, code_challenge_method: "S256" });
  if (redirectUri) params.set("redirect_uri", redirectUri);
  if (challenge !== null) params.set("code_challenge", challenge ?? pkce().challenge);
  if (scope) params.set("scope", scope);
  if (state) params.set("state", state);
  if (resource) params.set("resource", resource);
  for (const [key, value] of Object.entries(extra)) params.set(key, value);
  return params;
}

/** GET /api/oauth/authorize as `user` (or signed out); returns the redirect Location. */
export async function startAuthorize(params: URLSearchParams, user?: SessionUser): Promise<URL> {
  const headers = new Headers();
  if (user) headers.set("cookie", await sessionCookie(user));
  const response = await call(authorize, new NextRequest(`${TEST_ORIGIN}/api/oauth/authorize?${params}`, { headers }));
  if (response.status !== 302) throw new Error(`authorize: ${response.status}`);
  return new URL(response.headers.get("location")!);
}

export interface DecisionOptions {
  decision?: "allow" | "deny";
  /** Ticked write scopes (default: both). */
  scopes?: string[];
  origin?: string | null;
}

/** Submits the consent form as `user`; returns the response (303 + Location on success). */
export async function decide(
  user: SessionUser,
  params: URLSearchParams,
  { decision: choice = "allow", scopes = ["watches:write", "schedule:write"], origin = TEST_ORIGIN }: DecisionOptions = {},
): Promise<Response> {
  const form = new URLSearchParams({ request: params.toString(), decision: choice });
  for (const scope of scopes) form.append("scope", scope);
  const headers = new Headers({ cookie: await sessionCookie(user), "content-type": "application/x-www-form-urlencoded" });
  if (origin) headers.set("origin", origin);
  return call(decision, new NextRequest(`${TEST_ORIGIN}/api/oauth/authorize/decision`, { method: "POST", headers, body: form.toString() }));
}

/** POST /api/oauth/token with form fields; returns status and parsed JSON. */
export async function tokenRequest(fields: Record<string, string>, headers: Record<string, string> = {}) {
  const response = await appFetch(`${TEST_ORIGIN}/api/oauth/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...headers },
    body: new URLSearchParams(fields).toString(),
  });
  return { status: response.status, headers: response.headers, body: (await response.json()) as Record<string, string | number> };
}

export interface Tokens {
  access_token: string;
  refresh_token: string;
  scope: string;
  expires_in: number;
}

/** The whole happy path for `user`: authorize -> Allow (with `scopes` ticked) -> code -> tokens. */
export async function connect(
  user: SessionUser,
  client: RegisteredClient,
  { scopes, scope }: { scopes?: string[]; scope?: string } = {},
): Promise<Tokens> {
  const { verifier, challenge } = pkce();
  const params = authorizeQuery({ clientId: client.client_id, challenge, ...(scope ? { scope } : {}) });
  const response = await decide(user, params, { scopes });
  const location = new URL(response.headers.get("location")!);
  const code = location.searchParams.get("code");
  if (!code) throw new Error(`connect: no code in ${location}`);
  const result = await tokenRequest({
    grant_type: "authorization_code",
    code,
    code_verifier: verifier,
    client_id: client.client_id,
    redirect_uri: REDIRECT,
    resource: MCP_URL,
  });
  if (result.status !== 200) throw new Error(`connect: token ${result.status} ${JSON.stringify(result.body)}`);
  return result.body as unknown as Tokens;
}
