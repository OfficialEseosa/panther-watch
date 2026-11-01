import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // Inlined at build time: sitemap.xml's lastModified (a runtime new Date() would make it dynamic).
  env: { BUILD_TIME: new Date().toISOString() },
};

export default nextConfig;
