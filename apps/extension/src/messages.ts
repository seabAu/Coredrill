import {
  safeParseExtensionCaptureDraftV1,
  safeParsePageCaptureSnapshot,
  type ExtensionCaptureDraftV1,
  type PageCaptureSnapshot,
} from "@coredrill/capture-core";
import { TRANSFER_LIMITS } from "@coredrill/extension-bridge";

export type ExtensionRequest =
  | { readonly type: "capture.active-tab.v1" }
  | { readonly type: "capture.active-tab.v2" }
  | { readonly type: "capture.queue.v1"; readonly snapshot: unknown }
  | { readonly type: "capture.queue-draft.v1"; readonly draft: unknown }
  | { readonly type: "outbox.status.v1" }
  | { readonly type: "outbox.status.v2" }
  | { readonly type: "outbox.export.v1" };

export type ExtensionResponse =
  | {
      readonly success: true;
      readonly type: "capture.preview.v1";
      readonly snapshot: PageCaptureSnapshot;
    }
  | {
      readonly success: true;
      readonly type: "capture.preview-draft.v1";
      readonly draft: ExtensionCaptureDraftV1;
    }
  | {
      readonly success: true;
      readonly type: "capture.queued.v1";
      readonly outboxCount: number;
      readonly outboxBytes: number;
      readonly expiresAt: string;
    }
  | {
      readonly success: true;
      readonly type: "outbox.status.v1";
      readonly outboxCount: number;
      readonly outboxBytes: number;
      readonly earliestExpiry?: string;
    }
  | {
      readonly success: true;
      readonly type: "outbox.status.v2";
      readonly outboxCount: number;
      readonly outboxBytes: number;
      readonly earliestExpiry: string | null;
      readonly expiringSoonCount: number;
      readonly nextRetryAt: string | null;
      readonly retryExhaustedCount: number;
      readonly removedExpired: number;
    }
  | {
      readonly success: true;
      readonly type: "outbox.export.v1";
      readonly filename: string;
      readonly json: string;
      readonly bytes: number;
    }
  | {
      readonly success: false;
      readonly type: "extension.error.v1";
      readonly code: string;
      readonly message: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isCount(value: unknown): value is number {
  return Number.isSafeInteger(value) && (value as number) >= 0;
}

function isInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

export function parseExtensionRequest(input: unknown): ExtensionRequest | undefined {
  if (!isRecord(input) || typeof input["type"] !== "string") return undefined;
  if (
    (input["type"] === "capture.active-tab.v1" ||
      input["type"] === "capture.active-tab.v2" ||
      input["type"] === "outbox.status.v1" ||
      input["type"] === "outbox.status.v2" ||
      input["type"] === "outbox.export.v1") &&
    Object.keys(input).length === 1
  ) {
    return { type: input["type"] };
  }
  if (
    input["type"] === "capture.queue.v1" &&
    Object.keys(input).length === 2 &&
    Object.hasOwn(input, "snapshot")
  ) {
    return { type: "capture.queue.v1", snapshot: input["snapshot"] };
  }
  if (
    input["type"] === "capture.queue-draft.v1" &&
    Object.keys(input).length === 2 &&
    Object.hasOwn(input, "draft")
  ) {
    return { type: "capture.queue-draft.v1", draft: input["draft"] };
  }
  return undefined;
}

export function errorResponse(code: string, message: string): ExtensionResponse {
  return { success: false, type: "extension.error.v1", code, message };
}

export function isExtensionResponse(input: unknown): input is ExtensionResponse {
  if (
    !isRecord(input) ||
    typeof input["success"] !== "boolean" ||
    typeof input["type"] !== "string"
  ) {
    return false;
  }
  if (!input["success"]) {
    return (
      hasExactKeys(input, ["success", "type", "code", "message"]) &&
      input["type"] === "extension.error.v1" &&
      typeof input["code"] === "string" &&
      typeof input["message"] === "string"
    );
  }
  if (input["type"] === "capture.preview.v1") {
    return (
      hasExactKeys(input, ["success", "type", "snapshot"]) &&
      safeParsePageCaptureSnapshot(input["snapshot"]).success
    );
  }
  if (input["type"] === "capture.preview-draft.v1") {
    return (
      hasExactKeys(input, ["success", "type", "draft"]) &&
      safeParseExtensionCaptureDraftV1(input["draft"]).success
    );
  }
  if (input["type"] === "capture.queued.v1") {
    return (
      hasExactKeys(input, ["success", "type", "outboxCount", "outboxBytes", "expiresAt"]) &&
      isCount(input["outboxCount"]) &&
      isCount(input["outboxBytes"]) &&
      isInstant(input["expiresAt"])
    );
  }
  if (input["type"] === "outbox.status.v1") {
    const allowedKeys =
      input["earliestExpiry"] === undefined
        ? ["success", "type", "outboxCount", "outboxBytes"]
        : ["success", "type", "outboxCount", "outboxBytes", "earliestExpiry"];
    return (
      hasExactKeys(input, allowedKeys) &&
      isCount(input["outboxCount"]) &&
      isCount(input["outboxBytes"]) &&
      (input["earliestExpiry"] === undefined || isInstant(input["earliestExpiry"]))
    );
  }
  if (input["type"] === "outbox.status.v2") {
    return (
      hasExactKeys(input, [
        "success",
        "type",
        "outboxCount",
        "outboxBytes",
        "earliestExpiry",
        "expiringSoonCount",
        "nextRetryAt",
        "retryExhaustedCount",
        "removedExpired",
      ]) &&
      isCount(input["outboxCount"]) &&
      isCount(input["outboxBytes"]) &&
      (input["earliestExpiry"] === null || isInstant(input["earliestExpiry"])) &&
      isCount(input["expiringSoonCount"]) &&
      (input["nextRetryAt"] === null || isInstant(input["nextRetryAt"])) &&
      isCount(input["retryExhaustedCount"]) &&
      isCount(input["removedExpired"])
    );
  }
  if (input["type"] === "outbox.export.v1") {
    if (
      !hasExactKeys(input, ["success", "type", "filename", "json", "bytes"]) ||
      typeof input["filename"] !== "string" ||
      !/^coredrill-capture-outbox-\d{8}T\d{6}Z\.json$/u.test(input["filename"]) ||
      typeof input["json"] !== "string" ||
      !isCount(input["bytes"]) ||
      input["bytes"] > TRANSFER_LIMITS.maxExportBytes
    ) {
      return false;
    }
    return new TextEncoder().encode(input["json"]).byteLength === input["bytes"];
  }
  return false;
}
