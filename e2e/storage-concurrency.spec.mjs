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
  await page.goto("/storage-verification.html");
  await page.waitForFunction(() => globalThis.coredrillStorageSpike !== undefined);
  return page;
};

test("recovers a specific startup handle conflict with a fresh worker and no replayed vault write", async ({
  browser,
}) => {
  const context = await browser.newContext();
  await context.addInitScript(() => {
    const OriginalWorker = globalThis.Worker;
    const proof = { workers: 0, injected: 0, operations: [], vaultWrites: 0 };
    globalThis.opfsStartupRetryProof = proof;
    globalThis.Worker = class extends OriginalWorker {
      constructor(url, options) {
        super(url, options);
        this.sqlite = options?.name === "coredrill-sqlite";
        if (this.sqlite) proof.workers += 1;
      }
      postMessage(message, transfer) {
        if (this.sqlite) {
          proof.operations.push(message.operation);
          if (
            message.operation === "execute" &&
            /INSERT INTO vault\(/u.test(message.statement?.sql ?? "")
          )
            proof.vaultWrites += 1;
          if (message.operation === "open" && proof.injected === 0) {
            proof.injected += 1;
            queueMicrotask(() =>
              this.dispatchEvent(
                new MessageEvent("message", {
                  data: {
                    version: message.version,
                    id: message.id,
                    ok: false,
                    error: {
                      name: "NoModificationAllowedError",
                      message: "Synthetic previous-worker handle conflict",
                    },
                  },
                }),
              ),
            );
            return;
          }
        }
        super.postMessage(message, transfer);
      }
    };
  });
  try {
    const page = await openHarness(context);
    await callHarness(page, "openAndMigrate");
    await callHarness(page, "writeVault", vault);
    await expect(callHarness(page, "listVaults")).resolves.toHaveLength(1);
    const proof = await page.evaluate(() => globalThis.opfsStartupRetryProof);
    expect(proof.workers).toBe(2);
    expect(proof.injected).toBe(1);
    expect(proof.operations.slice(0, 2)).toEqual(["open", "open"]);
    expect(proof.vaultWrites).toBe(1);
    console.info(
      `OPFS_STARTUP_RETRY_PROOF ${JSON.stringify({ workers: proof.workers, injectedHandleConflicts: proof.injected, initialOperations: proof.operations.slice(0, 2), vaultWrites: proof.vaultWrites, canonicalVaults: 1 })}`,
    );
    await callHarness(page, "close");
  } finally {
    await context.close();
  }
});

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
