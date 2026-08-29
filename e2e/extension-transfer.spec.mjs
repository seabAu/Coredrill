import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { chromium, expect, test } from "@playwright/test";

const appOrigin = "https://app.coredrill.test";
const localAppOrigin = "http://127.0.0.1:4173";
const extensionPath = path.resolve("apps/extension/.output/chrome-mv3");

const snapshot = Object.freeze({
  specVersion: 1,
  url: "https://jobs.example.test/openings/phase0-transfer",
  canonicalUrl: "https://jobs.example.test/openings/phase0-transfer",
  pageTitle: "Synthetic transfer engineer",
  selectedText: "Local-first role with explicit user review.",
  fields: {
    title: {
      value: "Transfer Engineer",
      pointer: "/document/title",
      method: "selector",
      confidence: 0.45,
    },
  },
});

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

const sendExternal = (page, extensionId, message) =>
  page.evaluate(
    async ({ id, payload }) =>
      new Promise((resolve, reject) => {
        const runtime = globalThis.chrome?.runtime;
        if (runtime === undefined) {
          reject(new Error("External extension API is unavailable."));
          return;
        }
        runtime.sendMessage(id, payload, (response) => {
          if (runtime.lastError !== undefined) {
            reject(new Error("External extension message was rejected."));
            return;
          }
          resolve(response);
        });
      }),
    { id: extensionId, payload: message },
  );

test("durably stores before acknowledgement and safely retries the exact Chromium transfer", async () => {
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), "coredrill-extension-e2e-"));
  const context = await chromium.launchPersistentContext(userDataDirectory, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });
  try {
    await context.route(`${appOrigin}/**`, async (route) => {
      const requested = new URL(route.request().url());
      const response = await route.fetch({
        url: `${localAppOrigin}${requested.pathname}${requested.search}`,
      });
      await route.fulfill({ response });
    });
    let serviceWorker = context.serviceWorkers()[0];
    serviceWorker ??= await context.waitForEvent("serviceworker");
    const extensionId = new URL(serviceWorker.url()).host;
    expect(extensionId).toMatch(/^[a-p]{32}$/u);

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);
    const queued = await popup.evaluate(
      async (value) =>
        globalThis.chrome.runtime.sendMessage({ type: "capture.queue.v1", snapshot: value }),
      snapshot,
    );
    expect(queued).toMatchObject({ success: true, type: "capture.queued.v1", outboxCount: 1 });

    const app = await context.newPage();
    await app.goto(`${appOrigin}/`);
    await app.waitForFunction(
      () =>
        globalThis.coredrillStorageSpike !== undefined &&
        globalThis.coredrillExtensionInbox !== undefined,
    );
    await callStorage(app, "delete");
    await expect(callStorage(app, "openAndMigrate")).resolves.toMatchObject({
      appliedVersions: Array.from({ length: 87 }, (_, index) => index + 1),
      diagnostics: { schemaVersion: 87 },
    });

    const first = await callInbox(app, "pullAndStore", extensionId, { acknowledge: false });
    expect(first).toMatchObject({
      status: "stored",
      attempt: 1,
      duplicate: false,
      acknowledged: false,
    });
    const receipts = await callInbox(app, "listReceipts");
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      senderId: extensionId,
      senderSequence: 0,
      receivedVia: "external_message",
    });

    const oversized = await sendExternal(app, extensionId, {
      specVersion: 1,
      type: "capture.transfer.pull.v1",
      requestId: "oversize_request_abcdef",
      padding: "x".repeat(3_000),
    });
    expect(oversized).toMatchObject({
      type: "capture.transfer.error.v1",
      code: "message_invalid",
    });

    const wrongId = await sendExternal(app, extensionId, {
      specVersion: 1,
      type: "capture.transfer.ack.v1",
      requestId: "wrong_ack_request_abcdef",
      envelopeId: "0198d9cf-93b7-7a37-8b56-fba6b5f0ce11",
      envelopeChecksum: receipts[0].envelopeChecksum,
      contentHash: receipts[0].contentHash,
      nonce: receipts[0].senderNonce,
      sequence: receipts[0].senderSequence,
    });
    expect(wrongId).toMatchObject({
      type: "capture.transfer.error.v1",
      code: "replay_or_unknown_ack",
    });

    await callStorage(app, "close");
    await app.reload();
    await app.waitForFunction(() => globalThis.coredrillExtensionInbox !== undefined);
    const retry = await callInbox(app, "pullAndStore", extensionId);
    expect(retry).toMatchObject({
      status: "stored",
      envelopeId: receipts[0].envelopeId,
      attempt: 2,
      duplicate: true,
      acknowledged: true,
      remainingCount: 0,
    });
    await expect(callInbox(app, "listReceipts")).resolves.toHaveLength(1);

    const replay = await sendExternal(app, extensionId, {
      specVersion: 1,
      type: "capture.transfer.ack.v1",
      requestId: "replayed_ack_request_abc",
      envelopeId: receipts[0].envelopeId,
      envelopeChecksum: receipts[0].envelopeChecksum,
      contentHash: receipts[0].contentHash,
      nonce: receipts[0].senderNonce,
      sequence: receipts[0].senderSequence,
    });
    expect(replay).toMatchObject({
      type: "capture.transfer.error.v1",
      code: "replay_or_unknown_ack",
    });

    const status = await popup.evaluate(async () =>
      globalThis.chrome.runtime.sendMessage({ type: "outbox.status.v1" }),
    );
    expect(status).toMatchObject({ success: true, type: "outbox.status.v1", outboxCount: 0 });

    const attacker = await context.newPage();
    await attacker.route("https://attacker.example/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><title>attacker</title>" }),
    );
    await attacker.goto("https://attacker.example/");
    await expect(
      attacker.evaluate(() => globalThis.chrome?.runtime?.sendMessage !== undefined),
    ).resolves.toBe(false);

    await callStorage(app, "delete");
    console.info(
      `EXT_TRANSFER_PROOF ${JSON.stringify({
        browser: context.browser()?.version(),
        extensionId,
        appOrigin,
        durableBeforeAck: true,
        retryAttempt: retry.attempt,
        duplicateReceipts: 0,
        wrongOriginRejected: true,
        oversizedRejected: true,
        wrongIdRejected: true,
        replayRejected: true,
      })}`,
    );
  } finally {
    await context.close();
    await rm(userDataDirectory, { recursive: true, force: true });
  }
});
