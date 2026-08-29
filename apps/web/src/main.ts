import {
  BrowserSqliteBusyError,
  BrowserStorageUnavailableError,
  BrowserVaultBusyError,
  openBrowserSqliteDatabase,
  type BrowserSqliteDatabase,
} from "@coredrill/storage-browser";
import {
  applySqlMigrations,
  createPortableDataExportV1,
  createPhase1RepositoryContractSuite,
  defineSqlMigrations,
  PHASE_1_REPOSITORY_CONTRACT_MANIFEST,
  runDatabaseContractSuite,
  sqlStatement,
  type DatabaseContractRunResult,
  type DatabasePort,
  type Phase1RepositoryContractManifest,
  type PortableDatabase,
  type QueryRow,
  type StorageDiagnostics,
} from "@coredrill/storage-core";

import initialMigrationSql from "../../../migrations/0001_vault.sql?raw";
import captureInboxMigrationSql from "../../../migrations/0002_capture_inbox.sql?raw";
import appSettingMigrationSql from "../../../migrations/0003_app_setting.sql?raw";
import locationMigrationSql from "../../../migrations/0004_location.sql?raw";
import companyMigrationSql from "../../../migrations/0005_company.sql?raw";
import contactMigrationSql from "../../../migrations/0006_contact.sql?raw";
import jobMigrationSql from "../../../migrations/0007_job.sql?raw";
import jobSourceMigrationSql from "../../../migrations/0008_job_source.sql?raw";
import sourceSnapshotMigrationSql from "../../../migrations/0009_source_snapshot.sql?raw";
import provenanceMigrationSql from "../../../migrations/0010_provenance.sql?raw";
import companyAliasMigrationSql from "../../../migrations/0011_company_alias.sql?raw";
import contactPointProvenanceMigrationSql from "../../../migrations/0012_contact_point_provenance.sql?raw";
import fieldValueMigrationSql from "../../../migrations/0013_field_value.sql?raw";
import statusDefinitionMigrationSql from "../../../migrations/0014_status_definition.sql?raw";
import jobCurrentStatusMigrationSql from "../../../migrations/0015_job_current_status.sql?raw";
import jobNextActionMigrationSql from "../../../migrations/0016_job_next_action.sql?raw";
import applicationMigrationSql from "../../../migrations/0017_application.sql?raw";
import statusEventMigrationSql from "../../../migrations/0018_status_event.sql?raw";
import interactionMigrationSql from "../../../migrations/0019_interaction.sql?raw";
import nextActionMigrationSql from "../../../migrations/0020_next_action.sql?raw";
import interviewMigrationSql from "../../../migrations/0021_interview.sql?raw";
import reminderMigrationSql from "../../../migrations/0022_reminder.sql?raw";
import tagMigrationSql from "../../../migrations/0023_tag.sql?raw";
import jobTagMigrationSql from "../../../migrations/0024_job_tag.sql?raw";
import savedViewMigrationSql from "../../../migrations/0025_saved_view.sql?raw";
import documentMigrationSql from "../../../migrations/0026_document.sql?raw";
import documentVersionMigrationSql from "../../../migrations/0027_document_version.sql?raw";
import documentJobLinkMigrationSql from "../../../migrations/0028_document_job_link.sql?raw";
import attachmentManifestMigrationSql from "../../../migrations/0029_attachment_manifest.sql?raw";
import documentVersionAttachmentMigrationSql from "../../../migrations/0030_document_version_attachment.sql?raw";
import documentStyleExampleMigrationSql from "../../../migrations/0031_document_style_example.sql?raw";
import deviceMigrationSql from "../../../migrations/0032_device.sql?raw";
import integrityProbeMigrationSql from "../../../migrations/0033_integrity_probe.sql?raw";
import validateExistingIntegrityMigrationSql from "../../../migrations/0034_validate_existing_integrity.sql?raw";
import dropIntegrityProbeMigrationSql from "../../../migrations/0035_drop_integrity_probe.sql?raw";
import applicationDocumentInsertGuardMigrationSql from "../../../migrations/0036_application_document_insert_guard.sql?raw";
import applicationDocumentUpdateGuardMigrationSql from "../../../migrations/0037_application_document_update_guard.sql?raw";
import documentKindUpdateGuardMigrationSql from "../../../migrations/0038_document_kind_update_guard.sql?raw";
import documentVersionLineageGuardMigrationSql from "../../../migrations/0039_document_version_lineage_guard.sql?raw";
import documentVersionUpdateGuardMigrationSql from "../../../migrations/0040_document_version_update_guard.sql?raw";
import documentVersionDeleteGuardMigrationSql from "../../../migrations/0041_document_version_delete_guard.sql?raw";
import sourceSnapshotUpdateGuardMigrationSql from "../../../migrations/0042_source_snapshot_update_guard.sql?raw";
import statusEventUpdateGuardMigrationSql from "../../../migrations/0043_status_event_update_guard.sql?raw";
import interactionUpdateGuardMigrationSql from "../../../migrations/0044_interaction_update_guard.sql?raw";
import attachmentManifestUpdateGuardMigrationSql from "../../../migrations/0045_attachment_manifest_update_guard.sql?raw";
import { createExtensionInbox, type ExtensionInboxApi } from "./extension-transfer.js";
import {
  runJobSearchBenchmark,
  runStorageBenchmark,
  type JobSearchBenchmarkResult,
  type StorageBenchmarkInput,
  type StorageBenchmarkResult,
} from "./storage-benchmark.js";
import {
  runPortableArchiveWriterProof,
  type PortableArchiveBrowserProof,
} from "./portable-archive-proof.js";

