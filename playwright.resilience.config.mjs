import { defineConfig } from "@playwright/test";

const executablePath = process.env["COREDRILL_BROWSER_EXECUTABLE_PATH"];
const channel =
  executablePath === undefined
    ? (process.env["COREDRILL_BROWSER_CHANNEL"] ??
      (process.platform === "win32" ? "msedge" : "chrome"))
    : undefined;

export default defineConfig({
  testDir: "./e2e",
  testMatch: [
    "phase-1-resilience.spec.mjs",
    "storage-concurrency.spec.mjs",
    "storage-failures.spec.mjs",
  ],
  outputDir: "test-results/resilience",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/resilience.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4181",
    browserName: "chromium",
    ...(channel === undefined ? {} : { channel }),
    headless: true,
    viewport: { height: 900, width: 1440 },
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath } }),
  },
  webServer: {
    command:
      "pnpm --filter @coredrill/web build && pnpm --filter @coredrill/web exec vite preview --host 127.0.0.1 --port 4181 --strictPort",
    url: "http://127.0.0.1:4181/app-shell.html",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
