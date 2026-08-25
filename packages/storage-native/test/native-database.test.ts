import { createHash } from "node:crypto";
import { once } from "node:events";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";

import {
  applySqlMigrations,
  createTrackerRepositoryContractSuite,
  createTransactionSemanticsSuite,
  defineDatabaseContractSuite,
  defineSqlMigrations,
  runDatabaseContractSuite,
  sqlStatement,
  type DatabaseContractAdapter,
  type DatabasePort,
  type DatabaseSession,
  type QueryRow,
  type TransactionContractProbe,
} from "@coredrill/storage-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  NativeStorageCapabilityError,
  NativeStorageProtocolError,
  openNativeSqliteDatabase,
  type NativeSqliteDatabase,
  type NativeStorageRequest,
  type NativeStorageTransport,
} from "../src/index.js";

interface ProbeEnvelope {
  readonly ok: boolean;
  readonly response: unknown;
  readonly error: unknown;
}

interface PendingInvocation {
  readonly resolve: (value: unknown) => void;
  readonly reject: (reason: unknown) => void;
}

interface VaultRow extends QueryRow {
  readonly id: string;
  readonly name: string;
  readonly schema_version: number;
}

interface EntryRow extends QueryRow {
  readonly value: string;
}

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const probeExecutable = path.join(
  repositoryRoot,
  "apps",
  "desktop",
  "src-tauri",
  "target",
  "debug",
  process.platform === "win32"
    ? "coredrill-native-storage-probe.exe"
    : "coredrill-native-storage-probe",
);
const migrationDefinitions = [
  ["0001_vault.sql", "vault"],
  ["0002_capture_inbox.sql", "capture-inbox"],
  ["0003_app_setting.sql", "app-setting"],
  ["0004_location.sql", "location"],
  ["0005_company.sql", "company"],
  ["0006_contact.sql", "contact"],
  ["0007_job.sql", "job"],
  ["0008_job_source.sql", "job-source"],
  ["0009_source_snapshot.sql", "source-snapshot"],
  ["0010_provenance.sql", "provenance"],
  ["0011_company_alias.sql", "company-alias"],
  ["0012_contact_point_provenance.sql", "contact-point-provenance"],
  ["0013_field_value.sql", "field-value"],
] as const;
const migrationPaths = migrationDefinitions.map(([fileName]) =>
  path.join(repositoryRoot, "migrations", fileName),
);
const APPLIED_AT = "2026-08-24T12:00:00.000Z";

class ProbeTransport implements NativeStorageTransport {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending: PendingInvocation[] = [];
  private stdoutBuffer = "";
  private closed = false;

  public constructor(
    executable: string,
    private readonly root: string,
  ) {
    this.child = spawn(executable, [root], {
      stdio: "pipe",
      windowsHide: true,
    });
    this.child.stdout.setEncoding("utf8");
    this.child.stdout.on("data", (chunk: string) => this.consumeOutput(chunk));
    this.child.once("error", () => this.rejectPending());
    this.child.once("exit", () => {
      this.closed = true;
      this.rejectPending();
    });
  }

  public invoke(request: NativeStorageRequest): Promise<unknown> {
    if (this.closed) return Promise.reject(this.transportClosed());
    return new Promise((resolve, reject) => {
      this.pending.push({ resolve, reject });
      this.child.stdin.write(`${JSON.stringify(request)}\n`, (error) => {
        if (error !== null && error !== undefined) {
          const pending = this.pending.pop();
          pending?.reject(this.transportClosed());
        }
      });
    });
  }

  public storageRoot(): string {
    return this.root;
  }

  public async dispose(): Promise<void> {
    if (!this.closed) {
      this.child.stdin.end();
      await once(this.child, "exit");
    }
    const resolvedRoot = path.resolve(this.root);
    const resolvedTemp = path.resolve(tmpdir());
    if (!resolvedRoot.startsWith(`${resolvedTemp}${path.sep}`)) {
      throw new Error("Refusing to remove a native-storage test root outside the temp directory.");
    }
    await rm(resolvedRoot, { recursive: true, force: true });
  }