const DATABASE_NAME = "/coredrill-phase0.sqlite3";
const MIGRATION_APPLIED_AT = "2026-08-24T08:00:00.000Z";
const ADDITIONAL_MIGRATION_PATH = /\/(?<version>\d{4})_(?<name>[a-z0-9_]+)\.sql$/u;
const additionalMigrationSources = import.meta.glob("../../../migrations/*.sql", {
  eager: true,
  import: "default",
  query: "?raw",
}) as Readonly<Record<string, string>>;

interface VaultRow extends QueryRow {
  readonly id: string;
  readonly name: string;
  readonly schema_version: number;
  readonly created_at: string;
  readonly last_opened_at: string;
}

interface VaultInput {
  readonly id: string;
  readonly name: string;
  readonly createdAt: string;
  readonly lastOpenedAt: string;
}

interface PortableDatabaseJson {
  readonly schemaVersion: number;
  readonly byteLength: number;
  readonly sha256: string;
  readonly bytesBase64: string;
}

interface OpenMigrationProof {
  readonly appliedVersions: readonly number[];
  readonly diagnostics: StorageDiagnostics;
}

interface OpenOptions {
  readonly expectedExisting?: boolean;
}

interface OpenAttempt {
  readonly code?: "sqlite_busy" | "storage_unavailable" | "vault_busy";
  readonly message?: string;
  readonly opened: boolean;
  readonly proof?: OpenMigrationProof;
}

interface Phase1RepositoryContractProof {
  readonly manifest: Phase1RepositoryContractManifest;
  readonly run: DatabaseContractRunResult;
}

interface HumanReadableExportInput {
  readonly generatedAt: string;
  readonly vaultId: string;
}

interface HumanReadableExportProof {
  readonly dataFileCount: number;
  readonly datasetCount: number;
  readonly datasetNames: readonly string[];
  readonly jsonFiles: number;
  readonly csvFiles: number;
  readonly rowCount: number;
  readonly sourceSchemaVersion: number;
}

