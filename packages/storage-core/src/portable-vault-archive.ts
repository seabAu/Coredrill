import { entityId, instant } from "@coredrill/domain";
import { portableArchiveManifestV1Schema } from "@coredrill/contracts";
import {
  sqlStatement,
  type DatabasePort,
  type DatabaseReadSnapshot,
  type PortableDatabase,
  type QueryRow,
} from "./database-port.js";
import { readPortableDataExportSnapshotV1 } from "./portable-data-export.js";
import {
  PORTABLE_ARCHIVE_WRITER_LIMITS,
  writePortableArchiveV1,
  type PortableArchiveV1,
} from "./portable-archive-writer.js";

export class PortableVaultArchiveError extends Error {
  public override readonly name = "PortableVaultArchiveError";
  public constructor(
    public readonly code: "invalid_input" | "source_changed" | "archive_unavailable",
  ) {
    super(
      code === "source_changed"
        ? "The local vault changed during export. Review its current state before preparing another archive."
        : code === "invalid_input"
          ? "Review the current vault before preparing a portable archive."
          : "A complete portable archive could not be prepared. No file was saved.",
    );
  }
}
export interface PreparePortableVaultArchiveInputV1 {
  readonly database: DatabasePort;
  readonly vaultId: string;
  readonly archiveId: string;
  readonly createdAt: string;
  readonly createdByVersion: string;
  readonly readAttachment: (contentId: string) => Promise<Uint8Array | undefined>;
}
interface MigrationRow extends QueryRow {
  readonly version: number;
  readonly name: string;
  readonly sha256: string;
  readonly applied_at: string;
}
const snapshot = async (
  database: Pick<DatabaseReadSnapshot, "exportPortable">,
): Promise<PortableDatabase> => {
  const source = await database.exportPortable();
  if (
    !(source.bytes instanceof Uint8Array) ||
    source.bytes.byteLength > PORTABLE_ARCHIVE_WRITER_LIMITS.maxEntryBytes
  )
    throw new PortableVaultArchiveError("archive_unavailable");
  const bytes = Uint8Array.from(source.bytes);
  const schemaVersion = source.schemaVersion;
  const byteLength = source.byteLength;
  const expected = source.sha256;
  const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
  const sha256 = [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
  if (
    byteLength !== bytes.byteLength ||
    expected !== sha256 ||
    !Number.isSafeInteger(schemaVersion) ||
    schemaVersion < 1
  )
    throw new PortableVaultArchiveError("archive_unavailable");
  return Object.freeze({ bytes, byteLength, sha256, schemaVersion });
};

const dataVersion = async (database: Pick<DatabaseReadSnapshot, "query">): Promise<number> => {
  const rows = await database.query(sqlStatement("PRAGMA data_version"));
  const raw = rows[0]?.["data_version"];
  const value = typeof raw === "bigint" ? Number(raw) : raw;
  if (rows.length !== 1 || typeof value !== "number" || !Number.isSafeInteger(value) || value < 0)
    throw new PortableVaultArchiveError("archive_unavailable");
  return value;
};

/** Prepares bytes only. No save, restore, reminder advancement or automatic retry. */
export const preparePortableVaultArchiveV1 = async (
  input: PreparePortableVaultArchiveInputV1,
): Promise<PortableArchiveV1> => {
  let request: PreparePortableVaultArchiveInputV1;
  try {
    request = Object.freeze({
      database: input.database,
      vaultId: entityId("vault", input.vaultId),
      archiveId: entityId("portable-archive", input.archiveId),
      createdAt: instant(input.createdAt),
      createdByVersion: portableArchiveManifestV1Schema.shape.createdBy.parse({
        name: "coredrill",
        version: input.createdByVersion,
      }).version,
      readAttachment: input.readAttachment,
    });
    if (typeof request.readAttachment !== "function")
      throw new TypeError("Invalid attachment reader.");
  } catch {
    throw new PortableVaultArchiveError("invalid_input");
  }
  try {
    const capture = request.database.withReadSnapshot?.bind(request.database);
    if (capture === undefined) throw new PortableVaultArchiveError("archive_unavailable");
    const { before, data, history, revision } = await capture(async (lease) => {
      const revision = await dataVersion(lease);
      const before = await snapshot(lease);
      const data = await readPortableDataExportSnapshotV1({
        database: lease,
        generatedAt: request.createdAt,
        vaultId: request.vaultId,
      });
      if (data.sourceSchemaVersion !== before.schemaVersion)
        throw new PortableVaultArchiveError("source_changed");
      const history = await lease.query<MigrationRow>(
        sqlStatement(
          "SELECT version, name, sha256, applied_at FROM coredrill_schema_migration ORDER BY version",
        ),
      );
      if ((await dataVersion(lease)) !== revision)
        throw new PortableVaultArchiveError("source_changed");
      return { before, data, history, revision };
    });
    const manifests = data.datasets.find(({ dataset }) => dataset === "attachment_manifest");
    if (manifests === undefined) throw new PortableVaultArchiveError("archive_unavailable");
    const attachments = manifests.rows.map((row) => {
      const contentId = row["content_id"];
      const mediaType = row["media_type"];
      const byteLength = row["byte_length"];
      if (
        typeof contentId !== "string" ||
        typeof mediaType !== "string" ||
        typeof byteLength !== "number"
      )
        throw new PortableVaultArchiveError("archive_unavailable");
      return { contentId, sha256: contentId, mediaType, byteLength };
    });
    const archive = await writePortableArchiveV1({
      archiveId: request.archiveId,
      createdAt: request.createdAt,
      createdByVersion: request.createdByVersion,
      vault: {
        id: request.vaultId,
        schemaVersion: before.schemaVersion,
        migrationHistory: history.map((row) => ({
          version: row.version,
          name: row.name,
          sha256: row.sha256,
          appliedAt: row.applied_at,
        })),
      },
      database: before,
      dataFiles: data.dataFiles,
      attachments,
      readAttachment: request.readAttachment,
    });
    // The read lease already bound SQLite bytes, ledger and projections atomically
    // against this coordinator. A second check also rejects later committed drift.
    const after = await snapshot(request.database);
    if (
      after.sha256 !== before.sha256 ||
      after.byteLength !== before.byteLength ||
      after.schemaVersion !== before.schemaVersion
    )
      throw new PortableVaultArchiveError("source_changed");
    if ((await dataVersion(request.database)) !== revision)
      throw new PortableVaultArchiveError("source_changed");
    return archive;
  } catch (error) {
    if (error instanceof PortableVaultArchiveError) throw error;
    throw new PortableVaultArchiveError("archive_unavailable");
  }
};
