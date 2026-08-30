import { sha256CanonicalJson } from "@coredrill/capture-core";
import { safeParseCaptureEnvelope, type CaptureEnvelopeV1 } from "@coredrill/contracts";

import {
  OUTBOX_LIMITS,
  OUTBOX_SPEC_VERSION,
  safeParseOutboxState,
  type OutboxItemV1,
  type OutboxStateV1,
} from "./outbox.js";

export const TRANSFER_SPEC_VERSION = 1 as const;
export const OUTBOX_EXPORT_SPEC_VERSION = 1 as const;
export const TRANSFER_LIMITS = Object.freeze({
  maxRequestBytes: 2 * 1024,
  maxExportBytes: OUTBOX_LIMITS.maxBytes + 16 * 1024,
});

export interface TransferPullRequestV1 {
  readonly specVersion: typeof TRANSFER_SPEC_VERSION;
  readonly type: "capture.transfer.pull.v1";
  readonly requestId: string;
}

export interface TransferAckRequestV1 {
  readonly specVersion: typeof TRANSFER_SPEC_VERSION;
  readonly type: "capture.transfer.ack.v1";
  readonly requestId: string;
  readonly envelopeId: string;
  readonly envelopeChecksum: string;
  readonly contentHash: string;
  readonly nonce: string;
  readonly sequence: number;
}

export type ExternalTransferRequestV1 = TransferPullRequestV1 | TransferAckRequestV1;

export interface TransferOfferV1 {
  readonly specVersion: typeof TRANSFER_SPEC_VERSION;
  readonly type: "capture.transfer.offer.v1";
  readonly requestId: string;
  readonly attempt: number;
  readonly envelope: CaptureEnvelopeV1;
  readonly envelopeChecksum: string;
  readonly envelopeBytes: number;
}

export interface TransferEmptyV1 {
  readonly specVersion: typeof TRANSFER_SPEC_VERSION;
  readonly type: "capture.transfer.empty.v1";
  readonly requestId: string;
  readonly removedExpired: number;
}

export interface TransferAcknowledgedV1 {
  readonly specVersion: typeof TRANSFER_SPEC_VERSION;
  readonly type: "capture.transfer.acknowledged.v1";
  readonly requestId: string;
  readonly envelopeId: string;
  readonly remainingCount: number;
}

export interface TransferErrorV1 {
  readonly specVersion: typeof TRANSFER_SPEC_VERSION;
  readonly type: "capture.transfer.error.v1";
  readonly requestId: string | null;
  readonly code: string;
  readonly message: string;
}

export type ExternalTransferResponseV1 =
  TransferOfferV1 | TransferEmptyV1 | TransferAcknowledgedV1 | TransferErrorV1;

export interface OutboxExportV1 {
  readonly specVersion: typeof OUTBOX_EXPORT_SPEC_VERSION;
  readonly type: "coredrill.capture.outbox-export.v1";
  readonly exportedAt: string;
  readonly items: readonly OutboxItemV1[];
  readonly itemsChecksum: string;
}

export type PrepareTransferResult =
  | {
      readonly success: true;
      readonly state: OutboxStateV1;
      readonly response: TransferOfferV1 | TransferEmptyV1;
      readonly removedExpired: number;
    }
  | {
      readonly success: false;
      readonly code: string;
      readonly issue: string;
    };

export type AcknowledgeTransferResult =
  | {
      readonly success: true;
      readonly state: OutboxStateV1;
      readonly response: TransferAcknowledgedV1;
    }
  | {
      readonly success: false;
      readonly code: string;
      readonly issue: string;
    };

export type OutboxExportValidationResult =
  | { readonly success: true; readonly data: OutboxExportV1; readonly encodedBytes: number }
  | {
      readonly success: false;
      readonly code:
        "export_invalid" | "export_too_large" | "checksum_mismatch" | "capture_expired";
      readonly issue: string;
    };

const REQUEST_ID_PATTERN = /^[A-Za-z0-9_-]{22,128}$/u;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const SHA256_PATTERN = /^[0-9a-f]{64}$/u;
const NONCE_PATTERN = /^[A-Za-z0-9_-]{22,128}$/u;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const sortedExpected = [...expected].sort();
  return (
    actual.length === sortedExpected.length &&
    actual.every((key, index) => key === sortedExpected[index])
  );
}

function encodedBytes(value: unknown): number | undefined {
  try {
    const encoded = JSON.stringify(value);
    return typeof encoded === "string" ? new TextEncoder().encode(encoded).byteLength : undefined;
  } catch {
    return undefined;
  }
}

function isInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u.test(value)) {
    return false;
  }
  const date = new Date(value);
  return !Number.isNaN(date.getTime()) && date.toISOString() === value;
}

