import { NextResponse } from "next/server";
import { clearSessionCookie } from "@/lib/auth/session";
import { env } from "@/lib/env";
import { assertSameOrigin } from "@/lib/http";

export async function POST(request: Request) {
  // Without this, any site could log users out with an auto-submitting form.
  const denied = assertSameOrigin(request);
  if (denied) return denied;

  // 303 so the browser follows the redirect with GET.
  const response = NextResponse.redirect(new URL("/", env.APP_URL), 303);
  clearSessionCookie(response);
  return response;
}
