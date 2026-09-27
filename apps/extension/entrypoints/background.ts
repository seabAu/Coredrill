import {
  buildCaptureEnvelopeV1,
  buildExtensionCaptureDraftEnvelopeV1,
  safeParsePageCaptureSnapshot,
  type CaptureEnvelopeBuildResult,
} from "@coredrill/capture-core";
import {
  acknowledgeScheduledOutboxTransfer,
  createEmptyOutboxState,
  createOutboxRetryState,
  createOutboxExport,
  describeOutboxLifecycle,
  negotiateCompatibilityHandshake,
  parseCompatibilityHandshakeRequest,
  parseExternalTransferRequest,
  prepareNextScheduledOutboxTransfer,
  pruneExpiredOutboxLifecycle,
  queueCaptureEnvelope,
  safeParseOutboxRetryState,
  safeParseOutboxState,
  synchronizeOutboxRetryState,
  transferErrorResponse,
  type ExternalTransferResponseV1,
  type CompatibilityHandshakeResponseV1,
  type OutboxRetryStateV1,
  type OutboxStateV1,
} from "@coredrill/extension-bridge";
import { browser, type Browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import { captureActivePage } from "../src/capture-active-page";
import { errorResponse, parseExtensionRequest, type ExtensionResponse } from "../src/messages";
import { isTrustedHostedAppSender } from "../src/transfer-policy";

const STORAGE_KEY = "coredrill.extension.state.v1";
const LEGACY_STORED_STATE_SPEC_VERSION = 1 as const;
const STORED_STATE_SPEC_VERSION = 2 as const;

interface StoredExtensionStateV2 {
  readonly specVersion: typeof STORED_STATE_SPEC_VERSION;
  readonly nextSequence: number;
  readonly outbox: OutboxStateV1;
  readonly retry: OutboxRetryStateV1;
}

type StoredStateReadResult =
  | {
      readonly success: true;
      readonly state: StoredExtensionStateV2;
      readonly migrationRequired: boolean;
    }
  | { readonly success: false; readonly response: ExtensionResponse };

let queueTail: Promise<void> = Promise.resolve();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function exactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function isTrustedExtensionPage(sender: Browser.runtime.MessageSender): boolean {
  if (sender.id !== browser.runtime.id || sender.url === undefined) return false;
  try {
    const protocol = new URL(sender.url).protocol;
    return protocol === "chrome-extension:" || protocol === "moz-extension:";
  } catch {
    return false;
  }
}

async function readStoredState(now = new Date()): Promise<StoredStateReadResult> {
  const values = await browser.storage.local.get(STORAGE_KEY);
  const input = values[STORAGE_KEY];
  if (input === undefined) {
    const outbox = createEmptyOutboxState();
    return {
      success: true,
      state: {
        specVersion: STORED_STATE_SPEC_VERSION,
        nextSequence: 0,
        outbox,
        retry: createOutboxRetryState(outbox),
      },
      migrationRequired: false,
    };
  }
  if (
    !isRecord(input) ||
    !Number.isSafeInteger(input["nextSequence"]) ||
    (input["nextSequence"] as number) < 0
  ) {
    return {
      success: false,
      response: errorResponse(
        "storage_corrupt",
        "The extension outbox metadata is invalid. It was preserved for recovery.",
      ),
    };
  }
  const parsedOutbox = await safeParseOutboxState(input["outbox"]);
  if (!parsedOutbox.success) {
    return {
      success: false,
      response: errorResponse(
        parsedOutbox.code,
        "The extension outbox failed its integrity check. It was preserved for recovery.",
      ),
    };
  }
  if (
    input["specVersion"] === LEGACY_STORED_STATE_SPEC_VERSION &&
    exactKeys(input, ["specVersion", "nextSequence", "outbox"])
  ) {
    return {
      success: true,
      state: {
        specVersion: STORED_STATE_SPEC_VERSION,
        nextSequence: input["nextSequence"] as number,
        outbox: parsedOutbox.state,
        retry: createOutboxRetryState(parsedOutbox.state, now.toISOString()),
      },
      migrationRequired: true,
    };
  }
  if (
    input["specVersion"] !== STORED_STATE_SPEC_VERSION ||
    !exactKeys(input, ["specVersion", "nextSequence", "outbox", "retry"])
  ) {
    return {
      success: false,
      response: errorResponse(
        "storage_corrupt",
        "The extension outbox metadata is invalid. It was preserved for recovery.",
      ),
    };
  }
  const parsedRetry = await safeParseOutboxRetryState(input["retry"], parsedOutbox.state);
  if (!parsedRetry.success) {
    return {
      success: false,
      response: errorResponse(
        parsedRetry.code,
        "The extension retry metadata failed validation. It was preserved for recovery.",
      ),
    };
  }
  return {
    success: true,
    state: {
      specVersion: STORED_STATE_SPEC_VERSION,
      nextSequence: input["nextSequence"] as number,
      outbox: parsedOutbox.state,
      retry: parsedRetry.state,
    },
    migrationRequired: false,
  };
}

async function captureActiveTab(): Promise<ExtensionResponse> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];
    if (activeTab?.id === undefined) {
      return errorResponse("active_tab_missing", "No active browser tab is available.");
    }
    const tabId = activeTab.id;
    if (activeTab.url === undefined) {
      return errorResponse(
        "capture_permission_needed",
        "Temporary access to the current HTTP(S) page is needed before Coredrill can build a preview.",
      );
    }
    let pageUrl: URL;
    try {
      pageUrl = new URL(activeTab.url);
    } catch {
      return errorResponse("capture_unavailable", "The active page URL is invalid.");
    }
    if (pageUrl.protocol !== "http:" && pageUrl.protocol !== "https:") {
      return errorResponse(
        "capture_unavailable",
        "Coredrill captures only the HTTP(S) page you explicitly choose.",
      );
    }
    const results = await browser.scripting.executeScript({
      target: { tabId },
      func: captureActivePage,
    });
    const parsed = safeParsePageCaptureSnapshot(results[0]?.result);
    if (!parsed.success) {
      return errorResponse(
        parsed.code,
        "The selected page did not produce a valid capture preview.",
      );
    }
    return { success: true, type: "capture.preview.v1", snapshot: parsed.data };
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes("Selected text exceeds the capture boundary.")
    ) {
      return errorResponse(
        "selected_text_too_large",
        "The selected text is too large for one capture. Select a smaller job section and try again.",
      );
    }
    return errorResponse(
      "capture_permission_needed",
      "Temporary access to the current HTTP(S) page is needed. Re-open Coredrill Capture from that page or continue manually.",
    );
  }
}

