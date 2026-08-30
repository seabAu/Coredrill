import { createHash } from "node:crypto";

import { expect, test } from "@playwright/test";

const vault = Object.freeze({
  id: "0198d9d0-5f9b-7b39-b95a-5d260b3733e6",
  name: "Failure preservation vault",
  createdAt: "2026-08-24T09:00:00.000Z",
  lastOpenedAt: "2026-08-24T09:00:00.000Z",
});

const callHarness = (page, method, argument) =>
  page.evaluate(
    async ({ methodName, value }) => {
      const harness = globalThis.coredrillStorageSpike;
      if (harness === undefined) throw new Error("Storage verification harness is unavailable.");
      return value === undefined ? harness[methodName]() : harness[methodName](value);
    },
    { methodName: method, value: argument },
  );

const openHarness = async (context) => {
  const page = await context.newPage();
  await page.goto("/");
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);
  return page;
};

test("fails closed for denied persistence, quota pressure, profile loss, and corrupt restore", async ({
  browser,
}) => {
  const deniedContext = await browser.newContext();
  await deniedContext.addInitScript(() => {
    globalThis.coredrillPersistRequestCount = 0;
    const original = navigator.storage;
    const synthetic = Object.create(original);
    Object.defineProperties(synthetic, {
      estimate: { value: async () => ({ quota: 1_000, usage: 950 }) },
      persist: {
        value: async () => {
          globalThis.coredrillPersistRequestCount += 1;
          return false;
        },
      },
      persisted: { value: async () => false },
    });
    Object.defineProperty(navigator, "storage", { configurable: true, value: synthetic });
  });
  const deniedPage = await openHarness(deniedContext);
  await callHarness(deniedPage, "delete");
  const denied = await callHarness(deniedPage, "openAndMigrate");
  const passiveHealth = await callHarness(deniedPage, "storageHealth");
  expect(await deniedPage.evaluate(() => globalThis.coredrillPersistRequestCount)).toBe(0);
  expect(passiveHealth).toMatchObject({
    expectedDatabase: "not-required",
    persistence: "denied",
    quota: "low",
  });
  expect(denied.diagnostics).toMatchObject({ health: "degraded", persistence: "best-effort" });
  expect(denied.diagnostics.details).toEqual(
    expect.arrayContaining([
      "storage-persistence:denied",
      "storage-quota:low",
      "storage-warning:persistence-not-granted",
      "storage-warning:quota-low",
    ]),
  );
  const deniedRequest = await callHarness(deniedPage, "requestPersistentStorage");
  expect(await deniedPage.evaluate(() => globalThis.coredrillPersistRequestCount)).toBe(1);
  expect(deniedRequest).toMatchObject({ persistence: "denied", quota: "low" });
  await callHarness(deniedPage, "delete");
  await deniedContext.close();

  const grantedContext = await browser.newContext();
  await grantedContext.addInitScript(() => {
    globalThis.coredrillPersistRequestCount = 0;
    const original = navigator.storage;
    const synthetic = Object.create(original);
    Object.defineProperties(synthetic, {
      estimate: { value: async () => ({ quota: 1_000_000_000, usage: 100_000_000 }) },
      persist: {
        value: async () => {
          globalThis.coredrillPersistRequestCount += 1;
          return true;
        },
      },
      persisted: { value: async () => false },
    });
    Object.defineProperty(navigator, "storage", { configurable: true, value: synthetic });
  });
  const grantedPage = await openHarness(grantedContext);
  await callHarness(grantedPage, "delete");
  await callHarness(grantedPage, "openAndMigrate");
  expect(await grantedPage.evaluate(() => globalThis.coredrillPersistRequestCount)).toBe(0);
  const granted = await callHarness(grantedPage, "requestPersistentStorage");
  expect(await grantedPage.evaluate(() => globalThis.coredrillPersistRequestCount)).toBe(1);
  expect(granted).toMatchObject({ persistence: "granted", quota: "available" });
  await callHarness(grantedPage, "delete");
  await grantedContext.close();

  const errorContext = await browser.newContext();
  await errorContext.addInitScript(() => {
    const original = navigator.storage;
    const synthetic = Object.create(original);
    Object.defineProperties(synthetic, {
      estimate: { value: async () => Promise.reject(new Error("synthetic quota error")) },
      persist: { value: async () => Promise.reject(new Error("synthetic persist error")) },
      persisted: { value: async () => Promise.reject(new Error("synthetic persisted error")) },
    });
    Object.defineProperty(navigator, "storage", { configurable: true, value: synthetic });
  });
  const errorPage = await openHarness(errorContext);
  await callHarness(errorPage, "delete");
  const errored = await callHarness(errorPage, "openAndMigrate");
  expect(errored.diagnostics.details).toEqual(
    expect.arrayContaining([
      "storage-persistence:error",
      "storage-quota:unknown",
      "storage-warning:persistence-not-granted",
      "storage-warning:quota-unknown",
    ]),
  );
  await callHarness(errorPage, "delete");
  await errorContext.close();

  const unsupportedContext = await browser.newContext();
  await unsupportedContext.addInitScript(() => {
    const original = navigator.storage;
    const synthetic = Object.create(original);
    Object.defineProperties(synthetic, {
      estimate: { value: async () => ({ quota: 1_000_000, usage: 100_000 }) },
      persist: { value: undefined },
      persisted: { value: undefined },
    });
    Object.defineProperty(navigator, "storage", { configurable: true, value: synthetic });
  });
  const unsupportedPage = await openHarness(unsupportedContext);
  await callHarness(unsupportedPage, "delete");
  const unsupported = await callHarness(unsupportedPage, "openAndMigrate");
  expect(unsupported.diagnostics.details).toEqual(
    expect.arrayContaining([
      "storage-persistence:unsupported",
      "storage-warning:persistence-not-granted",
    ]),
  );
  await callHarness(unsupportedPage, "delete");
  await unsupportedContext.close();

  const sourceContext = await browser.newContext();
  const sourcePage = await openHarness(sourceContext);
  await callHarness(sourcePage, "delete");
  await callHarness(sourcePage, "openAndMigrate");
  const reminderNow = Date.UTC(2026, 7, 29, 12);
  const initialReminder = await callHarness(sourcePage, "getBrowserExportReminder", reminderNow);
  expect(initialReminder.reminder).toEqual({ reason: "never-exported", state: "due" });
  const snoozedReminder = await callHarness(sourcePage, "updateBrowserExportReminder", {
    action: "snooze",
    nowUnixMs: reminderNow,
  });
  expect(snoozedReminder.reminder).toMatchObject({ state: "scheduled" });
  await callHarness(sourcePage, "close");
  await callHarness(sourcePage, "openAndMigrate", { expectedExisting: true });
  await expect(callHarness(sourcePage, "getBrowserExportReminder", reminderNow)).resolves.toEqual(
    snoozedReminder,
  );
  const disabledReminder = await callHarness(sourcePage, "updateBrowserExportReminder", {
    action: "disable",
    nowUnixMs: reminderNow,
  });
  expect(disabledReminder.reminder).toEqual({ state: "off" });
  const enabledReminder = await callHarness(sourcePage, "updateBrowserExportReminder", {
    action: "enable",
    nowUnixMs: reminderNow,
  });
  expect(enabledReminder.reminder).toEqual({ reason: "never-exported", state: "due" });
  const successfulExportReminder = await callHarness(sourcePage, "updateBrowserExportReminder", {
    action: "record-success",
    nowUnixMs: reminderNow,
  });
  expect(successfulExportReminder.reminder).toEqual({
    nextReminderAtUnixMs: reminderNow + 30 * 24 * 60 * 60 * 1_000,
    state: "scheduled",
  });
  await callHarness(sourcePage, "writeVault", vault);
  const portable = await callHarness(sourcePage, "exportPortable");
  const sourceRows = await callHarness(sourcePage, "listVaults");

  const bytes = Buffer.from(portable.bytesBase64, "base64");
  const truncated = bytes.subarray(0, bytes.length - 17);
  const corruptPortable = {
    ...portable,
    byteLength: truncated.byteLength,
    bytesBase64: truncated.toString("base64"),
    sha256: createHash("sha256").update(truncated).digest("hex"),
  };
  await expect(callHarness(sourcePage, "restorePortable", corruptPortable)).rejects.toThrow();
  await expect(callHarness(sourcePage, "listVaults")).resolves.toEqual(sourceRows);

  await callHarness(sourcePage, "delete");
  const missing = await callHarness(sourcePage, "openAndMigrate", { expectedExisting: true });
  expect(missing.diagnostics).toMatchObject({ health: "degraded" });
  expect(missing.diagnostics.details).toContain("storage-warning:expected-database-missing");
  const missingHealth = await callHarness(sourcePage, "storageHealth");
  expect(missingHealth).toMatchObject({ expectedDatabase: "missing" });
  expect((await callHarness(sourcePage, "diagnostics")).details).toContain(
    "storage-warning:expected-database-missing",
  );
  await callHarness(sourcePage, "delete");
  await sourceContext.close();

  const ephemeralContext = await browser.newContext();
  const ephemeralPage = await openHarness(ephemeralContext);
  await callHarness(ephemeralPage, "delete");
  await callHarness(ephemeralPage, "openAndMigrate");
  await callHarness(ephemeralPage, "writeVault", vault);
  await ephemeralContext.close();

  const cleanContext = await browser.newContext();
  const cleanPage = await openHarness(cleanContext);
  const afterPrivateProfileClose = await callHarness(cleanPage, "openAndMigrate", {
    expectedExisting: true,
  });
  expect(afterPrivateProfileClose.diagnostics.details).toContain(
    "storage-warning:expected-database-missing",
  );
  await expect(callHarness(cleanPage, "listVaults")).resolves.toEqual([]);
  await callHarness(cleanPage, "delete");
  await cleanContext.close();

  console.info(
    `STG_FAILURE_PROOF ${JSON.stringify({
      corruptRestorePreservedTarget: true,
      deniedPersistence: true,
      erroredPersistence: true,
      ephemeralProfileLossDetected: true,
      explicitPersistenceRequestOnly: true,
      exportReminderPreferencePersisted: true,
      exportReminderUserControls: true,
      expectedDatabaseMissing: true,
      grantedPersistence: true,
      quotaLow: true,
      quotaUnknown: true,
      unsupportedPersistence: true,
    })}`,
  );
});
