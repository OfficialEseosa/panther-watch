import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { APP_ENV, APP_PORT, APP_URL, FAKE_URL } from "./e2e/env";

/**
 * `next dev` locks `.next/dev`, so a second dev server in this folder exits at once. Say so up
 * front instead of failing with "Process from config.webServer was not able to start".
 */
function assertNoOtherDevServer(): void {
  const lock = path.join(__dirname, ".next", "dev", "lock");
  if (!existsSync(lock)) return;
  let info: { pid?: number; appUrl?: string } = {};
  try {
    info = JSON.parse(readFileSync(lock, "utf8"));
    if (info.pid) process.kill(info.pid, 0); // throws when the process is gone (stale lock)
  } catch {
    return;
  }
  throw new Error(
    `Another \`next dev\` (pid ${info.pid}, ${info.appUrl}) holds .next/dev/lock. ` +
      "Stop it before running the e2e suite: the rig starts its own dev server with test-only env.",
  );
}
// Workers load this file too, after the rig's own dev server has taken the lock.
if (!process.env.TEST_WORKER_INDEX) assertNoOtherDevServer();

/**
 * End-to-end tests: a real browser against `next dev` on APP_PORT, backed by a throwaway local
 * Postgres (e2e/pg.ts, started in the global setup) and the fake GoSolar/Resend process
 * (e2e/fake-gosolar-server.ts). See e2e/README.md. Run with `npm run e2e`.
 *
 * Order: Playwright starts the webServers first, then runs globalSetup (Postgres + migrations),
 * then the tests. The app only connects to the database on demand, and its readiness probe
 * (/api/test/health) does not touch it.
 *
 * One worker: every spec shares one database and one fake, and resets them in beforeEach.
 */
export default defineConfig({
  testDir: "./e2e",
  testMatch: "**/*.spec.ts",
  outputDir: "./e2e/.output/test-results",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  // `next dev` compiles each route on first hit, which can take several seconds.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  reporter: [["list"], ["html", { outputFolder: "./e2e/.output/report", open: "never" }]],
  use: {
    baseURL: APP_URL,
    navigationTimeout: 45_000,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile",
      use: { ...devices["Pixel 7"] },
      // API-only flows are viewport-independent, and admin is a desktop tool: run them once.
      testIgnore: ["**/api-flows.spec.ts", "**/admin.spec.ts"],
    },
  ],
  webServer: [
    {
      name: "fake-gosolar",
      command: "npx tsx e2e/fake-gosolar-server.ts",
      url: `${FAKE_URL}/__control/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      stdout: process.env.E2E_SERVER_LOGS ? "pipe" : "ignore",
    },
    {
      name: "next",
      // Dev, not build+start: the /api/test routes refuse NODE_ENV=production by design, and a
      // Cache Components build is slow. It shares .next/dev with `npm run dev`, so stop any other
      // `next dev` in this folder first (Next's dist-dir lock refuses a second one).
      command: `npx next dev --port ${APP_PORT}`,
      url: `${APP_URL}/api/test/health`,
      reuseExistingServer: false,
      timeout: 180_000,
      env: APP_ENV,
      // Set E2E_SERVER_LOGS=1 to see the dev server's request log.
      stdout: process.env.E2E_SERVER_LOGS ? "pipe" : "ignore",
    },
  ],
});