export interface CoredrillStorageSpikeApi {
  openAndMigrate(options?: OpenOptions): Promise<OpenMigrationProof>;
  tryOpenAndMigrate(options?: OpenOptions): Promise<OpenAttempt>;
  writeVault(input: VaultInput): Promise<void>;
  proveRollback(input: VaultInput): Promise<boolean>;
  listVaults(): Promise<readonly VaultRow[]>;
  exportPortable(): Promise<PortableDatabaseJson>;
  restorePortable(portable: PortableDatabaseJson): Promise<void>;
  diagnostics(): Promise<StorageDiagnostics>;
  close(): Promise<void>;
  delete(): Promise<boolean>;
  runBenchmark(input: StorageBenchmarkInput): Promise<StorageBenchmarkResult>;
  runJobSearchBenchmark(input: StorageBenchmarkInput): Promise<JobSearchBenchmarkResult>;
  runPhase1RepositoryContracts(): Promise<Phase1RepositoryContractProof>;
  runPortableArchiveWriterProof(): Promise<PortableArchiveBrowserProof>;
  exportHumanReadable(input: HumanReadableExportInput): Promise<HumanReadableExportProof>;
}

declare global {
  var coredrillStorageSpike: CoredrillStorageSpikeApi;
  var coredrillExtensionInbox: ExtensionInboxApi;
}

let database: BrowserSqliteDatabase | undefined;
const statusElement = document.querySelector<HTMLElement>("#status");

const setStatus = (message: string): void => {
  if (statusElement !== null) statusElement.textContent = message;
};

const sha256Text = async (value: string): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
};

const additionalMigrations = async () =>
  Promise.all(
    Object.entries(additionalMigrationSources)
      .map(([sourcePath, sql]) => {
        const match = ADDITIONAL_MIGRATION_PATH.exec(sourcePath.replaceAll("\\", "/"));
        if (match?.groups === undefined) {
          throw new Error(`Migration source path ${sourcePath} is invalid.`);
        }
        return {
          version: Number(match.groups["version"]),
          name: match.groups["name"]?.replaceAll("_", "-") ?? "",
          sql,
        };
      })
      .filter((migration) => migration.version > 45)
      .sort((left, right) => left.version - right.version)
      .map(async (migration) => ({
        ...migration,
        sha256: await sha256Text(migration.sql),
      })),
  );

