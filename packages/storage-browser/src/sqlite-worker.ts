import type {
  Database,
  SAHPoolUtil,
  Sqlite3Static,
  SqlValue as WasmSqlValue,
} from "@sqlite.org/sqlite-wasm";
import type {
  ExecuteResult,
  PortableDatabase,
  QueryRow,
  SqlStatement,
  StorageDiagnostics,
} from "@coredrill/storage-core";

import {
  BROWSER_STORAGE_PROTOCOL_VERSION,
  isBrowserStorageRequest,
  type BrowserStorageDeleteResult,
  type BrowserStorageOpenResult,
  type BrowserStorageRequest,
  type BrowserStorageResponse,
  type BrowserStorageRestoreInspectionResult,
  type BrowserStorageRestoreResult,
  type BrowserStorageSuccessResponse,
} from "./protocol.js";

interface WorkerScope {
  addEventListener(type: "message", listener: (event: MessageEvent<unknown>) => void): void;
  postMessage(message: BrowserStorageResponse): void;
}

interface SQLiteGlobalConfiguration {
  sqlite3ApiConfig?: {
    readonly disable: {
      readonly vfs: Readonly<Record<string, boolean>>;
    };
  };
}

const scope = globalThis as unknown as WorkerScope;
const sqliteGlobal = globalThis as typeof globalThis & SQLiteGlobalConfiguration;
const POOL_DIRECTORY = "/coredrill/sqlite-sahpool";

let sqlite: Sqlite3Static | undefined;
let pool: SAHPoolUtil | undefined;
let database: Database | undefined;
let databaseName: string | undefined;

const assertDatabaseName = (value: string | undefined): string => {
  if (
    value === undefined ||
    !value.startsWith("/") ||
    value.length > 128 ||
    !/^\/[a-z0-9][a-z0-9._-]*\.sqlite3$/u.test(value)
  ) {
    throw new TypeError("The OPFS database name must be an absolute reviewed SQLite filename.");
  }
  return value;
};

const initializeSQLite = async (): Promise<void> => {
  if (sqlite !== undefined && pool !== undefined) return;
  sqliteGlobal.sqlite3ApiConfig = {
    disable: {
      vfs: {
        kvvfs: true,
        opfs: true,
        "opfs-wl": true,
      },
    },
  };
  const { default: sqlite3InitModule } = await import("@sqlite.org/sqlite-wasm");
  sqlite = await sqlite3InitModule();
  pool = await sqlite.installOpfsSAHPoolVfs({
    clearOnInit: false,
    directory: POOL_DIRECTORY,
    initialCapacity: 6,
    name: "opfs-sahpool",
  });
  if (pool.vfsName !== "opfs-sahpool") {
    throw new Error("SQLite installed an unexpected browser VFS.");
  }
};

const requireDatabase = (): Database => {
  if (!database?.isOpen()) throw new Error("The browser database is closed.");
  return database;
};

const requirePool = (): SAHPoolUtil => {
  if (pool === undefined) throw new Error("The OPFS SAH pool is unavailable.");
  return pool;
};

const requireSQLite = (): Sqlite3Static => {
  if (sqlite === undefined) throw new Error("SQLite WASM is unavailable.");
  return sqlite;
};

const openDatabase = async (name: string): Promise<BrowserStorageOpenResult> => {
  await initializeSQLite();
  if (database?.isOpen()) {
    if (databaseName !== name) throw new Error("This Worker already owns another database.");
    return describeOpenDatabase();
  }

  const existedBeforeOpen = requirePool().getFileNames().includes(name);
  databaseName = name;
  database = new (requirePool().OpfsSAHPoolDb)(name);
  database.exec("PRAGMA foreign_keys = ON");
  if (database.selectValue("PRAGMA foreign_keys") !== 1) {
    database.close();
    database = undefined;
    throw new Error("SQLite foreign-key enforcement could not be enabled.");
  }
  const integrity = database.selectValue("PRAGMA quick_check");
  if (integrity !== "ok") {
    database.close();
    database = undefined;
    throw new Error("SQLite quick_check rejected the browser database.");
  }
  return describeOpenDatabase(existedBeforeOpen);
};

const describeOpenDatabase = (existedBeforeOpen = true): BrowserStorageOpenResult => {
  const db = requireDatabase();
  if (db.dbVfsName() !== "opfs-sahpool") throw new Error("Database did not open on opfs-sahpool.");
  return Object.freeze({
    databaseName: databaseName ?? "",
    existedBeforeOpen,
    sqliteVersion: requireSQLite().version.libVersion,
    vfs: "opfs-sahpool",
    opfs: true,
    thread: "dedicated-worker",
  });
};

const closeDatabase = (): void => {
  if (database !== undefined) database.close();
  database = undefined;
};

const normalizeBoundValues = (statement: SqlStatement): WasmSqlValue[] =>
  statement.parameters.map((value) => (value instanceof Uint8Array ? value.slice() : value));

