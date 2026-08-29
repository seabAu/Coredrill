import {
  PORTABLE_ARCHIVE_LIMITS,
  portableArchiveManifestV1Schema,
  type MigrationHistoryEntryV1,
  type PortableArchiveManifestV1,
} from "@coredrill/contracts";
import { zipSync } from "fflate";

import type { PortableDatabase } from "./database-port.js";

export const PORTABLE_ARCHIVE_CONTAINER_VERSION = 1 as const;
export const PORTABLE_ARCHIVE_MANIFEST_PATH = "manifest.json" as const;
export const PORTABLE_ARCHIVE_MEDIA_TYPE = "application/zip" as const;
export const PORTABLE_ARCHIVE_FILE_EXTENSION = ".coredrill.zip" as const;

/**
 * The Phase 1 writer is deliberately in-memory. Keep its reviewed ceiling below
 * classic ZIP's 4 GiB boundary and revisit with a streamed/Zip64 writer before
 * increasing it.
 */
export const PORTABLE_ARCHIVE_WRITER_LIMITS = Object.freeze({
  maxEntryBytes: 256 * 1024 * 1024,
  maxPayloadBytes: 512 * 1024 * 1024,
});

export type PortableArchiveWriterErrorCode =
  | "archive_write_failed"
  | "attachment_integrity_mismatch"
  | "attachment_missing"
  | "attachment_read_failed"
  | "checksum_failed"
  | "database_integrity_mismatch"
  | "invalid_input"
  | "payload_too_large";

const PORTABLE_ARCHIVE_WRITER_ERROR_MESSAGES = Object.freeze({
  archive_write_failed: "The portable archive could not be assembled locally.",
  attachment_integrity_mismatch: "An attachment did not match its recorded length and checksum.",
  attachment_missing: "A recorded attachment is unavailable, so no archive was created.",
  attachment_read_failed: "A recorded attachment could not be read, so no archive was created.",
  checksum_failed: "A local archive entry checksum could not be calculated.",
  database_integrity_mismatch: "The database export did not match its recorded metadata.",
  invalid_input: "The portable archive input did not satisfy the version 1 contract.",
  payload_too_large: "The portable archive exceeds the reviewed in-memory writer limit.",
} satisfies Readonly<Record<PortableArchiveWriterErrorCode, string>>);

export class PortableArchiveWriterError extends Error {
  public readonly code: PortableArchiveWriterErrorCode;

  public constructor(code: PortableArchiveWriterErrorCode) {
    super(PORTABLE_ARCHIVE_WRITER_ERROR_MESSAGES[code]);
    this.name = "PortableArchiveWriterError";
    this.code = code;
  }
}

export interface PortableArchiveVaultV1 {
  readonly id: string;
  readonly schemaVersion: number;
  readonly migrationHistory: readonly MigrationHistoryEntryV1[];
}

export interface PortableArchiveDataFileSourceV1 {
  readonly path: string;
  readonly mediaType: string;
  readonly format: "csv" | "json";
  readonly logicalName: string;
  readonly bytes: Uint8Array;
}

export interface PortableArchiveAttachmentReferenceV1 {
  readonly contentId: string;
  readonly sha256: string;
  readonly mediaType: string;
  readonly byteLength: number;
  readonly logicalName?: string;
}

export interface PortableArchiveWriterInputV1 {
  readonly archiveId: string;
  readonly createdAt: string;
  readonly createdByVersion: string;
  readonly vault: PortableArchiveVaultV1;
  readonly database: PortableDatabase;
  readonly dataFiles: readonly PortableArchiveDataFileSourceV1[];
  readonly attachments: readonly PortableArchiveAttachmentReferenceV1[];
  readonly readAttachment: (contentId: string) => Promise<Uint8Array | undefined>;
}

export interface PortableArchiveV1 {
  readonly containerVersion: typeof PORTABLE_ARCHIVE_CONTAINER_VERSION;
  readonly mediaType: typeof PORTABLE_ARCHIVE_MEDIA_TYPE;
  readonly fileName: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly manifest: PortableArchiveManifestV1;
  readonly bytes: Uint8Array;
}

