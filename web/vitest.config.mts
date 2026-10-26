import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      // The real package throws outside the `react-server` condition; app modules that import
      // it must still be loadable in tests.
      "server-only": fileURLToPath(new URL("./tests/helpers/server-only.ts", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "tests/**/*.test.ts"],
    setupFiles: ["./tests/setup.ts"],
    // PGlite boot + migrations and the local fake-GoSolar round trips take a few seconds.
    // With every file booting its own PGlite in parallel, beforeAll can take far longer than
    // one file run alone, so hooks get extra headroom.
    testTimeout: 20_000,
    hookTimeout: 60_000,
  },
});
