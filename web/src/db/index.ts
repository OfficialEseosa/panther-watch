import "server-only";
import { attachDatabasePool } from "@vercel/functions";
import type { PgDatabase, PgQueryResultHKT } from "drizzle-orm/pg-core";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { Pool, type PoolConfig } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";

/**
 * The Drizzle database type app code should depend on. Both the production node-postgres
 * client and the PGlite client used by integration tests (tests/helpers/db.ts) satisfy it, so
 * `select`, `insert`, `update`, `delete`, `execute`, `transaction` and `query.*` type-check
 * against either. Driver-specific result shapes (e.g. `execute` rows) are typed loosely.
 *
 * Locking: production connects through Supabase's TRANSACTION pooler (Supavisor, port 6543),
 * which hands each transaction to whichever backend is free. Session state does not survive
 * between statements, so session-level advisory locks (`pg_advisory_lock`,
 * `pg_try_advisory_lock`) and `SET` are unsafe: the lock may be taken on one backend and the
 * unlock sent to another, leaking it. A lock that must span a request has to be
 * `pg_try_advisory_xact_lock(key)` (or `pg_advisory_xact_lock`) inside `db.transaction(...)`;
 * it is released automatically at COMMIT/ROLLBACK.
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** The production driver's concrete type. Prefer `Db` in app code. */
export type NodePgDb = NodePgDatabase<typeof schema>;

const POOL_MAX = 5;
const IDLE_TIMEOUT_MS = 20_000;
const CONNECTION_TIMEOUT_MS = 10_000;
const STATEMENT_TIMEOUT_MS = 30_000;

/** libpq SSL parameters that node-postgres would otherwise let override our `ssl` option. */
const SSL_URL_PARAMS = [
  "sslmode",
  "sslrootcert",
  "sslcert",
  "sslkey",
  "sslnegotiation",
  "uselibpqcompat",
];

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

/**
 * Pool options for `DATABASE_URL`. TLS is always on and the server certificate is always
 * verified (`rejectUnauthorized: true`). Supabase's certificates chain to Supabase's own root
 * CA, which is not in Node's trust store, so production must set `DATABASE_CA_CERT` to that
 * PEM (Dashboard > Database settings > SSL Configuration > Download certificate); without it
 * the connection fails closed with SELF_SIGNED_CERT_IN_CHAIN rather than silently going
 * unverified.
 *
 * node-postgres merges connection-string parameters OVER explicit options (and treats
 * `sslmode=require` as `verify-full` with a deprecation warning), so the ssl* query parameters
 * are stripped here and `ssl` is set explicitly. The one exception is `sslmode=disable` on a
 * loopback host, for a local Postgres without TLS.
 *
 * Exported for tests; app code uses `getDb()`.
 */
export function buildPoolConfig(databaseUrl: string, caCert?: string): PoolConfig {
  const url = new URL(databaseUrl);
  const sslmode = url.searchParams.get("sslmode");
  for (const param of SSL_URL_PARAMS) url.searchParams.delete(param);

  const localPlaintext = sslmode === "disable" && LOOPBACK_HOSTS.has(url.hostname);
  const ca = caCert?.trim() ? caCert.replace(/\\n/g, "\n") : undefined;

  return {
    connectionString: url.toString(),
    ssl: localPlaintext ? false : { rejectUnauthorized: true, ...(ca ? { ca } : {}) },
    max: POOL_MAX,
    idleTimeoutMillis: IDLE_TIMEOUT_MS,
    connectionTimeoutMillis: CONNECTION_TIMEOUT_MS,
    // Sent as a startup parameter. Supabase's transaction pooler does not apply session
    // settings, so `query_timeout` is the client-side backstop that always applies.
    statement_timeout: STATEMENT_TIMEOUT_MS,
    query_timeout: STATEMENT_TIMEOUT_MS + 1_000,
    application_name: "pantherwatch-web",
  };
}

interface Client {
  pool: Pool;
  db: NodePgDb;
}

let client: Client | undefined;
let testDb: Db | undefined;

// Created on first use, not at import, so `next build` never needs DATABASE_URL (see env.ts).
function getClient(): Client {
  if (client) return client;

  const pool = new Pool(buildPoolConfig(env.DATABASE_URL, env.DATABASE_CA_CERT));
  // An idle client losing its connection emits 'error' on the pool; unhandled, it would crash
  // the process. The pool discards that client by itself. Only the error name/code is logged.
  pool.on("error", (error: Error & { code?: string }) => {
    console.error("Postgres pool error", error.name, error.code ?? "");
  });
  // Keeps the Fluid compute instance alive until idle connections are closed. node-postgres
  // is the pool type @vercel/functions supports natively ('release' events, idleTimeoutMillis).
  attachDatabasePool(pool);

  client = { pool, db: drizzle(pool, { schema }) };
  return client;
}

/** The database: the test override if one is set, else the lazily created real client. */
export function getDb(): Db {
  return testDb ?? getClient().db;
}

/**
 * Routes `getDb()` (and the `db` proxy) to `database`, e.g. a PGlite instance from
 * `createTestDb()`. Pass `undefined` to restore the real client. Throws outside
 * `NODE_ENV=test` (Vitest sets it) so production code can never swap the database.
 */
export function setDbForTests(database: Db | undefined): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error("setDbForTests() is only allowed when NODE_ENV=test");
  }
  testDb = database;
}

/**
 * Drizzle instance that forwards to `getDb()` on every property access, so it connects lazily
 * and honours `setDbForTests`.
 */
export const db: Db = new Proxy({} as Db, {
  get: (_target, key) => {
    const real = getDb();
    const value: unknown = Reflect.get(real, key, real);
    return typeof value === "function" ? value.bind(real) : value;
  },
});

/**
 * The raw node-postgres pool, created on first use. Always the real database: NOT affected by
 * `setDbForTests`, so code that must run under integration tests should use
 * `db.execute(sql\`...\`)` instead. See the locking note on `Db` before taking any lock.
 */
export function pgPool(): Pool {
  return getClient().pool;
}