  private consumeOutput(chunk: string): void {
    this.stdoutBuffer += chunk;
    let newline = this.stdoutBuffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.stdoutBuffer.slice(0, newline);
      this.stdoutBuffer = this.stdoutBuffer.slice(newline + 1);
      const pending = this.pending.shift();
      if (pending !== undefined) {
        try {
          const envelope = JSON.parse(line) as ProbeEnvelope;
          if (envelope.ok) pending.resolve(envelope.response);
          else pending.reject(envelope.error);
        } catch {
          pending.reject(this.transportClosed());
        }
      }
      newline = this.stdoutBuffer.indexOf("\n");
    }
  }

  private rejectPending(): void {
    for (const pending of this.pending.splice(0)) pending.reject(this.transportClosed());
  }

  private transportClosed(): Readonly<Record<string, unknown>> {
    return Object.freeze({
      code: "transport_closed",
      message: "The native storage proof process is unavailable.",
      retryable: false,
    });
  }
}

let transport: ProbeTransport;
let databaseSequence = 1;
let migrationSql: readonly string[];
let migrationSha256: readonly string[];

const nextDatabaseName = (): string => {
  const name = `native-contract-${String(databaseSequence)}.sqlite3`;
  databaseSequence += 1;
  return name;
};

const migrations = () =>
  defineSqlMigrations(
    migrationDefinitions.map(([, name], index) => ({
      version: index + 1,
      name,
      sha256: migrationSha256[index] as string,
      sql: migrationSql[index] as string,
    })),
  );

const runProbe = (root: string, input = "") =>
  spawnSync(probeExecutable, [root], {
    encoding: "utf8",
    input,
    windowsHide: true,
  });

const nativeAdapter: DatabaseContractAdapter = {
  name: "native-rusqlite-candidate",
  createIsolatedDatabase: async () =>
    openNativeSqliteDatabase({ databaseName: nextDatabaseName(), transport }),
  disposeIsolatedDatabase: async (database: DatabasePort) => {
    await (database as NativeSqliteDatabase).delete();
  },
};

const entryProbe: TransactionContractProbe<readonly string[]> = {
  prepare: async (database) => {
    await database.execute(sqlStatement("CREATE TABLE contract_entry(value TEXT NOT NULL) STRICT"));
  },
  mutate: async (transaction) => {
    await transaction.execute(
      sqlStatement("INSERT INTO contract_entry(value) VALUES (?)", ["alpha"]),
    );
  },
  capture: async (session: DatabaseSession) => {
    const rows = await session.query<EntryRow>(
      sqlStatement("SELECT value FROM contract_entry ORDER BY value"),
    );
    return rows.map(({ value }) => value);
  },
  equivalent: (left, right) =>
    left.length === right.length && left.every((value, index) => value === right[index]),
};

beforeAll(async () => {
  const root = await mkdtemp(path.join(tmpdir(), "coredrill-native-"));
  transport = new ProbeTransport(probeExecutable, root);
  migrationSql = await Promise.all(
    migrationPaths.map((migrationPath) => readFile(migrationPath, "utf8")),
  );
  migrationSha256 = migrationSql.map((sql) => createHash("sha256").update(sql).digest("hex"));
});

afterAll(async () => {
  await transport.dispose();
});

