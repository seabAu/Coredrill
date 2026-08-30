import type { InspectedPortableArchiveV1 } from "./portable-archive-restore.js";
import { createPortableDataExportV1 } from "./portable-data-export.js";
import { sqlStatement, type DatabasePort, type QueryRow } from "./database-port.js";

export const PORTABLE_VAULT_CONTENT_HASH_VERSION = 1 as const;

export type PortableVaultContentHashErrorCode =
  "attachment_integrity_mismatch" | "attachment_missing" | "checksum_failed" | "invalid_input";

const ERROR_MESSAGES = Object.freeze({
  attachment_integrity_mismatch: "A content-addressed attachment did not match the vault manifest.",
  attachment_missing: "A content-addressed attachment required by the vault is unavailable.",
  checksum_failed: "The canonical vault content hash could not be calculated.",
  invalid_input: "The canonical vault content hash input is invalid.",
} satisfies Readonly<Record<PortableVaultContentHashErrorCode, string>>);

export class PortableVaultContentHashError extends Error {
  public readonly code: PortableVaultContentHashErrorCode;

  public constructor(code: PortableVaultContentHashErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "PortableVaultContentHashError";
    this.code = code;
  }
}

export interface PortableVaultContentHashV1 {
  readonly specVersion: typeof PORTABLE_VAULT_CONTENT_HASH_VERSION;
  readonly sha256: string;
  readonly vaultId: string;
  readonly schemaVersion: number;
  readonly jsonDataFileCount: number;
  readonly attachmentCount: number;
}

export interface PortableVaultContentHashInputV1 {
  readonly database: DatabasePort;
  readonly generatedAt: string;
  readonly vaultId: string;
  readonly readAttachment: (contentId: string) => Promise<Uint8Array | undefined>;
}

interface AttachmentManifestRow extends QueryRow {
  readonly content_id: string;
  readonly media_type: string;
  readonly byte_length: number;
}

