import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";
import { inspectPortableArchiveV1 } from "../packages/storage-core/dist/index.js";
import { initializeDefaultWorkspace } from "./production-workspace.mjs";
import { exerciseNormalVaultPreparation } from "./normal-vault-export-journey.mjs";

test("normal offline Settings records exact byte verification and retains honest history without treating handoff as success", async ({
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
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const history = page.getByRole("region", { name: "Verified export history", exact: true });
  await expect(history).toContainText("No export verification observations");
  const disable = history.getByRole("button", { name: "Turn off export reminders", exact: true });
  await disable.focus();
  await disable.press("Enter");
  await expect(
    history.getByRole("button", { name: "Turn on export reminders", exact: true }),
  ).toBeVisible();
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
  await expect(history).toContainText("No export verification observations");
  const file = await download.path();
  expect(file).not.toBeNull();
  const bytes = new Uint8Array(await readFile(file));
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  await expect(panel).toContainText(sha256);
  const archive = await inspectPortableArchiveV1({
    bytes,
    expectedSchemaVersion: 182,
    expectedArchiveSha256: sha256,
  });
  expect(archive.dataFiles).toHaveLength(122);
  expect(download.suggestedFilename()).toMatch(/^coredrill-\d{8}-.+\.coredrill\.zip$/);
  const verify = panel.getByLabel("Verify a saved local copy", { exact: true });
  await verify.setInputFiles({
    name: "wrong.zip",
    mimeType: "application/zip",
    buffer: Buffer.from([1, 2, 3]),
  });
  await expect(panel.getByRole("alert")).toContainText("No copy was verified");
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(before);
  await verify.setInputFiles(file);
  await expect(panel.getByRole("status")).toContainText("selected local copy matches");
  await expect(panel).toContainText("Historical byte verification recorded");
  await expect(history).toContainText(sha256);
  await expect(history).toContainText("Selected local copy hash match");
  await expect(
    history.getByRole("button", { name: "Turn on export reminders", exact: true }),
  ).toBeVisible();
  const stored = await page.evaluate(
    async (vaultId) => globalThis.coredrillStorageSpike.vaultExport.readVerifications({ vaultId }),
    archive.manifest.vault.id,
  );
  expect(stored).toMatchObject({
    ok: true,
    value: {
      history: {
        observations: [
          {
            archiveId: archive.manifest.archiveId,
            archiveCreatedAt: archive.manifest.createdAt,
            schemaVersion: 182,
            byteLength: bytes.length,
            sha256,
            method: "selected_local_copy",
          },
        ],
      },
      reminder: { enabled: false },
    },
  });
  expect(stored.value.history.observations).toHaveLength(1);
  expect(stored.value.reminder.lastSuccessfulExportAtUnixMs).toBe(
    Date.parse(stored.value.history.observations[0].verifiedAt),
  );
  const warning = await page.evaluate(async () =>
    globalThis.coredrillStorageSpike.prepareVaultDeletion(),
  );
  expect(warning).toMatchObject({
    ok: true,
    value: { lastSuccessfulPortableExportAt: stored.value.history.observations[0].verifiedAt },
  });
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
  const [nextDownload] = await Promise.all([
    page.waitForEvent("download"),
    panel.getByRole("button", { name: "Download prepared archive", exact: true }).click(),
  ]);
  const nextBytes = new Uint8Array(await readFile(await nextDownload.path()));
  const nextArchive = await inspectPortableArchiveV1({
    bytes: nextBytes,
    expectedSchemaVersion: 182,
  });
  const settingsFile = nextArchive.dataFiles.find(({ path }) => path === "data/app_setting.json");
  expect(settingsFile).toBeDefined();
  const settings = JSON.parse(new TextDecoder().decode(settingsFile.bytes));
  expect(
    settings.rows.find(({ key }) => key === "vault-export-verifications-v1").json_value,
  ).toEqual(stored.value.history);
  for (const original of archive.dataFiles.filter(
    ({ format, logicalName }) => format === "json" && logicalName !== "app_setting",
  )) {
    const next = nextArchive.dataFiles.find(({ path }) => path === original.path);
    expect(JSON.parse(new TextDecoder().decode(next.bytes)).rows).toEqual(
      JSON.parse(new TextDecoder().decode(original.bytes)).rows,
    );
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.reload();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Prepare portable archive", exact: true }),
  ).toBeDisabled();
  await expect(history).toContainText(sha256);
  await expect(history.getByRole("listitem")).toHaveCount(1);
  await expect(
    history.getByRole("button", { name: "Turn on export reminders", exact: true }),
  ).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  expect(
    (await new AxeBuilder({ page }).include('[aria-label="Verified export history"]').analyze())
      .violations,
  ).toEqual([]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
    ),
  ).toBe(true);
  await history.screenshot({ path: testInfo.outputPath("export-verification-history-320.png") });
  expect(errors).toEqual([]);
  expect(external).toEqual([]);
  await testInfo.attach("normal-vault-export-proof.json", {
    body: JSON.stringify({
      normalSettingsPreparation: true,
      browserDownloadHandoff: true,
      selectedCopySha256Verified: sha256,
      sourceUnchangedBeforeVerification: true,
      nonSettingDatasetRowsUnchanged: true,
      nativeSaveProven: false,
      restoreProven: false,
      persistedVerificationHistoryProven: true,
      disabledReminderPreserved: true,
      verificationHistoryIncludedInNextArchive: true,
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
  await page.getByRole("button", { name: "Review vault deletion", exact: true }).click();
  const deletionTrigger = page.getByRole("button", { name: "Delete local vault", exact: true });
  await expect(deletionTrigger).toBeEnabled();
  await panel.getByRole("checkbox").check();
  await panel.getByRole("button", { name: "Prepare portable archive", exact: true }).click();
  await expect(
    panel.getByRole("button", { name: "Preparing archive…", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Review vault deletion", exact: true }),
  ).toBeDisabled();
  await expect(deletionTrigger).toBeDisabled();
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
  await page.getByRole("button", { name: "Review vault deletion", exact: true }).click();
  await expect(deletionTrigger).toBeEnabled();
  expect(await page.evaluate(() => globalThis.coredrillExportPrepareCalls)).toBe(1);
});

test("verified copy survives lost record acknowledgement and explicit record-only retry is idempotent", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  await page.evaluate(() => {
    const api = globalThis.coredrillStorageSpike;
    const record = api.vaultExport.recordVerification;
    globalThis.coredrillRecordCalls = 0;
    globalThis.coredrillFileReads = 0;
    const read = File.prototype.arrayBuffer;
    File.prototype.arrayBuffer = function () {
      globalThis.coredrillFileReads += 1;
      return read.call(this);
    };
    globalThis.coredrillStorageSpike = {
      ...api,
      vaultExport: {
        ...api.vaultExport,
        recordVerification: async (input) => {
          globalThis.coredrillRecordCalls += 1;
          const result = await record(input);
          if (globalThis.coredrillRecordCalls === 1) {
            globalThis.coredrillFirstRecordInput = JSON.stringify(input);
            await new Promise((resolve) => {
              globalThis.coredrillReleaseRecord = resolve;
            });
            throw new Error("PRIVATE_RECORD_ACK_PATH");
          }
          globalThis.coredrillRetryRecordInput = JSON.stringify(input);
          return result;
        },
      },
    };
  });
  const panel = await exerciseNormalVaultPreparation(page, "browser");
  let downloads = 0;
  page.on("download", () => {
    downloads += 1;
  });
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    panel.getByRole("button", { name: "Download prepared archive", exact: true }).click(),
  ]);
  await panel
    .getByLabel("Verify a saved local copy", { exact: true })
    .setInputFiles(await download.path());
  await expect
    .poll(() => page.evaluate(() => typeof globalThis.coredrillReleaseRecord))
    .toBe("function");
  await expect(panel).toContainText("selected local copy matches");
  await expect(
    page.getByRole("button", { name: "Review vault deletion", exact: true }),
  ).toBeDisabled();
  await expect(
    panel.getByRole("button", { name: "Discard prepared archive", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Pipeline", exact: true })
    .click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await page.setViewportSize({ width: 320, height: 900 });
  await expect(
    panel.getByRole("button", { name: "Discard prepared archive", exact: true }),
  ).toBeDisabled();
  await page.evaluate(() => globalThis.coredrillReleaseRecord());
  await expect(panel.getByRole("alert")).toContainText("copy was verified");
  await expect(panel.getByRole("status")).toContainText("selected local copy matches");
  await expect(page.locator("body")).not.toContainText("PRIVATE_RECORD_ACK_PATH");
  const history = page.getByRole("region", { name: "Verified export history", exact: true });
  await history.getByRole("button", { name: "Refresh verification history", exact: true }).click();
  await expect(history.getByRole("listitem")).toHaveCount(1);
  await history.getByRole("button", { name: "Turn off export reminders", exact: true }).click();
  await expect(
    history.getByRole("button", { name: "Turn on export reminders", exact: true }),
  ).toBeVisible();
  const beforeRetry = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  const retry = panel.getByRole("button", {
    name: "Retry recording verification only",
    exact: true,
  });
  await retry.focus();
  await retry.press("Enter");
  await expect(panel).toContainText("Historical byte verification recorded");
  await expect(retry).toHaveCount(0);
  await expect(history.getByRole("listitem")).toHaveCount(1);
  await expect(
    history.getByRole("button", { name: "Turn on export reminders", exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(beforeRetry);
  const calls = await page.evaluate(() => ({
    records: globalThis.coredrillRecordCalls,
    reads: globalThis.coredrillFileReads,
    original: globalThis.coredrillFirstRecordInput,
    retry: globalThis.coredrillRetryRecordInput,
  }));
  expect(calls).toMatchObject({ records: 2, reads: 1 });
  expect(calls.retry).toBe(calls.original);
  expect(downloads).toBe(1);
  expect(
    (await new AxeBuilder({ page }).include('[aria-label="Local vault settings"]').analyze())
      .violations,
  ).toEqual([]);
  await testInfo.attach("export-verification-record-only-retry-proof.json", {
    body: JSON.stringify({
      recordCalls: 2,
      fileReads: 1,
      downloads,
      exactOriginalEvidenceRetained: true,
      unchangedSqliteOnRetry: true,
      disabledReminderPreserved: true,
      navigationReflowRetained: true,
      simulatedLostAcknowledgementAfterRealCommit: true,
    }),
    contentType: "application/json",
  });
});

test("history loading and private read errors stay honest and explicit retry reads actual stored state", async ({
  page,
}) => {
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  await page.evaluate(() => {
    const api = globalThis.coredrillStorageSpike;
    const read = api.vaultExport.readVerifications;
    globalThis.coredrillHistoryReadCalls = 0;
    globalThis.coredrillStorageSpike = {
      ...api,
      vaultExport: {
        ...api.vaultExport,
        readVerifications: async (input) => {
          globalThis.coredrillHistoryReadCalls += 1;
          if (globalThis.coredrillHistoryReadCalls === 1) {
            await new Promise((resolve) => {
              globalThis.coredrillReleaseHistoryRead = resolve;
            });
            throw new Error("PRIVATE_HISTORY_SQL_PATH");
          }
          return read(input);
        },
      },
    };
  });
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const history = page.getByRole("region", { name: "Verified export history", exact: true });
  await expect(history.getByRole("status")).toContainText("Reading local");
  await expect(history).not.toContainText("No export verification observations");
  await page.evaluate(() => globalThis.coredrillReleaseHistoryRead());
  await expect(history.getByRole("alert")).toContainText("could not be read");
  await expect(page.locator("body")).not.toContainText("PRIVATE_HISTORY_SQL_PATH");
  await history.getByRole("button", { name: "Refresh verification history", exact: true }).click();
  await expect(history).toContainText("No export verification observations");
  expect(await page.evaluate(() => globalThis.coredrillHistoryReadCalls)).toBe(2);
  await history.getByRole("button", { name: "Remind me in seven days", exact: true }).click();
  const snoozed = await page.evaluate(async () => {
    const api = globalThis.coredrillStorageSpike;
    const inspected = await api.vault.inspect();
    return api.vaultExport.readVerifications({ vaultId: inspected.value.vault.id });
  });
  expect(snoozed).toMatchObject({
    ok: true,
    value: { reminder: { enabled: true, lastSuccessfulExportAtUnixMs: null } },
  });
  const snoozeTime = new Date(snoozed.value.reminder.snoozedUntilUnixMs).toISOString();
  await expect(history).toContainText(snoozeTime);
  await page.reload();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(history).toContainText(snoozeTime);
  await history.getByRole("button", { name: "Turn off export reminders", exact: true }).click();
  await history.getByRole("button", { name: "Turn on export reminders", exact: true }).click();
  await expect(history).toContainText("consider making a verified copy");
});

test("an abandoned history read cannot replace the newer Settings view or expose private errors", async ({
  page,
}) => {
  await page.goto("/");
  await initializeDefaultWorkspace(page);
  const before = await page.evaluate(
    async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
  );
  await page.evaluate(() => {
    const api = globalThis.coredrillStorageSpike;
    const read = api.vaultExport.readVerifications;
    globalThis.coredrillHistoryReads = 0;
    globalThis.coredrillStorageSpike = {
      ...api,
      vaultExport: {
        ...api.vaultExport,
        readVerifications: async (input) => {
          globalThis.coredrillHistoryReads += 1;
          if (globalThis.coredrillHistoryReads === 1) {
            await new Promise((resolve) => {
              globalThis.coredrillReleaseOldHistory = resolve;
            });
            throw new Error("PRIVATE_ABANDONED_HISTORY_PATH");
          }
          return read(input);
        },
      },
    };
  });
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  const history = page.getByRole("region", { name: "Verified export history", exact: true });
  await expect(history.getByRole("status")).toContainText("Reading local");
  await page
    .getByRole("navigation", { name: "Primary", exact: true })
    .getByRole("link", { name: "Pipeline", exact: true })
    .click();
  await page.getByRole("link", { name: "Settings", exact: true }).click();
  await expect(history).toContainText("No export verification observations");
  await page.evaluate(() => globalThis.coredrillReleaseOldHistory());
  await expect(history.getByRole("alert")).toHaveCount(0);
  await expect(history).toContainText("No export verification observations");
  await expect(page.locator("body")).not.toContainText("PRIVATE_ABANDONED_HISTORY_PATH");
  expect(
    await page.evaluate(
      async () => (await globalThis.coredrillStorageSpike.exportPortable()).sha256,
    ),
  ).toBe(before);
});