const migrations = async () =>
  defineSqlMigrations([
    {
      version: 1,
      name: "vault",
      sha256: await sha256Text(initialMigrationSql),
      sql: initialMigrationSql,
    },
    {
      version: 2,
      name: "capture-inbox",
      sha256: await sha256Text(captureInboxMigrationSql),
      sql: captureInboxMigrationSql,
    },
    {
      version: 3,
      name: "app-setting",
      sha256: await sha256Text(appSettingMigrationSql),
      sql: appSettingMigrationSql,
    },
    {
      version: 4,
      name: "location",
      sha256: await sha256Text(locationMigrationSql),
      sql: locationMigrationSql,
    },
    {
      version: 5,
      name: "company",
      sha256: await sha256Text(companyMigrationSql),
      sql: companyMigrationSql,
    },
    {
      version: 6,
      name: "contact",
      sha256: await sha256Text(contactMigrationSql),
      sql: contactMigrationSql,
    },
    {
      version: 7,
      name: "job",
      sha256: await sha256Text(jobMigrationSql),
      sql: jobMigrationSql,
    },
    {
      version: 8,
      name: "job-source",
      sha256: await sha256Text(jobSourceMigrationSql),
      sql: jobSourceMigrationSql,
    },
    {
      version: 9,
      name: "source-snapshot",
      sha256: await sha256Text(sourceSnapshotMigrationSql),
      sql: sourceSnapshotMigrationSql,
    },
    {
      version: 10,
      name: "provenance",
      sha256: await sha256Text(provenanceMigrationSql),
      sql: provenanceMigrationSql,
    },
    {
      version: 11,
      name: "company-alias",
      sha256: await sha256Text(companyAliasMigrationSql),
      sql: companyAliasMigrationSql,
    },
    {
      version: 12,
      name: "contact-point-provenance",
      sha256: await sha256Text(contactPointProvenanceMigrationSql),
      sql: contactPointProvenanceMigrationSql,
    },
    {
      version: 13,
      name: "field-value",
      sha256: await sha256Text(fieldValueMigrationSql),
      sql: fieldValueMigrationSql,
    },
    {
      version: 14,
      name: "status-definition",
      sha256: await sha256Text(statusDefinitionMigrationSql),
      sql: statusDefinitionMigrationSql,
    },
    {
      version: 15,
      name: "job-current-status",
      sha256: await sha256Text(jobCurrentStatusMigrationSql),
      sql: jobCurrentStatusMigrationSql,
    },
    {
      version: 16,
      name: "job-next-action",
      sha256: await sha256Text(jobNextActionMigrationSql),
      sql: jobNextActionMigrationSql,
    },
    {
      version: 17,
      name: "application",
      sha256: await sha256Text(applicationMigrationSql),
      sql: applicationMigrationSql,
    },
    {
      version: 18,
      name: "status-event",
      sha256: await sha256Text(statusEventMigrationSql),
      sql: statusEventMigrationSql,
    },
    {
      version: 19,
      name: "interaction",
      sha256: await sha256Text(interactionMigrationSql),
      sql: interactionMigrationSql,
    },
    {
      version: 20,
      name: "next-action",
      sha256: await sha256Text(nextActionMigrationSql),
      sql: nextActionMigrationSql,
    },
    {
      version: 21,
      name: "interview",
      sha256: await sha256Text(interviewMigrationSql),
      sql: interviewMigrationSql,
    },
    {
      version: 22,
      name: "reminder",
      sha256: await sha256Text(reminderMigrationSql),
      sql: reminderMigrationSql,
    },
    {
      version: 23,
      name: "tag",
      sha256: await sha256Text(tagMigrationSql),
      sql: tagMigrationSql,
    },
    {
      version: 24,
      name: "job-tag",
      sha256: await sha256Text(jobTagMigrationSql),
      sql: jobTagMigrationSql,
    },
    {
      version: 25,
      name: "saved-view",
      sha256: await sha256Text(savedViewMigrationSql),
      sql: savedViewMigrationSql,
    },
    {
      version: 26,
      name: "document",
      sha256: await sha256Text(documentMigrationSql),
      sql: documentMigrationSql,
    },
    {
      version: 27,
      name: "document-version",
      sha256: await sha256Text(documentVersionMigrationSql),
      sql: documentVersionMigrationSql,
    },
    {
      version: 28,
      name: "document-job-link",
      sha256: await sha256Text(documentJobLinkMigrationSql),
      sql: documentJobLinkMigrationSql,
    },
    {
      version: 29,
      name: "attachment-manifest",
      sha256: await sha256Text(attachmentManifestMigrationSql),
      sql: attachmentManifestMigrationSql,
    },
    {
      version: 30,
      name: "document-version-attachment",
      sha256: await sha256Text(documentVersionAttachmentMigrationSql),
      sql: documentVersionAttachmentMigrationSql,
    },
    {
      version: 31,
      name: "document-style-example",
      sha256: await sha256Text(documentStyleExampleMigrationSql),
      sql: documentStyleExampleMigrationSql,
    },
    {
      version: 32,
      name: "device",
      sha256: await sha256Text(deviceMigrationSql),
      sql: deviceMigrationSql,
    },
    {
      version: 33,
      name: "integrity-probe",
      sha256: await sha256Text(integrityProbeMigrationSql),
      sql: integrityProbeMigrationSql,
    },
    {
      version: 34,
      name: "validate-existing-integrity",
      sha256: await sha256Text(validateExistingIntegrityMigrationSql),
      sql: validateExistingIntegrityMigrationSql,
    },
    {
      version: 35,
      name: "drop-integrity-probe",
      sha256: await sha256Text(dropIntegrityProbeMigrationSql),
      sql: dropIntegrityProbeMigrationSql,
    },
    {
      version: 36,
      name: "application-document-insert-guard",
      sha256: await sha256Text(applicationDocumentInsertGuardMigrationSql),
      sql: applicationDocumentInsertGuardMigrationSql,
    },
    {
      version: 37,
      name: "application-document-update-guard",
      sha256: await sha256Text(applicationDocumentUpdateGuardMigrationSql),
      sql: applicationDocumentUpdateGuardMigrationSql,
    },
    {
      version: 38,
      name: "document-kind-update-guard",
      sha256: await sha256Text(documentKindUpdateGuardMigrationSql),
      sql: documentKindUpdateGuardMigrationSql,
    },
    {
      version: 39,
      name: "document-version-lineage-guard",
      sha256: await sha256Text(documentVersionLineageGuardMigrationSql),
      sql: documentVersionLineageGuardMigrationSql,
    },
    {
      version: 40,
      name: "document-version-update-guard",
      sha256: await sha256Text(documentVersionUpdateGuardMigrationSql),
      sql: documentVersionUpdateGuardMigrationSql,
    },
    {
      version: 41,
      name: "document-version-delete-guard",
      sha256: await sha256Text(documentVersionDeleteGuardMigrationSql),
      sql: documentVersionDeleteGuardMigrationSql,
    },
    {
      version: 42,
      name: "source-snapshot-update-guard",
      sha256: await sha256Text(sourceSnapshotUpdateGuardMigrationSql),
      sql: sourceSnapshotUpdateGuardMigrationSql,
    },
    {
      version: 43,
      name: "status-event-update-guard",
      sha256: await sha256Text(statusEventUpdateGuardMigrationSql),
      sql: statusEventUpdateGuardMigrationSql,
    },
    {
      version: 44,
      name: "interaction-update-guard",
      sha256: await sha256Text(interactionUpdateGuardMigrationSql),
      sql: interactionUpdateGuardMigrationSql,
    },
    {
      version: 45,
      name: "attachment-manifest-update-guard",
      sha256: await sha256Text(attachmentManifestUpdateGuardMigrationSql),
      sql: attachmentManifestUpdateGuardMigrationSql,
    },
    ...(await additionalMigrations()),
  ]);

