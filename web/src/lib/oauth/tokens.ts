import "server-only";
import { and, eq, gt, isNull, sql } from "drizzle-orm";
import { getDb } from "@/db";
import { oauthClients, oauthCodes, oauthTokens } from "@/db/schema";
import { clientSecretMatches, findClient, type Client } from "./clients";
import { ACCESS_TOKEN_TTL_S, isOurResource, REFRESH_TOKEN_TTL_S } from "./config";
import { hashSecret, randomSecret, verifyPkce } from "./crypto";
import { formatScopes, splitScopes, type Scope } from "./scopes";

/** A token-endpoint failure: RFC 6749 §5.2 `error`, its description and HTTP status. */
export class OAuthGrantError extends Error {
  constructor(
    readonly error: string,
    message: string,
    readonly status = 400,
  ) {
    super(message);
    this.name = "OAuthGrantError";
  }
}

export interface TokenResponse {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
  scope: string;
}

// ---------------------------------------------------------------------------------------------
// Client authentication (token and revocation endpoints)
// ---------------------------------------------------------------------------------------------

/**
 * Identifies the calling client from `client_id` (+ `client_secret`) in the form body or HTTP
 * Basic credentials. Public clients send only their id; confidential ones must send the secret.
 * Throws `invalid_client` (401) otherwise.
 */
export async function authenticateClient(request: Request, form: URLSearchParams): Promise<Client> {
  let clientId = form.get("client_id");
  let secret = form.get("client_secret");
  const header = request.headers.get("authorization");
  if (header?.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = Buffer.from(header.slice(6).trim(), "base64").toString("utf8");
      const colon = decoded.indexOf(":");
      if (colon > 0) {
        clientId = decodeURIComponent(decoded.slice(0, colon));
        secret = decodeURIComponent(decoded.slice(colon + 1));
      }
    } catch {
      throw new OAuthGrantError("invalid_client", "malformed Basic credentials", 401);
    }
  }
  if (!clientId) throw new OAuthGrantError("invalid_client", "client_id is required", 401);
  const client = await findClient(clientId);
  if (!client) throw new OAuthGrantError("invalid_client", "unknown client", 401);
  if (client.secretHash !== null && !clientSecretMatches(client.secretHash, secret)) {
    throw new OAuthGrantError("invalid_client", "client authentication failed", 401);
  }
  return client;
}

// ---------------------------------------------------------------------------------------------
// Issuing
// ---------------------------------------------------------------------------------------------

async function issueTokens(
  userId: string,
  clientId: string,
  scopes: readonly string[],
  { now, grantedAt }: { now: Date; grantedAt: Date },
): Promise<TokenResponse> {
  const accessToken = randomSecret("pwat_");
  const refreshToken = randomSecret("pwrt_");
  const scope = formatScopes(scopes);
  await getDb()
    .insert(oauthTokens)
    .values({
      userId,
      clientId,
      accessTokenHash: hashSecret(accessToken),
      refreshTokenHash: hashSecret(refreshToken),
      scope,
      expiresAt: new Date(now.getTime() + ACCESS_TOKEN_TTL_S * 1000),
      refreshExpiresAt: new Date(now.getTime() + REFRESH_TOKEN_TTL_S * 1000),
      grantedAt,
      createdAt: now,
    });
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: ACCESS_TOKEN_TTL_S,
    refresh_token: refreshToken,
    scope,
  };
}

/** Revokes every live token of (user, client). Returns how many rows changed. */
async function revokeGrant(userId: string, clientId: string, now: Date): Promise<number> {
  const rows = await getDb()
    .update(oauthTokens)
    .set({ revokedAt: now })
    .where(and(eq(oauthTokens.userId, userId), eq(oauthTokens.clientId, clientId), isNull(oauthTokens.revokedAt)))
    .returning({ id: oauthTokens.id });
  return rows.length;
}

function checkResource(resource: string | null): void {
  if (resource !== null && !isOurResource(resource)) {
    throw new OAuthGrantError("invalid_target", "resource must be this server's MCP endpoint");
  }
}

/**
 * `grant_type=authorization_code`: checks the code (this client's, unexpired, unused),
 * `redirect_uri` (when sent, it must equal the one the code was issued for) and the PKCE
 * verifier, then claims the code atomically and issues a token pair. A code presented a second
 * time is refused and the tokens already issued to that user and client are revoked
 * (RFC 6749 §4.1.2), since a replayed code means it leaked.
 */
