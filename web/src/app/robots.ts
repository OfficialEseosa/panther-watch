import type { MetadataRoute } from "next";

/**
 * /robots.txt. Public pages are crawlable; everything dynamic or GoSolar-backed is not:
 * each /course-results or /api/courses hit is a live GoSolar search, and members-only pages
 * just redirect. Scripts should use the JSON API documented on /developers instead.
 */
export default function robots(): MetadataRoute.Robots {
  // APP_URL read raw (no full env validation), like the root layout's metadataBase.
  const origin = (process.env.APP_URL || "https://www.pantherwatch.app").replace(/\/+$/, "");
  return {
    rules: {
      userAgent: "*",
      allow: ["/", "/course-search", "/assistant", "/privacy", "/terms", "/developers"],
      disallow: [
        "/api/",
        "/admin",
        "/settings",
        "/tracked-classes",
        "/schedule-builder",
        "/dashboard",
        "/course-results",
      ],
    },
    sitemap: `${origin}/sitemap.xml`,
  };
}
