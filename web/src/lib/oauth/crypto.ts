import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { constantTimeEqual } from "@/lib/http";

/**
 * A fresh secret: 32 random bytes, base64url, with a short prefix naming its kind
 * (`pwat_` access token, `pwrt_` refresh token, `pwac_` code, `pwcs_` client secret) so a
 * leaked value is recognisable in logs and secret scanners.
 */
export function randomSecret(prefix: "pwat_" | "pwrt_" | "pwac_" | "pwcs_" | "pwc_"): string {
  return `${prefix}${randomBytes(32).toString("base64url")}`;
}

/** What is stored for a secret: its SHA-256, hex. The secrets are 256-bit random, so no salt or KDF is needed. */
export function hashSecret(secret: string): string {
  return createHash("sha256").update(secret, "utf8").digest("hex");
}

/** RFC 7636 code_verifier syntax: 43-128 unreserved characters. */
const VERIFIER = /^[A-Za-z0-9\-._~]{43,128}$/;
/** An S256 code_challenge: base64url SHA-256, 43 characters. */
export const S256_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

/** PKCE S256: BASE64URL(SHA256(verifier)) equals the stored challenge. */
export function verifyPkce(verifier: string, challenge: string): boolean {
  if (!VERIFIER.test(verifier)) return false;
  const computed = createHash("sha256").update(verifier, "ascii").digest("base64url");
  return constantTimeEqual(computed, challenge);
}