const query = (statement: SqlStatement): readonly QueryRow[] => {
  const rows = requireDatabase().exec({
    sql: statement.sql,
    bind: normalizeBoundValues(statement),
    rowMode: "object",
    returnValue: "resultRows",
  });
  return rows.map((row) => Object.freeze({ ...row }) as QueryRow);
};

const execute = (statement: SqlStatement): ExecuteResult => {
  const db = requireDatabase();
  db.exec({ sql: statement.sql, bind: normalizeBoundValues(statement) });
  const rowsAffected = db.changes();
  const pointer = db.pointer;
  if (pointer === undefined) throw new Error("SQLite closed during statement execution.");
  const lastInsertRowId = requireSQLite().capi.sqlite3_last_insert_rowid(pointer);
  return lastInsertRowId === 0n
    ? Object.freeze({ rowsAffected })
    : Object.freeze({ rowsAffected, lastInsertRowId });
};

const sha256 = async (bytes: Uint8Array): Promise<string> => {
  const digest = await crypto.subtle.digest("SHA-256", Uint8Array.from(bytes).buffer);
  return [...new Uint8Array(digest)].map((value) => value.toString(16).padStart(2, "0")).join("");
};

const exportPortable = async (): Promise<PortableDatabase> => {
  const name = databaseName;
  if (name === undefined) throw new Error("No browser database name is available.");
  const schemaVersionValue = requireDatabase().selectValue("PRAGMA user_version");
  if (typeof schemaVersionValue !== "number" || !Number.isSafeInteger(schemaVersionValue)) {
    throw new Error("SQLite returned an invalid schema version.");
  }
  const bytes = (await requirePool().exportFile(name)).slice();
  return {
    schemaVersion: schemaVersionValue,
    byteLength: bytes.byteLength,
    sha256: await sha256(bytes),
    bytes,
  };
};

const validatePortableEnvelope = async (
  portable: PortableDatabase | undefined,
): Promise<string> => {
  if (portable === undefined) throw new TypeError("A portable database is required for restore.");
  if (portable.byteLength !== portable.bytes.byteLength) {
    throw new Error("Portable database byte length does not match its payload.");
  }
  const actualSha256 = await sha256(portable.bytes);
  if (actualSha256 !== portable.sha256) throw new Error("Portable database checksum mismatch.");
  return actualSha256;
};

const inspectCandidate = (
  candidate: Database,
  portable: PortableDatabase,
  actualSha256: string,
  expectedVaultId: string | undefined,
): BrowserStorageRestoreInspectionResult | BrowserStorageRestoreResult => {
  candidate.exec("PRAGMA trusted_schema = OFF");
  const integrity = candidate.selectValue("PRAGMA integrity_check");
  const schemaVersion = candidate.selectValue("PRAGMA user_version");
  if (integrity !== "ok") throw new Error("Restored database failed SQLite integrity_check.");
  if (schemaVersion !== portable.schemaVersion) {
    throw new Error("Restored database schema version does not match its export.");
  }
  const result = Object.freeze({
    byteLength: portable.byteLength,
    schemaVersion: portable.schemaVersion,
    sha256: actualSha256,
    integrity: "ok" as const,
  });
  if (expectedVaultId === undefined) return result;

  const vaultCount = candidate.selectValue("SELECT COUNT(*) FROM vault");
  const vaultId = candidate.selectValue("SELECT id FROM vault ORDER BY id LIMIT 1");
  if (vaultCount !== 1 || typeof vaultId !== "string") {
    throw new Error("Restored database must contain exactly one vault identity.");
  }
  if (vaultId !== expectedVaultId) {
    throw new Error("Restored database vault identity does not match its archive.");
  }
  return Object.freeze({
    ...result,
    vaultId,
  });
};

const inspectPortable = async (
  name: string,
  portable: PortableDatabase | undefined,
  expectedVaultId: string | undefined,
): Promise<BrowserStorageRestoreInspectionResult> => {
  if (portable === undefined) throw new TypeError("A portable database is required for restore.");
  if (expectedVaultId === undefined) {
    throw new TypeError("An expected vault identity is required for archive inspection.");
  }
  const actualSha256 = await validatePortableEnvelope(portable);
  const activePool = requirePool();
  const restoreName = name.replace(/\.sqlite3$/u, ".restore.sqlite3");
  closeDatabase();
  activePool.unlink(restoreName);
  try {
    await activePool.importDb(restoreName, portable.bytes.slice());
    const candidate = new activePool.OpfsSAHPoolDb(restoreName);
    try {
      const inspection = inspectCandidate(candidate, portable, actualSha256, expectedVaultId);
      if (!("vaultId" in inspection)) {
        throw new Error("Archive inspection did not return a vault identity.");
      }
      return inspection;
    } finally {
      candidate.close();
    }
  } finally {
    activePool.unlink(restoreName);
    await openDatabase(name);
  }
};

