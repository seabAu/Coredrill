import { sha256CanonicalJson } from "@coredrill/capture-core";
import { safeParseCaptureEnvelope, type CaptureEnvelopeV1 } from "@coredrill/contracts";

export const OUTBOX_SPEC_VERSION = 1 as const;
export const OUTBOX_ITEM_SPEC_VERSION = 1 as const;
export const OUTBOX_LIMITS = Object.freeze({
  maxItems: 32,
  maxBytes: 6 * 1024 * 1024,
});

export interface OutboxItemV1 {
  readonly specVersion: typeof OUTBOX_ITEM_SPEC_VERSION;
  readonly envelope: CaptureEnvelopeV1;
  readonly envelopeChecksum: string;
  readonly envelopeBytes: number;
  readonly queuedAt: string;
  readonly expiresAt: string;
  readonly attemptCount: number;
  readonly status: "queued";
}

export interface OutboxStateV1 {
  readonly specVersion: typeof OUTBOX_SPEC_VERSION;
  readonly items: readonly OutboxItemV1[];
}

export type OutboxValidationResult =
  | { readonly success: true; readonly state: OutboxStateV1; readonly encodedBytes: number }
  | {
      readonly success: false;
      readonly code: "state_invalid" | "checksum_mismatch" | "outbox_too_large";
      readonly issue: string;
    };

export type QueueOutboxResult =
  | {
      readonly success: true;
      readonly state: OutboxStateV1;
      readonly item: OutboxItemV1;
      readonly encodedBytes: number;
      readonly removedExpired: number;
    }
  | {
      readonly success: false;
      readonly code:
        | "state_invalid"
        | "checksum_mismatch"
        | "outbox_too_large"
        | "envelope_invalid"
        | "envelope_expired"
        | "duplicate"
        | "outbox_full";
      readonly issue: string;
    };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(record: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(record).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function encodedBytes(value: unknown): number | undefined {
  try {
    const serialized = JSON.stringify(value);
    return typeof serialized === "string"
      ? new TextEncoder().encode(serialized).byteLength
      : undefined;
  } catch {
    return undefined;
  }
}

function isInstant(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)) {
    return false;
  }
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
}

function parseItemShape(
  input: unknown,
):
  | { readonly success: true; readonly item: Record<string, unknown> }
  | { readonly success: false; readonly issue: string } {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, [
      "specVersion",
      "envelope",
      "envelopeChecksum",
      "envelopeBytes",
      "queuedAt",
      "expiresAt",
      "attemptCount",
      "status",
    ]) ||
    input["specVersion"] !== OUTBOX_ITEM_SPEC_VERSION ||
    typeof input["envelopeChecksum"] !== "string" ||
    !/^[0-9a-f]{64}$/.test(input["envelopeChecksum"]) ||
    !Number.isSafeInteger(input["envelopeBytes"]) ||
    (input["envelopeBytes"] as number) <= 0 ||
    !isInstant(input["queuedAt"]) ||
    !isInstant(input["expiresAt"]) ||
    !Number.isSafeInteger(input["attemptCount"]) ||
    (input["attemptCount"] as number) < 0 ||
    input["status"] !== "queued"
  ) {
    return { success: false, issue: "Outbox item shape is invalid." };
  }
  return { success: true, item: input };
}

export function createEmptyOutboxState(): OutboxStateV1 {
  return { specVersion: OUTBOX_SPEC_VERSION, items: [] };
}

