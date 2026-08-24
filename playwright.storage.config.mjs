import { defineConfig } from "@playwright/test";

const browserName = process.env["COREDRILL_BROWSER_ENGINE"] ?? "chromium";
const executablePath = process.env["COREDRILL_BROWSER_EXECUTABLE_PATH"];
const channel =
  executablePath === undefined && browserName === "chromium"
    ? (process.env["COREDRILL_BROWSER_CHANNEL"] ??
      (process.platform === "win32" ? "msedge" : "chrome"))
    : undefined;

export default defineConfig({
  testDir: "./e2e",
  testMatch: process.env["COREDRILL_TEST_MATCH"] ?? "storage-*.spec.mjs",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/storage-browser.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4173",
    browserName,
    ...(channel === undefined ? {} : { channel }),
    headless: true,
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath } }),
  },
  webServer: {
    command: "pnpm --filter @coredrill/web dev --port 4173 --strictPort",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
