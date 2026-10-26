/**
 * Every port, URL and secret the e2e rig uses, in one place. Imported by playwright.config.ts
 * (main process and workers), the global setup and the specs, so the values must be
 * deterministic: no random ports. Override a port with its env var if it is taken.
 *
 * None of these are real credentials. The secrets only have to satisfy src/lib/env.ts.
 */
import os from "node:os";
import path from "node:path";

const port = (name: string, fallback: number) => Number(process.env[name] ?? fallback);

export const APP_PORT = port("E2E_APP_PORT", 3450);
export const GOSOLAR_PORT = port("E2E_GOSOLAR_PORT", 3451);
export const PG_PORT = port("E2E_PG_PORT", 54329);

export const APP_URL = `http://localhost:${APP_PORT}`;
/** The fake's front server (e2e/fake-gosolar-server.ts): control endpoints, fake Resend, GoSolar proxy. */
export const FAKE_URL = `http://127.0.0.1:${GOSOLAR_PORT}`;
export const GOSOLAR_BASE_URL = `${FAKE_URL}/StudentRegistrationSsb/ssb`;
/** The Resend SDK reads RESEND_BASE_URL, so seat alerts go to the fake instead of api.resend.com. */
export const RESEND_BASE_URL = `${FAKE_URL}/resend`;

export const PG_DB = "pantherwatch_e2e";
export const PG_USER = "postgres";
/** Throwaway cluster directory; created by the global setup and deleted by its teardown. */
export const PG_DIR = process.env.E2E_PG_DIR ?? path.join(os.tmpdir(), `pantherwatch-e2e-pg-${PG_PORT}`);
export const DATABASE_URL = `postgres://${PG_USER}@127.0.0.1:${PG_PORT}/${PG_DB}?sslmode=disable`;

export const E2E_TEST_SECRET = "e2e-test-secret-not-for-production";
export const CRON_SECRET = "e2e-cron-secret-0123456789abcdef0123456789abcdef";
export const ADMIN_EMAIL = "admin@e2e.test";

/** The Next server's environment. Every app variable is set, so `.env*` files cannot leak in. */
export const APP_ENV: Record<string, string> = {
  DATABASE_URL,
  DATABASE_CA_CERT: "",
  GOOGLE_CLIENT_ID: "e2e-google-client-id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "e2e-google-client-secret",
  JWT_SECRET: "e2e-jwt-secret-0123456789abcdef0123456789abcdef",
  RESEND_API_KEY: "re_test_e2e",
  RESEND_BASE_URL,
  CRON_SECRET,
  APP_URL,
  ADMIN_EMAILS: ADMIN_EMAIL,
  GOSOLAR_BASE_URL,
  E2E_TEST_SECRET,
  NEXT_TELEMETRY_DISABLED: "1",
};