interface ContentDescriptorEntry {
  readonly kind: "attachment" | "data";
  readonly identity: string;
  readonly byteLength: number;
  readonly sha256: string;
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const UUID_V7_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const encoder = new TextEncoder();

const contentHashError = (code: PortableVaultContentHashErrorCode): PortableVaultContentHashError =>
  new PortableVaultContentHashError(code);

const sha256 = async (bytes: Uint8Array): Promise<string> => {
  try {
    const digest = await globalThis.crypto.subtle.digest("SHA-256", Uint8Array.from(bytes));
    return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
  } catch {
    throw contentHashError("checksum_failed");
  }
};

const comparePortableText = (left: string, right: string): number =>
  left < right ? -1 : left > right ? 1 : 0;

const assertDescriptorHeader = (vaultId: string, schemaVersion: number): void => {
  if (!UUID_V7_PATTERN.test(vaultId) || !Number.isSafeInteger(schemaVersion) || schemaVersion < 1) {
    throw contentHashError("invalid_input");
  }
};

const hashDescriptor = async (input: {
  readonly vaultId: string;
  readonly schemaVersion: number;
  readonly entries: readonly ContentDescriptorEntry[];
}): Promise<PortableVaultContentHashV1> => {
  assertDescriptorHeader(input.vaultId, input.schemaVersion);
  const entries = [...input.entries].sort((left, right) => {
    const kind = comparePortableText(left.kind, right.kind);
    return kind === 0 ? comparePortableText(left.identity, right.identity) : kind;
  });
  for (const entry of entries) {
    if (
      entry.identity.length === 0 ||
      entry.identity.includes("\n") ||
      !Number.isSafeInteger(entry.byteLength) ||
      entry.byteLength < 0 ||
      !SHA256_PATTERN.test(entry.sha256)
    ) {
      throw contentHashError("invalid_input");
    }
  }
  const preimage = [
    "coredrill-vault-content-v1",
    `vault:${input.vaultId}`,
    `schema:${String(input.schemaVersion)}`,
    ...entries.map(
      (entry) => `${entry.kind}:${entry.identity}:${String(entry.byteLength)}:${entry.sha256}`,
    ),
    "",
  ].join("\n");
  return Object.freeze({
    specVersion: PORTABLE_VAULT_CONTENT_HASH_VERSION,
    sha256: await sha256(encoder.encode(preimage)),
    vaultId: input.vaultId,
    schemaVersion: input.schemaVersion,
    jsonDataFileCount: entries.filter(({ kind }) => kind === "data").length,
    attachmentCount: entries.filter(({ kind }) => kind === "attachment").length,
  });
};

const dataDescriptorEntries = async (
  dataFiles: readonly {
    readonly path: string;
    readonly format: "csv" | "json";
    readonly byteLength?: number;
    readonly sha256?: string;
    readonly bytes: Uint8Array;
  }[],
): Promise<readonly ContentDescriptorEntry[]> =>
  Promise.all(
    dataFiles
      .filter(({ format }) => format === "json")
      .map(async (file) => {
        const checksum = await sha256(file.bytes);
        if (
          (file.byteLength !== undefined && file.byteLength !== file.bytes.byteLength) ||
          (file.sha256 !== undefined && file.sha256 !== checksum)
        ) {
          throw contentHashError("invalid_input");
        }
        return Object.freeze({
          kind: "data" as const,
          identity: file.path,
          byteLength: file.bytes.byteLength,
          sha256: checksum,
        });
      }),
  );

/**
 * Hashes the lossless user-visible content represented by a validated archive.
 * SQLite file-layout details and redundant CSV projections are deliberately not
 * part of this cross-adapter comparison.
 */
export const createPortableArchiveContentHashV1 = async (
  archive: InspectedPortableArchiveV1,
): Promise<PortableVaultContentHashV1> => {
  const dataEntries = await dataDescriptorEntries(archive.dataFiles);
  const attachmentEntries = archive.attachments.map((attachment) =>
    Object.freeze({
      kind: "attachment" as const,
      identity: attachment.contentId,
      byteLength: attachment.byteLength,
      sha256: attachment.sha256,
    }),
  );
  return hashDescriptor({
    vaultId: archive.manifest.vault.id,
    schemaVersion: archive.manifest.vault.schemaVersion,
    entries: [...dataEntries, ...attachmentEntries],
  });
};

/**
 * Reprojects a restored vault and hashes the same canonical JSON and verified
 * content-addressed attachment inventory used by the archive comparison.
 */
export const createPortableVaultContentHashV1 = async (
  input: PortableVaultContentHashInputV1,
): Promise<PortableVaultContentHashV1> => {
  const bundle = await createPortableDataExportV1({
    database: input.database,
    generatedAt: input.generatedAt,
    vaultId: input.vaultId,
  });
  const manifestRows = await input.database.query<AttachmentManifestRow>(
    sqlStatement(
      "SELECT content_id, media_type, byte_length FROM attachment_manifest ORDER BY content_id",
    ),
  );
  const attachmentEntries = await Promise.all(
    manifestRows.map(async (row) => {
      if (
        !SHA256_PATTERN.test(row.content_id) ||
        typeof row.media_type !== "string" ||
        !Number.isSafeInteger(row.byte_length) ||
        row.byte_length < 0
      ) {
        throw contentHashError("invalid_input");
      }
      const bytes = await input.readAttachment(row.content_id);
      if (bytes === undefined) throw contentHashError("attachment_missing");
      const checksum = await sha256(bytes);
      if (bytes.byteLength !== row.byte_length || checksum !== row.content_id) {
        throw contentHashError("attachment_integrity_mismatch");
      }
      return Object.freeze({
        kind: "attachment" as const,
        identity: row.content_id,
        byteLength: bytes.byteLength,
        sha256: checksum,
      });
    }),
  );
  return hashDescriptor({
    vaultId: input.vaultId,
    schemaVersion: bundle.sourceSchemaVersion,
    entries: [...(await dataDescriptorEntries(bundle.dataFiles)), ...attachmentEntries],
  });
};

/** Stable stale-preview fingerprint covering database bytes and logical attachment inventory. */
export const createPortableRestoreTargetFingerprintV1 = async (
  databaseSha256: string,
  attachmentContentIds: readonly string[],
): Promise<string> => {
  if (!SHA256_PATTERN.test(databaseSha256)) throw contentHashError("invalid_input");
  const contentIds = [...attachmentContentIds].sort(comparePortableText);
  if (
    new Set(contentIds).size !== contentIds.length ||
    contentIds.some((contentId) => !SHA256_PATTERN.test(contentId))
  ) {
    throw contentHashError("invalid_input");
  }
  return sha256(
    encoder.encode(
      ["coredrill-restore-target-v1", `database:${databaseSha256}`, ...contentIds, ""].join("\n"),
    ),
  );
};
