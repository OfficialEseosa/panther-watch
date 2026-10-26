import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { z } from "zod";
import { env } from "@/lib/env";
import { SESSION_MAX_AGE_S } from "./constants";

export const ISSUER = "pantherwatch";
const ALGORITHM = "HS256";

const claimsSchema = z.object({
  sub: z.string().min(1),
  email: z.string(),
  name: z.string().nullable(),
  picture: z.string().nullable(),
});

export type SessionClaims = z.infer<typeof claimsSchema>;

let key: Uint8Array | undefined;
function signingKey(): Uint8Array {
  key ??= new TextEncoder().encode(env.JWT_SECRET);
  return key;
}

export async function signSession({ sub, email, name, picture }: SessionClaims): Promise<string> {
  return new SignJWT({ email, name, picture })
    .setProtectedHeader({ alg: ALGORITHM, typ: "JWT" })
    .setSubject(sub)
    .setIssuer(ISSUER)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_MAX_AGE_S}s`)
    .sign(signingKey());
}

/**
 * Returns the claims of a valid, unexpired session token, or null. Accepts only HS256 with our
 * key, `typ: JWT`, our issuer, and tokens carrying both `exp` and `iat`.
 */
export async function verifySession(token: string): Promise<SessionClaims | null> {
  try {
    const { payload } = await jwtVerify(token, signingKey(), {
      issuer: ISSUER,
      algorithms: [ALGORITHM],
      typ: "JWT",
      requiredClaims: ["exp", "iat"],
    });
    const claims = claimsSchema.safeParse(payload);
    return claims.success ? claims.data : null;
  } catch {
    return null;
  }
}
