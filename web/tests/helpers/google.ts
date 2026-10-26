/**
 * Drives GET /api/auth/google/callback without Google: `mockGoogle()` answers Google's token
 * and userinfo endpoints from `fetch` and passes every other request (fake GoSolar, ...) to the
 * real fetch. Set the identity the next sign-in returns with `google.as(info)`.
 *
 *   const google = mockGoogle();
 *   google.as({ sub: "g-1", email: "new@student.gsu.test", email_verified: true, name: "New" });
 *   const response = await signIn();            // 302 to /dashboard
 *   google.restore();
 */
import { NextRequest } from "next/dist/server/web/spec-extension/request";
import { vi } from "vitest";
import { OAUTH_STATE_COOKIE } from "@/lib/auth/constants";
import type { GoogleUserInfo } from "@/lib/auth/google";
import { TEST_ORIGIN } from "./session";

export interface GoogleIdentity {
  sub: string;
  email: string;
  email_verified?: boolean;
  name?: string | null;
  picture?: string | null;
}

export interface MockGoogle {
  as(identity: GoogleIdentity): void;
  restore(): void;
}

export function mockGoogle(): MockGoogle {
  const realFetch = globalThis.fetch;
  let identity: GoogleIdentity | null = null;
  const spy = vi.spyOn(globalThis, "fetch").mockImplementation(async (input, init) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      return Response.json({ access_token: "test-access-token", token_type: "Bearer", expires_in: 3600 });
    }
    if (url.startsWith("https://www.googleapis.com/oauth2/v3/userinfo")) {
      if (!identity) return Response.json({ error: "no identity configured" }, { status: 401 });
      const info: Partial<GoogleUserInfo> = {
        email_verified: true,
        name: null,
        picture: null,
        ...identity,
      };
      return Response.json(info);
    }
    return realFetch(input, init);
  });
  return {
    as(next) {
      identity = next;
    },
    restore() {
      spy.mockRestore();
    },
  };
}

/** A callback request with a matching state cookie, as Google's redirect would produce. */
export function callbackRequest(state = "test-state"): NextRequest {
  return new NextRequest(`${TEST_ORIGIN}/api/auth/google/callback?code=test-code&state=${state}`, {
    headers: { cookie: `${OAUTH_STATE_COOKIE}=${state}` },
  });
}
