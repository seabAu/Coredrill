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
    const original = navigator.storage;
    const synthetic = Object.create(original);
    Object.defineProperties(synthetic, {
      estimate: { value: async () => ({ quota: 1_000, usage: 950 }) },
      persist: { value: async () => false },
      persisted: { value: async () => false },
    });
    Object.defineProperty(navigator, "storage", { configurable: true, value: synthetic });
  });
  const deniedPage = await openHarness(deniedContext);
  await callHarness(deniedPage, "delete");
  const denied = await callHarness(deniedPage, "openAndMigrate");
  expect(denied.diagnostics).toMatchObject({ health: "degraded", persistence: "best-effort" });
  expect(denied.diagnostics.details).toEqual(
    expect.arrayContaining([
      "storage-persistence:denied",
      "storage-quota:low",
      "storage-warning:persistence-not-granted",
      "storage-warning:quota-low",
    ]),
  );
  await callHarness(deniedPage, "delete");
  await deniedContext.close();

  const sourceContext = await browser.newContext();
  const sourcePage = await openHarness(sourceContext);
  await callHarness(sourcePage, "delete");
  await callHarness(sourcePage, "openAndMigrate");
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
      ephemeralProfileLossDetected: true,
      expectedDatabaseMissing: true,
      quotaLow: true,
    })}`,
  );
});
