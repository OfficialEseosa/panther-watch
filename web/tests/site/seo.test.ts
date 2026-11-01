import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "@/app/robots";
import sitemap from "@/app/sitemap";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("robots.txt and sitemap.xml", () => {
  it("lets crawlers see the public pages and keeps them off dynamic, GoSolar-backed ones", () => {
    vi.stubEnv("APP_URL", "https://www.pantherwatch.app");
    const { rules, sitemap: sitemapUrl } = robots();
    const rule = Array.isArray(rules) ? rules[0] : rules;
    expect(rule.userAgent).toBe("*");
    expect(rule.allow).toEqual(["/", "/course-search", "/privacy", "/terms", "/developers"]);
    expect(rule.disallow).toEqual(
      expect.arrayContaining([
        "/api/",
        "/admin",
        "/settings",
        "/tracked-classes",
        "/schedule-builder",
        "/dashboard",
        "/course-results",
      ]),
    );
    expect(sitemapUrl).toBe("https://www.pantherwatch.app/sitemap.xml");
  });

  it("lists exactly the public pages on the APP_URL origin", () => {
    vi.stubEnv("APP_URL", "https://www.pantherwatch.app/");
    const urls = sitemap().map((entry) => entry.url);
    expect(urls).toEqual([
      "https://www.pantherwatch.app",
      "https://www.pantherwatch.app/course-search",
      "https://www.pantherwatch.app/developers",
      "https://www.pantherwatch.app/privacy",
      "https://www.pantherwatch.app/terms",
    ]);
    // Nothing the robots rules disallow.
    expect(urls.some((url) => /\/(api|admin|settings|tracked-classes|schedule-builder|dashboard|course-results)/.test(url))).toBe(false);
  });
});
