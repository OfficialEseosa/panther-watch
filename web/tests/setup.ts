/**
 * Vitest `setupFiles`: fixed, obviously fake env so `@/lib/env` validates and no test can pick
 * up a developer's real secrets or database from the shell. Tests never connect to
 * DATABASE_URL; integration tests route `getDb()` to PGlite with `setDbForTests`.
 */
const testEnv: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgres://unused",
  JWT_SECRET: "test-jwt-secret-".padEnd(64, "x"),
  APP_URL: "http://localhost:3000",
  CRON_SECRET: "test-cron-secret-".padEnd(48, "x"),
  GOOGLE_CLIENT_ID: "test-google-client-id.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
  RESEND_API_KEY: "re_test_dummy_key",
};

for (const [key, value] of Object.entries(testEnv)) process.env[key] = value;
// Unset so every test file starts from the same env; files that need these set them first.
delete process.env.DATABASE_CA_CERT;
delete process.env.ADMIN_EMAILS;
