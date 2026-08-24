import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "extension-*.spec.mjs",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  reporter: [["list"], ["json", { outputFile: "test-results/extension-transfer.json" }]],
  projects: [
    {
      name: "chromium-extension-transfer",
      testMatch: "extension-transfer.spec.mjs",
    },
    {
      name: "firefox-manual-fallback",
      testMatch: "extension-firefox-fallback.spec.mjs",
      use: { browserName: "firefox" },
    },
  ],
  use: {
    baseURL: "http://127.0.0.1:4173",
    headless: true,
  },
  webServer: {
    command: "pnpm --filter @coredrill/web dev --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
