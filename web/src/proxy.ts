import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE_NAMES } from "@/lib/auth/constants";

/**
 * Cheap routing on cookie presence only: checks that a session cookie exists (under either
 * name: `__Host-pw_session` in production, `pw_session` in development). The token and the
 * user row are checked in the page (`requireUser()` / `requireAdmin()`), so a forged or
 * revoked cookie gets past here but not past the page.
 *
 * - Members-only routes (tracked classes, schedule builder, settings, admin) send signed-out
 *   visitors to `/?next=<path>`. The landing page ignores `next` for now (the login route has
 *   no redirect target); it only explains why they landed there.
 * - `/` sends visitors who have a session cookie to `/dashboard`, so the landing page never
 *   flashes for members (pages.md §1). Dashboard, course search and results are guest-OK and
 *   aren't matched at all. A stale cookie lands on the dashboard's guest view, never a loop.
 */
export function proxy(request: NextRequest) {
  const hasSession = SESSION_COOKIE_NAMES.some((name) => request.cookies.has(name));
  const { pathname, searchParams } = request.nextUrl;

  if (pathname === "/") {
    // Keep the OAuth error banner visible even if an old cookie is still around.
    if (hasSession && !searchParams.has("auth_error")) {
      return NextResponse.redirect(new URL("/dashboard", request.url));
    }
    return NextResponse.next();
  }

  if (!hasSession) {
    const target = new URL("/", request.url);
    target.searchParams.set("next", pathname);
    return NextResponse.redirect(target);
  }
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/",
    "/tracked-classes/:path*",
    "/schedule-builder/:path*",
    "/settings/:path*",
    "/admin/:path*",
  ],
};
