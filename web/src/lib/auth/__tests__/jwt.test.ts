import { SignJWT } from "jose";
import { describe, expect, it } from "vitest";
import { ISSUER, signSession, verifySession } from "../jwt";

const key = () => new TextEncoder().encode(process.env.JWT_SECRET);
const claims = { sub: "6d3f1c3e-0b5a-4c55-9a59-6f1f0a1b2c3d", email: "a@student.gsu.test", name: "A", picture: null };
const now = () => Math.floor(Date.now() / 1000);
const b64 = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");

function base(alg = "HS256") {
  return new SignJWT({ email: claims.email, name: claims.name, picture: claims.picture })
    .setProtectedHeader({ alg, typ: "JWT" })
    .setSubject(claims.sub)
    .setIssuer(ISSUER);
}

describe("session JWT", () => {
  it("accepts a token it signed", async () => {
    await expect(verifySession(await signSession(claims))).resolves.toEqual(claims);
  });

  it("rejects alg:none", async () => {
    const payload = { ...claims, iss: ISSUER, iat: now(), exp: now() + 3600 };
    const unsigned = `${b64({ alg: "none", typ: "JWT" })}.${b64(payload)}.`;
    await expect(verifySession(unsigned)).resolves.toBeNull();
  });

  it("rejects HS512 even when signed with the same secret", async () => {
    const token = await base("HS512").setIssuedAt().setExpirationTime("1h").sign(key());
    await expect(verifySession(token)).resolves.toBeNull();
  });

  it("rejects a token signed with another secret", async () => {
    const other = new TextEncoder().encode("another-secret-".padEnd(64, "y"));
    const token = await base().setIssuedAt().setExpirationTime("1h").sign(other);
    await expect(verifySession(token)).resolves.toBeNull();
  });

  it("rejects the wrong issuer", async () => {
    const token = await base().setIssuer("someone-else").setIssuedAt().setExpirationTime("1h").sign(key());
    await expect(verifySession(token)).resolves.toBeNull();
  });

  it("rejects an expired token", async () => {
    const token = await base().setIssuedAt(now() - 7200).setExpirationTime(now() - 3600).sign(key());
    await expect(verifySession(token)).resolves.toBeNull();
  });

  it("rejects tokens missing exp or iat", async () => {
    const noExp = await base().setIssuedAt().sign(key());
    const noIat = await base().setExpirationTime("1h").sign(key());
    await expect(verifySession(noExp)).resolves.toBeNull();
    await expect(verifySession(noIat)).resolves.toBeNull();
  });

  it("rejects a typ other than JWT", async () => {
    const token = await new SignJWT({ email: claims.email, name: null, picture: null })
      .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
      .setSubject(claims.sub)
      .setIssuer(ISSUER)
      .setIssuedAt()
      .setExpirationTime("1h")
      .sign(key());
    await expect(verifySession(token)).resolves.toBeNull();
  });

  it("rejects garbage", async () => {
    await expect(verifySession("not.a.jwt")).resolves.toBeNull();
  });
});
