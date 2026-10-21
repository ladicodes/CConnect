import { defineConfig, devices } from "@playwright/test";

/**
 * End-to-end tests run against a production build (`npm run build` first),
 * with a private local database and local sign-in that are reset every run.
 * They never touch Supabase or any real deployment.
 */
const PORT = 3200;

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  timeout: 45_000,
  expect: { timeout: 10_000 },
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"] }, testMatch: /public\.spec\.ts/ },
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } }, testIgnore: /public\.spec\.ts/ },
  ],
  webServer: {
    command: "node scripts/local/dev.mjs --production --reset --sample",
    url: `http://localhost:${PORT}/api/health`,
    timeout: 120_000,
    reuseExistingServer: false,
    env: {
      PORT: String(PORT),
      LOCAL_DB_PORT: "54532",
      LOCAL_AUTH_PORT: "54531",
      LOCAL_DATA_DIR: ".local/e2e-postgres",
      SITE_URL: `http://localhost:${PORT}`,
    },
  },
});
