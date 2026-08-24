import { deserializeNativeStorageError, NativeStorageProtocolError } from "./protocol.js";

export const NATIVE_ARCHIVE_PROTOCOL_VERSION = 1 as const;
const NATIVE_ARCHIVE_FORMAT_VERSION = 1 as const;
const MAX_ARCHIVE_DATABASE_BYTES = 64 * 1024 * 1024 * 1024;
const U32_MAX = 0xffff_ffff;

export interface NativeArchiveTransport {
  invokeArchive(request: NativeArchiveRequest): Promise<unknown>;
}

export interface NativeArchiveRequest {
  readonly protocolVersion: typeof NATIVE_ARCHIVE_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly operation: NativeArchiveOperation;
}

export type NativeArchiveOperation =
  | { readonly type: "export"; readonly sessionId: string }
  | { readonly type: "restore"; readonly sessionId: string };

export interface NativeArchiveMetadata {
  readonly formatVersion: number;
  readonly schemaVersion: number;
  readonly databaseBytes: number;
  readonly sha256: string;
}

export interface NativeArchiveResponse {
  readonly protocolVersion: typeof NATIVE_ARCHIVE_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly data: NativeArchiveResponseData;
}

export type NativeArchiveResponseData =
  | { readonly type: "cancelled"; readonly operation: "export" | "restore" }
  | { readonly type: "exported"; readonly archive: NativeArchiveMetadata }
  | { readonly type: "restored"; readonly archive: NativeArchiveMetadata };

export type NativeArchiveOutcome =
  | { readonly status: "cancelled" }
  | { readonly status: "completed"; readonly archive: NativeArchiveMetadata };

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const invalidResponse = (cause?: unknown): NativeStorageProtocolError =>
  new NativeStorageProtocolError(
    "invalid_response",
    "The native archive boundary returned an invalid response.",
    false,
    cause === undefined ? undefined : { cause },
  );

const requireSafeInteger = (record: Readonly<Record<string, unknown>>, key: string): number => {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw invalidResponse();
  }
  return value;
};

const parseMetadata = (value: unknown): NativeArchiveMetadata => {
  if (!isRecord(value)) throw invalidResponse();
  const sha256 = value["sha256"];
  if (typeof sha256 !== "string" || !/^[0-9a-f]{64}$/.test(sha256)) {
    throw invalidResponse();
  }
  const formatVersion = requireSafeInteger(value, "formatVersion");
  const schemaVersion = requireSafeInteger(value, "schemaVersion");
  const databaseBytes = requireSafeInteger(value, "databaseBytes");
  if (
    formatVersion !== NATIVE_ARCHIVE_FORMAT_VERSION ||
    schemaVersion > U32_MAX ||
    databaseBytes > MAX_ARCHIVE_DATABASE_BYTES
  ) {
    throw invalidResponse();
  }
  return Object.freeze({
    formatVersion,
    schemaVersion,
    databaseBytes,
    sha256,
  });
};

const parseResponseData = (value: unknown): NativeArchiveResponseData => {
  if (!isRecord(value) || typeof value["type"] !== "string") throw invalidResponse();
  switch (value["type"]) {
    case "cancelled": {
      const operation = value["operation"];
      if (operation !== "export" && operation !== "restore") throw invalidResponse();
      return Object.freeze({ type: "cancelled", operation });
    }
    case "exported":
      return Object.freeze({ type: "exported", archive: parseMetadata(value["archive"]) });
    case "restored":
      return Object.freeze({ type: "restored", archive: parseMetadata(value["archive"]) });
    default:
      throw invalidResponse();
  }
};

export const parseNativeArchiveResponse = (
  value: unknown,
  requestId: string,
): NativeArchiveResponse => {
  if (!isRecord(value)) throw invalidResponse();
  if (
    value["protocolVersion"] !== NATIVE_ARCHIVE_PROTOCOL_VERSION ||
    value["requestId"] !== requestId
  ) {
    throw invalidResponse();
  }
  return Object.freeze({
    protocolVersion: NATIVE_ARCHIVE_PROTOCOL_VERSION,
    requestId,
    data: parseResponseData(value["data"]),
  });
};

export const deserializeNativeArchiveError = deserializeNativeStorageError;
