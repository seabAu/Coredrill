import { deserializeNativeStorageError, NativeStorageProtocolError } from "./protocol.js";

export const NATIVE_ARCHIVE_PROTOCOL_VERSION = 2 as const;
const NATIVE_ARCHIVE_FORMAT_VERSION = 1 as const;
const MAX_ARCHIVE_DATABASE_BYTES = 64 * 1024 * 1024 * 1024;
const MAX_PORTABLE_ENTRY_BYTES = 256 * 1024 * 1024;
const MAX_PORTABLE_ATTACHMENTS = 10_000;
export const NATIVE_BACKUP_RETENTION_LIMITS = Object.freeze({ min: 1, max: 90 });
const MAX_MANAGED_BACKUP_ENTRIES = 512;
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
  | { readonly type: "restore"; readonly sessionId: string }
  | {
      readonly type: "automatic_backup";
      readonly sessionId: string;
      readonly retentionCount: number;
    }
  | { readonly type: "portable_export"; readonly sessionId: string }
  | {
      readonly type: "portable_inspect";
      readonly sessionId: string;
      readonly database: NativePortableDatabase;
      readonly expectedVaultId: string;
    }
  | { readonly type: "portable_target"; readonly sessionId: string }
  | { readonly type: "attachment_read"; readonly sessionId: string; readonly contentId: string }
  | {
      readonly type: "portable_commit";
      readonly sessionId: string;
      readonly expectedTargetFingerprint: string;
      readonly vaultId: string;
      readonly database: NativePortableDatabase;
      readonly attachments: readonly NativePortableAttachment[];
    };

export interface NativePortableDatabase {
  readonly schemaVersion: number;
  readonly byteLength: number;
  readonly sha256: string;
  readonly bytes: readonly number[];
}

export interface NativePortableAttachment {
  readonly contentId: string;
  readonly mediaType: string;
  readonly logicalName?: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly bytes: readonly number[];
}

export type NativePortableTarget =
  | {
      readonly state: "empty";
      readonly fingerprint: string;
      readonly attachmentContentIds: readonly [];
    }
  | {
      readonly state: "present";
      readonly fingerprint: string;
      readonly vaultId: string;
      readonly schemaVersion: number;
      readonly databaseSha256: string;
      readonly attachmentContentIds: readonly string[];
    };

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

export interface NativeAutomaticBackupMetadata {
  readonly createdAtUnixMs: number;
  readonly retentionCount: number;
  readonly knownGoodBackups: number;
  readonly prunedBackups: number;
  readonly cleanupPending: boolean;
  readonly archive: NativeArchiveMetadata;
}

export type NativeArchiveResponseData =
  | { readonly type: "cancelled"; readonly operation: "export" | "restore" }
  | { readonly type: "exported"; readonly archive: NativeArchiveMetadata }
  | { readonly type: "restored"; readonly archive: NativeArchiveMetadata }
  | { readonly type: "backup_created"; readonly backup: NativeAutomaticBackupMetadata }
  | { readonly type: "portable_database"; readonly database: NativePortableDatabase }
  | {
      readonly type: "portable_inspection";
      readonly integrity: "ok";
      readonly schemaVersion: number;
      readonly vaultId: string;
    }
  | { readonly type: "portable_target"; readonly target: NativePortableTarget }
  | {
      readonly type: "attachment_data";
      readonly contentId: string;
      readonly byteLength: number;
      readonly sha256: string;
      readonly bytes: readonly number[];
    }
  | { readonly type: "attachment_missing"; readonly contentId: string }
  | {
      readonly type: "portable_committed";
      readonly databaseSha256: string;
      readonly attachmentCount: number;
    };

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

const parseSha256 = (value: unknown): string => {
  if (typeof value !== "string" || !/^[0-9a-f]{64}$/.test(value)) throw invalidResponse();
  return value;
};

const parseBytes = (value: unknown, expectedLength: number): readonly number[] => {
  if (
    !Array.isArray(value) ||
    value.length !== expectedLength ||
    value.length > MAX_PORTABLE_ENTRY_BYTES
  ) {
    throw invalidResponse();
  }
  const bytes: number[] = [];
  for (const byte of value) {
    if (typeof byte !== "number" || !Number.isInteger(byte) || byte < 0 || byte > 255) {
      throw invalidResponse();
    }
    bytes.push(byte);
  }
  return Object.freeze(bytes);
};

const parsePortableDatabase = (value: unknown): NativePortableDatabase => {
  if (!isRecord(value)) throw invalidResponse();
  const schemaVersion = requireSafeInteger(value, "schemaVersion");
  const byteLength = requireSafeInteger(value, "byteLength");
  if (schemaVersion < 1 || schemaVersion > U32_MAX || byteLength > MAX_PORTABLE_ENTRY_BYTES) {
    throw invalidResponse();
  }
  return Object.freeze({
    schemaVersion,
    byteLength,
    sha256: parseSha256(value["sha256"]),
    bytes: parseBytes(value["bytes"], byteLength),
  });
};