interface PayloadEntry {
  readonly path: string;
  readonly bytes: Uint8Array;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const encoder = new TextEncoder();

const writerError = (code: PortableArchiveWriterErrorCode): PortableArchiveWriterError =>
  new PortableArchiveWriterError(code);

const copyBoundedBytes = (value: Uint8Array): Uint8Array => {
  if (!(value instanceof Uint8Array)) throw writerError("invalid_input");
  if (value.byteLength > PORTABLE_ARCHIVE_WRITER_LIMITS.maxEntryBytes) {
    throw writerError("payload_too_large");
  }
  return value.slice();
};

const sha256 = async (bytes: Uint8Array): Promise<string> => {
  try {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  } catch {
    throw writerError("checksum_failed");
  }
};

const addPayloadBytes = (current: number, additional: number): number => {
  if (additional > PORTABLE_ARCHIVE_WRITER_LIMITS.maxPayloadBytes - current) {
    throw writerError("payload_too_large");
  }
  return current + additional;
};

const attachmentPath = (contentId: string): string =>
  `attachments/${contentId.slice(0, 2)}/${contentId}`;

const comparePortableText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const archiveFileName = (manifest: PortableArchiveManifestV1): string =>
  `coredrill-${manifest.createdAt.slice(0, 10).replaceAll("-", "")}-${manifest.archiveId}${PORTABLE_ARCHIVE_FILE_EXTENSION}`;

const parseManifest = (value: unknown): PortableArchiveManifestV1 => {
  const parsed = portableArchiveManifestV1Schema.safeParse(value);
  if (!parsed.success) throw writerError("invalid_input");
  if (
    parsed.data.dataFiles.some(
      (entry) =>
        !entry.path.startsWith("data/") ||
        !entry.path.endsWith(entry.format === "json" ? ".json" : ".csv"),
    )
  ) {
    throw writerError("invalid_input");
  }
  return parsed.data;
};

const verifyDatabase = async (
  database: PortableDatabase,
  schemaVersion: number,
): Promise<PayloadEntry & { readonly byteLength: number; readonly sha256: string }> => {
  const bytes = copyBoundedBytes(database.bytes);
  const checksum = await sha256(bytes);
  if (
    database.schemaVersion !== schemaVersion ||
    database.byteLength !== bytes.byteLength ||
    database.sha256 !== checksum
  ) {
    throw writerError("database_integrity_mismatch");
  }
  return Object.freeze({
    path: "database.sqlite3",
    bytes,
    byteLength: bytes.byteLength,
    sha256: checksum,
  });
};

const assertAttachmentReferences = (
  attachments: readonly PortableArchiveAttachmentReferenceV1[],
): void => {
  if (attachments.length > PORTABLE_ARCHIVE_LIMITS.maxAttachments) {
    throw writerError("invalid_input");
  }
  const contentIds = new Set<string>();
  for (const attachment of attachments) {
    if (
      !SHA256_PATTERN.test(attachment.contentId) ||
      attachment.sha256 !== attachment.contentId ||
      !Number.isSafeInteger(attachment.byteLength) ||
      attachment.byteLength < 0 ||
      contentIds.has(attachment.contentId)
    ) {
      throw writerError("invalid_input");
    }
    if (attachment.byteLength > PORTABLE_ARCHIVE_WRITER_LIMITS.maxEntryBytes) {
      throw writerError("payload_too_large");
    }
    contentIds.add(attachment.contentId);
  }
};

const preflightPayloadBytes = (input: PortableArchiveWriterInputV1): void => {
  let total = 0;
  if (!(input.database.bytes instanceof Uint8Array)) throw writerError("invalid_input");
  if (input.database.bytes.byteLength > PORTABLE_ARCHIVE_WRITER_LIMITS.maxEntryBytes) {
    throw writerError("payload_too_large");
  }
  total = addPayloadBytes(total, input.database.bytes.byteLength);
  for (const dataFile of input.dataFiles) {
    if (!(dataFile.bytes instanceof Uint8Array)) throw writerError("invalid_input");
    if (dataFile.bytes.byteLength > PORTABLE_ARCHIVE_WRITER_LIMITS.maxEntryBytes) {
      throw writerError("payload_too_large");
    }
    total = addPayloadBytes(total, dataFile.bytes.byteLength);
  }
  for (const attachment of input.attachments) {
    total = addPayloadBytes(total, attachment.byteLength);
  }
};

/**
 * Produces deterministic, unencrypted ZIP bytes from a complete local snapshot.
 * The function returns only after every expected attachment and checksum has
 * passed, so callers cannot persist a partial archive as a successful export.
 */
export const writePortableArchiveV1 = async (
  input: PortableArchiveWriterInputV1,
): Promise<PortableArchiveV1> => {
  if (
    input.dataFiles.length > PORTABLE_ARCHIVE_LIMITS.maxDataFiles ||
    input.vault.migrationHistory.length > PORTABLE_ARCHIVE_LIMITS.maxMigrationHistory
  ) {
    throw writerError("invalid_input");
  }
  assertAttachmentReferences(input.attachments);
  preflightPayloadBytes(input);

  const database = await verifyDatabase(input.database, input.vault.schemaVersion);

  const dataEntries = await Promise.all(
    [...input.dataFiles]
      .sort((left, right) => comparePortableText(left.path, right.path))
      .map(async (dataFile) => {
        const bytes = copyBoundedBytes(dataFile.bytes);
        const checksum = await sha256(bytes);
        return Object.freeze({
          kind: "data" as const,
          path: dataFile.path,
          mediaType: dataFile.mediaType,
          byteLength: bytes.byteLength,
          sha256: checksum,
          format: dataFile.format,
          logicalName: dataFile.logicalName,
          bytes,
        });
      }),
  );
  const attachmentEntries = [];
  for (const attachment of [...input.attachments].sort((left, right) =>
    comparePortableText(left.contentId, right.contentId),
  )) {
    let resolved: Uint8Array | undefined;
    try {
      resolved = await input.readAttachment(attachment.contentId);
    } catch {
      throw writerError("attachment_read_failed");
    }
    if (resolved === undefined) throw writerError("attachment_missing");
    const bytes = copyBoundedBytes(resolved);
    const checksum = await sha256(bytes);
    if (bytes.byteLength !== attachment.byteLength || checksum !== attachment.contentId) {
      throw writerError("attachment_integrity_mismatch");
    }
    attachmentEntries.push(
      Object.freeze({
        kind: "attachment" as const,
        path: attachmentPath(attachment.contentId),
        mediaType: attachment.mediaType,
        byteLength: bytes.byteLength,
        sha256: checksum,
        contentId: attachment.contentId,
        ...(attachment.logicalName === undefined ? {} : { logicalName: attachment.logicalName }),
        bytes,
      }),
    );
  }

  const manifest = parseManifest({
    specVersion: 1,
    archiveId: input.archiveId,
    createdAt: input.createdAt,
    createdBy: {
      name: "coredrill",
      version: input.createdByVersion,
    },
    vault: {
      id: input.vault.id,
      schemaVersion: input.vault.schemaVersion,
      migrationHistory: input.vault.migrationHistory,
    },
    checksumAlgorithm: "sha256",
    database: {
      kind: "database",
      path: database.path,
      mediaType: "application/vnd.sqlite3",
      byteLength: database.byteLength,
      sha256: database.sha256,
    },
    dataFiles: dataEntries.map(({ bytes: _bytes, ...entry }) => entry),
    attachments: attachmentEntries.map(({ bytes: _bytes, ...entry }) => entry),
    encryption: {
      specVersion: 1,
      mode: "none",
    },
  });
  const manifestBytes = encoder.encode(`${JSON.stringify(manifest, undefined, 2)}\n`);

  const zipEntries = Object.create(null) as Record<string, Uint8Array>;
  zipEntries[PORTABLE_ARCHIVE_MANIFEST_PATH] = manifestBytes;
  const payloadEntries: readonly PayloadEntry[] = [database, ...dataEntries, ...attachmentEntries];
  for (const entry of payloadEntries) zipEntries[entry.path] = entry.bytes;

  let bytes: Uint8Array;
  try {
    bytes = zipSync(zipEntries, {
      level: 0,
      mtime: new Date(1980, 0, 1, 0, 0, 0, 0),
      os: 0,
    });
  } catch {
    throw writerError("archive_write_failed");
  }

  return Object.freeze({
    containerVersion: PORTABLE_ARCHIVE_CONTAINER_VERSION,
    mediaType: PORTABLE_ARCHIVE_MEDIA_TYPE,
    fileName: archiveFileName(manifest),
    byteLength: bytes.byteLength,
    sha256: await sha256(bytes),
    manifest,
    bytes,
  });
};
