import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { inspectPortableArchiveV1 } from "../packages/storage-core/dist/index.js";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";
import { exerciseNormalVaultPreparation } from "./normal-vault-export-journey.mjs";

test("normal offline Settings prepares, downloads and verifies the exact portable archive without inventing backup history", async ({
  page,
  context,
}, testInfo) => {
  test.setTimeout(90_000);
  const errors = [];
  const external = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/*", (route) => {
    if (route.request().url().startsWith("http://127.0.0.1:4181/")) return route.continue();
    external.push(route.request().url());
    return route.abort("blockedbyclient");
  });
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole("navigation", { name: "Primary", exact: true })).toBeVisible();
  await context.setOffline(true);
  const before = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  const panel = await exerciseNormalVaultPreparation(page, "browser");
  const snapshot = await panel.locator("dl").textContent();
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Pipeline", exact: true })
    .click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(panel.locator("dl")).toHaveText(snapshot);
  await page.setViewportSize({ width: 320, height: 900 });
  const overflow = await page.evaluate(() =>
    [...document.querySelectorAll("body *")]
      .filter(
        (element) =>
          element.getBoundingClientRect().right > document.documentElement.clientWidth + 1,
      )
      .slice(-15)
      .map((element) => ({
        tag: element.tagName,
        className: element.className,
        width: element.getBoundingClientRect().width,
        text: element.textContent?.slice(0, 100),
      })),
  );
  if (overflow.length) console.info(`EXPORT_REFLOW ${JSON.stringify(overflow)}`);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  expect(
    (await new AxeBuilder({ page }).include('[aria-label="Portable vault export"]').analyze())
      .violations,
  ).toEqual([]);
  await panel.screenshot({ path: testInfo.outputPath("normal-vault-export-320.png") });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    panel.getByRole("button", { name: "Download prepared archive", exact: true }).click(),
  ]);
  await expect(panel.getByRole("status")).toContainText("A saved file has not been confirmed");
  const file = await download.path();
  expect(file).not.toBeNull();
  const bytes = new Uint8Array(await readFile(file));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await expect(panel).toContainText(sha256);
  const archive = await inspectPortableArchiveV1({
    bytes,
    expectedSchemaVersion: 160,
    expectedArchiveSha256: sha256,
  });
  expect(archive.dataFiles).toHaveLength(114);
  expect(download.suggestedFilename()).toMatch(/^coredrill-\d{8}-.+\.coredrill\.zip$/);
  const verify = panel.getByLabel("Verify a saved local copy", { exact: true });
  await verify.setInputFiles({
    name: "wrong.zip",
    mimeType: "application/zip",
    buffer: Buffer.from([1, 2, 3]),
  });
  await expect(panel.getByRole("alert")).toContainText("No copy was verified");
  await verify.setInputFiles(file);
  await expect(panel.getByRole("status")).toContainText("selected local copy matches");
  await expect(panel.getByRole("status")).toContainText("no backup timestamp was recorded");
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(before);
  await panel.getByRole("button", { name: "Discard prepared archive", exact: true }).click();
  await expect(panel.getByRole("checkbox")).not.toBeChecked();
  await expect(
    panel.getByRole("heading", { name: "Prepared archive snapshot", exact: true }),
  ).toHaveCount(0);
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "Prepare portable archive", exact: true }).click();
  await expect(
    panel.getByRole("heading", { name: "Prepared archive snapshot", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Prepare portable archive", exact: true }),
  ).toBeDisabled();
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  await testInfo.attach("normal-vault-export-proof.json", {
    body: JSON.stringify({
      normalSettingsPreparation: true,
      browserDownloadHandoff: true,
      selectedCopySha256Verified: sha256,
      sourceUnchanged: true,
      nativeSaveProven: false,
      restoreProven: false,
      persistedBackupHistoryProven: false,
    }),
    contentType: "application/json",
  });
});

test("held export remains single-flight across navigation and reports a private preparation failure safely", async ({
  page,
}) => {
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  await page.evaluate(() => {
    const api = globalThis.coredrillStorageSpike;
    globalThis.coredrillExportPrepareCalls = 0;
    globalThis.coredrillStorageSpike = {
      ...api,
      vaultExport: {
        ...api.vaultExport,
        prepare: async () => {
          globalThis.coredrillExportPrepareCalls += 1;
          await new Promise((resolve) => {
            globalThis.coredrillReleaseExport = resolve;
          });
          throw new Error("PRIVATE_SYNTHETIC_VAULT_PATH");
        },
      },
    };
  });
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const panel = page.getByRole("region", { name: "Portable vault export", exact: true });
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "Prepare portable archive", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Preparing archive…", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Review vault deletion", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Pipeline", exact: true })
    .click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Preparing archive…", exact: true }),
  ).toBeDisabled();
  expect(await page.evaluate(() => globalThis.coredrillExportPrepareCalls)).toBe(1);
  await page.evaluate(() => globalThis.coredrillReleaseExport());
  await expect(panel.getByRole("alert")).toHaveText(
    "A complete archive could not be prepared. No file was saved.",
  );
  await expect(page.locator("body")).not.toContainText("PRIVATE_SYNTHETIC_VAULT_PATH");
  await expect(
    panel.getByRole("button", { name: "Prepare portable archive", exact: true }),
  ).toBeEnabled();
  expect(await page.evaluate(() => globalThis.coredrillExportPrepareCalls)).toBe(1);
});
