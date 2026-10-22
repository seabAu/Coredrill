import { entityId, instant } from "@coredrill/domain";
import { defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";
import { decodeLiteralUtf8Chunk } from "./literal-utf8-chunk.js";
import {
  CONTACT_HISTORY_MAX_SUMMARY_BYTES,
  ContactInteractionHistoryError,
  parseContactInteractionCursorV1,
  type ContactInteractionCursorV1,
} from "./contact-interaction-history.js";

/** This reference is a viewed record/version tuple, not an integrity certificate. */
export interface ReadContactInteractionSummaryInputV1 {
  readonly specVersion: 1;
  readonly reference: ContactInteractionCursorV1;
  readonly summaryByteLength: number;
  readonly byteOffset?: number;
  readonly limitBytes?: number;
}
export interface ReadContactInteractionSummaryRequestV1 {
  readonly specVersion: 1;
  readonly reference: ContactInteractionCursorV1;
  readonly summaryByteLength: number;
  readonly byteOffset: number;
  readonly limitBytes: number;
}
export interface ContactInteractionSummaryPartV1 {
  readonly specVersion: 1;
  readonly reference: ContactInteractionCursorV1;
  readonly summaryByteLength: number;
  readonly byteOffset: number;
  /** Exact literal text, never markup or commands. Empty is a retained empty summary. */
  readonly text: string;
  readonly bytesRead: number;
  readonly hasMore: boolean;
  readonly nextByteOffset: number | null;
}
export interface ContactInteractionSummaryPortV1 {
  readSummaryPart(input: ReadContactInteractionSummaryRequestV1): Promise<unknown>;
}
const record = (value: unknown, keys: readonly string[], required = keys) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError();
  if (
    Object.keys(value).some((key) => !keys.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    throw new TypeError();
  return value as Record<string, unknown>;
};
const integer = (value: unknown, minimum: number, maximum: number): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    throw new TypeError();
  return value;
};
export const parseContactInteractionSummaryRequestV1 = (
  value: unknown,
): ReadContactInteractionSummaryRequestV1 => {
  const raw = record(
    value,
    ["specVersion", "reference", "summaryByteLength", "byteOffset", "limitBytes"],
    ["specVersion", "reference", "summaryByteLength"],
  );
  if (raw["specVersion"] !== 1) throw new TypeError();
  const summaryByteLength = integer(raw["summaryByteLength"], 0, CONTACT_HISTORY_MAX_SUMMARY_BYTES);
  return Object.freeze({
    specVersion: 1,
    reference: parseContactInteractionCursorV1(raw["reference"]),
    summaryByteLength,
    byteOffset:
      raw["byteOffset"] === undefined ? 0 : integer(raw["byteOffset"], 0, summaryByteLength),
    limitBytes: raw["limitBytes"] === undefined ? 16_384 : integer(raw["limitBytes"], 4, 65_536),
  });
};

/** Revalidate a decoded application DTO at a reader boundary; not a content-hash claim. */
export const parseContactInteractionSummaryTextPartV1 = (
  value: unknown,
  scope: ReadContactInteractionSummaryInputV1,
): ContactInteractionSummaryPartV1 => {
  const input = parseContactInteractionSummaryRequestV1(scope);
  const raw = record(value, [
    "specVersion",
    "reference",
    "summaryByteLength",
    "byteOffset",
    "text",
    "bytesRead",
    "hasMore",
    "nextByteOffset",
  ]);
  const reference = parseContactInteractionCursorV1(raw["reference"]);
  const remaining = input.summaryByteLength - input.byteOffset;
  const maximum = Math.min(remaining, input.limitBytes);
  const bytesRead = integer(raw["bytesRead"], Math.max(0, maximum - 3), maximum);
  const text = raw["text"];
  const next = input.byteOffset + bytesRead;
  const hasMore = next < input.summaryByteLength;
  if (
    raw["specVersion"] !== 1 ||
    JSON.stringify(reference) !== JSON.stringify(input.reference) ||
    raw["summaryByteLength"] !== input.summaryByteLength ||
    raw["byteOffset"] !== input.byteOffset ||
    typeof text !== "string" ||
    text.length > input.limitBytes ||
    /[\uD800-\uDFFF]/u.test(text) ||
    new TextEncoder().encode(text).byteLength !== bytesRead ||
    (remaining > 0 && bytesRead === 0) ||
    (!hasMore && bytesRead !== remaining) ||
    (hasMore && remaining <= input.limitBytes) ||
    raw["hasMore"] !== hasMore ||
    raw["nextByteOffset"] !== (hasMore ? next : null)
  )
    throw new TypeError();
  return Object.freeze({
    specVersion: 1,
    reference,
    summaryByteLength: input.summaryByteLength,
    byteOffset: input.byteOffset,
    text,
    bytesRead,
    hasMore,
    nextByteOffset: hasMore ? next : null,
  });
};

export const parseContactInteractionSummaryPartV1 = (
  value: unknown,
  scope: ReadContactInteractionSummaryInputV1,
): ContactInteractionSummaryPartV1 => {
  const input = parseContactInteractionSummaryRequestV1(scope);
  const raw = record(value, [
    "specVersion",
    "reference",
    "summaryByteLength",
    "byteOffset",
    "bytes",
  ]);
  const reference = parseContactInteractionCursorV1(raw["reference"]);
  // Both references have the same strict own-key set and canonical construction order.
  if (
    raw["specVersion"] !== 1 ||
    JSON.stringify(reference) !== JSON.stringify(input.reference) ||
    raw["summaryByteLength"] !== input.summaryByteLength ||
    raw["byteOffset"] !== input.byteOffset
  )
    throw new TypeError();
  const part = decodeLiteralUtf8Chunk(
    raw["bytes"],
    input.summaryByteLength,
    input.byteOffset,
    input.limitBytes,
  );
  return Object.freeze({
    specVersion: 1,
    reference,
    summaryByteLength: input.summaryByteLength,
    byteOffset: input.byteOffset,
    text: part.text,
    bytesRead: part.bytesRead,
    hasMore: part.hasMore,
    nextByteOffset: part.hasMore ? input.byteOffset + part.bytesRead : null,
  });
};

export const createContactInteractionSummaryQuery = (port: ContactInteractionSummaryPortV1) =>
  defineQuery<ReadContactInteractionSummaryInputV1, ContactInteractionSummaryPartV1>(
    "ReadContactInteractionSummaryQuery",
    async (untrusted, context) => {
      let input: ReadContactInteractionSummaryRequestV1;
      try {
        entityId("application-operation", context.operationId);
        instant(context.initiatedAt);
        input = parseContactInteractionSummaryRequestV1(untrusted);
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose a valid recorded contact-summary part.",
          retryable: false,
        });
      }
      let result: unknown;
      try {
        result = await port.readSummaryPart(input);
      } catch (error) {
        const code =
          error instanceof ContactInteractionHistoryError && error.code === "cursor_invalidated"
            ? "conflict"
            : error instanceof ContactInteractionHistoryError && error.code === "invalid_state"
              ? "internal"
              : "unavailable";
        return applicationFailure({
          code,
          message: "The recorded summary could not be read. Refresh its history and try again.",
          retryable: code !== "internal",
        });
      }
      if (result === undefined)
        return applicationFailure({
          code: "not_found",
          message: "This recorded contact summary is not available in the requested scope.",
          retryable: false,
        });
      try {
        return applicationSuccess(parseContactInteractionSummaryPartV1(result, input));
      } catch {
        return applicationFailure({
          code: "internal",
          message: "Stored contact-summary content did not pass validation.",
          retryable: false,
        });
      }
    },
  );