const restorePortable = async (
  name: string,
  portable: PortableDatabase | undefined,
  expectedTargetSha256: string | undefined,
  expectedVaultId: string | undefined,
): Promise<BrowserStorageRestoreResult> => {
  if (portable === undefined) throw new TypeError("A portable database is required for restore.");
  const actualSha256 = await validatePortableEnvelope(portable);

  const activePool = requirePool();
  const restoreName = name.replace(/\.sqlite3$/u, ".restore.sqlite3");
  const originalBytes = activePool.getFileNames().includes(name)
    ? await activePool.exportFile(name)
    : undefined;
  if (
    expectedTargetSha256 !== undefined &&
    (originalBytes === undefined || (await sha256(originalBytes)) !== expectedTargetSha256)
  ) {
    throw new Error("The restore target changed after preview.");
  }
  closeDatabase();
  activePool.unlink(restoreName);
  let inspection: BrowserStorageRestoreResult;
  try {
    await activePool.importDb(restoreName, portable.bytes.slice());
    const candidate = new activePool.OpfsSAHPoolDb(restoreName);
    try {
      inspection = inspectCandidate(candidate, portable, actualSha256, expectedVaultId);
    } finally {
      candidate.close();
    }
  } catch (error) {
    activePool.unlink(restoreName);
    await openDatabase(name);
    throw error;
  }

  const validatedBytes = await activePool.exportFile(restoreName);
  activePool.unlink(restoreName);
  try {
    await activePool.importDb(name, validatedBytes);
    await openDatabase(name);
  } catch (error) {
    closeDatabase();
    if (originalBytes !== undefined) await activePool.importDb(name, originalBytes);
    await openDatabase(name);
    throw error;
  }
  return inspection;
};

const deleteDatabase = (name: string): BrowserStorageDeleteResult => {
  closeDatabase();
  return Object.freeze({ deleted: requirePool().unlink(name) });
};

const diagnostics = (): StorageDiagnostics => {
  const db = requireDatabase();
  const schemaVersion = db.selectValue("PRAGMA user_version");
  const journalMode = db.selectValue("PRAGMA journal_mode");
  if (typeof schemaVersion !== "number" || typeof journalMode !== "string") {
    throw new Error("SQLite returned invalid storage diagnostics.");
  }
  return Object.freeze({
    adapterName: "official-sqlite-wasm-opfs-sahpool",
    health: "ready",
    persistence: "best-effort",
    readOnly: false,
    schemaVersion,
    details: Object.freeze([
      `sqlite-version:${requireSQLite().version.libVersion}`,
      "vfs:opfs-sahpool",
      `journal-mode:${journalMode}`,
      "foreign-keys:on",
      "thread:dedicated-worker",
    ]),
  });
};

const handleRequest = async (
  request: BrowserStorageRequest,
): Promise<BrowserStorageSuccessResponse["result"]> => {
  const name =
    request.operation === "open" ||
    request.operation === "delete" ||
    request.operation === "inspect_restore" ||
    request.operation === "restore"
      ? assertDatabaseName(request.databaseName)
      : undefined;

  switch (request.operation) {
    case "open":
      return openDatabase(name ?? "");
    case "query":
      if (request.statement === undefined) throw new TypeError("A query statement is required.");
      return query(request.statement);
    case "execute":
      if (request.statement === undefined) throw new TypeError("An execute statement is required.");
      return execute(request.statement);
    case "begin":
      return execute({ sql: "BEGIN IMMEDIATE", parameters: [] });
    case "commit":
      return execute({ sql: "COMMIT", parameters: [] });
    case "rollback":
      return execute({ sql: "ROLLBACK", parameters: [] });
    case "export":
      return exportPortable();
    case "inspect_restore":
      return inspectPortable(name ?? "", request.portable, request.expectedVaultId);
    case "restore":
      return restorePortable(
        name ?? "",
        request.portable,
        request.expectedTargetSha256,
        request.expectedVaultId,
      );
    case "diagnostics":
      return diagnostics();
    case "delete":
      return deleteDatabase(name ?? "");
    case "close":
      closeDatabase();
      return undefined;
  }
};

const serializeError = (
  error: unknown,
): { readonly name: string; readonly message: string; readonly resultCode?: number } => {
  if (!(error instanceof Error)) {
    return Object.freeze({ name: "Error", message: "Unknown browser storage failure." });
  }
  const resultCode: unknown = Reflect.get(error, "resultCode");
  return Object.freeze({
    name: error.name,
    message: error.message,
    ...(typeof resultCode === "number" && Number.isSafeInteger(resultCode) ? { resultCode } : {}),
  });
};

scope.addEventListener("message", (event) => {
  const request = event.data;
  if (!isBrowserStorageRequest(request)) return;
  void handleRequest(request).then(
    (result) => {
      scope.postMessage({
        version: BROWSER_STORAGE_PROTOCOL_VERSION,
        id: request.id,
        ok: true,
        result,
      });
    },
    (error: unknown) => {
      scope.postMessage({
        version: BROWSER_STORAGE_PROTOCOL_VERSION,
        id: request.id,
        ok: false,
        error: serializeError(error),
      });
    },
  );
});

export {};
