import "server-only";
import { z } from "zod";

const schema = z.object({
  DATABASE_URL: z.string().regex(/^postgres(ql)?:\/\//, "must be a postgres:// URL"),
  /** Supabase root CA (PEM, multi-line or with literal "\n" escapes). See buildPoolConfig in src/db. */
  DATABASE_CA_CERT: z
    .string()
    .optional()
    .refine((value) => !value?.trim() || value.includes("-----BEGIN CERTIFICATE-----"), {
      message: "must be a PEM certificate",
    }),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  JWT_SECRET: z.string().min(32, "must be at least 32 characters"),
  RESEND_API_KEY: z.string().min(1),
  CRON_SECRET: z.string().min(32, "must be at least 32 characters"),
  /** A bare origin (scheme://host[:port]), no path, query or trailing slash. */
  APP_URL: z
    .url({ protocol: /^https?$/ })
    .transform((url) => url.replace(/\/+$/, ""))
    .refine((url) => new URL(url).origin === url, {
      message: "must be an origin like https://example.com (no path, query or credentials)",
    }),
  /**
   * Overrides GoSolar's base URL (https://host/StudentRegistrationSsb/ssb), e.g. the e2e rig's fake.
   * Read by src/lib/gosolar/config.ts; listed here so a malformed value fails validation.
   */
  GOSOLAR_BASE_URL: z.url({ protocol: /^https?$/ }).optional(),
  /**
   * Enables the e2e-only routes under /api/test (see e2e/README.md). They also require
   * NODE_ENV and VERCEL_ENV to differ from "production", so this does nothing in prod.
   */
  E2E_TEST_SECRET: z.string().min(16, "must be at least 16 characters").optional(),
  ADMIN_EMAILS: z
    .string()
    .optional()
    .transform(
      (value): ReadonlySet<string> =>
        new Set(
          (value ?? "")
            .split(",")
            .map((email) => email.trim().toLowerCase())
            .filter(Boolean),
        ),
    ),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

function loadEnv(): Env {
  if (!cached) {
    const result = schema.safeParse(process.env);
    if (!result.success) {
      throw new Error(`Invalid environment variables:\n${z.prettifyError(result.error)}`);
    }
    cached = result.data;
  }
  return cached;
}

/**
 * Validated server env. Validation is lazy (first property read, then cached) rather than
 * at import time: `next build` evaluates route modules to collect page data, and the build
 * machine does not need runtime secrets. A missing variable therefore fails the first
 * request that needs it, with a message naming every invalid variable.
 */
export const env: Env = new Proxy({} as Env, {
  get: (_target, key) => Reflect.get(loadEnv(), key),
});
