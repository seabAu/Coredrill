import { buildCaptureEnvelopeV1, safeParsePageCaptureSnapshot } from "@coredrill/capture-core";
import {
  createEmptyOutboxState,
  queueCaptureEnvelope,
  safeParseOutboxState,
  type OutboxStateV1,
} from "@coredrill/extension-bridge";
import { browser, type Browser } from "wxt/browser";
import { defineBackground } from "wxt/utils/define-background";

import { captureActivePage } from "../src/capture-active-page";
import { errorResponse, parseExtensionRequest, type ExtensionResponse } from "../src/messages";

const STORAGE_KEY = "coredrill.extension.state.v1";
const STORED_STATE_SPEC_VERSION = 1 as const;

interface StoredExtensionStateV1 {
  readonly specVersion: typeof STORED_STATE_SPEC_VERSION;
  readonly nextSequence: number;
  readonly outbox: OutboxStateV1;
}

type StoredStateReadResult =
  | { readonly success: true; readonly state: StoredExtensionStateV1 }
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

async function readStoredState(): Promise<StoredStateReadResult> {
  const values = await browser.storage.local.get(STORAGE_KEY);
  const input = values[STORAGE_KEY];
  if (input === undefined) {
    return {
      success: true,
      state: {
        specVersion: STORED_STATE_SPEC_VERSION,
        nextSequence: 0,
        outbox: createEmptyOutboxState(),
      },
    };
  }
  if (
    !isRecord(input) ||
    !exactKeys(input, ["specVersion", "nextSequence", "outbox"]) ||
    input["specVersion"] !== STORED_STATE_SPEC_VERSION ||
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
  return {
    success: true,
    state: {
      specVersion: STORED_STATE_SPEC_VERSION,
      nextSequence: input["nextSequence"] as number,
      outbox: parsedOutbox.state,
    },
  };
}

async function captureActiveTab(): Promise<ExtensionResponse> {
  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tabId = tabs[0]?.id;
    if (tabId === undefined) {
      return errorResponse("active_tab_missing", "No active browser tab is available.");
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
  } catch {
    return errorResponse(
      "capture_unavailable",
      "Coredrill cannot capture this page. Open an HTTP(S) job page and invoke the extension again.",
    );
  }
}

async function queueSnapshot(snapshot: unknown): Promise<ExtensionResponse> {
  const loaded = await readStoredState();
  if (!loaded.success) return loaded.response;
  if (loaded.state.nextSequence >= Number.MAX_SAFE_INTEGER) {
    return errorResponse("sequence_exhausted", "The extension sequence counter is exhausted.");
  }
  const now = new Date();
  const built = await buildCaptureEnvelopeV1(snapshot, {
    senderId: browser.runtime.id,
    sequence: loaded.state.nextSequence,
    now,
  });
  if (!built.success) return errorResponse(built.code, built.issue);

  const queued = await queueCaptureEnvelope(loaded.state.outbox, built.envelope, now);
  if (!queued.success) return errorResponse(queued.code, queued.issue);
  const nextState: StoredExtensionStateV1 = {
    specVersion: STORED_STATE_SPEC_VERSION,
    nextSequence: loaded.state.nextSequence + 1,
    outbox: queued.state,
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

async function outboxStatus(): Promise<ExtensionResponse> {
  const loaded = await readStoredState();
  if (!loaded.success) return loaded.response;
  const now = Date.now();
  const activeItems = loaded.state.outbox.items.filter((item) => Date.parse(item.expiresAt) > now);
  const parsed = await safeParseOutboxState({
    specVersion: loaded.state.outbox.specVersion,
    items: activeItems,
  });
  if (!parsed.success) return errorResponse(parsed.code, parsed.issue);
  if (activeItems.length !== loaded.state.outbox.items.length) {
    try {
      await browser.storage.local.set({
        [STORAGE_KEY]: {
          specVersion: STORED_STATE_SPEC_VERSION,
          nextSequence: loaded.state.nextSequence,
          outbox: parsed.state,
        } satisfies StoredExtensionStateV1,
      });
    } catch {
      return errorResponse(
        "storage_failed",
        "Expired captures could not be removed from browser storage.",
      );
    }
  }
  const earliestExpiry = parsed.state.items.map((item) => item.expiresAt).sort()[0];
  return {
    success: true,
    type: "outbox.status.v1",
    outboxCount: parsed.state.items.length,
    outboxBytes: parsed.encodedBytes,
    ...(earliestExpiry === undefined ? {} : { earliestExpiry }),
  };
}

function serializeQueueOperation(
  operation: () => Promise<ExtensionResponse>,
): Promise<ExtensionResponse> {
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
    case "capture.queue.v1":
      return serializeQueueOperation(() => queueSnapshot(request.snapshot));
    case "outbox.status.v1":
      return serializeQueueOperation(outboxStatus);
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
});
