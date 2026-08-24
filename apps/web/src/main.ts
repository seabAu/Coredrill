import {
  BrowserSqliteBusyError,
  BrowserStorageUnavailableError,
  BrowserVaultBusyError,
  openBrowserSqliteDatabase,
  type BrowserSqliteDatabase,
} from "@coredrill/storage-browser";
import {
  applySqlMigrations,
  defineSqlMigrations,
  sqlStatement,
  type PortableDatabase,
  type QueryRow,
  type StorageDiagnostics,
} from "@coredrill/storage-core";

import initialMigrationSql from "../../../migrations/0001_vault.sql?raw";
import captureInboxMigrationSql from "../../../migrations/0002_capture_inbox.sql?raw";
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
};

globalThis.coredrillStorageSpike = Object.freeze(api);
globalThis.coredrillExtensionInbox = createExtensionInbox(async () => {
  const client = await getDatabase();
  await applySqlMigrations(client, await migrations(), MIGRATION_APPLIED_AT);
  return client;
});
