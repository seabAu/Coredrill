import {
  PORTABLE_ARCHIVE_LIMITS,
  portableArchiveManifestV1Schema,
  type PortableArchiveManifestV1,
} from "@coredrill/contracts";
import { unzipSync } from "fflate";

import type { PortableDatabase } from "./database-port.js";
import {
  PORTABLE_ARCHIVE_MANIFEST_PATH,
  PORTABLE_ARCHIVE_WRITER_LIMITS,
} from "./portable-archive-writer.js";

export const PORTABLE_ARCHIVE_RESTORE_LIMITS = Object.freeze({
  maxArchiveBytes: 544 * 1024 * 1024,
  maxEntries: 2 + PORTABLE_ARCHIVE_LIMITS.maxDataFiles + PORTABLE_ARCHIVE_LIMITS.maxAttachments,
  maxManifestBytes: 1024 * 1024,
});

export type PortableArchiveRestoreErrorCode =
  | "archive_corrupt"
  | "checksum_mismatch"
  | "commit_failed"
  | "database_invalid"
  | "invalid_input"
  | "manifest_invalid"
  | "payload_too_large"
  | "schema_mismatch"
  | "stale_target"
  | "unsafe_archive"
  | "version_unsupported";

const ERROR_MESSAGES = Object.freeze({
  archive_corrupt: "The portable archive is corrupt or unreadable.",
  checksum_mismatch: "A portable archive entry did not match its recorded checksum.",
  commit_failed: "The validated portable archive could not be committed atomically.",
  database_invalid: "The archive database did not pass non-mutating SQLite validation.",
  invalid_input: "The portable archive restore input is invalid.",
  manifest_invalid: "The portable archive manifest did not satisfy its version 1 contract.",
  payload_too_large: "The portable archive exceeds the reviewed in-memory restore limit.",
  schema_mismatch: "The archive database schema is not supported by this restore version.",
  stale_target: "The local vault changed after restore preview; preview the archive again.",
  unsafe_archive: "The portable archive contains an unsafe or unexpected entry.",
  version_unsupported: "The portable archive version is not supported.",
} satisfies Readonly<Record<PortableArchiveRestoreErrorCode, string>>);

export class PortableArchiveRestoreError extends Error {
  public readonly code: PortableArchiveRestoreErrorCode;

  public constructor(code: PortableArchiveRestoreErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "PortableArchiveRestoreError";
    this.code = code;
  }
}

export interface PortableArchiveRestoreDataFileV1 {
  readonly path: string;
  readonly mediaType: string;
  readonly format: "csv" | "json";
  readonly logicalName: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly bytes: Uint8Array;
}

export interface PortableArchiveRestoreAttachmentV1 {
  readonly path: string;
  readonly contentId: string;
  readonly mediaType: string;
  readonly logicalName?: string;
  readonly byteLength: number;
  readonly sha256: string;
  readonly bytes: Uint8Array;
}

export interface InspectedPortableArchiveV1 {
  readonly specVersion: 1;
  readonly archiveSha256: string;
  readonly byteLength: number;
  readonly manifest: PortableArchiveManifestV1;
  readonly database: PortableDatabase;
  readonly dataFiles: readonly PortableArchiveRestoreDataFileV1[];
  readonly attachments: readonly PortableArchiveRestoreAttachmentV1[];
}

export type PortableArchiveRestoreTargetSnapshotV1 =
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

export interface PortableArchiveDatabaseInspectionV1 {
  readonly integrity: "ok";
  readonly schemaVersion: number;
  readonly vaultId: string;
}

export interface PortableArchiveRestoreCommitPayloadV1 {
  readonly specVersion: 1;
  readonly archiveSha256: string;
  readonly expectedTargetFingerprint: string;
  readonly vaultId: string;
  readonly database: PortableDatabase;
  readonly attachments: readonly PortableArchiveRestoreAttachmentV1[];
}