function activeOutbox(
  state: OutboxStateV1,
  now: Date,
): {
  readonly state: OutboxStateV1;
  readonly removedExpired: number;
} {
  const nowMilliseconds = now.getTime();
  const items = state.items.filter((item) => Date.parse(item.expiresAt) > nowMilliseconds);
  return {
    state: { specVersion: OUTBOX_SPEC_VERSION, items },
    removedExpired: state.items.length - items.length,
  };
}

export function transferErrorResponse(
  code: string,
  message: string,
  requestId: string | null = null,
): TransferErrorV1 {
  return {
    specVersion: TRANSFER_SPEC_VERSION,
    type: "capture.transfer.error.v1",
    requestId,
    code,
    message,
  };
}

export function parseExternalTransferRequest(
  input: unknown,
): ExternalTransferRequestV1 | undefined {
  const size = encodedBytes(input);
  if (size === undefined || size > TRANSFER_LIMITS.maxRequestBytes || !isRecord(input)) {
    return undefined;
  }
  if (
    input["specVersion"] !== TRANSFER_SPEC_VERSION ||
    typeof input["requestId"] !== "string" ||
    !REQUEST_ID_PATTERN.test(input["requestId"])
  ) {
    return undefined;
  }
  if (
    input["type"] === "capture.transfer.pull.v1" &&
    hasExactKeys(input, ["specVersion", "type", "requestId"])
  ) {
    return {
      specVersion: TRANSFER_SPEC_VERSION,
      type: "capture.transfer.pull.v1",
      requestId: input["requestId"],
    };
  }
  if (
    input["type"] === "capture.transfer.ack.v1" &&
    hasExactKeys(input, [
      "specVersion",
      "type",
      "requestId",
      "envelopeId",
      "envelopeChecksum",
      "contentHash",
      "nonce",
      "sequence",
    ]) &&
    typeof input["envelopeId"] === "string" &&
    UUID_PATTERN.test(input["envelopeId"]) &&
    typeof input["envelopeChecksum"] === "string" &&
    SHA256_PATTERN.test(input["envelopeChecksum"]) &&
    typeof input["contentHash"] === "string" &&
    SHA256_PATTERN.test(input["contentHash"]) &&
    typeof input["nonce"] === "string" &&
    NONCE_PATTERN.test(input["nonce"]) &&
    Number.isSafeInteger(input["sequence"]) &&
    (input["sequence"] as number) >= 0
  ) {
    return {
      specVersion: TRANSFER_SPEC_VERSION,
      type: "capture.transfer.ack.v1",
      requestId: input["requestId"],
      envelopeId: input["envelopeId"],
      envelopeChecksum: input["envelopeChecksum"],
      contentHash: input["contentHash"],
      nonce: input["nonce"],
      sequence: input["sequence"] as number,
    };
  }
  return undefined;
}

export async function prepareNextOutboxTransfer(
  stateInput: unknown,
  request: TransferPullRequestV1,
  now = new Date(),
): Promise<PrepareTransferResult> {
  const parsedRequest = parseExternalTransferRequest(request);
  if (parsedRequest?.type !== "capture.transfer.pull.v1") {
    return { success: false, code: "message_invalid", issue: "Transfer request is invalid." };
  }
  const parsedState = await safeParseOutboxState(stateInput);
  if (!parsedState.success) return parsedState;
  const active = activeOutbox(parsedState.state, now);
  const first = active.state.items[0];
  if (first === undefined) {
    return {
      success: true,
      state: active.state,
      removedExpired: active.removedExpired,
      response: {
        specVersion: TRANSFER_SPEC_VERSION,
        type: "capture.transfer.empty.v1",
        requestId: request.requestId,
        removedExpired: active.removedExpired,
      },
    };
  }
  if (first.attemptCount >= Number.MAX_SAFE_INTEGER) {
    return {
      success: false,
      code: "attempt_exhausted",
      issue: "The transfer attempt counter is exhausted.",
    };
  }
  const attempted: OutboxItemV1 = { ...first, attemptCount: first.attemptCount + 1 };
  const state: OutboxStateV1 = {
    specVersion: OUTBOX_SPEC_VERSION,
    items: [attempted, ...active.state.items.slice(1)],
  };
  return {
    success: true,
    state,
    removedExpired: active.removedExpired,
    response: {
      specVersion: TRANSFER_SPEC_VERSION,
      type: "capture.transfer.offer.v1",
      requestId: request.requestId,
      attempt: attempted.attemptCount,
      envelope: attempted.envelope,
      envelopeChecksum: attempted.envelopeChecksum,
      envelopeBytes: attempted.envelopeBytes,
    },
  };
}

