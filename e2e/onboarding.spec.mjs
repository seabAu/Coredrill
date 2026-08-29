import { writeFile } from "node:fs/promises";

import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

const openOnboarding = async (page, options = {}) => {
  const parameters = new URLSearchParams(options).toString();
  await page.goto(`/onboarding.html${parameters.length > 0 ? `?${parameters}` : ""}`);
  await expect(
    page.getByRole("heading", { name: "Start with one job, or set up the whole workspace" }),
  ).toBeVisible();
  await page.waitForFunction(() => globalThis.coredrillOnboarding !== undefined);
};

const getCatalogState = (page) =>
  page.evaluate(() => {
    if (globalThis.coredrillOnboarding === undefined) throw new Error("Onboarding API is missing.");
    return globalThis.coredrillOnboarding.getState();
  });

const attachProof = async (page, testInfo, name) => {
  const screenshotPath = testInfo.outputPath(`${name}.png`);
  await page.screenshot({ fullPage: true, path: screenshotPath });
  await testInfo.attach(`${name}.png`, { path: screenshotPath, contentType: "image/png" });
};

const attachAxe = async (page, testInfo, name) => {
  const results = await new AxeBuilder({ page }).analyze();
  expect(results.violations).toEqual([]);
  const axePath = testInfo.outputPath(`${name}-axe.json`);
  await writeFile(axePath, `${JSON.stringify(results, null, 2)}\n`, "utf8");
  await testInfo.attach(`${name}-axe.json`, { path: axePath, contentType: "application/json" });
};

test("chooser explains the accountless local baseline and makes every path optional", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4179/")) externalRequests.push(request.url());
  });
  await page.setViewportSize({ width: 1280, height: 900 });
  await openOnboarding(page);

  await expect(page.getByText("No account · local first")).toBeVisible();
  await expect(page.getByText(/vault lives on this device/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /Quick start/ })).toBeVisible();
  await expect(page.getByRole("button", { name: /Guided setup/ })).toBeVisible();
  await expect(page.getByRole("button", { name: "Explore demo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Skip setup and go to Home" })).toBeVisible();
  await attachAxe(page, testInfo, "chooser-local-first");
  await attachProof(page, testInfo, "chooser-local-first");
  expect(externalRequests).toEqual([]);
});

test("quick start creates one user job and converges on its Overview without profile setup", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4179/")) externalRequests.push(request.url());
  });
  await openOnboarding(page);

  await page.getByRole("button", { name: /Quick start/ }).click();
  await expect(
    page.getByRole("heading", { name: "Your vault stays on this device" }),
  ).toBeVisible();
  await expect(page.getByText("No account or remote database")).toBeVisible();
  await expect(page.getByLabel("Vault name")).toHaveValue("My job search");
  await page.getByRole("button", { name: /Create with safe defaults/ }).click();

  await page.getByLabel("Job title").fill("Research Operations Lead");
  await page.getByLabel("Company").fill("Fictional Meridian Labs");
  await page.getByRole("button", { name: /Review job/ }).click();
  await expect(page.getByRole("heading", { name: "Review before saving" })).toBeVisible();
  await expect(page.getByText("Career Profile can wait")).toBeVisible();
  await expect(page.getByText("Manual · confirmed")).toBeVisible();
  await page.getByRole("button", { name: "Create vault and open job overview" }).click();

  await expect(page.getByRole("heading", { name: "Your first job is ready" })).toBeVisible();
  const completionState = await getCatalogState(page);
  expect(completionState).toMatchObject({
    activeVaultKind: "user",
    completedDestination: null,
    demoVault: null,
    lastCompletion: {
      destination: "job-overview",
      firstJob: {
        company: "Fictional Meridian Labs",
        method: "manual",
        sourceText: "",
        title: "Research Operations Lead",
      },
      runtime: "browser",
      track: "quick",
      vaultName: "My job search",
    },
    skipped: false,
    userVault: { jobCount: 1, name: "My job search", runtime: "browser" },
  });
  await attachAxe(page, testInfo, "quick-start-complete");
  await attachProof(page, testInfo, "quick-start-complete");

  await page.getByRole("link", { name: "Open job overview" }).click();
  await expect
    .poll(async () => (await getCatalogState(page)).completedDestination)
    .toBe("job-overview");
  expect(externalRequests).toEqual([]);
});

test("quick and guided tracks can both finish later and converge on Home", async ({ page }) => {
  await openOnboarding(page);
  await page.getByRole("button", { name: /Quick start/ }).click();
  await page.getByRole("button", { name: "Finish later" }).click();
  await expect(page.getByRole("heading", { name: "Your workspace is ready" })).toBeVisible();
  expect(await getCatalogState(page)).toMatchObject({
    activeVaultKind: "none",
    lastCompletion: null,
    skipped: true,
    userVault: null,
  });
  await page.getByRole("link", { name: "Go to Home" }).click();
  await expect.poll(async () => (await getCatalogState(page)).completedDestination).toBe("home");

  await openOnboarding(page);
  await page.getByRole("button", { name: /Guided setup/ }).click();
  await page.getByRole("button", { name: "Finish later" }).click();
  await expect(page.getByRole("heading", { name: "Your workspace is ready" })).toBeVisible();
  expect(await getCatalogState(page)).toMatchObject({
    activeVaultKind: "none",
    lastCompletion: null,
    skipped: true,
    userVault: null,
  });
});

