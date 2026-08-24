import type {
  ExecuteResult,
  PortableDatabase,
  QueryRow,
  SqlStatement,
  StorageDiagnostics,
} from "@coredrill/storage-core";

export const BROWSER_STORAGE_PROTOCOL_VERSION = 2 as const;

export interface BrowserStorageOpenResult {
  readonly databaseName: string;
  readonly existedBeforeOpen: boolean;
  readonly sqliteVersion: string;
  readonly vfs: "opfs-sahpool";
  readonly opfs: true;
  readonly thread: "dedicated-worker";
}

export interface BrowserStorageRestoreResult {
  readonly byteLength: number;
  readonly schemaVersion: number;
  readonly sha256: string;
  readonly integrity: "ok";
}

export interface BrowserStorageDeleteResult {
  readonly deleted: boolean;
}

export type BrowserStorageOperation =
  | "begin"
  | "close"
  | "commit"
  | "delete"
  | "diagnostics"
  | "execute"
  | "export"
  | "open"
  | "query"
  | "restore"
  | "rollback";

export interface BrowserStorageRequest {
  readonly version: typeof BROWSER_STORAGE_PROTOCOL_VERSION;
  readonly id: string;
  readonly operation: BrowserStorageOperation;
  readonly databaseName?: string;
  readonly statement?: SqlStatement;
  readonly portable?: PortableDatabase;
}

export interface BrowserStorageError {
  readonly name: string;
  readonly message: string;
  readonly resultCode?: number;
}

export interface BrowserStorageSuccessResponse {
  readonly version: typeof BROWSER_STORAGE_PROTOCOL_VERSION;
  readonly id: string;
  readonly ok: true;
  readonly result:
    | BrowserStorageDeleteResult
    | BrowserStorageOpenResult
    | BrowserStorageRestoreResult
    | ExecuteResult
    | PortableDatabase
    | StorageDiagnostics
    | readonly QueryRow[]
    | undefined;
}

export interface BrowserStorageFailureResponse {
  readonly version: typeof BROWSER_STORAGE_PROTOCOL_VERSION;
  readonly id: string;
  readonly ok: false;
  readonly error: BrowserStorageError;
}

export type BrowserStorageResponse = BrowserStorageFailureResponse | BrowserStorageSuccessResponse;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const isBrowserStorageRequest = (value: unknown): value is BrowserStorageRequest => {
  if (!isRecord(value)) return false;
  return (
    value["version"] === BROWSER_STORAGE_PROTOCOL_VERSION &&
    typeof value["id"] === "string" &&
    value["id"].length > 0 &&
    typeof value["operation"] === "string" &&
    [
      "begin",
      "close",
      "commit",
      "delete",
      "diagnostics",
      "execute",
      "export",
      "open",
      "query",
      "restore",
      "rollback",
    ].includes(value["operation"])
  );
};

export const isBrowserStorageResponse = (value: unknown): value is BrowserStorageResponse => {
  if (!isRecord(value)) return false;
  if (
    value["version"] !== BROWSER_STORAGE_PROTOCOL_VERSION ||
    typeof value["id"] !== "string" ||
    typeof value["ok"] !== "boolean"
  ) {
    return false;
  }
  if (value["ok"]) return "result" in value;
  if (!isRecord(value["error"])) return false;
  const resultCode = value["error"]["resultCode"];
  return (
    typeof value["error"]["name"] === "string" &&
    typeof value["error"]["message"] === "string" &&
    (resultCode === undefined ||
      (typeof resultCode === "number" && Number.isSafeInteger(resultCode)))
  );
};