export async function acknowledgeOutboxTransfer(
  stateInput: unknown,
  request: TransferAckRequestV1,
  now = new Date(),
): Promise<AcknowledgeTransferResult> {
  const parsedRequest = parseExternalTransferRequest(request);
  if (parsedRequest?.type !== "capture.transfer.ack.v1") {
    return { success: false, code: "message_invalid", issue: "Acknowledgement is invalid." };
  }
  const parsedState = await safeParseOutboxState(stateInput);
  if (!parsedState.success) return parsedState;
  const active = activeOutbox(parsedState.state, now);
  const index = active.state.items.findIndex((item) => item.envelope.id === request.envelopeId);
  const item = active.state.items[index];
  if (item === undefined) {
    return {
      success: false,
      code: "replay_or_unknown_ack",
      issue: "Acknowledgement does not identify an active outbox item.",
    };
  }
  if (
    item.attemptCount === 0 ||
    item.envelopeChecksum !== request.envelopeChecksum ||
    item.envelope.contentHash !== request.contentHash ||
    item.envelope.nonce !== request.nonce ||
    item.envelope.sequence !== request.sequence
  ) {
    return {
      success: false,
      code: "ack_mismatch",
      issue: "Acknowledgement metadata does not match the offered capture.",
    };
  }
  const items = active.state.items.filter((_, itemIndex) => itemIndex !== index);
  const state: OutboxStateV1 = { specVersion: OUTBOX_SPEC_VERSION, items };
  return {
    success: true,
    state,
    response: {
      specVersion: TRANSFER_SPEC_VERSION,
      type: "capture.transfer.acknowledged.v1",
      requestId: request.requestId,
      envelopeId: request.envelopeId,
      remainingCount: items.length,
    },
  };
}

export function createTransferAcknowledgement(offer: TransferOfferV1): TransferAckRequestV1 {
  return {
    specVersion: TRANSFER_SPEC_VERSION,
    type: "capture.transfer.ack.v1",
    requestId: offer.requestId,
    envelopeId: offer.envelope.id,
    envelopeChecksum: offer.envelopeChecksum,
    contentHash: offer.envelope.contentHash,
    nonce: offer.envelope.nonce,
    sequence: offer.envelope.sequence,
  };
}

export async function safeParseTransferResponse(
  input: unknown,
  options: {
    readonly expectedRequestId: string;
    readonly expectedExtensionId: string;
    readonly now?: Date;
  },
): Promise<ExternalTransferResponseV1 | undefined> {
  if (!isRecord(input) || input["specVersion"] !== TRANSFER_SPEC_VERSION) return undefined;
  if (input["type"] === "capture.transfer.offer.v1") {
    if (
      !hasExactKeys(input, [
        "specVersion",
        "type",
        "requestId",
        "attempt",
        "envelope",
        "envelopeChecksum",
        "envelopeBytes",
      ]) ||
      input["requestId"] !== options.expectedRequestId ||
      !Number.isSafeInteger(input["attempt"]) ||
      (input["attempt"] as number) <= 0 ||
      typeof input["envelopeChecksum"] !== "string" ||
      !SHA256_PATTERN.test(input["envelopeChecksum"]) ||
      !Number.isSafeInteger(input["envelopeBytes"]) ||
      (input["envelopeBytes"] as number) <= 0
    ) {
      return undefined;
    }
    const parsedEnvelope = safeParseCaptureEnvelope(input["envelope"]);
    if (
      !parsedEnvelope.success ||
      parsedEnvelope.encodedBytes !== input["envelopeBytes"] ||
      parsedEnvelope.data.sender.kind !== "browser_extension" ||
      parsedEnvelope.data.sender.id !== options.expectedExtensionId ||
      Date.parse(parsedEnvelope.data.expiresAt) <= (options.now ?? new Date()).getTime() ||
      (await sha256CanonicalJson(parsedEnvelope.data)) !== input["envelopeChecksum"]
    ) {
      return undefined;
    }
    return {
      specVersion: TRANSFER_SPEC_VERSION,
      type: "capture.transfer.offer.v1",
      requestId: options.expectedRequestId,
      attempt: input["attempt"] as number,
      envelope: parsedEnvelope.data,
      envelopeChecksum: input["envelopeChecksum"],
      envelopeBytes: parsedEnvelope.encodedBytes,
    };
  }
  if (
    input["type"] === "capture.transfer.empty.v1" &&
    hasExactKeys(input, ["specVersion", "type", "requestId", "removedExpired"]) &&
    input["requestId"] === options.expectedRequestId &&
    Number.isSafeInteger(input["removedExpired"]) &&
    (input["removedExpired"] as number) >= 0
  ) {
    return input as unknown as TransferEmptyV1;
  }
  if (
    input["type"] === "capture.transfer.acknowledged.v1" &&
    hasExactKeys(input, ["specVersion", "type", "requestId", "envelopeId", "remainingCount"]) &&
    input["requestId"] === options.expectedRequestId &&
    typeof input["envelopeId"] === "string" &&
    UUID_PATTERN.test(input["envelopeId"]) &&
    Number.isSafeInteger(input["remainingCount"]) &&
    (input["remainingCount"] as number) >= 0
  ) {
    return input as unknown as TransferAcknowledgedV1;
  }
  if (
    input["type"] === "capture.transfer.error.v1" &&
    hasExactKeys(input, ["specVersion", "type", "requestId", "code", "message"]) &&
    (input["requestId"] === null || input["requestId"] === options.expectedRequestId) &&
    typeof input["code"] === "string" &&
    input["code"].length > 0 &&
    input["code"].length <= 128 &&
    typeof input["message"] === "string" &&
    input["message"].length > 0 &&
    input["message"].length <= 512
  ) {
    return input as unknown as TransferErrorV1;
  }
  return undefined;
}