async function captureActiveTabDraft(): Promise<ExtensionResponse> {
  const response = await captureActiveTab();
  if (!response.success || response.type !== "capture.preview.v1") return response;
  return {
    success: true,
    type: "capture.preview-draft.v1",
    draft: {
      specVersion: 1,
      capturedAt: new Date().toISOString(),
      snapshot: response.snapshot,
    },
  };
}

async function queueBuiltCapture(
  build: (sequence: number, now: Date) => Promise<CaptureEnvelopeBuildResult>,
): Promise<ExtensionResponse> {
  const now = new Date();
  const loaded = await readStoredState(now);
  if (!loaded.success) return loaded.response;
  if (loaded.state.nextSequence >= Number.MAX_SAFE_INTEGER) {
    return errorResponse("sequence_exhausted", "The extension sequence counter is exhausted.");
  }
  const built = await build(loaded.state.nextSequence, now);
  if (!built.success) return errorResponse(built.code, built.issue);

  const queued = await queueCaptureEnvelope(loaded.state.outbox, built.envelope, now);
  if (!queued.success) return errorResponse(queued.code, queued.issue);
  const retry = await synchronizeOutboxRetryState(
    loaded.state.outbox,
    loaded.state.retry,
    queued.state,
    now,
  );
  if (!retry.success) return errorResponse(retry.code, retry.issue);
  const nextState: StoredExtensionStateV2 = {
    specVersion: STORED_STATE_SPEC_VERSION,
    nextSequence: loaded.state.nextSequence + 1,
    outbox: queued.state,
    retry: retry.state,
  };
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: nextState });
  } catch {
    return errorResponse(
      "storage_failed",
      "The capture was not queued because browser storage rejected the write.",
    );
  }
  return {
    success: true,
    type: "capture.queued.v1",
    outboxCount: queued.state.items.length,
    outboxBytes: queued.encodedBytes,
    expiresAt: queued.item.expiresAt,
  };
}

