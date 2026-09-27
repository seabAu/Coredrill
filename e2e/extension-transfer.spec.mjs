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

const launchExtensionContext = (userDataDirectory) =>
  chromium.launchPersistentContext(userDataDirectory, {
    channel: "chromium",
    headless: true,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`],
  });

const routeHostedApp = (context) =>
  context.route(`${appOrigin}/**`, async (route) => {
    const requested = new URL(route.request().url());
    const response = await route.fetch({
      url: `${localAppOrigin}${requested.pathname}${requested.search}`,
    });
    await route.fulfill({ response });
  });

test("durably stores before acknowledgement and safely retries the exact Chromium transfer", async () => {
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), "coredrill-extension-e2e-"));
  let context = await launchExtensionContext(userDataDirectory);
  try {
    await routeHostedApp(context);
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
      appliedVersions: Array.from({ length: 101 }, (_, index) => index + 1),
      diagnostics: { schemaVersion: 101 },
    });

    const compatibilityRequest = {
      specVersion: 1,
      type: "capture.compatibility.handshake.v1",
      requestId: "compatibility_request_abc",
      appOrigin,
      expectedExtensionId: extensionId,
      supportedTransferVersions: [1],
      supportedCaptureVersions: [1],
      requiredCapabilities: ["capture.transfer.pull.v1", "capture.transfer.ack.v1"],
    };
    const compatible = await sendExternal(app, extensionId, compatibilityRequest);
    expect(compatible).toEqual({
      specVersion: 1,
      type: "capture.compatibility.accepted.v1",
      requestId: compatibilityRequest.requestId,
      appOrigin,
      extensionId,
      selectedTransferVersion: 1,
      selectedCaptureVersion: 1,
      capabilities: ["capture.transfer.pull.v1", "capture.transfer.ack.v1"],
    });
    await expect(
      sendExternal(app, extensionId, {
        ...compatibilityRequest,
        requestId: "wrong_origin_request_abcde",
        appOrigin: "https://different.coredrill.test",
      }),
    ).resolves.toMatchObject({ code: "app_origin_mismatch" });
    await expect(
      sendExternal(app, extensionId, {
        ...compatibilityRequest,
        requestId: "wrong_extension_request_ab",
        expectedExtensionId: "ponmlkjihgfedcbaponmlkjihgfedcba",
      }),
    ).resolves.toMatchObject({ code: "extension_id_mismatch" });
    await expect(
      sendExternal(app, extensionId, {
        ...compatibilityRequest,
        requestId: "wrong_version_request_abcd",
        supportedTransferVersions: [2],
      }),
    ).resolves.toMatchObject({ code: "transfer_version_mismatch" });
    await expect(
      sendExternal(app, extensionId, {
        ...compatibilityRequest,
        requestId: "wrong_capability_request_ab",
        requiredCapabilities: ["capture.transfer.delete.v1"],
      }),
    ).resolves.toMatchObject({ code: "capability_mismatch" });
    await expect(
      sendExternal(app, extensionId, {
        ...compatibilityRequest,
        requestId: "extra_field_request_abcdef",
        unexpected: true,
      }),
    ).resolves.toMatchObject({ code: "message_invalid" });

    const first = await callInbox(app, "pullAndStore", extensionId, { acknowledge: false });
    expect(first).toMatchObject({
      status: "stored",
      attempt: 1,
      duplicate: false,
      duplicateKind: "none",
      acknowledged: false,
    });
    const receipts = await callInbox(app, "listReceipts");
    expect(receipts).toHaveLength(1);
    expect(receipts[0]).toMatchObject({
      senderId: extensionId,
      senderSequence: 0,
      receivedVia: "external_message",
    });

    const earlyRetry = await app.evaluate(async (id) => {
      try {
        await globalThis.coredrillExtensionInbox.pullAndStore(id);
        return { success: true };
      } catch (error) {
        return {
          success: false,
          code:
            typeof error === "object" && error !== null && "code" in error ? error.code : "unknown",
        };
      }
    }, extensionId);
    expect(earlyRetry).toEqual({ success: false, code: "retry_not_due" });

    const persistedBeforeRestart = await popup.evaluate(async () => {
      const values = await globalThis.chrome.storage.local.get("coredrill.extension.state.v1");
      return values["coredrill.extension.state.v1"];
    });
    expect(persistedBeforeRestart).toMatchObject({
      specVersion: 2,
      outbox: { items: [{ attemptCount: 1 }] },
      retry: {
        specVersion: 1,
        items: [
          {
            lastAttemptAt: expect.any(String),
            nextAttemptAt: expect.any(String),
            lastErrorCode: "acknowledgement_pending",
          },
        ],
      },
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
    await context.close();

    context = await launchExtensionContext(userDataDirectory);
    await routeHostedApp(context);
    serviceWorker = context.serviceWorkers()[0];
    serviceWorker ??= await context.waitForEvent("serviceworker");
    const restartedExtensionId = new URL(serviceWorker.url()).host;
    expect(restartedExtensionId).toBe(extensionId);

    const restartedPopup = await context.newPage();
    await restartedPopup.goto(`chrome-extension://${extensionId}/popup.html`);
    const restartStatus = await restartedPopup.evaluate(async () =>
      globalThis.chrome.runtime.sendMessage({ type: "outbox.status.v2" }),
    );
    expect(restartStatus).toMatchObject({
      success: true,
      type: "outbox.status.v2",
      outboxCount: 1,
      nextRetryAt: persistedBeforeRestart.retry.items[0].nextAttemptAt,
    });

    const restartedApp = await context.newPage();
    await restartedApp.goto(`${appOrigin}/`);
    await restartedApp.waitForFunction(
      () =>
        globalThis.coredrillStorageSpike !== undefined &&
        globalThis.coredrillExtensionInbox !== undefined,
    );
    const waitMilliseconds = Math.max(
      0,
      Date.parse(persistedBeforeRestart.retry.items[0].nextAttemptAt) - Date.now() + 100,
    );
    await new Promise((resolve) => globalThis.setTimeout(resolve, waitMilliseconds));
    const retry = await callInbox(restartedApp, "pullAndStore", extensionId);
    expect(retry).toMatchObject({
      status: "stored",
      envelopeId: receipts[0].envelopeId,
      attempt: 2,
      duplicate: true,
      duplicateKind: "exact_retry",
      durableEnvelopeId: receipts[0].envelopeId,
      acknowledged: true,
      remainingCount: 0,
    });
    await expect(callInbox(restartedApp, "listReceipts")).resolves.toHaveLength(1);

    const replay = await sendExternal(restartedApp, extensionId, {
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

    const status = await restartedPopup.evaluate(async () =>
      globalThis.chrome.runtime.sendMessage({ type: "outbox.status.v1" }),
    );
    expect(status).toMatchObject({ success: true, type: "outbox.status.v1", outboxCount: 0 });

    const repeatedContent = await restartedPopup.evaluate(
      async (value) =>
        globalThis.chrome.runtime.sendMessage({ type: "capture.queue.v1", snapshot: value }),
      snapshot,
    );
    expect(repeatedContent).toMatchObject({
      success: true,
      type: "capture.queued.v1",
      outboxCount: 1,
    });
    const semanticDuplicate = await callInbox(restartedApp, "pullAndStore", extensionId);
    expect(semanticDuplicate).toMatchObject({
      status: "stored",
      duplicate: true,
      duplicateKind: "content_hash",
      durableEnvelopeId: receipts[0].envelopeId,
      acknowledged: true,
      remainingCount: 0,
    });
    await expect(callInbox(restartedApp, "listReceipts")).resolves.toHaveLength(1);

    await callStorage(restartedApp, "close");
    await context.close();

    context = await launchExtensionContext(userDataDirectory);
    await routeHostedApp(context);
    serviceWorker = context.serviceWorkers()[0];
    serviceWorker ??= await context.waitForEvent("serviceworker");
    expect(new URL(serviceWorker.url()).host).toBe(extensionId);

    const postAckPopup = await context.newPage();
    await postAckPopup.goto(`chrome-extension://${extensionId}/popup.html`);
    const postAckStatus = await postAckPopup.evaluate(async () =>
      globalThis.chrome.runtime.sendMessage({ type: "outbox.status.v2" }),
    );
    expect(postAckStatus).toMatchObject({
      success: true,
      type: "outbox.status.v2",
      outboxCount: 0,
    });

    const postAckApp = await context.newPage();
    await postAckApp.goto(`${appOrigin}/`);
    await postAckApp.waitForFunction(
      () =>
        globalThis.coredrillStorageSpike !== undefined &&
        globalThis.coredrillExtensionInbox !== undefined,
    );
    const postAckReceipts = await callInbox(postAckApp, "listReceipts");
    expect(postAckReceipts).toHaveLength(1);
    expect(postAckReceipts[0]).toMatchObject({
      envelopeId: receipts[0].envelopeId,
      envelopeChecksum: receipts[0].envelopeChecksum,
      contentHash: receipts[0].contentHash,
    });

    const attacker = await context.newPage();
    await attacker.route("https://attacker.example/**", (route) =>
      route.fulfill({ contentType: "text/html", body: "<!doctype html><title>attacker</title>" }),
    );
    await attacker.goto("https://attacker.example/");
    await expect(
      attacker.evaluate(() => globalThis.chrome?.runtime?.sendMessage !== undefined),
    ).resolves.toBe(false);

    await callStorage(postAckApp, "delete");
    console.info(
      `EXT_TRANSFER_PROOF ${JSON.stringify({
        browser: context.browser()?.version(),
        extensionId,
        appOrigin,
        compatibilityHandshake: true,
        exactIdentityAgreement: true,
        incompatibleVersionRejected: true,
        capabilityMismatchRejected: true,
        extraFieldRejected: true,
        durableBeforeAck: true,
        immediateRetryDeferred: true,
        browserRestartRecovered: true,
        acknowledgedReceiptSurvivedRestart: true,
        acknowledgedOutboxStayedEmpty: true,
        retryAttempt: retry.attempt,
        semanticContentDeduplicated: true,
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

test("preserves the existing outbox when browser storage rejects a later queue write", async () => {
  const userDataDirectory = await mkdtemp(path.join(tmpdir(), "coredrill-extension-quota-"));
  const context = await launchExtensionContext(userDataDirectory);
  try {
    let serviceWorker = context.serviceWorkers()[0];
    serviceWorker ??= await context.waitForEvent("serviceworker");
    const extensionId = new URL(serviceWorker.url()).host;
    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${extensionId}/popup.html`);

    const first = await popup.evaluate(
      async (value) =>
        globalThis.chrome.runtime.sendMessage({ type: "capture.queue.v1", snapshot: value }),
      snapshot,
    );
    expect(first).toMatchObject({ success: true, type: "capture.queued.v1", outboxCount: 1 });
    const current = await popup.evaluate(async () => {
      const values = await globalThis.chrome.storage.local.get("coredrill.extension.state.v1");
      return values["coredrill.extension.state.v1"];
    });
    await popup.evaluate(async (state) => {
      await globalThis.chrome.storage.local.set({
        "coredrill.extension.state.v1": {
          specVersion: 1,
          nextSequence: state.nextSequence,
          outbox: state.outbox,
        },
      });
    }, current);
    const migratedStatus = await popup.evaluate(async () =>
      globalThis.chrome.runtime.sendMessage({ type: "outbox.status.v2" }),
    );
    expect(migratedStatus).toMatchObject({
      success: true,
      type: "outbox.status.v2",
      outboxCount: 1,
    });
    const before = await popup.evaluate(async () => {
      const values = await globalThis.chrome.storage.local.get("coredrill.extension.state.v1");
      return values["coredrill.extension.state.v1"];
    });
    expect(before).toMatchObject({
      specVersion: 2,
      outbox: { items: [{ attemptCount: 0 }] },
      retry: { items: [{ lastAttemptAt: null, lastErrorCode: null }] },
    });

    const quotaUse = await popup.evaluate(async () => {
      const quotaBytes = 10 * 1024 * 1024;
      const currentBytes = await globalThis.chrome.storage.local.getBytesInUse(null);
      const fillLength = Math.max(1, quotaBytes - currentBytes - 64 * 1024);
      await globalThis.chrome.storage.local.set({ pex003QuotaFill: "q".repeat(fillLength) });
      return {
        quotaBytes,
        usedBytes: await globalThis.chrome.storage.local.getBytesInUse(null),
      };
    });
    expect(quotaUse.usedBytes).toBeGreaterThan(quotaUse.quotaBytes - 96 * 1024);

    const paddedSnapshot = {
      ...snapshot,
      url: "https://jobs.example.test/openings/storage-failure",
      canonicalUrl: "https://jobs.example.test/openings/storage-failure",
      pageTitle: "Storage failure witness",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "JobPosting",
          title: "Storage failure witness",
          description: "x".repeat(256 * 1024),
        },
      ],
    };
    const rejected = await popup.evaluate(
      async (value) =>
        globalThis.chrome.runtime.sendMessage({ type: "capture.queue.v1", snapshot: value }),
      paddedSnapshot,
    );
    expect(rejected).toMatchObject({
      success: false,
      type: "extension.error.v1",
      code: "storage_failed",
    });

    const after = await popup.evaluate(async () => {
      const values = await globalThis.chrome.storage.local.get("coredrill.extension.state.v1");
      return values["coredrill.extension.state.v1"];
    });
    expect(after).toEqual(before);
    await popup.evaluate(async () => globalThis.chrome.storage.local.remove("pex003QuotaFill"));
    const status = await popup.evaluate(async () =>
      globalThis.chrome.runtime.sendMessage({ type: "outbox.status.v2" }),
    );
    expect(status).toMatchObject({
      success: true,
      type: "outbox.status.v2",
      outboxCount: 1,
    });
    console.info(
      `PEX003_STORAGE_FAILURE_PROOF ${JSON.stringify({
        browser: context.browser()?.version(),
        originalOutboxCount: before.outbox.items.length,
        rejectedCode: rejected.code,
        retainedAfterFailure: true,
      })}`,
    );
  } finally {
    await context.close();
    await rm(userDataDirectory, { recursive: true, force: true });
  }
});