const getDatabase = async (options: OpenOptions = {}): Promise<BrowserSqliteDatabase> => {
  database ??= await openBrowserSqliteDatabase({
    databaseName: DATABASE_NAME,
    expectedExisting: options.expectedExisting ?? false,
    requestPersistentStorage: false,
  });
  return database;
};

const logOpenProof = (diagnostics: StorageDiagnostics): void => {
  console.info(
    `COREDRILL_STORAGE ${JSON.stringify({
      event: "storage.open",
      adapter: diagnostics.adapterName,
      persistence: diagnostics.persistence,
      schemaVersion: diagnostics.schemaVersion,
      details: diagnostics.details,
    })}`,
  );
};

const bytesToBase64 = (bytes: Uint8Array): string => {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
};

const base64ToBytes = (value: string): Uint8Array => {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
};

const toPortableDatabase = (portable: PortableDatabaseJson): PortableDatabase => ({
  schemaVersion: portable.schemaVersion,
  byteLength: portable.byteLength,
  sha256: portable.sha256,
  bytes: base64ToBytes(portable.bytesBase64),
});

const createBrowserContractAdapter = () => {
  let sequence = 1;
  return {
    name: "official-sqlite-wasm-opfs-sahpool",
    createIsolatedDatabase: async () => {
      const client = await openBrowserSqliteDatabase({
        databaseName: `/coredrill-phase-1-contract-${String(sequence)}.sqlite3`,
        expectedExisting: false,
        requestPersistentStorage: false,
      });
      sequence += 1;
      return client;
    },
    disposeIsolatedDatabase: async (client: DatabasePort) => {
      await (client as BrowserSqliteDatabase).delete();
    },
  };
};