async function queueSnapshot(snapshot: unknown): Promise<ExtensionResponse> {
  return queueBuiltCapture((sequence, now) =>
    buildCaptureEnvelopeV1(snapshot, {
      senderId: browser.runtime.id,
      sequence,
      now,
    }),
  );
}

async function queueDraft(draft: unknown): Promise<ExtensionResponse> {
  return queueBuiltCapture((sequence) =>
    buildExtensionCaptureDraftEnvelopeV1(draft, {
      senderId: browser.runtime.id,
      sequence,
    }),
  );
}

async function outboxStatus(version: 1 | 2): Promise<ExtensionResponse> {
  const now = new Date();
  const loaded = await readStoredState(now);
  if (!loaded.success) return loaded.response;
  const pruned = await pruneExpiredOutboxLifecycle(loaded.state.outbox, loaded.state.retry, now);
  if (!pruned.success) return errorResponse(pruned.code, pruned.issue);
  const parsed = await safeParseOutboxState(pruned.state);
  if (!parsed.success) return errorResponse(parsed.code, parsed.issue);
  if (loaded.migrationRequired || pruned.removedExpired > 0) {
    try {
      await browser.storage.local.set({
        [STORAGE_KEY]: {
          specVersion: STORED_STATE_SPEC_VERSION,
          nextSequence: loaded.state.nextSequence,
          outbox: parsed.state,
          retry: pruned.retryState,
        } satisfies StoredExtensionStateV2,
      });
    } catch {
      return errorResponse(
        "storage_failed",
        "Expired captures could not be removed from browser storage.",
      );
    }
  }
  const earliestExpiry = parsed.state.items.map((item) => item.expiresAt).sort()[0];
  if (version === 1) {
    return {
      success: true,
      type: "outbox.status.v1",
      outboxCount: parsed.state.items.length,
      outboxBytes: parsed.encodedBytes,
      ...(earliestExpiry === undefined ? {} : { earliestExpiry }),
    };
  }
  const described = await describeOutboxLifecycle(parsed.state, pruned.retryState, now);
  if (!described.success) return errorResponse(described.code, described.issue);
  return {
    success: true,
    type: "outbox.status.v2",
    outboxCount: parsed.state.items.length,
    outboxBytes: parsed.encodedBytes,
    earliestExpiry: described.summary.earliestExpiry,
    expiringSoonCount: described.summary.expiringSoonCount,
    nextRetryAt: described.summary.nextRetryAt,
    retryExhaustedCount: described.summary.exhaustedCount,
    removedExpired: pruned.removedExpired,
  };
}

async function exportOutbox(): Promise<ExtensionResponse> {
  const now = new Date();
  const loaded = await readStoredState(now);
  if (!loaded.success) return loaded.response;
  const pruned = await pruneExpiredOutboxLifecycle(loaded.state.outbox, loaded.state.retry, now);
  if (!pruned.success) return errorResponse(pruned.code, pruned.issue);
  const exported = await createOutboxExport(pruned.state, now);
  if (!exported.success) return errorResponse(exported.code, exported.issue);
  const nextState: StoredExtensionStateV2 = {
    specVersion: STORED_STATE_SPEC_VERSION,
    nextSequence: loaded.state.nextSequence,
    outbox: { specVersion: exported.data.specVersion, items: exported.data.items },
    retry: pruned.retryState,
  };
  try {
    await browser.storage.local.set({ [STORAGE_KEY]: nextState });
  } catch {
    return errorResponse("storage_failed", "Expired captures could not be removed before export.");
  }
  const json = JSON.stringify(exported.data);
  return {
    success: true,
    type: "outbox.export.v1",
    filename: `coredrill-capture-outbox-${now
      .toISOString()
      .replaceAll(/[-:]/gu, "")
      .replace(/\.\d{3}Z$/u, "Z")}.json`,
    json,
    bytes: new TextEncoder().encode(json).byteLength,
  };
}

