import { defineConfig } from "@playwright/test";

const executablePath = process.env["COREDRILL_BROWSER_EXECUTABLE_PATH"];
const channel =
  executablePath === undefined
    ? (process.env["COREDRILL_BROWSER_CHANNEL"] ??
      (process.platform === "win32" ? "msedge" : "chrome"))
    : undefined;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "app-shell.spec.mjs",
  outputDir: "test-results/app-shell",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"], ["json", { outputFile: "test-results/app-shell.json" }]],
  use: {
    baseURL: "http://127.0.0.1:4178",
    browserName: "chromium",
    ...(channel === undefined ? {} : { channel }),
    headless: true,
    ...(executablePath === undefined ? {} : { launchOptions: { executablePath } }),
  },
  webServer: {
    command: "pnpm --filter @coredrill/web dev --port 4178 --strictPort",
    url: "http://127.0.0.1:4178/app-shell.html",
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
