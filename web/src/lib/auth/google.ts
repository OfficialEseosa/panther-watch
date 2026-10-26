import "server-only";
import { z } from "zod";
import { env } from "@/lib/env";

const AUTHORIZE_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const USERINFO_ENDPOINT = "https://www.googleapis.com/oauth2/v3/userinfo";
const TIMEOUT_MS = 10_000;

const tokensSchema = z.object({
  access_token: z.string().min(1),
  token_type: z.string(),
  expires_in: z.number().optional(),
  scope: z.string().optional(),
  id_token: z.string().optional(),
});

const userInfoSchema = z.object({
  sub: z.string().min(1),
  email: z.string().min(1),
  email_verified: z.boolean().default(false),
  name: z.string().nullish().transform((value) => value ?? null),
  picture: z.string().nullish().transform((value) => value ?? null),
});

/** A failed Google OAuth call. `code` is `<http status>:<google error code>`, safe to log. */
export class GoogleOAuthError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = "GoogleOAuthError";
  }
}

export type GoogleTokens = z.infer<typeof tokensSchema>;
export type GoogleUserInfo = z.infer<typeof userInfoSchema>;

function redirectUri(): string {
  return `${env.APP_URL}/api/auth/google/callback`;
}

export function buildAuthUrl(state: string): string {
  const url = new URL(AUTHORIZE_ENDPOINT);
  url.search = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    redirect_uri: redirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state,
    access_type: "online",
    prompt: "select_account",
  }).toString();
  return url.toString();
}

export async function exchangeCode(code: string): Promise<GoogleTokens> {
  const response = await fetch(TOKEN_ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri(),
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    const code = `${response.status}:${await errorCode(response)}`;
    throw new GoogleOAuthError(`Google token exchange failed (${code})`, code);
  }
  return tokensSchema.parse(await response.json());
}

export async function fetchUserInfo(accessToken: string): Promise<GoogleUserInfo> {
  const response = await fetch(USERINFO_ENDPOINT, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!response.ok) {
    const code = `${response.status}:${await errorCode(response)}`;
    throw new GoogleOAuthError(`Google userinfo failed (${code})`, code);
  }
  return userInfoSchema.parse(await response.json());
}

/** Google's OAuth `error` code only; the rest of the body is not logged. */
async function errorCode(response: Response): Promise<string> {
  try {
    const body: unknown = await response.json();
    if (
      body &&
      typeof body === "object" &&
      "error" in body &&
      typeof body.error === "string" &&
      /^[a-z_]{1,64}$/i.test(body.error)
    ) {
      return body.error;
    }
  } catch {
    // Non-JSON error body.
  }
  return "";
}