export async function createOutboxExport(
  stateInput: unknown,
  now = new Date(),
): Promise<OutboxExportValidationResult> {
  const parsedState = await safeParseOutboxState(stateInput);
  if (!parsedState.success) {
    return { success: false, code: "export_invalid", issue: parsedState.issue };
  }
  const active = activeOutbox(parsedState.state, now);
  const data: OutboxExportV1 = {
    specVersion: OUTBOX_EXPORT_SPEC_VERSION,
    type: "coredrill.capture.outbox-export.v1",
    exportedAt: now.toISOString(),
    items: active.state.items,
    itemsChecksum: await sha256CanonicalJson(active.state.items),
  };
  const size = encodedBytes(data);
  if (size === undefined || size > TRANSFER_LIMITS.maxExportBytes) {
    return {
      success: false,
      code: "export_too_large",
      issue: "Outbox export exceeds the reviewed size limit.",
    };
  }
  return { success: true, data, encodedBytes: size };
}

export async function safeParseOutboxExport(
  input: unknown,
  now = new Date(),
): Promise<OutboxExportValidationResult> {
  const size = encodedBytes(input);
  if (size === undefined || !isRecord(input)) {
    return { success: false, code: "export_invalid", issue: "Outbox export is invalid." };
  }
  if (size > TRANSFER_LIMITS.maxExportBytes) {
    return {
      success: false,
      code: "export_too_large",
      issue: "Outbox export exceeds the reviewed size limit.",
    };
  }
  if (
    !hasExactKeys(input, ["specVersion", "type", "exportedAt", "items", "itemsChecksum"]) ||
    input["specVersion"] !== OUTBOX_EXPORT_SPEC_VERSION ||
    input["type"] !== "coredrill.capture.outbox-export.v1" ||
    !isInstant(input["exportedAt"]) ||
    !Array.isArray(input["items"]) ||
    typeof input["itemsChecksum"] !== "string" ||
    !SHA256_PATTERN.test(input["itemsChecksum"])
  ) {
    return { success: false, code: "export_invalid", issue: "Outbox export shape is invalid." };
  }
  const parsedState = await safeParseOutboxState({
    specVersion: OUTBOX_SPEC_VERSION,
    items: input["items"],
  });
  if (!parsedState.success) {
    return { success: false, code: "export_invalid", issue: parsedState.issue };
  }
  if ((await sha256CanonicalJson(parsedState.state.items)) !== input["itemsChecksum"]) {
    return {
      success: false,
      code: "checksum_mismatch",
      issue: "Outbox export checksum does not match its items.",
    };
  }
  if (parsedState.state.items.some((item) => Date.parse(item.expiresAt) <= now.getTime())) {
    return {
      success: false,
      code: "capture_expired",
      issue: "Outbox export contains an expired capture.",
    };
  }
  return {
    success: true,
    data: {
      specVersion: OUTBOX_EXPORT_SPEC_VERSION,
      type: "coredrill.capture.outbox-export.v1",
      exportedAt: input["exportedAt"],
      items: parsedState.state.items,
      itemsChecksum: input["itemsChecksum"],
    },
    encodedBytes: size,
  };
}

export async function parseOutboxExportJson(
  json: string,
  now = new Date(),
): Promise<OutboxExportValidationResult> {
  if (new TextEncoder().encode(json).byteLength > TRANSFER_LIMITS.maxExportBytes) {
    return {
      success: false,
      code: "export_too_large",
      issue: "Outbox export exceeds the reviewed size limit.",
    };
  }
  try {
    return await safeParseOutboxExport(JSON.parse(json) as unknown, now);
  } catch {
    return { success: false, code: "export_invalid", issue: "Outbox export JSON is invalid." };
  }
}
