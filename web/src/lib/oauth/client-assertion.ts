import "server-only";
import { lt } from "drizzle-orm";
import {
  createLocalJWKSet,
  decodeJwt,
  errors,
  jwtVerify,
  type JSONWebKeySet,
  type JWTPayload,
  type JWTVerifyGetKey,
  type JWTVerifyOptions,
} from "jose";
import { getDb } from "@/db";
import { oauthAssertionJtis } from "@/db/schema";
import { clientJwks, type ClientRecord } from "./clients";
import { ASSERTION_SIGNING_ALGS } from "./config";

/**
 * private_key_jwt client authentication (RFC 7523 §2.2 / §3, OIDC Core 9): the client proves
 * its identity at the token endpoint with a short-lived JWT signed by a key in its JWKS.
 */

export const JWT_BEARER_ASSERTION_TYPE = "urn:ietf:params:oauth:client-assertion-type:jwt-bearer";

/** Clock skew tolerated on `exp`, `nbf` and `iat`. */
export const ASSERTION_CLOCK_SKEW_S = 60;
/** The furthest in the future an assertion's `exp` may be (bounds how long its jti is kept). */
export const ASSERTION_MAX_LIFETIME_S = 60 * 60;
const MAX_ASSERTION_LENGTH = 8 * 1024;
const MAX_JTI_LENGTH = 256;

/** Why an assertion was refused (becomes `invalid_client`, 401). */
export class ClientAssertionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ClientAssertionError";
  }
}

/**
 * The client id an assertion claims (`sub`, which must equal `iss`), read WITHOUT verifying it:
 * only used to look the client up. Throws ClientAssertionError for a malformed JWT.
 */
export function assertionClientId(assertion: string): string {
  if (assertion.length > MAX_ASSERTION_LENGTH) throw new ClientAssertionError("client_assertion is too long");
  let payload: JWTPayload;
  try {
    payload = decodeJwt(assertion);
  } catch {
    throw new ClientAssertionError("client_assertion is not a valid JWT");
  }
  if (typeof payload.sub !== "string" || !payload.sub) throw new ClientAssertionError("client_assertion has no sub");
  return payload.sub;
}

function describe(error: unknown): string {
  if (error instanceof errors.JWTExpired) return "client assertion has expired";
  if (error instanceof errors.JWTClaimValidationFailed) {
    switch (error.claim) {
      case "aud":
        return "client assertion aud must be this server's token endpoint or issuer";
      case "iss":
      case "sub":
        return "client assertion iss and sub must both be the client_id";
      case "nbf":
        return "client assertion is not valid yet (nbf)";
      case "iat":
        return "client assertion iat is invalid";
      default:
        return `client assertion ${error.claim} claim is missing or invalid`;
    }
  }
  if (error instanceof errors.JOSEAlgNotAllowed || error instanceof errors.JOSENotSupported) {
    return "client assertion is signed with an algorithm this client may not use";
  }
  if (error instanceof errors.JWKSNoMatchingKey) return "no key in the client's JWKS matches the client assertion";
  if (error instanceof errors.JWSSignatureVerificationFailed) return "client assertion signature is invalid";
  if (error instanceof errors.JWKSInvalid) return "the client's JWKS is invalid";
  return "client assertion is invalid";
}

/** Verifies against one JWKS; with several candidate keys (no `kid`), tries each in turn. */
async function verifyWith(jwks: JSONWebKeySet, assertion: string, options: JWTVerifyOptions) {
  const keySet: JWTVerifyGetKey = createLocalJWKSet(jwks);
  try {
    return await jwtVerify(assertion, keySet, options);
  } catch (error) {
    if (!(error instanceof errors.JWKSMultipleMatchingKeys)) throw error;
    for await (const key of error) {
      try {
        return await jwtVerify(assertion, key, options);
      } catch (inner) {
        if (!(inner instanceof errors.JWSSignatureVerificationFailed)) throw inner;
      }
    }
    throw new errors.JWSSignatureVerificationFailed();
  }
}

/**
 * Verifies `assertion` for `client`:
 * - signed with a key from the client's JWKS (its `jwks_uri`, cached; refetched once when the
 *   `kid` is unknown), with the alg the client declared, else RS256 / ES256 / PS256;
 * - `iss` and `sub` both equal to the client_id;
 * - `aud` containing one of `audiences` (the token endpoint URL or the issuer);
 * - `exp` present and in the future, at most an hour ahead; `nbf` and `iat` not in the future
 *   (each with 60 s of clock skew);
 * - `jti` present and never seen before for this client (recorded until `exp`).
 * Throws ClientAssertionError otherwise.
 */
export async function verifyClientAssertion(
  client: ClientRecord,
  assertion: string,
  { audiences, now = new Date() }: { audiences: string[]; now?: Date },
): Promise<void> {
  if (!client.authMethods.includes("private_key_jwt") || (!client.jwksUri && !client.jwks)) {
    throw new ClientAssertionError("this client is not registered for private_key_jwt");
  }
  const options: JWTVerifyOptions = {
    algorithms: client.signingAlg ? [client.signingAlg] : [...ASSERTION_SIGNING_ALGS],
    issuer: client.id,
    subject: client.id,
    audience: audiences,
    clockTolerance: ASSERTION_CLOCK_SKEW_S,
    requiredClaims: ["exp", "jti"],
    currentDate: now,
  };

  let payload: JWTPayload;
  try {
    let keys = await clientJwks(client, { now: now.getTime() });
    try {
      ({ payload } = await verifyWith(keys.jwks, assertion, options));
    } catch (error) {
      if (!(error instanceof errors.JWKSNoMatchingKey) || keys.fresh) throw error;
      // Unknown kid against a cached set: the client may have rotated keys. Refetch once.
      keys = await clientJwks(client, { refresh: true, now: now.getTime() });
      ({ payload } = await verifyWith(keys.jwks, assertion, options));
    }
  } catch (error) {
    if (error instanceof errors.JOSEError) throw new ClientAssertionError(describe(error));
    if (error instanceof Error && error.message.startsWith("the client")) throw new ClientAssertionError(error.message);
    throw error;
  }

  const nowS = Math.floor(now.getTime() / 1000);
  const exp = payload.exp!;
  if (exp > nowS + ASSERTION_MAX_LIFETIME_S + ASSERTION_CLOCK_SKEW_S) {
    throw new ClientAssertionError("client assertion exp is too far in the future (at most one hour)");
  }
  if (payload.iat !== undefined && payload.iat > nowS + ASSERTION_CLOCK_SKEW_S) {
    throw new ClientAssertionError("client assertion iat is in the future");
  }
  const jti = payload.jti;
  if (typeof jti !== "string" || jti.length === 0 || jti.length > MAX_JTI_LENGTH) {
    throw new ClientAssertionError("client assertion jti is missing or invalid");
  }

  // Single use: claim the jti. A row left over from an expired assertion may be reclaimed.
  const expiresAt = new Date((exp + ASSERTION_CLOCK_SKEW_S) * 1000);
  const claimed = await getDb()
    .insert(oauthAssertionJtis)
    .values({ clientId: client.id, jti, expiresAt })
    .onConflictDoUpdate({
      target: [oauthAssertionJtis.clientId, oauthAssertionJtis.jti],
      set: { expiresAt },
      setWhere: lt(oauthAssertionJtis.expiresAt, now),
    })
    .returning({ jti: oauthAssertionJtis.jti });
  if (claimed.length === 0) throw new ClientAssertionError("client assertion was already used (jti replay)");
}