export async function safeParseOutboxState(input: unknown): Promise<OutboxValidationResult> {
  if (
    !isRecord(input) ||
    !hasExactKeys(input, ["specVersion", "items"]) ||
    input["specVersion"] !== OUTBOX_SPEC_VERSION ||
    !Array.isArray(input["items"]) ||
    input["items"].length > OUTBOX_LIMITS.maxItems
  ) {
    return { success: false, code: "state_invalid", issue: "Outbox state shape is invalid." };
  }

  const items: OutboxItemV1[] = [];
  const envelopeIds = new Set<string>();
  const contentHashes = new Set<string>();
  for (const inputItem of input["items"]) {
    const parsedItem = parseItemShape(inputItem);
    if (!parsedItem.success) {
      return { success: false, code: "state_invalid", issue: parsedItem.issue };
    }
    const item = parsedItem.item;
    const parsedEnvelope = safeParseCaptureEnvelope(item["envelope"]);
    if (
      !parsedEnvelope.success ||
      parsedEnvelope.encodedBytes !== item["envelopeBytes"] ||
      parsedEnvelope.data.expiresAt !== item["expiresAt"] ||
      envelopeIds.has(parsedEnvelope.data.id) ||
      contentHashes.has(parsedEnvelope.data.contentHash)
    ) {
      return {
        success: false,
        code: "state_invalid",
        issue: "Outbox envelope metadata is invalid or duplicated.",
      };
    }
    const checksum = await sha256CanonicalJson(parsedEnvelope.data);
    if (checksum !== item["envelopeChecksum"]) {
      return {
        success: false,
        code: "checksum_mismatch",
        issue: `Checksum mismatch for envelope ${parsedEnvelope.data.id}.`,
      };
    }
    envelopeIds.add(parsedEnvelope.data.id);
    contentHashes.add(parsedEnvelope.data.contentHash);
    items.push({
      specVersion: OUTBOX_ITEM_SPEC_VERSION,
      envelope: parsedEnvelope.data,
      envelopeChecksum: item["envelopeChecksum"],
      envelopeBytes: parsedEnvelope.encodedBytes,
      queuedAt: item["queuedAt"] as string,
      expiresAt: item["expiresAt"],
      attemptCount: item["attemptCount"] as number,
      status: "queued",
    });
  }

  const state: OutboxStateV1 = { specVersion: OUTBOX_SPEC_VERSION, items };
  const size = encodedBytes(state);
  if (size === undefined) {
    return { success: false, code: "state_invalid", issue: "Outbox is not serializable." };
  }
  if (size > OUTBOX_LIMITS.maxBytes) {
    return {
      success: false,
      code: "outbox_too_large",
      issue: `Outbox requires ${String(size)} bytes; the limit is ${String(OUTBOX_LIMITS.maxBytes)}.`,
    };
  }
  return { success: true, state, encodedBytes: size };
}

export async function queueCaptureEnvelope(
  stateInput: unknown,
  envelopeInput: unknown,
  now = new Date(),
): Promise<QueueOutboxResult> {
  const parsedState = await safeParseOutboxState(stateInput);
  if (!parsedState.success) return parsedState;

  const parsedEnvelope = safeParseCaptureEnvelope(envelopeInput);
  if (!parsedEnvelope.success) {
    return {
      success: false,
      code: "envelope_invalid",
      issue: "Capture envelope failed boundary validation.",
    };
  }
  const nowMilliseconds = now.getTime();
  if (
    !Number.isSafeInteger(nowMilliseconds) ||
    nowMilliseconds < 0 ||
    nowMilliseconds > 253_402_300_799_999
  ) {
    return { success: false, code: "state_invalid", issue: "Queue timestamp is invalid." };
  }
  if (Date.parse(parsedEnvelope.data.expiresAt) <= nowMilliseconds) {
    return {
      success: false,
      code: "envelope_expired",
      issue: "Expired captures cannot enter the outbox.",
    };
  }

  const retainedItems = parsedState.state.items.filter(
    (item) => Date.parse(item.expiresAt) > nowMilliseconds,
  );
  const removedExpired = parsedState.state.items.length - retainedItems.length;
  if (
    retainedItems.some(
      (item) =>
        item.envelope.id === parsedEnvelope.data.id ||
        item.envelope.contentHash === parsedEnvelope.data.contentHash,
    )
  ) {
    return { success: false, code: "duplicate", issue: "This capture is already queued." };
  }
  if (retainedItems.length >= OUTBOX_LIMITS.maxItems) {
    return {
      success: false,
      code: "outbox_full",
      issue: `Outbox already contains ${String(OUTBOX_LIMITS.maxItems)} untransferred captures.`,
    };
  }

  const item: OutboxItemV1 = {
    specVersion: OUTBOX_ITEM_SPEC_VERSION,
    envelope: parsedEnvelope.data,
    envelopeChecksum: await sha256CanonicalJson(parsedEnvelope.data),
    envelopeBytes: parsedEnvelope.encodedBytes,
    queuedAt: now.toISOString(),
    expiresAt: parsedEnvelope.data.expiresAt,
    attemptCount: 0,
    status: "queued",
  };
  const state: OutboxStateV1 = {
    specVersion: OUTBOX_SPEC_VERSION,
    items: [...retainedItems, item],
  };
  const size = encodedBytes(state);
  if (size === undefined) {
    return { success: false, code: "state_invalid", issue: "Outbox is not serializable." };
  }
  if (size > OUTBOX_LIMITS.maxBytes) {
    return {
      success: false,
      code: "outbox_full",
      issue: `Capture would exceed the ${String(OUTBOX_LIMITS.maxBytes)}-byte outbox limit.`,
    };
  }
  return { success: true, state, item, encodedBytes: size, removedExpired };
}
