import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("discovers a manually saved job through normal Pipeline navigation offline", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(120_000);
  page.setDefaultTimeout(10_000);
  const pageErrors = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  const external = [];
  await page.route("**/*", async (route) => {
    if (route.request().url().startsWith("http://127.0.0.1:4181/")) return route.continue();
    external.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  await page.goto("/");
  await expect(
    page.getByRole("button", { name: "Browser vault: Local workspace. Vault health not checked" }),
  ).toBeVisible();
  await page.waitForFunction(
    () => globalThis.coredrillOfflineShell?.getState().registered === true,
  );
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.waitForFunction(
    () => globalThis.coredrillAppShell !== undefined && navigator.serviceWorker.controller !== null,
  );
  await context.setOffline(true);
  expect(await page.evaluate(() => globalThis.coredrillReferenceShellCatalog)).toBeUndefined();
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Pipeline", exact: true })
    .click();
  await expect(page.getByText("No stored jobs yet.", { exact: false })).toBeVisible();
  await expect(page.locator("[data-board-job]")).toHaveCount(0);
  await expect(page.getByText("Northstar Health", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("menuitem", { name: /Add job/u }).click();
  const capture = page.getByRole("dialog");
  await capture.getByLabel(/Job title/u).fill("Synthetic discoverable local role");
  await capture.getByLabel(/Company/u).fill("Synthetic Navigation Lab");
  await capture.getByLabel(/Notes or listing details/u).fill("Build truthful offline navigation.");
  await capture.getByRole("button", { name: "Save to capture inbox" }).click();
  await expect(capture.getByRole("status")).toContainText("Stored in the local capture inbox");
  await capture.getByRole("button", { name: "Close capture dialog" }).click();
  await page.locator('[data-pipeline-view-option="inbox"]').click();
  const review = page.getByTestId("capture-review");
  await review.getByRole("button", { name: "Accept high-confidence fields" }).click();
  await review.getByRole("button", { name: "Save as new job" }).click();
  await expect(review.getByText("No durable captures yet")).toBeVisible();
  await page.locator('[data-pipeline-view-option="board"]').click();
  const board = page.getByTestId("pipeline-board");
  await expect(board.locator("[data-board-job]")).toHaveCount(1);
  await expect(board.locator('[data-board-unassigned="true"]')).toContainText(
    "Synthetic discoverable local role",
  );
  await expect(board).toContainText("Unknown priority");
  await expect(board.getByRole("combobox")).toBeDisabled();
  await page.locator('[data-pipeline-view-option="table"]').click();
  const table = page.getByTestId("pipeline-table");
  await expect(
    table.getByRole("button", { name: "Synthetic discoverable local role", exact: true }),
  ).toBeVisible();
  await expect(table.getByRole("button", { name: /^Edit /u })).toHaveCount(0);
  await table
    .getByRole("button", { name: "Synthetic discoverable local role", exact: true })
    .click();
  await expect(
    page.getByRole("region", { name: "Stored job overview", exact: true }),
  ).toContainText("No sample source, contact, or timeline data is substituted.");
  await expect(page).toHaveURL(/\/jobs\/[a-f0-9-]{36}\/overview$/u);
  // The URL/ID was discovered by normal UI navigation, never read from a test API.
  const discoveredUrl = page.url();
  await page.getByRole("button", { name: "Documents", exact: true }).click();
  const start = page.getByRole("form", { name: "Start local application preparation" });
  await start.getByLabel("Preparation stage name").fill("My local drafting stage");
  await start.getByRole("button", { name: "Start preparation locally" }).click();
  await expect(page.locator('[data-preparation-status="missing"]')).toBeVisible();
  expect(await page.evaluate(() => history.state.pipelineDepth)).toBe(2);
  await page.evaluate(() => {
    const api = globalThis.coredrillStorageSpike;
    globalThis.coredrillPipelineReturnProbe = { api, release: null };
    globalThis.coredrillStorageSpike = {
      ...api,
      pipeline: {
        ...api.pipeline,
        page: async (input) => {
          await new Promise((resolve) => {
            globalThis.coredrillPipelineReturnProbe.release = resolve;
          });
          return api.pipeline.page(input);
        },
      },
    };
  });
  await page.getByRole("button", { name: /Close Job workspace|Back to Pipeline/u }).click();
  await expect(page).toHaveURL(/\/pipeline\?/u);
  await expect(page.locator("[data-job-workspace]")).toHaveCount(0);
  await page.waitForFunction(() => globalThis.coredrillPipelineReturnProbe.release !== null);
  await expect(
    page.getByRole("region", { name: "Stored Pipeline status", exact: true }),
  ).toContainText("Loading local jobs");
  await page.evaluate(() => {
    globalThis.coredrillStorageSpike = globalThis.coredrillPipelineReturnProbe.api;
    globalThis.coredrillPipelineReturnProbe.release();
  });
  await expect(
    table.getByRole("button", { name: "Synthetic discoverable local role", exact: true }),
  ).toBeFocused();
  await page.screenshot({ path: testInfo.outputPath("pipeline-after-close.png"), fullPage: true });
  await page.locator('[data-pipeline-view-option="board"]').click();
  await expect(board.locator('[data-board-unassigned="true"] [data-board-job]')).toHaveCount(0);
  await expect(board).toContainText("My local drafting stage");
  await expect(board.locator("[data-board-job]")).toHaveCount(1);
  await page.reload();
  await expect(board.locator("[data-board-job]")).toHaveCount(1);
  await expect(board).toContainText("Synthetic discoverable local role");
  await page.evaluate(() => {
    globalThis.coredrillStoredPipelineFaultBackup = globalThis.coredrillStorageSpike;
    globalThis.coredrillStorageSpike = {
      ...globalThis.coredrillStorageSpike,
      pipeline: {
        ...globalThis.coredrillStorageSpike.pipeline,
        page: async () => {
          throw new Error("private storage detail must not appear");
        },
      },
    };
  });
  await page.locator('[data-pipeline-view-option="table"]').click();
  await expect(
    page.getByRole("button", { name: "Retry local Pipeline", exact: true }),
  ).toBeVisible();
  await expect(page.getByTestId("pipeline-table")).toHaveCount(0);
  await expect(
    page.getByText("private storage detail must not appear", { exact: false }),
  ).toHaveCount(0);
  await page.evaluate(() => {
    globalThis.coredrillStorageSpike = globalThis.coredrillStoredPipelineFaultBackup;
  });
  await page.getByRole("button", { name: "Retry local Pipeline", exact: true }).click();
  await expect(
    table.getByRole("button", { name: "Synthetic discoverable local role", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  await page.emulateMedia({ forcedColors: "active", reducedMotion: "reduce" });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const axe = await new AxeBuilder({ page }).analyze();
  expect(axe.violations).toEqual([]);
  await testInfo.attach("stored-pipeline-axe.json", {
    body: JSON.stringify(axe),
    contentType: "application/json",
  });
  await page.screenshot({ path: testInfo.outputPath("stored-pipeline-320.png"), fullPage: true });
  expect(external).toEqual([]);
  expect(pageErrors).toEqual([]);
  console.log(
    "STORED_PIPELINE_NAVIGATION_PROOF",
    JSON.stringify({
      offline: true,
      fixtureOptIn: false,
      normalCapture: true,
      discoveredThroughUi: true,
      discoveredUrl,
      peerViews: true,
      reloaded: true,
      queryFailureRetried: true,
      axeViolations: 0,
      externalRequests: 0,
    }),
  );
});