const api: CoredrillStorageSpikeApi = {
  openAndMigrate: async (options = {}) => {
    const client = await getDatabase(options);
    const result = await applySqlMigrations(client, await migrations(), MIGRATION_APPLIED_AT);
    const diagnostics = await client.diagnostics();
    logOpenProof(diagnostics);
    setStatus(
      diagnostics.health === "ready"
        ? "Vault ready"
        : "Vault ready with storage warnings; export a backup before relying on this profile.",
    );
    return Object.freeze({ appliedVersions: result.appliedVersions, diagnostics });
  },
  tryOpenAndMigrate: async (options = {}) => {
    try {
      return Object.freeze({ opened: true, proof: await api.openAndMigrate(options) });
    } catch (error) {
      if (
        error instanceof BrowserVaultBusyError ||
        error instanceof BrowserStorageUnavailableError ||
        error instanceof BrowserSqliteBusyError
      ) {
        setStatus(error.message);
        return Object.freeze({
          opened: false,
          code: error.code,
          message: error.message,
        });
      }
      throw error;
    }
  },
  writeVault: async (input) => {
    const client = await getDatabase();
    await client.transaction(async (transaction) => {
      await transaction.execute(
        sqlStatement(
          "INSERT INTO vault(id, name, schema_version, created_at, last_opened_at) VALUES (?, ?, 1, ?, ?)",
          [input.id, input.name, input.createdAt, input.lastOpenedAt],
        ),
      );
    });
  },
  proveRollback: async (input) => {
    const client = await getDatabase();
    const rejection = new Error("intentional browser storage rollback proof");
    try {
      await client.transaction(async (transaction) => {
        await transaction.execute(
          sqlStatement(
            "INSERT INTO vault(id, name, schema_version, created_at, last_opened_at) VALUES (?, ?, 1, ?, ?)",
            [input.id, input.name, input.createdAt, input.lastOpenedAt],
          ),
        );
        throw rejection;
      });
    } catch (error) {
      if (error !== rejection) throw error;
    }
    const rows = await client.query(sqlStatement("SELECT id FROM vault WHERE id = ?", [input.id]));
    return rows.length === 0;
  },
  listVaults: async () => {
    const client = await getDatabase();
    return client.query<VaultRow>(
      sqlStatement(
        "SELECT id, name, schema_version, created_at, last_opened_at FROM vault ORDER BY id",
      ),
    );
  },
  exportPortable: async () => {
    const portable = await (await getDatabase()).exportPortable();
    return Object.freeze({
      schemaVersion: portable.schemaVersion,
      byteLength: portable.byteLength,
      sha256: portable.sha256,
      bytesBase64: bytesToBase64(portable.bytes),
    });
  },
  restorePortable: async (portable) => {
    await (await getDatabase()).restorePortable(toPortableDatabase(portable));
  },
  diagnostics: async () => (await getDatabase()).diagnostics(),
  close: async () => {
    if (database === undefined) return;
    await database.close();
    database = undefined;
  },
  delete: async () => {
    const client = await getDatabase();
    const deleted = await client.delete();
    database = undefined;
    return deleted;
  },
  runBenchmark: (input) => runStorageBenchmark(input),
  runJobSearchBenchmark: async (input) => runJobSearchBenchmark(input, await migrations()),
  runPortableArchiveWriterProof,
  exportHumanReadable: async (input) => {
    const bundle = await createPortableDataExportV1({
      database: await getDatabase(),
      generatedAt: input.generatedAt,
      vaultId: input.vaultId,
    });
    return Object.freeze({
      dataFileCount: bundle.dataFiles.length,
      datasetCount: bundle.datasetCount,
      datasetNames: Object.freeze(bundle.datasets.map((dataset) => dataset.dataset)),
      jsonFiles: bundle.dataFiles.filter((file) => file.format === "json").length,
      csvFiles: bundle.dataFiles.filter((file) => file.format === "csv").length,
      rowCount: bundle.rowCount,
      sourceSchemaVersion: bundle.sourceSchemaVersion,
    });
  },
  runPhase1RepositoryContracts: async () => {
    await api.close();
    const reviewedMigrations = await migrations();
    const run = await runDatabaseContractSuite(
      createBrowserContractAdapter(),
      createPhase1RepositoryContractSuite({
        expectedFts5: true,
        migrate: async (client) => {
          await applySqlMigrations(client, reviewedMigrations, MIGRATION_APPLIED_AT);
        },
      }),
    );
    return Object.freeze({
      manifest: PHASE_1_REPOSITORY_CONTRACT_MANIFEST,
      run,
    });
  },
};

globalThis.coredrillStorageSpike = Object.freeze(api);
globalThis.coredrillExtensionInbox = createExtensionInbox(async () => {
  const client = await getDatabase();
  await applySqlMigrations(client, await migrations(), MIGRATION_APPLIED_AT);
  return client;
});
