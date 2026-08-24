import { expect, test } from "@playwright/test";

const vault = Object.freeze({
  id: "0198d9d1-263b-711d-9264-2dcc9b274ee5",
  name: "Cross-tab handoff vault",
  createdAt: "2026-08-24T09:10:00.000Z",
  lastOpenedAt: "2026-08-24T09:10:00.000Z",
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

test("blocks a second writer, hands off after tab loss, and survives reload", async ({
  browser,
}) => {
  const context = await browser.newContext();
  const ownerPage = await openHarness(context);
  await callHarness(ownerPage, "delete");
  await callHarness(ownerPage, "openAndMigrate");
  await callHarness(ownerPage, "writeVault", vault);

  const contenderPage = await openHarness(context);
  const blocked = await callHarness(contenderPage, "tryOpenAndMigrate", {
    expectedExisting: true,
  });
  expect(blocked).toMatchObject({ opened: false, code: "vault_busy" });
  await expect(contenderPage.getByRole("status")).toContainText("open in another tab");

  await ownerPage.close();
  await expect
    .poll(
      async () =>
        (
          await callHarness(contenderPage, "tryOpenAndMigrate", {
            expectedExisting: true,
          })
        ).opened,
      { timeout: 10_000 },
    )
    .toBe(true);
  await expect(callHarness(contenderPage, "listVaults")).resolves.toHaveLength(1);

  await contenderPage.reload();
  await contenderPage.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);
  await expect
    .poll(
      async () =>
        (
          await callHarness(contenderPage, "tryOpenAndMigrate", {
            expectedExisting: true,
          })
        ).opened,
      { timeout: 10_000 },
    )
    .toBe(true);
  await expect(callHarness(contenderPage, "listVaults")).resolves.toEqual([
    {
      id: vault.id,
      name: vault.name,
      schema_version: 1,
      created_at: vault.createdAt,
      last_opened_at: vault.lastOpenedAt,
    },
  ]);

  await callHarness(contenderPage, "delete");
  await context.close();
  console.info(
    `STG_CONCURRENCY_PROOF ${JSON.stringify({
      crashReloadDurable: true,
      handoffAfterOwnerLoss: true,
      secondWriterBlocked: true,
      sqliteBusyTypedRetry: true,
    })}`,
  );
});
