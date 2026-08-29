import { buildCaptureEnvelopeV1 } from "../packages/capture-core/dist/index.js";
import {
  createEmptyOutboxState,
  createOutboxExport,
  queueCaptureEnvelope,
} from "../packages/extension-bridge/dist/index.js";

import { expect, test } from "@playwright/test";

function entropy(length) {
  return Uint8Array.from({ length }, (_, index) => (index + 17) % 256);
}

async function createExport(now) {
  const built = await buildCaptureEnvelopeV1(
    {
      specVersion: 1,
      url: "https://jobs.example.test/openings/firefox-fallback",
      pageTitle: "Firefox fallback role",
      fields: {},
    },
    {
      senderId: "capture@coredrill.local",
      sequence: 0,
      now,
      randomBytes: entropy,
    },
  );
  if (!built.success) throw new Error(built.issue);
  const queued = await queueCaptureEnvelope(createEmptyOutboxState(), built.envelope, now);
  if (!queued.success) throw new Error(queued.issue);
  const exported = await createOutboxExport(queued.state, now);
  if (!exported.success) throw new Error(exported.issue);
  return exported.data;
}

const callStorage = (page, method, argument) =>
  page.evaluate(
    async ({ methodName, value }) => {
      const api = globalThis.coredrillStorageSpike;
      if (api === undefined) throw new Error("Storage API is unavailable.");
      return value === undefined ? api[methodName]() : api[methodName](value);
    },
    { methodName: method, value: argument },
  );

const callInbox = (page, method, ...arguments_) =>
  page.evaluate(
    async ({ methodName, values }) => {
      const api = globalThis.coredrillExtensionInbox;
      if (api === undefined) throw new Error("Extension inbox API is unavailable.");
      return api[methodName](...values);
    },
    { methodName: method, values: arguments_ },
  );

test("imports the checksummed Firefox JSON fallback idempotently into durable SQLite", async ({
  browser,
  page,
}) => {
  const now = new Date();
  const exported = await createExport(now);
  await page.goto("/");
  await page.waitForFunction(() => globalThis.coredrillExtensionInbox !== undefined);
  await callStorage(page, "delete");
  await expect(callStorage(page, "openAndMigrate")).resolves.toMatchObject({
    appliedVersions: Array.from({ length: 92 }, (_, index) => index + 1),
    diagnostics: { schemaVersion: 92 },
  });

  const json = JSON.stringify(exported);
  await expect(callInbox(page, "importOutboxJson", json)).resolves.toEqual({
    imported: 1,
    duplicates: 0,
    total: 1,
  });
  await expect(callInbox(page, "importOutboxJson", json)).resolves.toEqual({
    imported: 0,
    duplicates: 1,
    total: 1,
  });
  const receipts = await callInbox(page, "listReceipts");
  expect(receipts).toHaveLength(1);
  expect(receipts[0]).toMatchObject({
    senderId: "capture@coredrill.local",
    receivedVia: "manual_export",
  });

  const corrupt = structuredClone(exported);
  corrupt.itemsChecksum = "0".repeat(64);
  await expect(callInbox(page, "importOutboxJson", JSON.stringify(corrupt))).rejects.toThrow(
    "checksum",
  );
  await expect(callInbox(page, "listReceipts")).resolves.toHaveLength(1);

  await callStorage(page, "delete");
  console.info(
    `EXT_FIREFOX_FALLBACK_PROOF ${JSON.stringify({
      browser: browser.version(),
      extensionId: "capture@coredrill.local",
      manifestTransferMode: "manual-json-export-import",
      checksumRejected: true,
      idempotent: true,
      durableSchemaVersion: 92,
    })}`,
  );
});
