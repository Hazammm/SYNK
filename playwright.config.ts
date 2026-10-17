import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e", fullyParallel: false, workers: 1, timeout: 90_000,
  use: { baseURL: process.env.E2E_BASE_URL ?? "http://localhost:3000", trace: "retain-on-failure", screenshot: "only-on-failure",
    launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"] : [] } },
  webServer: { command: "npm run dev", url: process.env.E2E_BASE_URL ?? "http://localhost:3000", reuseExistingServer: !process.env.CI, timeout: 120_000 },
});
