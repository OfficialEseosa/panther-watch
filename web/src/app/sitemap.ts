import type { MetadataRoute } from "next";

/** Public, static pages only (robots.ts keeps crawlers off the dynamic ones). */
const PAGES: Array<{ path: string; changeFrequency: "weekly" | "monthly" | "yearly"; priority: number }> = [
  { path: "/", changeFrequency: "weekly", priority: 1 },
  { path: "/course-search", changeFrequency: "weekly", priority: 0.8 },
  { path: "/developers", changeFrequency: "monthly", priority: 0.5 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.2 },
];

/** /sitemap.xml */
export default function sitemap(): MetadataRoute.Sitemap {
  // APP_URL read raw (no full env validation), like the root layout's metadataBase.
  const origin = (process.env.APP_URL || "https://www.pantherwatch.app").replace(/\/+$/, "");
  return PAGES.map(({ path, changeFrequency, priority }) => ({
    url: path === "/" ? origin : `${origin}${path}`,
    changeFrequency,
    priority,
  }));
}