test("guided setup records reviewed optional choices and converges on Home with no AI call", async ({
  page,
}, testInfo) => {
  const externalRequests = [];
  page.on("request", (request) => {
    if (!request.url().startsWith("http://127.0.0.1:4179/")) externalRequests.push(request.url());
  });
  await openOnboarding(page, { runtime: "desktop", theme: "dark" });

  await page.getByRole("button", { name: /Guided setup/ }).click();
  await expect(page.getByLabel("Desktop app on this device")).toBeChecked();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByLabel("Vault name").fill("Focused search");
  await page.getByLabel("Ask for device unlock when supported").check();
  await page.getByLabel("Configure a backup now").check();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByLabel("Import a resume later").check();
  await page.getByLabel("Import an existing tracker later").check();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByText(/2 import sources are queued/)).toBeVisible();
  await expect(page.getByText("Proposals remain unconfirmed")).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();
  await expect(page.getByLabel("AI disabled")).toBeChecked();
  await expect(page.getByText("Nothing is sent now")).toBeVisible();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.getByLabel("Pair after setup").check();
  await expect(page.getByText("Disabled", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Finish and go to Home" }).click();

  await expect(page.getByRole("heading", { name: "Your workspace is ready" })).toBeVisible();
  expect(await getCatalogState(page)).toMatchObject({
    activeVaultKind: "user",
    completedDestination: null,
    demoVault: null,
    lastCompletion: {
      aiMode: "disabled",
      backup: "configure-now",
      destination: "home",
      extension: "pair",
      imports: ["resume", "tracker"],
      optionalLock: true,
      runtime: "desktop",
      track: "guided",
      vaultName: "Focused search",
    },
    userVault: { jobCount: 0, name: "Focused search", runtime: "desktop" },
  });
  await attachAxe(page, testInfo, "guided-dark-complete");
  await attachProof(page, testInfo, "guided-dark-complete");
  await page.getByRole("link", { name: "Go to Home" }).click();
  await expect.poll(async () => (await getCatalogState(page)).completedDestination).toBe("home");
  expect(externalRequests).toEqual([]);
});

test("guided setup allows each decision to be deferred and preserves safe defaults", async ({
  page,
}) => {
  await openOnboarding(page);
  await page.getByRole("button", { name: /Guided setup/ }).click();

  for (let step = 0; step < 5; step += 1) {
    await expect(page.getByRole("button", { name: "Skip this step" })).toBeVisible();
    await page.getByRole("button", { name: "Skip this step" }).click();
  }
  await expect(page.getByRole("button", { name: "Use safe defaults" })).toBeVisible();
  await page.getByRole("button", { name: "Use safe defaults" }).click();

  expect(await getCatalogState(page)).toMatchObject({
    activeVaultKind: "user",
    lastCompletion: {
      aiMode: "disabled",
      backup: "remind-later",
      destination: "home",
      extension: "later",
      imports: [],
      optionalLock: false,
      runtime: "browser",
      track: "guided",
      vaultName: "My job search",
    },
  });
});

test("disposable demo records remain isolated and are removed before an owned vault starts", async ({
  page,
}, testInfo) => {
  await openOnboarding(page);
  await page.getByRole("button", { name: "Explore demo" }).click();
  await expect(page.getByRole("heading", { name: "A small, synthetic job search" })).toBeVisible();
  await expect(page.getByLabel("Synthetic demo jobs").getByRole("article")).toHaveCount(3);
  expect(await getCatalogState(page)).toMatchObject({
    activeVaultKind: "demo",
    demoVault: {
      isolatedFromUserVault: true,
      kind: "demo",
      lifetime: "session",
      sampleData: "synthetic-v1",
      sampleJobCount: 3,
    },
    userVault: null,
  });
  await attachAxe(page, testInfo, "isolated-demo-vault");
  await attachProof(page, testInfo, "isolated-demo-vault");

  await page.getByRole("button", { name: "Start with my own vault" }).click();
  await expect(
    page.getByRole("heading", { name: "Your vault stays on this device" }),
  ).toBeVisible();
  expect(await getCatalogState(page)).toMatchObject({
    activeVaultKind: "none",
    demoVault: null,
    userVault: null,
  });
});

test("320 pixel forced-colors and reduced-motion layouts reflow without horizontal overflow", async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 320, height: 800 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  await openOnboarding(page, { density: "compact" });
  await page.getByRole("button", { name: /Quick start/ }).click();
  await expect(page.locator("html")).toHaveAttribute("data-motion", "reduced");

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await attachAxe(page, testInfo, "mobile-forced-colors-320");
  await attachProof(page, testInfo, "mobile-forced-colors-320");
});