export async function exchangeAuthorizationCode(
  client: Client,
  input: { code: string | null; codeVerifier: string | null; redirectUri: string | null; resource: string | null },
  { now = new Date() }: { now?: Date } = {},
): Promise<TokenResponse> {
  if (!input.code) throw new OAuthGrantError("invalid_request", "code is required");
  if (!input.codeVerifier) throw new OAuthGrantError("invalid_request", "code_verifier is required (PKCE)");
  checkResource(input.resource);

  const db = getDb();
  const codeHash = hashSecret(input.code);
  const [row] = await db.select().from(oauthCodes).where(eq(oauthCodes.codeHash, codeHash)).limit(1);
  if (!row || row.clientId !== client.id) throw new OAuthGrantError("invalid_grant", "unknown authorization code");
  if (row.usedAt) {
    await revokeGrant(row.userId, row.clientId, now);
    throw new OAuthGrantError("invalid_grant", "authorization code was already used");
  }
  if (row.expiresAt <= now) throw new OAuthGrantError("invalid_grant", "authorization code expired");
  if (input.redirectUri !== null && input.redirectUri !== row.redirectUri) {
    throw new OAuthGrantError("invalid_grant", "redirect_uri does not match the authorization request");
  }
  if (!verifyPkce(input.codeVerifier, row.codeChallenge)) {
    throw new OAuthGrantError("invalid_grant", "code_verifier does not match code_challenge");
  }

  const [claimed] = await db
    .update(oauthCodes)
    .set({ usedAt: now })
    .where(and(eq(oauthCodes.codeHash, codeHash), isNull(oauthCodes.usedAt)))
    .returning({ userId: oauthCodes.userId });
  if (!claimed) {
    // A concurrent exchange of the same code won the claim: treat as a replay.
    await revokeGrant(row.userId, row.clientId, now);
    throw new OAuthGrantError("invalid_grant", "authorization code was already used");
  }
  return issueTokens(row.userId, row.clientId, splitScopes(row.scope), { now, grantedAt: now });
}

/**
 * `grant_type=refresh_token` with rotation: the presented refresh token's row is revoked and a
 * new pair issued (same grant, a fresh 30-day refresh window). A revoked refresh token
 * presented again is a replay: every token of that user and client is revoked. `scope` may
 * narrow, never widen, the grant.
 */
export async function refreshAccessToken(
  client: Client,
  input: { refreshToken: string | null; scope: string | null; resource: string | null },
  { now = new Date() }: { now?: Date } = {},
): Promise<TokenResponse> {
  if (!input.refreshToken) throw new OAuthGrantError("invalid_request", "refresh_token is required");
  checkResource(input.resource);

  const db = getDb();
  const [current] = await db
    .select()
    .from(oauthTokens)
    .where(eq(oauthTokens.refreshTokenHash, hashSecret(input.refreshToken)))
    .limit(1);
  const invalid = () => new OAuthGrantError("invalid_grant", "refresh token is invalid, expired or revoked");
  if (!current || current.clientId !== client.id) throw invalid();
  if (current.revokedAt) {
    await revokeGrant(current.userId, current.clientId, now);
    throw invalid();
  }
  if (current.refreshExpiresAt <= now) throw invalid();

  const granted = splitScopes(current.scope);
  let scopes: Scope[] = granted;
  if (input.scope !== null && input.scope.trim() !== "") {
    const asked = input.scope.split(/\s+/).filter(Boolean);
    if (asked.some((scope) => !(granted as string[]).includes(scope))) {
      throw new OAuthGrantError("invalid_scope", "scope exceeds what was granted");
    }
    scopes = granted.filter((scope) => asked.includes(scope));
  }

  const [rotated] = await db
    .update(oauthTokens)
    .set({ revokedAt: now })
    .where(and(eq(oauthTokens.id, current.id), isNull(oauthTokens.revokedAt)))
    .returning({ id: oauthTokens.id });
  if (!rotated) {
    // A concurrent refresh with the same token won: the token was used twice.
    await revokeGrant(current.userId, current.clientId, now);
    throw invalid();
  }
  return issueTokens(current.userId, current.clientId, scopes, { now, grantedAt: current.grantedAt });
}

/**
 * RFC 7009 revocation: revokes the row whose access or refresh token is `token`, if it belongs
 * to `client`. Unknown tokens are not an error (the endpoint always answers 200).
 */
export async function revokeToken(client: Client, token: string, { now = new Date() } = {}): Promise<boolean> {
  const hash = hashSecret(token);
  const rows = await getDb()
    .update(oauthTokens)
    .set({ revokedAt: now })
    .where(
      and(
        eq(oauthTokens.clientId, client.id),
        isNull(oauthTokens.revokedAt),
        sql`(${oauthTokens.accessTokenHash} = ${hash} OR ${oauthTokens.refreshTokenHash} = ${hash})`,
      ),
    )
    .returning({ id: oauthTokens.id });
  return rows.length > 0;
}

// ---------------------------------------------------------------------------------------------
// Verification (the MCP endpoint)
// ---------------------------------------------------------------------------------------------

export interface VerifiedToken {
  userId: string;
  clientId: string;
  scopes: Scope[];
  /** Seconds since the epoch. */
  expiresAt: number;
}