export interface PortableArchiveRestorePortV1 {
  /** Returns a stable fingerprint covering the database and attachment inventory. */
  inspectTarget(): Promise<PortableArchiveRestoreTargetSnapshotV1>;
  /** Opens only a temporary candidate and never mutates the active target. */
  inspectDatabase(database: PortableDatabase): Promise<PortableArchiveDatabaseInspectionV1>;
  /** Atomically replaces database and attachment state or preserves the old target on failure. */
  commit(payload: PortableArchiveRestoreCommitPayloadV1): Promise<void>;
}

export type PortableArchiveRestoreConflictV1 =
  "different_vault_replace" | "identical" | "none" | "same_vault_replace";

export type PortableArchiveRestoreConfirmationV1 =
  "commit" | "replace_different_vault" | "replace_same_vault";

export interface PortableArchiveRestorePreviewV1 {
  readonly specVersion: 1;
  readonly previewId: string;
  readonly archive: {
    readonly sha256: string;
    readonly byteLength: number;
    readonly createdAt: string;
    readonly createdByVersion: string;
    readonly vaultId: string;
    readonly schemaVersion: number;
    readonly dataFileCount: number;
    readonly attachmentCount: number;
  };
  readonly target: {
    readonly state: "empty" | "present";
    readonly fingerprint: string;
    readonly vaultId?: string;
    readonly schemaVersion?: number;
    readonly attachmentCount: number;
  };
  readonly conflict: PortableArchiveRestoreConflictV1;
  readonly requiredConfirmation: PortableArchiveRestoreConfirmationV1;
  readonly changes: {
    readonly database: "create" | "unchanged" | "replace";
    readonly attachmentsAdded: number;
    readonly attachmentsReused: number;
    readonly attachmentsRemoved: number;
  };
}

export interface PortableArchiveRestoreCommitResultV1 {
  readonly committed: true;
  readonly archiveSha256: string;
  readonly vaultId: string;
  readonly schemaVersion: number;
  readonly databaseSha256: string;
  readonly attachmentCount: number;
}

