import { createRequire } from "node:module";
import { describe, expect, it } from "vitest";
import { buildPoolConfig } from "..";

const POOLER = "postgres://postgres.ref:pw@aws-0-us-east-1.pooler.supabase.com:6543/postgres";
const PEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";

/** What node-postgres will actually use: it merges connection-string params over options. */
const ConnectionParameters = createRequire(import.meta.url)("pg/lib/connection-parameters") as new (
  config: object,
) => { ssl: unknown };
function effective(config: ReturnType<typeof buildPoolConfig>) {
  return new ConnectionParameters(config);
}

describe("buildPoolConfig", () => {
  it("always verifies TLS, even when the URL says sslmode=require", () => {
    const config = buildPoolConfig(`${POOLER}?sslmode=require`);
    expect(config.connectionString).not.toContain("sslmode");
    expect(effective(config).ssl).toEqual({ rejectUnauthorized: true });
  });

  it("pins the Supabase CA when given, accepting escaped newlines", () => {
    const config = buildPoolConfig(POOLER, PEM.replace(/\n/g, "\n"));
    expect(effective(config).ssl).toEqual({ rejectUnauthorized: true, ca: PEM });
  });

  it("ignores sslmode=disable for remote hosts", () => {
    expect(effective(buildPoolConfig(`${POOLER}?sslmode=disable`)).ssl).toEqual({ rejectUnauthorized: true });
  });

  it("allows plaintext only for a loopback sslmode=disable URL", () => {
    expect(buildPoolConfig("postgres://u:p@localhost:5432/db?sslmode=disable").ssl).toBe(false);
  });

  it("sets the pool limits and timeouts", () => {
    expect(buildPoolConfig(POOLER)).toMatchObject({
      max: 5,
      idleTimeoutMillis: 20_000,
      connectionTimeoutMillis: 10_000,
      statement_timeout: 30_000,
    });
  });
});
