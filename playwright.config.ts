import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.PAPERTRAIL_E2E_PORT ?? 3100);
const baseURL = `http://localhost:${port}`;

export default defineConfig({
  testDir: "./tests/e2e",
  expect: { timeout: 30_000 },
  use: {
    baseURL,
    trace: "on-first-retry",
  },
  webServer: {
    command: `npm run dev -- -p ${port}`,
    url: baseURL,
    reuseExistingServer: process.env.PAPERTRAIL_E2E_REUSE === "1",
    timeout: 180_000,
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