/** `last_used_at` is written at most this often per token, so most requests are one SELECT. */
const LAST_USED_RESOLUTION_MS = 60_000;

/**
 * The access token's grant, or null when it is unknown, expired or revoked (including when its
 * user or client was deleted: the rows cascade). Cheap: one indexed SELECT, plus an UPDATE of
 * `last_used_at` at most once a minute.
 */
export async function verifyAccessToken(token: string | undefined, { now = new Date() } = {}): Promise<VerifiedToken | null> {
  if (!token || !token.startsWith("pwat_") || token.length > 100) return null;
  const db = getDb();
  const [row] = await db
    .select({
      id: oauthTokens.id,
      userId: oauthTokens.userId,
      clientId: oauthTokens.clientId,
      scope: oauthTokens.scope,
      expiresAt: oauthTokens.expiresAt,
      revokedAt: oauthTokens.revokedAt,
      lastUsedAt: oauthTokens.lastUsedAt,
    })
    .from(oauthTokens)
    .where(eq(oauthTokens.accessTokenHash, hashSecret(token)))
    .limit(1);
  if (!row || row.revokedAt || row.expiresAt <= now) return null;
  if (!row.lastUsedAt || now.getTime() - row.lastUsedAt.getTime() >= LAST_USED_RESOLUTION_MS) {
    await db.update(oauthTokens).set({ lastUsedAt: now }).where(eq(oauthTokens.id, row.id));
  }
  return {
    userId: row.userId,
    clientId: row.clientId,
    scopes: splitScopes(row.scope),
    expiresAt: Math.floor(row.expiresAt.getTime() / 1000),
  };
}

// ---------------------------------------------------------------------------------------------
// Settings: connected apps
// ---------------------------------------------------------------------------------------------

export interface ConnectedApp {
  clientId: string;
  name: string;
  scopes: Scope[];
  /** When the user (first, of the live grants) approved it. ISO string. */
  connectedAt: string;
  /** Last MCP request, or null if never used. ISO string. */
  lastUsedAt: string | null;
}

/**
 * Apps with at least one live grant (a token row that is not revoked and whose refresh token
 * has not expired), most recently used first.
 */
export async function listConnectedApps(userId: string, { now = new Date() } = {}): Promise<ConnectedApp[]> {
  const db = getDb();
  const live = await db
    .select({
      clientId: oauthTokens.clientId,
      name: oauthClients.name,
      scope: oauthTokens.scope,
      grantedAt: oauthTokens.grantedAt,
    })
    .from(oauthTokens)
    .innerJoin(oauthClients, eq(oauthClients.id, oauthTokens.clientId))
    .where(and(eq(oauthTokens.userId, userId), isNull(oauthTokens.revokedAt), gt(oauthTokens.refreshExpiresAt, now)));
  if (live.length === 0) return [];

  // Last use spans rotated (revoked) rows of the same client too.
  const usage = await db
    .select({ clientId: oauthTokens.clientId, lastUsedAt: sql<Date | string | null>`max(${oauthTokens.lastUsedAt})` })
    .from(oauthTokens)
    .where(eq(oauthTokens.userId, userId))
    .groupBy(oauthTokens.clientId);
  const lastUsed = new Map(usage.map((row) => [row.clientId, row.lastUsedAt ? new Date(row.lastUsedAt) : null]));

  const apps = new Map<string, { name: string; scopes: Set<string>; grantedAt: Date }>();
  for (const row of live) {
    const app = apps.get(row.clientId) ?? { name: row.name, scopes: new Set<string>(), grantedAt: row.grantedAt };
    for (const scope of splitScopes(row.scope)) app.scopes.add(scope);
    if (row.grantedAt < app.grantedAt) app.grantedAt = row.grantedAt;
    apps.set(row.clientId, app);
  }
  return [...apps.entries()]
    .map(([clientId, app]) => ({
      clientId,
      name: app.name,
      scopes: splitScopes([...app.scopes].join(" ")),
      connectedAt: app.grantedAt.toISOString(),
      lastUsedAt: lastUsed.get(clientId)?.toISOString() ?? null,
    }))
    .sort((a, b) => (b.lastUsedAt ?? b.connectedAt).localeCompare(a.lastUsedAt ?? a.connectedAt));
}

/**
 * Disconnects an app: revokes every token the user granted it and burns its unused codes.
 * Returns false when nothing was live.
 */
export async function disconnectApp(userId: string, clientId: string, { now = new Date() } = {}): Promise<boolean> {
  const revoked = await revokeGrant(userId, clientId, now);
  await getDb()
    .update(oauthCodes)
    .set({ usedAt: now })
    .where(and(eq(oauthCodes.userId, userId), eq(oauthCodes.clientId, clientId), isNull(oauthCodes.usedAt)));
  return revoked > 0;
}
