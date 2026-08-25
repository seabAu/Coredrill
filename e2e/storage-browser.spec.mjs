import { expect, test } from "@playwright/test";

const committedVault = Object.freeze({
  id: "0198d9cf-93b7-7a37-8b56-fba6b5f0ce11",
  name: "Phase 0 durable vault",
  createdAt: "2026-08-24T08:00:00.000Z",
  lastOpenedAt: "2026-08-24T08:00:00.000Z",
});

const rolledBackVault = Object.freeze({
  id: "0198d9cf-ae62-7b24-bc7a-1521e48241c2",
  name: "Must roll back",
  createdAt: "2026-08-24T08:01:00.000Z",
  lastOpenedAt: "2026-08-24T08:01:00.000Z",
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

const openHarness = async (context, logs) => {
  const page = await context.newPage();
  page.on("console", (message) => {
    if (message.text().startsWith("COREDRILL_STORAGE ")) logs.push(message.text());
  });
  await page.goto("/");
  await expect(page.getByRole("status")).toHaveText("Harness ready");
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);
  return page;
};

test("opens official SQLite in a Worker, persists transactions, and restores a checksummed export", async ({
  browser,
}) => {
  const logs = [];
  const sourceContext = await browser.newContext();
  const sourcePage = await openHarness(sourceContext, logs);
  const browserVersion = browser.version();
  const expectedBrowserVersion = process.env["COREDRILL_EXPECTED_BROWSER_VERSION"];
  if (expectedBrowserVersion !== undefined) expect(browserVersion).toBe(expectedBrowserVersion);

  await callHarness(sourcePage, "delete");
  const opened = await callHarness(sourcePage, "openAndMigrate");
  expect(opened.appliedVersions).toEqual([
    1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20, 21, 22,
  ]);
  expect(opened.diagnostics).toMatchObject({
    adapterName: "official-sqlite-wasm-opfs-sahpool",
    schemaVersion: 22,
  });
  expect(["ready", "degraded"]).toContain(opened.diagnostics.health);
  expect(["best-effort", "durable"]).toContain(opened.diagnostics.persistence);
  expect(opened.diagnostics.details).toEqual(
    expect.arrayContaining([
      "vfs:opfs-sahpool",
      "foreign-keys:on",
      "thread:dedicated-worker",
      expect.stringMatching(/^storage-persistence:/u),
      expect.stringMatching(/^storage-quota:/u),
    ]),
  );

  await callHarness(sourcePage, "writeVault", committedVault);
  await expect(callHarness(sourcePage, "proveRollback", rolledBackVault)).resolves.toBe(true);
  await callHarness(sourcePage, "close");

  const reopened = await callHarness(sourcePage, "openAndMigrate");
  expect(reopened.appliedVersions).toEqual([]);
  const durableRows = await callHarness(sourcePage, "listVaults");
  expect(durableRows).toEqual([
    {
      id: committedVault.id,
      name: committedVault.name,
      schema_version: 1,
      created_at: committedVault.createdAt,
      last_opened_at: committedVault.lastOpenedAt,
    },
  ]);

  const portable = await callHarness(sourcePage, "exportPortable");
  expect(portable.schemaVersion).toBe(22);
  expect(portable.byteLength).toBeGreaterThan(0);
  expect(portable.sha256).toMatch(/^[a-f0-9]{64}$/u);
  await callHarness(sourcePage, "close");
  await sourceContext.close();

  const restoreContext = await browser.newContext();
  const restorePage = await openHarness(restoreContext, logs);
  await callHarness(restorePage, "delete");
  await expect(
    callHarness(restorePage, "restorePortable", {
      ...portable,
      sha256: "0".repeat(64),
    }),
  ).rejects.toThrow("checksum mismatch");
  await callHarness(restorePage, "restorePortable", portable);
  const restoredRows = await callHarness(restorePage, "listVaults");
  expect(restoredRows).toEqual(durableRows);
  const restoredPortable = await callHarness(restorePage, "exportPortable");
  expect(restoredPortable).toMatchObject({
    schemaVersion: portable.schemaVersion,
    byteLength: portable.byteLength,
    sha256: portable.sha256,
  });

  await callHarness(restorePage, "delete");
  await callHarness(restorePage, "openAndMigrate");
  await expect(callHarness(restorePage, "listVaults")).resolves.toEqual([]);
  await callHarness(restorePage, "delete");
  await restoreContext.close();

  expect(logs).toEqual(
    expect.arrayContaining([
      expect.stringContaining('"adapter":"official-sqlite-wasm-opfs-sahpool"'),
      expect.stringContaining('"vfs:opfs-sahpool"'),
      expect.stringContaining('"thread:dedicated-worker"'),
    ]),
  );
  console.info(
    `STG_PROOF ${JSON.stringify({
      sqlite: opened.diagnostics.details.find((detail) => detail.startsWith("sqlite-version:")),
      browser: browserVersion,
      vfs: "opfs-sahpool",
      worker: "dedicated-worker",
      persistence: opened.diagnostics.persistence,
      schemaVersion: portable.schemaVersion,
      byteLength: portable.byteLength,
      sha256: portable.sha256,
      durableRows: durableRows.length,
      rollback: true,
      cleanProfileRestore: true,
    })}`,
  );
});