async function handleExternalMessage(
  input: unknown,
  sender: Browser.runtime.MessageSender,
): Promise<ExternalTransferResponseV1 | CompatibilityHandshakeResponseV1> {
  if (!isTrustedHostedAppSender(sender)) {
    return transferErrorResponse(
      "untrusted_sender",
      "Only the exact Coredrill app origin may use this boundary.",
    );
  }
  const compatibilityRequest = parseCompatibilityHandshakeRequest(input);
  if (compatibilityRequest !== undefined) {
    return negotiateCompatibilityHandshake(compatibilityRequest, {
      appOrigin: sender.origin ?? "",
      extensionId: browser.runtime.id,
    });
  }
  const request = parseExternalTransferRequest(input);
  if (request === undefined) {
    return transferErrorResponse("message_invalid", "Transfer message contract is invalid.");
  }
  const now = new Date();
  const loaded = await readStoredState(now);
  if (!loaded.success) {
    return transferErrorResponse(
      loaded.response.success ? "storage_corrupt" : loaded.response.code,
      "The extension outbox is unavailable.",
      request.requestId,
    );
  }
  const result =
    request.type === "capture.transfer.pull.v1"
      ? await prepareNextScheduledOutboxTransfer(
          loaded.state.outbox,
          loaded.state.retry,
          request,
          now,
        )
      : await acknowledgeScheduledOutboxTransfer(
          loaded.state.outbox,
          loaded.state.retry,
          request,
          now,
        );
  if (!result.success) {
    return transferErrorResponse(result.code, result.issue, request.requestId);
  }
  try {
    await browser.storage.local.set({
      [STORAGE_KEY]: {
        specVersion: STORED_STATE_SPEC_VERSION,
        nextSequence: loaded.state.nextSequence,
        outbox: result.state,
        retry: result.retryState,
      } satisfies StoredExtensionStateV2,
    });
  } catch {
    return transferErrorResponse(
      "storage_failed",
      "The transfer state was not changed because browser storage rejected the write.",
      request.requestId,
    );
  }
  return result.response;
}

function serializeQueueOperation<Result>(operation: () => Promise<Result>): Promise<Result> {
  const result = queueTail.then(operation, operation);
  queueTail = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

async function handleMessage(
  input: unknown,
  sender: Browser.runtime.MessageSender,
): Promise<ExtensionResponse> {
  if (!isTrustedExtensionPage(sender)) {
    return errorResponse(
      "untrusted_sender",
      "Only Coredrill extension pages may use this boundary.",
    );
  }
  const request = parseExtensionRequest(input);
  if (request === undefined) {
    return errorResponse("message_invalid", "The extension message contract is invalid.");
  }
  switch (request.type) {
    case "capture.active-tab.v1":
      return captureActiveTab();
    case "capture.active-tab.v2":
      return captureActiveTabDraft();
    case "capture.queue.v1":
      return serializeQueueOperation(() => queueSnapshot(request.snapshot));
    case "capture.queue-draft.v1":
      return serializeQueueOperation(() => queueDraft(request.draft));
    case "outbox.status.v1":
      return serializeQueueOperation(() => outboxStatus(1));
    case "outbox.status.v2":
      return serializeQueueOperation(() => outboxStatus(2));
    case "outbox.export.v1":
      return serializeQueueOperation(exportOutbox);
  }
}

export default defineBackground(() => {
  browser.runtime.onMessage.addListener((message, sender, sendResponse) => {
    void handleMessage(message, sender).then(
      (response) => {
        sendResponse(response);
      },
      () => {
        sendResponse(
          errorResponse("internal_error", "The extension boundary failed without storing data."),
        );
      },
    );
    return true;
  });
  browser.runtime.onMessageExternal.addListener((message, sender, sendResponse) => {
    void serializeQueueOperation(() => handleExternalMessage(message, sender)).then(
      (response) => {
        sendResponse(response);
      },
      () => {
        sendResponse(
          transferErrorResponse(
            "internal_error",
            "The transfer boundary failed without acknowledging data.",
          ),
        );
      },
    );
    return true;
  });
});