describe("native SQLite repository and migration contracts", () => {
  it("initializes canonical database and content-addressed attachment roots", async () => {
    const database = await openNativeSqliteDatabase({
      databaseName: nextDatabaseName(),
      transport,
    });
    try {
      const canonicalRoot = await realpath(transport.storageRoot());
      const databaseRoot = await realpath(path.join(transport.storageRoot(), "databases"));
      const attachmentRoot = await realpath(
        path.join(transport.storageRoot(), "attachments", "sha256"),
      );

      expect(path.dirname(databaseRoot)).toBe(canonicalRoot);
      expect(path.dirname(path.dirname(attachmentRoot))).toBe(canonicalRoot);
      expect((await stat(databaseRoot)).isDirectory()).toBe(true);
      expect((await stat(attachmentRoot)).isDirectory()).toBe(true);
    } finally {
      await database.delete();
    }
  });

  it("passes the shared transaction semantics suite", async () => {
    await expect(
      runDatabaseContractSuite(nativeAdapter, createTransactionSemanticsSuite(entryProbe)),
    ).resolves.toEqual({
      adapterName: "native-rusqlite-candidate",
      suiteName: "database-transaction-semantics",
      completedCases: ["commits a fulfilled transaction", "rolls back a rejected transaction"],
    });
  });

  it("passes the shared migration and repository suite with bound values", async () => {
    const suite = defineDatabaseContractSuite("vault-migration-and-repository", [
      {
        name: "applies the shared migration and reopens its ledger",
        run: async (database) => {
          await expect(applySqlMigrations(database, migrations(), APPLIED_AT)).resolves.toEqual({
            schemaVersion: 13,
            appliedVersions: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13],
          });
          await expect(applySqlMigrations(database, migrations(), APPLIED_AT)).resolves.toEqual({
            schemaVersion: 13,
            appliedVersions: [],
          });
        },
      },
      {
        name: "stores and retrieves a vault without interpolating values",
        run: async (database) => {
          await applySqlMigrations(database, migrations(), APPLIED_AT);
          const adversarialName = "Candidate'); DROP TABLE vault; --";
          await database.execute(
            sqlStatement(
              "INSERT INTO vault(id, name, schema_version, created_at, last_opened_at) VALUES (?, ?, ?, ?, ?)",
              [
                "vault-native-1",
                adversarialName,
                1,
                "2026-08-24T12:00:00.000Z",
                "2026-08-24T12:00:00.000Z",
              ],
            ),
          );
          await expect(
            database.query<VaultRow>(
              sqlStatement("SELECT id, name, schema_version FROM vault WHERE id = ?", [
                "vault-native-1",
              ]),
            ),
          ).resolves.toEqual([{ id: "vault-native-1", name: adversarialName, schema_version: 1 }]);
        },
      },
    ]);

    await expect(runDatabaseContractSuite(nativeAdapter, suite)).resolves.toEqual({
      adapterName: "native-rusqlite-candidate",
      suiteName: "vault-migration-and-repository",
      completedCases: [
        "applies the shared migration and reopens its ledger",
        "stores and retrieves a vault without interpolating values",
      ],
    });
  });

  it("passes the shared Phase 1 tracker repository suite", async () => {
    const suite = createTrackerRepositoryContractSuite({
      migrate: async (database) => {
        await applySqlMigrations(database, migrations(), APPLIED_AT);
      },
    });
    await expect(runDatabaseContractSuite(nativeAdapter, suite)).resolves.toEqual({
      adapterName: "native-rusqlite-candidate",
      suiteName: "phase-1-tracker-repositories",
      completedCases: [
        "migrates vault settings and preserves typed JSON",
        "persists company contact job source snapshot and provenance with bound values",
        "retains field candidates and requires explicit confirmed replacement",
        "enforces foreign keys and rolls back an invalid aggregate",
      ],
    });
  });

  it("persists the migrated vault across native close and reopen", async () => {
    const databaseName = nextDatabaseName();
    const first = await openNativeSqliteDatabase({ databaseName, transport });
    await applySqlMigrations(first, migrations(), APPLIED_AT);
    await first.execute(
      sqlStatement(
        "INSERT INTO vault(id, name, schema_version, created_at, last_opened_at) VALUES (?, ?, 1, ?, ?)",
        [
          "vault-durable",
          "Durable synthetic vault",
          "2026-08-24T12:00:00.000Z",
          "2026-08-24T12:00:00.000Z",
        ],
      ),
    );
    await first.close();

    const databasePath = path.join(transport.storageRoot(), "databases", databaseName);
    expect((await stat(databasePath)).isFile()).toBe(true);
    expect(path.dirname(await realpath(databasePath))).toBe(
      await realpath(path.join(transport.storageRoot(), "databases")),
    );

    const reopened = await openNativeSqliteDatabase({ databaseName, transport });
    await expect(
      reopened.query<VaultRow>(
        sqlStatement("SELECT id, name, schema_version FROM vault WHERE id = ?", ["vault-durable"]),
      ),
    ).resolves.toEqual([
      { id: "vault-durable", name: "Durable synthetic vault", schema_version: 1 },
    ]);
    await expect(reopened.diagnostics()).resolves.toMatchObject({
      adapterName: "native-rusqlite-candidate",
      health: "ready",
      persistence: "durable",
      schemaVersion: 13,
    });
    await expect(reopened.delete()).resolves.toBe(true);
  });

  it("enforces query/execute separation and keeps unfinished capabilities explicit", async () => {
    const database = await openNativeSqliteDatabase({
      databaseName: nextDatabaseName(),
      transport,
    });
    await expect(
      database.query(sqlStatement("CREATE TABLE no_query(id INTEGER)")),
    ).rejects.toMatchObject({
      code: "invalid_statement",
    });
    await expect(database.execute(sqlStatement("SELECT 1"))).rejects.toMatchObject({
      code: "invalid_statement",
    });
    await expect(database.exportPortable()).rejects.toBeInstanceOf(NativeStorageCapabilityError);
    await expect(database.exportRecoveryArchive()).rejects.toBeInstanceOf(
      NativeStorageCapabilityError,
    );
    await expect(database.restoreRecoveryArchive()).rejects.toBeInstanceOf(
      NativeStorageCapabilityError,
    );
    await database.delete();
  });

  it("rejects path-shaped database names before privileged work", async () => {
    await expect(
      openNativeSqliteDatabase({ databaseName: "../outside.sqlite3", transport }),
    ).rejects.toMatchObject({
      code: "invalid_request",
      retryable: false,
    });
  });

  it("fails closed when the app-data root is relative or occupied by a file", async () => {
    const relative = runProbe("relative-app-data");
    expect(relative.error).toBeUndefined();
    expect(relative.status).toBe(2);

    const testParent = await mkdtemp(path.join(tmpdir(), "coredrill-native-unusable-"));
    try {
      const fileRoot = path.join(testParent, "not-a-directory");
      await writeFile(fileRoot, "synthetic unusable root", "utf8");
      const unusable = runProbe(fileRoot);
      expect(unusable.error).toBeUndefined();
      expect(unusable.status).toBe(2);
    } finally {
      await rm(testParent, { recursive: true, force: true });
    }
  });

  it("rejects external symlinks or Windows junctions at every managed root", async () => {
    for (const managedPath of [["databases"], ["attachments"], ["attachments", "sha256"]]) {
      const testParent = await mkdtemp(path.join(tmpdir(), "coredrill-native-link-"));
      try {
        const appDataRoot = path.join(testParent, "app-data");
        const externalRoot = path.join(testParent, "external");
        const linkedPath = path.join(appDataRoot, ...managedPath);
        await mkdir(path.dirname(linkedPath), { recursive: true });
        await mkdir(externalRoot, { recursive: true });
        await symlink(externalRoot, linkedPath, process.platform === "win32" ? "junction" : "dir");

        const linked = runProbe(appDataRoot);
        expect(linked.error).toBeUndefined();
        expect(linked.status).toBe(2);
        expect(await realpath(linkedPath)).toBe(await realpath(externalRoot));
      } finally {
        await rm(testParent, { recursive: true, force: true });
      }
    }
  });

  it("rejects a final database-path reparse point before SQLite opens it", async () => {
    const testParent = await mkdtemp(path.join(tmpdir(), "coredrill-native-database-link-"));
    try {
      const appDataRoot = path.join(testParent, "app-data");
      const initialized = runProbe(appDataRoot);
      expect(initialized.error).toBeUndefined();
      expect(initialized.status).toBe(0);

      const externalRoot = path.join(testParent, "external-database-target");
      const linkedDatabase = path.join(appDataRoot, "databases", "linked.sqlite3");
      await mkdir(externalRoot, { recursive: true });
      await symlink(
        externalRoot,
        linkedDatabase,
        process.platform === "win32" ? "junction" : "dir",
      );

      const request = JSON.stringify({
        protocolVersion: 1,
        requestId: "path-link",
        operation: { type: "open", databaseName: "linked.sqlite3" },
      });
      const linked = runProbe(appDataRoot, `${request}\n`);
      expect(linked.error).toBeUndefined();
      expect(linked.status).toBe(0);
      expect(JSON.parse(linked.stdout) as ProbeEnvelope).toMatchObject({
        ok: false,
        error: {
          code: "storage_unavailable",
          message: "Native storage is unavailable.",
          retryable: false,
        },
      });
    } finally {
      await rm(testParent, { recursive: true, force: true });
    }
  });
});
