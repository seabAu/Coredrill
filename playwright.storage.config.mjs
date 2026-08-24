import { defineConfig } from "@playwright/test";

const channel =
  process.env["COREDRILL_BROWSER_CHANNEL"] ?? (process.platform === "win32" ? "msedge" : "chrome");

export default defineConfig({
  testDir: "./e2e",
  testMatch: "storage-browser.spec.mjs",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/storage-browser.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    channel,
    headless: true,
  },
  webServer: {
    command: "pnpm --filter @coredrill/web dev --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
