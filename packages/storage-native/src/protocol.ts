import type { SqlStatement, SqlValue } from "@coredrill/storage-core";

export const NATIVE_STORAGE_PROTOCOL_VERSION = 1 as const;

export interface NativeStorageTransport {
  invoke(request: NativeStorageRequest): Promise<unknown>;
}

export interface NativeStorageRequest {
  readonly protocolVersion: typeof NATIVE_STORAGE_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly operation: NativeStorageOperation;
}

export type NativeStorageOperation =
  | { readonly type: "open"; readonly databaseName: string }
  | { readonly type: "query"; readonly sessionId: string; readonly statement: NativeStatement }
  | { readonly type: "execute"; readonly sessionId: string; readonly statement: NativeStatement }
  | { readonly type: "begin"; readonly sessionId: string }
  | { readonly type: "commit"; readonly sessionId: string }
  | { readonly type: "rollback"; readonly sessionId: string }
  | { readonly type: "diagnostics"; readonly sessionId: string }
  | { readonly type: "close"; readonly sessionId: string }
  | { readonly type: "delete"; readonly sessionId: string };

export interface NativeStatement {
  readonly sql: string;
  readonly parameters: readonly NativeSqlValue[];
}

export type NativeSqlValue =
  | { readonly type: "null" }
  | { readonly type: "integer"; readonly value: string }
  | { readonly type: "real"; readonly value: number }
  | { readonly type: "text"; readonly value: string }
  | { readonly type: "blob"; readonly bytes: readonly number[] };

export interface NativeStorageResponse {
  readonly protocolVersion: typeof NATIVE_STORAGE_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly data: NativeStorageResponseData;
}

export type NativeStorageResponseData =
  | { readonly type: "opened"; readonly sessionId: string }
  | {
      readonly type: "rows";
      readonly columns: readonly string[];
      readonly rows: readonly (readonly NativeSqlValue[])[];
    }
  | {
      readonly type: "executed";
      readonly rowsAffected: number;
      readonly lastInsertRowId: string;
    }
  | { readonly type: "transaction_state"; readonly active: boolean }
  | {
      readonly type: "diagnostics";
      readonly sqliteVersion: string;
      readonly schemaVersion: number;
      readonly foreignKeysEnabled: boolean;
    }
  | { readonly type: "closed" }
  | { readonly type: "deleted"; readonly deleted: boolean };

export class NativeStorageProtocolError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;

  public constructor(code: string, message: string, retryable: boolean, options?: ErrorOptions) {
    super(message, options);
    this.name = "NativeStorageProtocolError";
    this.code = code;
    this.retryable = retryable;
  }
}

export class NativeStorageCapabilityError extends NativeStorageProtocolError {
  public constructor(capability: string) {
    super(
      "capability_unavailable",
      `Native storage capability ${capability} is not available in this Phase 0 candidate.`,
      false,
    );
    this.name = "NativeStorageCapabilityError";
  }
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const invalidResponse = (cause?: unknown): NativeStorageProtocolError =>
  new NativeStorageProtocolError(
    "invalid_response",
    "The native storage boundary returned an invalid response.",
    false,
    cause === undefined ? undefined : { cause },
  );

const requireString = (record: Readonly<Record<string, unknown>>, key: string): string => {
  const value = record[key];
  if (typeof value !== "string") throw invalidResponse();
  return value;
};

const requireBoolean = (record: Readonly<Record<string, unknown>>, key: string): boolean => {
  const value = record[key];
  if (typeof value !== "boolean") throw invalidResponse();
  return value;
};

const requireSafeInteger = (record: Readonly<Record<string, unknown>>, key: string): number => {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw invalidResponse();
  }
  return value;
};

const parseSqlValue = (value: unknown): NativeSqlValue => {
  if (!isRecord(value) || typeof value["type"] !== "string") throw invalidResponse();
  switch (value["type"]) {
    case "null":
      return Object.freeze({ type: "null" });
    case "integer":
      return Object.freeze({ type: "integer", value: requireString(value, "value") });
    case "real": {
      const number = value["value"];
      if (typeof number !== "number" || !Number.isFinite(number)) throw invalidResponse();
      return Object.freeze({ type: "real", value: number });
    }
    case "text":
      return Object.freeze({ type: "text", value: requireString(value, "value") });
    case "blob": {
      const bytes = value["bytes"];
      if (!Array.isArray(bytes)) throw invalidResponse();
      const parsedBytes: number[] = [];
      for (const byte of bytes as unknown[]) {
        if (typeof byte !== "number" || !Number.isInteger(byte) || byte < 0 || byte > 255) {
          throw invalidResponse();
        }
        parsedBytes.push(byte);
      }
      return Object.freeze({ type: "blob", bytes: Object.freeze(parsedBytes) });
    }
    default:
      throw invalidResponse();
  }
};

