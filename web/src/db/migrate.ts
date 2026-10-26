/**
 * Applies the SQL migrations in `drizzle/` to `DATABASE_URL` (`npm run db:migrate`, run from
 * `web/`). Drizzle records applied migrations in `drizzle.__drizzle_migrations` and runs all
 * pending ones in a single transaction.
 *
 * Prefer a direct or session-pooler URL (port 5432) for migrations; the transaction pooler
 * (6543) works for this one-transaction run but is not meant for DDL.
 *
 * TLS is verified exactly like the app (see `buildPoolConfig` in ./index.ts): set
 * `DATABASE_CA_CERT` to Supabase's root CA PEM.
 *
 * Standalone script: it does not import `@/lib/env` (which would demand every app secret) or
 * `./index` (which imports `server-only`), so the pool options are rebuilt here.
 */
import path from "node:path";
import { loadEnvConfig } from "@next/env";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const SSL_URL_PARAMS = ["sslmode", "sslrootcert", "sslcert", "sslkey", "sslnegotiation", "uselibpqcompat"];
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

async function main(): Promise<void> {
  loadEnvConfig(process.cwd());
  const raw = process.env.DATABASE_URL;
  if (!raw) throw new Error("DATABASE_URL is not set");

  const url = new URL(raw);
  const sslmode = url.searchParams.get("sslmode");
  for (const param of SSL_URL_PARAMS) url.searchParams.delete(param);
  const ca = process.env.DATABASE_CA_CERT?.trim()
    ? process.env.DATABASE_CA_CERT.replace(/\\n/g, "\n")
    : undefined;
  const plaintext = sslmode === "disable" && LOOPBACK_HOSTS.has(url.hostname);

  console.log(`Migrating ${url.hostname}:${url.port || "5432"}${url.pathname}`);

  const pool = new Pool({
    connectionString: url.toString(),
    ssl: plaintext ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    max: 1,
    connectionTimeoutMillis: 10_000,
  });
  try {
    await migrate(drizzle(pool), {
      migrationsFolder: path.resolve(process.cwd(), "drizzle"),
    });
    console.log("Migrations applied.");
  } finally {
    await pool.end();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