interface PreviewPayload {
  readonly archiveBytes: Uint8Array;
  readonly expectedSchemaVersion: number;
  readonly target: PortableArchiveRestoreTargetSnapshotV1;
  readonly port: PortableArchiveRestorePortV1;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const SAFE_PATH_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*(?:\/[A-Za-z0-9][A-Za-z0-9._-]*)*$/;
const decoder = new TextDecoder("utf-8", { fatal: true });
const previews = new WeakMap<PortableArchiveRestorePreviewV1, PreviewPayload>();
const completedPreviews = new WeakSet<PortableArchiveRestorePreviewV1>();

const restoreError = (code: PortableArchiveRestoreErrorCode): PortableArchiveRestoreError =>
  new PortableArchiveRestoreError(code);

const copyArchiveBytes = (value: Uint8Array): Uint8Array => {
  if (!(value instanceof Uint8Array)) throw restoreError("invalid_input");
  if (value.byteLength > PORTABLE_ARCHIVE_RESTORE_LIMITS.maxArchiveBytes) {
    throw restoreError("payload_too_large");
  }
  return value.slice();
};

const sha256 = async (bytes: Uint8Array): Promise<string> => {
  try {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  } catch {
    throw restoreError("archive_corrupt");
  }
};

const attachmentPath = (contentId: string): string =>
  `attachments/${contentId.slice(0, 2)}/${contentId}`;

const readManifest = (bytes: Uint8Array): PortableArchiveManifestV1 => {
  let value: unknown;
  try {
    value = JSON.parse(decoder.decode(bytes));
  } catch {
    throw restoreError("manifest_invalid");
  }
  if (
    typeof value === "object" &&
    value !== null &&
    "specVersion" in value &&
    (value as { readonly specVersion?: unknown }).specVersion !== 1
  ) {
    throw restoreError("version_unsupported");
  }
  const parsed = portableArchiveManifestV1Schema.safeParse(value);
  if (!parsed.success) throw restoreError("manifest_invalid");
  return parsed.data;
};

const assertExpectedEntries = (
  entries: Readonly<Record<string, Uint8Array>>,
  manifest: PortableArchiveManifestV1,
): void => {
  const expected = new Set([
    PORTABLE_ARCHIVE_MANIFEST_PATH,
    manifest.database.path,
    ...manifest.dataFiles.map((entry) => entry.path),
    ...manifest.attachments.map((entry) => entry.path),
  ]);
  const actual = Object.keys(entries);
  if (actual.length !== expected.size || actual.some((path) => !expected.has(path))) {
    throw restoreError("unsafe_archive");
  }
  if (
    manifest.dataFiles.some(
      (entry) =>
        !entry.path.startsWith("data/") ||
        !entry.path.endsWith(entry.format === "json" ? ".json" : ".csv"),
    ) ||
    manifest.attachments.some((entry) => entry.path !== attachmentPath(entry.contentId))
  ) {
    throw restoreError("manifest_invalid");
  }
};

const verifiedEntryBytes = async (
  entries: Readonly<Record<string, Uint8Array>>,
  entry: { readonly path: string; readonly byteLength: number; readonly sha256: string },
): Promise<Uint8Array> => {
  const bytes = entries[entry.path];
  if (bytes?.byteLength !== entry.byteLength) {
    throw restoreError("checksum_mismatch");
  }
  if ((await sha256(bytes)) !== entry.sha256) throw restoreError("checksum_mismatch");
  return bytes.slice();
};

export const inspectPortableArchiveV1 = async (input: {
  readonly bytes: Uint8Array;
  readonly expectedSchemaVersion: number;
  readonly expectedArchiveSha256?: string;
}): Promise<InspectedPortableArchiveV1> => {
  const bytes = copyArchiveBytes(input.bytes);
  if (
    !Number.isSafeInteger(input.expectedSchemaVersion) ||
    input.expectedSchemaVersion < 1 ||
    (input.expectedArchiveSha256 !== undefined && !SHA256_PATTERN.test(input.expectedArchiveSha256))
  ) {
    throw restoreError("invalid_input");
  }
  const archiveSha256 = await sha256(bytes);
  if (input.expectedArchiveSha256 !== undefined && archiveSha256 !== input.expectedArchiveSha256) {
    throw restoreError("checksum_mismatch");
  }

  const observedPaths = new Set<string>();
  let firstPath: string | undefined;
  let expandedBytes = 0;
  let entries: Readonly<Record<string, Uint8Array>>;
  try {
    entries = unzipSync(bytes, {
      filter: (entry) => {
        firstPath ??= entry.name;
        if (
          entry.name.length > PORTABLE_ARCHIVE_LIMITS.maxPathCharacters ||
          !SAFE_PATH_PATTERN.test(entry.name) ||
          observedPaths.has(entry.name) ||
          entry.compression !== 0
        ) {
          throw restoreError("unsafe_archive");
        }
        if (observedPaths.size >= PORTABLE_ARCHIVE_RESTORE_LIMITS.maxEntries) {
          throw restoreError("payload_too_large");
        }
        const entryLimit =
          entry.name === PORTABLE_ARCHIVE_MANIFEST_PATH
            ? PORTABLE_ARCHIVE_RESTORE_LIMITS.maxManifestBytes
            : PORTABLE_ARCHIVE_WRITER_LIMITS.maxEntryBytes;
        if (entry.originalSize > entryLimit) throw restoreError("payload_too_large");
        if (
          entry.originalSize >
          PORTABLE_ARCHIVE_WRITER_LIMITS.maxPayloadBytes +
            PORTABLE_ARCHIVE_RESTORE_LIMITS.maxManifestBytes -
            expandedBytes
        ) {
          throw restoreError("payload_too_large");
        }
        observedPaths.add(entry.name);
        expandedBytes += entry.originalSize;
        return true;
      },
    });
  } catch (error) {
    if (error instanceof PortableArchiveRestoreError) throw error;
    throw restoreError("archive_corrupt");
  }
  if (firstPath !== PORTABLE_ARCHIVE_MANIFEST_PATH) throw restoreError("unsafe_archive");

  const manifestBytes = entries[PORTABLE_ARCHIVE_MANIFEST_PATH];
  if (
    manifestBytes === undefined ||
    manifestBytes.byteLength > PORTABLE_ARCHIVE_RESTORE_LIMITS.maxManifestBytes
  ) {
    throw restoreError("manifest_invalid");
  }
  const manifest = readManifest(manifestBytes);
  if (manifest.vault.schemaVersion !== input.expectedSchemaVersion) {
    throw restoreError("schema_mismatch");
  }
  assertExpectedEntries(entries, manifest);

  const databaseBytes = await verifiedEntryBytes(entries, manifest.database);
  const dataFiles = await Promise.all(
    manifest.dataFiles.map(async (entry) =>
      Object.freeze({ ...entry, bytes: await verifiedEntryBytes(entries, entry) }),
    ),
  );
  const attachments = await Promise.all(
    manifest.attachments.map(async (entry) =>
      Object.freeze({
        path: entry.path,
        contentId: entry.contentId,
        mediaType: entry.mediaType,
        ...(entry.logicalName === undefined ? {} : { logicalName: entry.logicalName }),
        byteLength: entry.byteLength,
        sha256: entry.sha256,
        bytes: await verifiedEntryBytes(entries, entry),
      }),
    ),
  );

  return Object.freeze({
    specVersion: 1 as const,
    archiveSha256,
    byteLength: bytes.byteLength,
    manifest,
    database: Object.freeze({
      schemaVersion: manifest.vault.schemaVersion,
      byteLength: databaseBytes.byteLength,
      sha256: manifest.database.sha256,
      bytes: databaseBytes,
    }),
    dataFiles: Object.freeze(dataFiles),
    attachments: Object.freeze(attachments),
  });
};

const validateTarget = (value: unknown): PortableArchiveRestoreTargetSnapshotV1 => {
  if (typeof value !== "object" || value === null || !("state" in value)) {
    throw restoreError("invalid_input");
  }
  const target = value as Readonly<Record<string, unknown>>;
  if (target["state"] === "empty") {
    const fingerprint = target["fingerprint"];
    const attachmentContentIds = target["attachmentContentIds"];
    if (
      typeof fingerprint !== "string" ||
      (fingerprint !== "empty" && !SHA256_PATTERN.test(fingerprint))
    ) {
      throw restoreError("invalid_input");
    }
    if (!Array.isArray(attachmentContentIds) || attachmentContentIds.length !== 0) {
      throw restoreError("invalid_input");
    }
    return Object.freeze({
      state: "empty" as const,
      fingerprint,
      attachmentContentIds: Object.freeze([] as const),
    });
  }

  const fingerprint = target["fingerprint"];
  const vaultId = target["vaultId"];
  const schemaVersion = target["schemaVersion"];
  const databaseSha256 = target["databaseSha256"];
  const rawAttachmentContentIds = target["attachmentContentIds"];
  if (
    target["state"] !== "present" ||
    typeof fingerprint !== "string" ||
    !SHA256_PATTERN.test(fingerprint) ||
    typeof vaultId !== "string" ||
    !UUID_V7_PATTERN.test(vaultId) ||
    typeof schemaVersion !== "number" ||
    !Number.isSafeInteger(schemaVersion) ||
    schemaVersion < 1 ||
    typeof databaseSha256 !== "string" ||
    !SHA256_PATTERN.test(databaseSha256) ||
    !Array.isArray(rawAttachmentContentIds) ||
    rawAttachmentContentIds.length > PORTABLE_ARCHIVE_LIMITS.maxAttachments
  ) {
    throw restoreError("invalid_input");
  }
  const attachmentContentIds: string[] = [];
  for (const contentId of rawAttachmentContentIds) {
    if (typeof contentId !== "string" || !SHA256_PATTERN.test(contentId)) {
      throw restoreError("invalid_input");
    }
    attachmentContentIds.push(contentId);
  }
  if (new Set(attachmentContentIds).size !== attachmentContentIds.length) {
    throw restoreError("invalid_input");
  }
  attachmentContentIds.sort();
  return Object.freeze({
    state: "present" as const,
    fingerprint,
    vaultId,
    schemaVersion,
    databaseSha256,
    attachmentContentIds: Object.freeze(attachmentContentIds),
  });
};

const sameTarget = (
  left: PortableArchiveRestoreTargetSnapshotV1,
  right: PortableArchiveRestoreTargetSnapshotV1,
): boolean =>
  left.state === right.state &&
  left.fingerprint === right.fingerprint &&
  (left.state === "empty" ||
    (right.state === "present" &&
      left.vaultId === right.vaultId &&
      left.schemaVersion === right.schemaVersion &&
      left.databaseSha256 === right.databaseSha256 &&
      left.attachmentContentIds.length === right.attachmentContentIds.length &&
      left.attachmentContentIds.every(
        (contentId, index) => contentId === right.attachmentContentIds[index],
      )));

const previewId = async (archiveSha256: string, targetFingerprint: string): Promise<string> =>
  sha256(
    new TextEncoder().encode(`coredrill-restore-v1\n${archiveSha256}\n${targetFingerprint}\n`),
  );

export const createPortableArchiveRestorePreviewV1 = async (input: {
  readonly archiveBytes: Uint8Array;
  readonly expectedSchemaVersion: number;
  readonly expectedArchiveSha256?: string;
  readonly port: PortableArchiveRestorePortV1;
}): Promise<PortableArchiveRestorePreviewV1> => {
  const archiveBytes = copyArchiveBytes(input.archiveBytes);
  const archive = await inspectPortableArchiveV1({
    bytes: archiveBytes,
    expectedSchemaVersion: input.expectedSchemaVersion,
    ...(input.expectedArchiveSha256 === undefined
      ? {}
      : { expectedArchiveSha256: input.expectedArchiveSha256 }),
  });

  let databaseInspection: unknown;
  let target: PortableArchiveRestoreTargetSnapshotV1;
  try {
    databaseInspection = await input.port.inspectDatabase({
      ...archive.database,
      bytes: archive.database.bytes.slice(),
    });
  } catch {
    throw restoreError("database_invalid");
  }
  if (typeof databaseInspection !== "object" || databaseInspection === null) {
    throw restoreError("database_invalid");
  }
  const inspectedDatabase = databaseInspection as Readonly<Record<string, unknown>>;
  if (
    inspectedDatabase["integrity"] !== "ok" ||
    inspectedDatabase["schemaVersion"] !== input.expectedSchemaVersion ||
    inspectedDatabase["schemaVersion"] !== archive.manifest.vault.schemaVersion ||
    inspectedDatabase["vaultId"] !== archive.manifest.vault.id
  ) {
    throw restoreError("database_invalid");
  }
  try {
    target = validateTarget(await input.port.inspectTarget());
  } catch (error) {
    if (error instanceof PortableArchiveRestoreError) throw error;
    throw restoreError("invalid_input");
  }

  const archiveAttachmentIds = archive.attachments.map((entry) => entry.contentId).sort();
  const targetAttachmentIds = new Set(target.attachmentContentIds);
  const archiveAttachmentSet = new Set(archiveAttachmentIds);
  const attachmentsReused = archiveAttachmentIds.filter((id) => targetAttachmentIds.has(id)).length;
  const attachmentsAdded = archiveAttachmentIds.length - attachmentsReused;
  const attachmentsRemoved = target.attachmentContentIds.filter(
    (id) => !archiveAttachmentSet.has(id),
  ).length;

  const databaseUnchanged =
    target.state === "present" && target.databaseSha256 === archive.database.sha256;
  const attachmentsUnchanged = attachmentsAdded === 0 && attachmentsRemoved === 0;
  const conflict: PortableArchiveRestoreConflictV1 =
    target.state === "empty"
      ? "none"
      : target.vaultId !== archive.manifest.vault.id
        ? "different_vault_replace"
        : databaseUnchanged && attachmentsUnchanged
          ? "identical"
          : "same_vault_replace";
  const requiredConfirmation: PortableArchiveRestoreConfirmationV1 =
    conflict === "different_vault_replace"
      ? "replace_different_vault"
      : conflict === "same_vault_replace"
        ? "replace_same_vault"
        : "commit";

  const preview = Object.freeze({
    specVersion: 1 as const,
    previewId: await previewId(archive.archiveSha256, target.fingerprint),
    archive: Object.freeze({
      sha256: archive.archiveSha256,
      byteLength: archive.byteLength,
      createdAt: archive.manifest.createdAt,
      createdByVersion: archive.manifest.createdBy.version,
      vaultId: archive.manifest.vault.id,
      schemaVersion: archive.manifest.vault.schemaVersion,
      dataFileCount: archive.dataFiles.length,
      attachmentCount: archive.attachments.length,
    }),
    target: Object.freeze({
      state: target.state,
      fingerprint: target.fingerprint,
      ...(target.state === "empty"
        ? {}
        : { vaultId: target.vaultId, schemaVersion: target.schemaVersion }),
      attachmentCount: target.attachmentContentIds.length,
    }),
    conflict,
    requiredConfirmation,
    changes: Object.freeze({
      database: target.state === "empty" ? "create" : databaseUnchanged ? "unchanged" : "replace",
      attachmentsAdded,
      attachmentsReused,
      attachmentsRemoved,
    }),
  });
  previews.set(preview, {
    archiveBytes,
    expectedSchemaVersion: input.expectedSchemaVersion,
    target,
    port: input.port,
  });
  return preview;
};

export const commitPortableArchiveRestoreV1 = async (input: {
  readonly preview: PortableArchiveRestorePreviewV1;
  readonly confirmation: PortableArchiveRestoreConfirmationV1;
}): Promise<PortableArchiveRestoreCommitResultV1> => {
  const payload = previews.get(input.preview);
  if (
    payload === undefined ||
    completedPreviews.has(input.preview) ||
    input.confirmation !== input.preview.requiredConfirmation
  ) {
    throw restoreError("invalid_input");
  }

  let currentTarget: PortableArchiveRestoreTargetSnapshotV1;
  try {
    currentTarget = validateTarget(await payload.port.inspectTarget());
  } catch (error) {
    if (error instanceof PortableArchiveRestoreError) throw error;
    throw restoreError("stale_target");
  }
  if (!sameTarget(payload.target, currentTarget)) throw restoreError("stale_target");

  const archive = await inspectPortableArchiveV1({
    bytes: payload.archiveBytes,
    expectedSchemaVersion: payload.expectedSchemaVersion,
    expectedArchiveSha256: input.preview.archive.sha256,
  });
  try {
    await payload.port.commit({
      specVersion: 1,
      archiveSha256: archive.archiveSha256,
      expectedTargetFingerprint: payload.target.fingerprint,
      vaultId: archive.manifest.vault.id,
      database: Object.freeze({ ...archive.database, bytes: archive.database.bytes.slice() }),
      attachments: Object.freeze(
        archive.attachments.map((entry) => Object.freeze({ ...entry, bytes: entry.bytes.slice() })),
      ),
    });
  } catch {
    throw restoreError("commit_failed");
  }
  completedPreviews.add(input.preview);
  return Object.freeze({
    committed: true as const,
    archiveSha256: archive.archiveSha256,
    vaultId: archive.manifest.vault.id,
    schemaVersion: archive.manifest.vault.schemaVersion,
    databaseSha256: archive.database.sha256,
    attachmentCount: archive.attachments.length,
  });
};
