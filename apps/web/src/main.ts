import {
  BrowserSqliteBusyError,
  BrowserStorageUnavailableError,
  BrowserVaultBusyError,
  openBrowserSqliteDatabase,
  type BrowserSqliteDatabase,
} from "@coredrill/storage-browser";
import {
  applySqlMigrations,
  createDocumentRepositoryContractSuite,
  createPipelineRepositoryContractSuite,
  createTrackerRepositoryContractSuite,
  createViewRepositoryContractSuite,
  defineSqlMigrations,
  runDatabaseContractSuite,
  sqlStatement,
  type DatabaseContractRunResult,
  type DatabasePort,
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
import { createExtensionInbox, type ExtensionInboxApi } from "./extension-transfer.js";
import {
  runStorageBenchmark,
  type StorageBenchmarkInput,
  type StorageBenchmarkResult,
} from "./storage-benchmark.js";

const DATABASE_NAME = "/coredrill-phase0.sqlite3";
const MIGRATION_APPLIED_AT = "2026-08-24T08:00:00.000Z";

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
  runDocumentRepositoryContracts(): Promise<DatabaseContractRunResult>;
  runPipelineRepositoryContracts(): Promise<DatabaseContractRunResult>;
  runTrackerRepositoryContracts(): Promise<DatabaseContractRunResult>;
  runViewRepositoryContracts(): Promise<DatabaseContractRunResult>;
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
  runDocumentRepositoryContracts: async () => {
    await api.close();
    let sequence = 1;
    const adapter = {
      name: "official-sqlite-wasm-opfs-sahpool",
      createIsolatedDatabase: async () => {
        const client = await openBrowserSqliteDatabase({
          databaseName: `/coredrill-document-contract-${String(sequence)}.sqlite3`,
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
    const reviewedMigrations = await migrations();
    return runDatabaseContractSuite(
      adapter,
      createDocumentRepositoryContractSuite({
        migrate: async (client) => {
          await applySqlMigrations(client, reviewedMigrations, MIGRATION_APPLIED_AT);
        },
      }),
    );
  },
  runPipelineRepositoryContracts: async () => {
    await api.close();
    let sequence = 1;
    const adapter = {
      name: "official-sqlite-wasm-opfs-sahpool",
      createIsolatedDatabase: async () => {
        const client = await openBrowserSqliteDatabase({
          databaseName: `/coredrill-pipeline-contract-${String(sequence)}.sqlite3`,
          requestPersistentStorage: false,
        });
        sequence += 1;
        return client;
      },
      disposeIsolatedDatabase: async (client: DatabasePort) => {
        await (client as BrowserSqliteDatabase).delete();
      },
    };
    const reviewedMigrations = await migrations();
    return runDatabaseContractSuite(
      adapter,
      createPipelineRepositoryContractSuite({
        migrate: async (client) => {
          await applySqlMigrations(client, reviewedMigrations, MIGRATION_APPLIED_AT);
        },
      }),
    );
  },
  runTrackerRepositoryContracts: async () => {
    await api.close();
    let sequence = 1;
    const adapter = {
      name: "official-sqlite-wasm-opfs-sahpool",
      createIsolatedDatabase: async () => {
        const client = await openBrowserSqliteDatabase({
          databaseName: `/coredrill-tracker-contract-${String(sequence)}.sqlite3`,
          requestPersistentStorage: false,
        });
        sequence += 1;
        return client;
      },
      disposeIsolatedDatabase: async (client: DatabasePort) => {
        await (client as BrowserSqliteDatabase).delete();
      },
    };
    const reviewedMigrations = await migrations();
    return runDatabaseContractSuite(
      adapter,
      createTrackerRepositoryContractSuite({
        migrate: async (client) => {
          await applySqlMigrations(client, reviewedMigrations, MIGRATION_APPLIED_AT);
        },
      }),
    );
  },
  runViewRepositoryContracts: async () => {
    await api.close();
    let sequence = 1;
    const adapter = {
      name: "official-sqlite-wasm-opfs-sahpool",
      createIsolatedDatabase: async () => {
        const client = await openBrowserSqliteDatabase({
          databaseName: `/coredrill-view-contract-${String(sequence)}.sqlite3`,
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
    const reviewedMigrations = await migrations();
    return runDatabaseContractSuite(
      adapter,
      createViewRepositoryContractSuite({
        migrate: async (client) => {
          await applySqlMigrations(client, reviewedMigrations, MIGRATION_APPLIED_AT);
        },
      }),
    );
  },
};

globalThis.coredrillStorageSpike = Object.freeze(api);
globalThis.coredrillExtensionInbox = createExtensionInbox(async () => {
  const client = await getDatabase();
  await applySqlMigrations(client, await migrations(), MIGRATION_APPLIED_AT);
  return client;
});