const parseTarget = (value: unknown): NativePortableTarget => {
  if (!isRecord(value)) throw invalidResponse();
  const state = value["state"];
  const fingerprint = parseSha256(value["fingerprint"]);
  const rawContentIds = value["attachmentContentIds"];
  if (!Array.isArray(rawContentIds) || rawContentIds.length > MAX_PORTABLE_ATTACHMENTS) {
    throw invalidResponse();
  }
  const contentIds = rawContentIds.map(parseSha256);
  if (new Set(contentIds).size !== contentIds.length) throw invalidResponse();
  contentIds.sort();
  if (state === "empty") {
    if (contentIds.length !== 0) throw invalidResponse();
    return Object.freeze({
      state: "empty" as const,
      fingerprint,
      attachmentContentIds: Object.freeze([] as const),
    });
  }
  if (state !== "present" || typeof value["vaultId"] !== "string") throw invalidResponse();
  const schemaVersion = requireSafeInteger(value, "schemaVersion");
  if (schemaVersion < 1 || schemaVersion > U32_MAX) throw invalidResponse();
  return Object.freeze({
    state: "present" as const,
    fingerprint,
    vaultId: value["vaultId"],
    schemaVersion,
    databaseSha256: parseSha256(value["databaseSha256"]),
    attachmentContentIds: Object.freeze(contentIds),
  });
};

const parseMetadata = (value: unknown): NativeArchiveMetadata => {
  if (!isRecord(value)) throw invalidResponse();
  const sha256 = parseSha256(value["sha256"]);
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

const parseAutomaticBackupMetadata = (value: unknown): NativeAutomaticBackupMetadata => {
  if (!isRecord(value)) throw invalidResponse();
  const createdAtUnixMs = requireSafeInteger(value, "createdAtUnixMs");
  const retentionCount = requireSafeInteger(value, "retentionCount");
  const knownGoodBackups = requireSafeInteger(value, "knownGoodBackups");
  const prunedBackups = requireSafeInteger(value, "prunedBackups");
  const cleanupPending = value["cleanupPending"];
  if (
    createdAtUnixMs === 0 ||
    retentionCount < NATIVE_BACKUP_RETENTION_LIMITS.min ||
    retentionCount > NATIVE_BACKUP_RETENTION_LIMITS.max ||
    knownGoodBackups < 1 ||
    knownGoodBackups > MAX_MANAGED_BACKUP_ENTRIES ||
    prunedBackups > MAX_MANAGED_BACKUP_ENTRIES ||
    typeof cleanupPending !== "boolean" ||
    (!cleanupPending && knownGoodBackups > retentionCount)
  ) {
    throw invalidResponse();
  }
  return Object.freeze({
    createdAtUnixMs,
    retentionCount,
    knownGoodBackups,
    prunedBackups,
    cleanupPending,
    archive: parseMetadata(value["archive"]),
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
    case "backup_created":
      return Object.freeze({
        type: "backup_created",
        backup: parseAutomaticBackupMetadata(value["backup"]),
      });
    case "portable_database":
      return Object.freeze({
        type: "portable_database",
        database: parsePortableDatabase(value["database"]),
      });
    case "portable_inspection": {
      const schemaVersion = requireSafeInteger(value, "schemaVersion");
      if (
        value["integrity"] !== "ok" ||
        schemaVersion < 1 ||
        schemaVersion > U32_MAX ||
        typeof value["vaultId"] !== "string"
      ) {
        throw invalidResponse();
      }
      return Object.freeze({
        type: "portable_inspection",
        integrity: "ok" as const,
        schemaVersion,
        vaultId: value["vaultId"],
      });
    }
    case "portable_target":
      return Object.freeze({ type: "portable_target", target: parseTarget(value["target"]) });
    case "attachment_data": {
      const contentId = parseSha256(value["contentId"]);
      const byteLength = requireSafeInteger(value, "byteLength");
      const sha256 = parseSha256(value["sha256"]);
      if (sha256 !== contentId || byteLength > MAX_PORTABLE_ENTRY_BYTES) throw invalidResponse();
      return Object.freeze({
        type: "attachment_data",
        contentId,
        byteLength,
        sha256,
        bytes: parseBytes(value["bytes"], byteLength),
      });
    }
    case "attachment_missing":
      return Object.freeze({
        type: "attachment_missing",
        contentId: parseSha256(value["contentId"]),
      });
    case "portable_committed": {
      const attachmentCount = requireSafeInteger(value, "attachmentCount");
      if (attachmentCount > MAX_PORTABLE_ATTACHMENTS) throw invalidResponse();
      return Object.freeze({
        type: "portable_committed",
        databaseSha256: parseSha256(value["databaseSha256"]),
        attachmentCount,
      });
    }
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