const parseResponseData = (value: unknown): NativeStorageResponseData => {
  if (!isRecord(value) || typeof value["type"] !== "string") throw invalidResponse();
  switch (value["type"]) {
    case "opened":
      return Object.freeze({ type: "opened", sessionId: requireString(value, "sessionId") });
    case "rows": {
      const columns = value["columns"];
      const rows = value["rows"];
      if (
        !Array.isArray(columns) ||
        !columns.every((column) => typeof column === "string") ||
        !Array.isArray(rows)
      ) {
        throw invalidResponse();
      }
      const parsedRows = rows.map((row) => {
        if (!Array.isArray(row) || row.length !== columns.length) throw invalidResponse();
        return Object.freeze(row.map(parseSqlValue));
      });
      return Object.freeze({
        type: "rows",
        columns: Object.freeze([...columns] as string[]),
        rows: Object.freeze(parsedRows),
      });
    }
    case "executed":
      return Object.freeze({
        type: "executed",
        rowsAffected: requireSafeInteger(value, "rowsAffected"),
        lastInsertRowId: requireString(value, "lastInsertRowId"),
      });
    case "transaction_state":
      return Object.freeze({
        type: "transaction_state",
        active: requireBoolean(value, "active"),
      });
    case "diagnostics":
      return Object.freeze({
        type: "diagnostics",
        sqliteVersion: requireString(value, "sqliteVersion"),
        schemaVersion: requireSafeInteger(value, "schemaVersion"),
        foreignKeysEnabled: requireBoolean(value, "foreignKeysEnabled"),
      });
    case "closed":
      return Object.freeze({ type: "closed" });
    case "deleted":
      return Object.freeze({ type: "deleted", deleted: requireBoolean(value, "deleted") });
    default:
      throw invalidResponse();
  }
};

export const parseNativeStorageResponse = (
  value: unknown,
  requestId: string,
): NativeStorageResponse => {
  if (!isRecord(value)) throw invalidResponse();
  if (
    value["protocolVersion"] !== NATIVE_STORAGE_PROTOCOL_VERSION ||
    value["requestId"] !== requestId
  ) {
    throw invalidResponse();
  }
  return Object.freeze({
    protocolVersion: NATIVE_STORAGE_PROTOCOL_VERSION,
    requestId,
    data: parseResponseData(value["data"]),
  });
};

export const deserializeNativeStorageError = (value: unknown): NativeStorageProtocolError => {
  if (!isRecord(value)) return invalidResponse(value);
  const code = value["code"];
  const message = value["message"];
  const retryable = value["retryable"];
  if (typeof code !== "string" || typeof message !== "string" || typeof retryable !== "boolean") {
    return invalidResponse(value);
  }
  return new NativeStorageProtocolError(code, message, retryable);
};

const I64_MIN = -(2n ** 63n);
const I64_MAX = 2n ** 63n - 1n;

const encodeSqlValue = (value: SqlValue): NativeSqlValue => {
  if (value === null) return Object.freeze({ type: "null" });
  if (typeof value === "bigint") {
    if (value < I64_MIN || value > I64_MAX) {
      throw new RangeError("Native SQLite integer parameters must fit in a signed 64-bit integer.");
    }
    return Object.freeze({ type: "integer", value: value.toString() });
  }
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new TypeError("Native SQLite numbers must be finite.");
    return Number.isSafeInteger(value)
      ? Object.freeze({ type: "integer", value: String(value) })
      : Object.freeze({ type: "real", value });
  }
  if (typeof value === "string") return Object.freeze({ type: "text", value });
  return Object.freeze({ type: "blob", bytes: Object.freeze(Array.from(value)) });
};

export const encodeNativeStatement = (statement: SqlStatement): NativeStatement =>
  Object.freeze({
    sql: statement.sql,
    parameters: Object.freeze(statement.parameters.map(encodeSqlValue)),
  });

export const decodeNativeSqlValue = (value: NativeSqlValue): SqlValue => {
  switch (value.type) {
    case "null":
      return null;
    case "integer": {
      const integer = BigInt(value.value);
      return integer >= BigInt(Number.MIN_SAFE_INTEGER) &&
        integer <= BigInt(Number.MAX_SAFE_INTEGER)
        ? Number(integer)
        : integer;
    }
    case "real":
      return value.value;
    case "text":
      return value.value;
    case "blob":
      return Uint8Array.from(value.bytes);
  }
};
