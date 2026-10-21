import { createHash } from "node:crypto";
import { once } from "node:events";
import { readdirSync } from "node:fs";
import { mkdir, mkdtemp, readFile, realpath, rm, stat, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawn, spawnSync, type ChildProcessWithoutNullStreams } from "node:child_process";

import {
  applySqlMigrations,
  CAREER_REPOSITORY_CONTRACT_CASE_NAMES,
  CAREER_REPOSITORY_CONTRACT_MANIFEST,
  commitPortableArchiveRestoreV1,
  createPortableArchiveContentHashV1,
  createPortableArchiveRestorePreviewV1,
  discardPortableArchiveRestorePreviewV1,
  createPortableDataExportV1,
  createPortableVaultContentHashV1,
  createCareerRepositoryContractSuite,
  createPhase1RepositoryContractSuite,
  createTransactionSemanticsSuite,
  defineDatabaseContractSuite,
  defineSqlMigrations,
  PHASE_1_REPOSITORY_CONTRACT_CASE_NAMES,
  PHASE_1_REPOSITORY_CONTRACT_MANIFEST,
  inspectPortableArchiveV1,
  preparePortableVaultArchiveV1,
  runDatabaseContractSuite,
  runPhase1CanonicalJourney,
  sqlStatement,
  type DatabaseContractAdapter,
  type DatabasePort,
  type DatabaseReadSnapshot,
  type DatabaseSession,
  type QueryRow,
  type TransactionContractProbe,
} from "@coredrill/storage-core";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { JsonLineFramer } from "./helpers/json-line-framer.js";

import {
  NativeStorageProtocolError,
  NATIVE_ARCHIVE_PROTOCOL_VERSION,
  createNativePortableArchiveRestorePortV1,
  openNativeSqliteDatabase,
  type NativeArchiveRequest,
  type NativeArchiveTransport,
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
const legacyMigrationDefinitions = [
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
  ["0014_status_definition.sql", "status-definition"],
  ["0015_job_current_status.sql", "job-current-status"],
  ["0016_job_next_action.sql", "job-next-action"],
  ["0017_application.sql", "application"],
  ["0018_status_event.sql", "status-event"],
  ["0019_interaction.sql", "interaction"],
  ["0020_next_action.sql", "next-action"],
  ["0021_interview.sql", "interview"],
  ["0022_reminder.sql", "reminder"],
  ["0023_tag.sql", "tag"],
  ["0024_job_tag.sql", "job-tag"],
  ["0025_saved_view.sql", "saved-view"],
  ["0026_document.sql", "document"],
  ["0027_document_version.sql", "document-version"],
  ["0028_document_job_link.sql", "document-job-link"],
  ["0029_attachment_manifest.sql", "attachment-manifest"],
  ["0030_document_version_attachment.sql", "document-version-attachment"],
  ["0031_document_style_example.sql", "document-style-example"],
  ["0032_device.sql", "device"],
  ["0033_integrity_probe.sql", "integrity-probe"],
  ["0034_validate_existing_integrity.sql", "validate-existing-integrity"],
  ["0035_drop_integrity_probe.sql", "drop-integrity-probe"],
  ["0036_application_document_insert_guard.sql", "application-document-insert-guard"],
  ["0037_application_document_update_guard.sql", "application-document-update-guard"],
  ["0038_document_kind_update_guard.sql", "document-kind-update-guard"],
  ["0039_document_version_lineage_guard.sql", "document-version-lineage-guard"],
  ["0040_document_version_update_guard.sql", "document-version-update-guard"],
  ["0041_document_version_delete_guard.sql", "document-version-delete-guard"],
  ["0042_source_snapshot_update_guard.sql", "source-snapshot-update-guard"],
  ["0043_status_event_update_guard.sql", "status-event-update-guard"],
  ["0044_interaction_update_guard.sql", "interaction-update-guard"],
  ["0045_attachment_manifest_update_guard.sql", "attachment-manifest-update-guard"],
] as const;
const migrationDefinitions = [
  ...legacyMigrationDefinitions,
  ...readdirSync(path.join(repositoryRoot, "migrations"))
    .filter((fileName) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(fileName))
    .filter((fileName) => Number(fileName.slice(0, 4)) > 45)
    .sort()
    .map((fileName) => [fileName, fileName.slice(5, -4).replaceAll("_", "-")] as const),
];
const migrationPaths = migrationDefinitions.map(([fileName]) =>
  path.join(repositoryRoot, "migrations", fileName),
);
const APPLIED_AT = "2026-08-24T12:00:00.000Z";

class ProbeTransport implements NativeStorageTransport, NativeArchiveTransport {
  private readonly child: ChildProcessWithoutNullStreams;
  private readonly pending: PendingInvocation[] = [];
  private readonly stdoutFramer = new JsonLineFramer();
  private closed = false;

  public constructor(
    executable: string,
    private readonly root: string,
  ) {
    this.child = spawn(executable, [root, "", this.portableArchiveSelectionPath()], {
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
    return this.send(request);
  }

  public invokeArchive(request: NativeArchiveRequest): Promise<unknown> {
    return this.send(request);
  }

  public portableArchiveSelectionPath(): string {
    return path.join(this.root, "selected-portable.coredrill.zip");
  }

  private send(request: NativeStorageRequest | NativeArchiveRequest): Promise<unknown> {
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
    this.stdoutFramer.consume(chunk, (line) => {
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
    });
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
  it("selects a complete archive through actual Rust without restoring or changing the target", async () => {
    const timed = async <T>(stage: string, work: () => Promise<T>): Promise<T> => {
      const startedAt = performance.now();
      try {
        return await work();
      } finally {
        console.info(
          "NATIVE_PORTABLE_READ_STAGE",
          JSON.stringify({
            stage,
            elapsedMs: Math.round(performance.now() - startedAt),
          }),
        );
      }
    };
    const archive = new Uint8Array(
      await timed("fixture_read", () =>
        readFile(
          path.join(
            repositoryRoot,
            "fixtures",
            "recovery",
            "phase-1-vault-schema-160-v1.coredrill.zip",
          ),
        ),
      ),
    );
    await timed("fixture_write", () =>
      writeFile(transport.portableArchiveSelectionPath(), archive),
    );
    const database = await timed("open", () =>
      openNativeSqliteDatabase({
        databaseName: nextDatabaseName(),
        transport,
      }),
    );
    try {
      await timed("migrations", () => applySqlMigrations(database, migrations(), APPLIED_AT));
      const before = await timed("export_before", () => database.exportPortable());
      const selected = await timed("select_first", () => database.selectPortableArchive());
      if (selected.status !== "selected") throw new Error("Expected selected portable archive");
      expect(Buffer.from(selected.bytes).equals(Buffer.from(archive))).toBe(true);
      expect(selected.sha256).toBe(createHash("sha256").update(archive).digest("hex"));
      const inspected = await timed("inspect", () =>
        inspectPortableArchiveV1({
          bytes: selected.bytes,
          expectedSchemaVersion: 160,
          expectedArchiveSha256: selected.sha256,
        }),
      );
      expect(inspected.attachments.length).toBeGreaterThan(0);
      const preview = await timed("preview", () =>
        createPortableArchiveRestorePreviewV1({
          archiveBytes: selected.bytes,
          expectedSchemaVersion: 160,
          expectedArchiveSha256: selected.sha256,
          port: createNativePortableArchiveRestorePortV1({
            database,
            expectedVaultId: inspected.manifest.vault.id,
          }),
        }),
      );
      expect(preview).toMatchObject({ target: { state: "empty" }, requiredConfirmation: "commit" });
      expect(
        Buffer.from(
          (await timed("export_after_preview", () => database.exportPortable())).bytes,
        ).equals(Buffer.from(before.bytes)),
      ).toBe(true);
      expect(discardPortableArchiveRestorePreviewV1(preview)).toBe(true);
      const second = await timed("select_second", () => database.selectPortableArchive());
      expect(second).toMatchObject({ status: "selected", sha256: selected.sha256 });
      expect(
        Buffer.from(
          (await timed("export_after_second", () => database.exportPortable())).bytes,
        ).equals(Buffer.from(before.bytes)),
      ).toBe(true);
    } finally {
      await timed("cleanup", () => database.delete());
    }
  });

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

  it("rejects an exact logical ABA across two real native connections during archive capture", async () => {
    const databaseName = nextDatabaseName();
    const database = await openNativeSqliteDatabase({ databaseName, transport });
    let other: NativeSqliteDatabase | undefined;
    try {
      await applySqlMigrations(database, migrations(), APPLIED_AT);
      const vaultId = "0198e102-0000-7000-8000-000000000001";
      await database.execute(
        sqlStatement(
          "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
          [vaultId, "Original native vault", 160, APPLIED_AT, APPLIED_AT],
        ),
      );
      const writer = await openNativeSqliteDatabase({ databaseName, transport });
      other = writer;
      let changed = false;
      let restored = false;
      let finalSnapshots = 0;
      const source: DatabasePort = {
        query: database.query.bind(database),
        execute: database.execute.bind(database),
        transaction: database.transaction.bind(database),
        diagnostics: database.diagnostics.bind(database),
        exportPortable: () => {
          finalSnapshots += 1;
          return database.exportPortable();
        },
        withReadSnapshot: (work) =>
          database.withReadSnapshot((lease) =>
            work({
              exportPortable: async () => {
                const portable = await lease.exportPortable();
                await writer.execute(
                  sqlStatement("UPDATE vault SET name = ? WHERE id = ?", [
                    "Intervening native vault",
                    vaultId,
                  ]),
                );
                changed = true;
                return portable;
              },
              query: async <Row extends QueryRow = QueryRow>(
                statement: import("@coredrill/storage-core").SqlStatement,
              ) => {
                const rows = await lease.query<Row>(statement);
                if (changed && !restored && statement.sql.includes('FROM "vault"')) {
                  await writer.execute(
                    sqlStatement("UPDATE vault SET name = ? WHERE id = ?", [
                      "Original native vault",
                      vaultId,
                    ]),
                  );
                  restored = true;
                }
                return rows;
              },
            }),
          ),
      };
      await expect(
        preparePortableVaultArchiveV1({
          database: source,
          vaultId,
          archiveId: "0198e102-0000-7000-8000-000000000002",
          createdAt: APPLIED_AT,
          createdByVersion: "0.0.0",
          readAttachment: async () => undefined,
        }),
      ).rejects.toMatchObject({ code: "source_changed" });
      expect(changed).toBe(true);
      expect(restored).toBe(true);
      expect(finalSnapshots).toBe(0);
      expect(await database.query(sqlStatement("SELECT name FROM vault"))).toEqual([
        { name: "Original native vault" },
      ]);
    } finally {
      await other?.close();
      await database.delete();
    }
  });

  it("holds a read/export lease against queued writes and expires it on success or failure", async () => {
    const database = await openNativeSqliteDatabase({
      databaseName: nextDatabaseName(),
      transport,
    });
    try {
      await applySqlMigrations(database, migrations(), APPLIED_AT);
      await database.execute(
        sqlStatement("CREATE TABLE read_lease_probe(value TEXT NOT NULL) STRICT"),
      );
      await database.execute(sqlStatement("INSERT INTO read_lease_probe VALUES (?)", ["original"]));
      const holder = new Map<string, DatabaseReadSnapshot>();
      let release!: () => void;
      let entered!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const started = new Promise<void>((resolve) => {
        entered = resolve;
      });
      const capture = database.withReadSnapshot(async (lease) => {
        holder.set("lease", lease);
        expect(Object.keys(lease).sort()).toEqual(["exportPortable", "query"]);
        expect(await lease.query(sqlStatement("SELECT value FROM read_lease_probe"))).toEqual([
          { value: "original" },
        ]);
        entered();
        await held;
        expect((await lease.exportPortable()).schemaVersion).toBe(160);
        return lease.query(sqlStatement("SELECT value FROM read_lease_probe"));
      });
      await started;
      let writeFinished = false;
      const write = database
        .execute(sqlStatement("UPDATE read_lease_probe SET value = ?", ["updated"]))
        .then(() => {
          writeFinished = true;
        });
      await Promise.resolve();
      expect(writeFinished).toBe(false);
      release();
      expect(await capture).toEqual([{ value: "original" }]);
      await write;
      expect(await database.query(sqlStatement("SELECT value FROM read_lease_probe"))).toEqual([
        { value: "updated" },
      ]);
      const escaped = holder.get("lease");
      if (escaped === undefined) throw new Error("Missing native test lease.");
      await expect(
        escaped.query(sqlStatement("SELECT value FROM read_lease_probe")),
      ).rejects.toThrow("lease has ended");
      await expect(escaped.exportPortable()).rejects.toThrow("lease has ended");
      await expect(
        database.withReadSnapshot(async (lease) => {
          holder.set("failed", lease);
          await lease.query(sqlStatement("SELECT value FROM read_lease_probe"));
          throw new Error("Synthetic snapshot failure");
        }),
      ).rejects.toThrow("Synthetic snapshot failure");
      const failedLease = holder.get("failed");
      if (failedLease === undefined) throw new Error("Missing failed native test lease.");
      await expect(failedLease.exportPortable()).rejects.toThrow("lease has ended");
      await database.execute(
        sqlStatement("UPDATE read_lease_probe SET value = ?", ["after failure"]),
      );
      expect(await database.query(sqlStatement("SELECT value FROM read_lease_probe"))).toEqual([
        { value: "after failure" },
      ]);
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
            schemaVersion: 160,
            appliedVersions: Array.from({ length: 160 }, (_, index) => index + 1),
          });
          await expect(applySqlMigrations(database, migrations(), APPLIED_AT)).resolves.toEqual({
            schemaVersion: 160,
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

  it("passes the versioned Phase 1 repository contract manifest", async () => {
    const suite = createPhase1RepositoryContractSuite({
      expectedFts5: true,
      migrate: async (database, throughVersion) => {
        await applySqlMigrations(database, migrations().slice(0, throughVersion), APPLIED_AT);
      },
    });
    expect(PHASE_1_REPOSITORY_CONTRACT_MANIFEST.schemaVersion).toBe(11);
    expect(PHASE_1_REPOSITORY_CONTRACT_CASE_NAMES).toHaveLength(27);
    await expect(runDatabaseContractSuite(nativeAdapter, suite)).resolves.toEqual({
      adapterName: "native-rusqlite-candidate",
      suiteName: PHASE_1_REPOSITORY_CONTRACT_MANIFEST.suiteName,
      completedCases: PHASE_1_REPOSITORY_CONTRACT_CASE_NAMES,
    });
  }, 60_000);

  it("passes the Career Profile repository contract manifest", async () => {
    const suite = createCareerRepositoryContractSuite({
      migrate: async (database) => {
        await applySqlMigrations(database, migrations(), APPLIED_AT);
      },
    });
    await expect(runDatabaseContractSuite(nativeAdapter, suite)).resolves.toEqual({
      adapterName: "native-rusqlite-candidate",
      suiteName: CAREER_REPOSITORY_CONTRACT_MANIFEST.suiteName,
      completedCases: CAREER_REPOSITORY_CONTRACT_CASE_NAMES,
    });
  }, 60_000);

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
      schemaVersion: 160,
    });
    await expect(reopened.delete()).resolves.toBe(true);
  });

  it("enforces query/execute separation and exposes the path-free archive boundary", async () => {
    const step = async <Result>(stage: string, work: () => Promise<Result>): Promise<Result> => {
      const startedAt = performance.now();
      console.info("NATIVE_ARCHIVE_BOUNDARY_STAGE", JSON.stringify({ stage, state: "started" }));
      try {
        return await work();
      } finally {
        console.info(
          "NATIVE_ARCHIVE_BOUNDARY_STAGE",
          JSON.stringify({
            stage,
            state: "settled",
            elapsedMs: Math.round(performance.now() - startedAt),
          }),
        );
      }
    };
    const database = await openNativeSqliteDatabase({
      databaseName: nextDatabaseName(),
      transport,
    });
    try {
      await step("query-ddl-rejection", () =>
        expect(
          database.query(sqlStatement("CREATE TABLE no_query(id INTEGER)")),
        ).rejects.toMatchObject({
          code: "invalid_statement",
        }),
      );
      await step("execute-select-rejection", () =>
        expect(database.execute(sqlStatement("SELECT 1"))).rejects.toMatchObject({
          code: "invalid_statement",
        }),
      );
      await step("migrations", () => applySqlMigrations(database, migrations(), APPLIED_AT));
      await step("portable-export", () =>
        expect(database.exportPortable()).resolves.toMatchObject({
          schemaVersion: 160,
          byteLength: expect.any(Number),
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        }),
      );
      await step("export-cancellation", () =>
        expect(database.exportRecoveryArchive()).resolves.toEqual({ status: "cancelled" }),
      );
      await step("restore-cancellation", () =>
        expect(database.restoreRecoveryArchive()).resolves.toEqual({ status: "cancelled" }),
      );
      await step("automatic-backup", () =>
        expect(database.createAutomaticBackup(7)).resolves.toMatchObject({
          retentionCount: 7,
          knownGoodBackups: 1,
          cleanupPending: false,
          archive: { schemaVersion: 160, sha256: expect.stringMatching(/^[a-f0-9]{64}$/u) },
        }),
      );
    } finally {
      await step("cleanup", () => database.delete());
    }
  });

  it("persists immutable path-free attachment writes durably and rejects forged payloads in Rust", async () => {
    const databaseName = nextDatabaseName();
    const database = await openNativeSqliteDatabase({ databaseName, transport });
    await applySqlMigrations(database, migrations(), APPLIED_AT);
    const beforeWriteHash = (await database.exportPortable()).sha256;
    const bytes = new Uint8Array([0, 255, 9, 13, 10]);
    const contentId = createHash("sha256").update(bytes).digest("hex");
    const input = { contentId, sha256: contentId, byteLength: bytes.byteLength, bytes };
    await database.writePortableAttachment(input);
    await database.writePortableAttachment(input);
    expect((await database.exportPortable()).sha256).toBe(beforeWriteHash);
    await expect(database.readPortableAttachment(contentId)).resolves.toEqual(bytes);
    const attachmentPath = path.join(
      // /var aliases on macOS and Windows short temp names are valid root aliases.
      // Canonicalize only the root: leaf/shard redirection must still fail below it.
      await realpath(transport.storageRoot()),
      "attachments",
      "sha256",
      contentId.slice(0, 2),
      contentId.slice(2, 4),
      contentId,
    );
    expect(await readFile(attachmentPath)).toEqual(Buffer.from(bytes));
    expect(await realpath(attachmentPath)).toBe(attachmentPath);
    await database.close();
    const reopened = await openNativeSqliteDatabase({ databaseName, transport });
    await expect(reopened.readPortableAttachment(contentId)).resolves.toEqual(bytes);
    // Direct transport faults deliberately bypass TypeScript's preflight.
    const opened = (await transport.invoke({
      protocolVersion: 1,
      requestId: "attachment-fault-session",
      operation: { type: "open", databaseName: nextDatabaseName() },
    })) as { data: { sessionId: string } };
    for (const invalid of [
      { contentId: "../escape", sha256: contentId, byteLength: 5, bytes: [...bytes] },
      { contentId, sha256: "0".repeat(64), byteLength: 5, bytes: [...bytes] },
      { contentId, sha256: contentId, byteLength: 4, bytes: [...bytes] },
      { contentId, sha256: contentId, byteLength: 5, bytes: [0, 255, 9, 13, 11] },
    ])
      await expect(
        transport.invokeArchive({
          protocolVersion: NATIVE_ARCHIVE_PROTOCOL_VERSION,
          requestId: "invalid-attachment-put",
          operation: {
            type: "attachment_put",
            sessionId: opened.data.sessionId,
            attachment: invalid,
          },
        }),
      ).rejects.toBeDefined();
    await transport.invoke({
      protocolVersion: 1,
      requestId: "begin-attachment-fault",
      operation: { type: "begin", sessionId: opened.data.sessionId },
    });
    await expect(
      transport.invokeArchive({
        protocolVersion: NATIVE_ARCHIVE_PROTOCOL_VERSION,
        requestId: "transaction-attachment-put",
        operation: {
          type: "attachment_put",
          sessionId: opened.data.sessionId,
          attachment: { ...input, bytes: [...bytes] },
        },
      }),
    ).rejects.toMatchObject({ code: "transaction_state" });
    await transport.invoke({
      protocolVersion: 1,
      requestId: "rollback-attachment-fault",
      operation: { type: "rollback", sessionId: opened.data.sessionId },
    });
    await transport.invoke({
      protocolVersion: 1,
      requestId: "close-attachment-fault",
      operation: { type: "close", sessionId: opened.data.sessionId },
    });
    await expect(
      transport.invokeArchive({
        protocolVersion: NATIVE_ARCHIVE_PROTOCOL_VERSION,
        requestId: "closed-attachment-put",
        operation: {
          type: "attachment_put",
          sessionId: opened.data.sessionId,
          attachment: { ...input, bytes: [...bytes] },
        },
      }),
    ).rejects.toMatchObject({ code: "session_missing" });
    await expect(reopened.readPortableAttachment(contentId)).resolves.toEqual(bytes);
    await writeFile(attachmentPath, "synthetic corruption");
    await expect(reopened.writePortableAttachment(input)).rejects.toMatchObject({
      code: "archive_invalid",
    });
    expect(await readFile(attachmentPath, "utf8")).toBe("synthetic corruption");
    await reopened.delete();
  });

  it.each(["phase-1-vault-v1", "phase-1-vault-schema-159-v1", "phase-1-vault-schema-160-v1"])(
    "restores complete evidence relationships and attachments through the native boundary: %s",
    async (fixtureName) => {
      const manifest = JSON.parse(
        await readFile(
          path.join(repositoryRoot, "fixtures", "recovery", `${fixtureName}.json`),
          "utf8",
        ),
      ) as {
        readonly archiveSha256: string;
        readonly contentSha256: string;
        readonly databaseSha256: string;
        readonly generatedAt: string;
        readonly vaultId: string;
        readonly schemaVersion: number;
        readonly attachmentCount: number;
        readonly attachmentContentIds: readonly string[];
        readonly phase3Inventory: Readonly<Record<string, number>>;
        readonly documentRoundTrip: {
          readonly specVersion: 1;
          readonly datasets: readonly {
            readonly dataset: string;
            readonly rowCount: number;
            readonly rows: readonly Readonly<Record<string, unknown>>[];
          }[];
        };
      };
      const archiveBytes = new Uint8Array(
        await readFile(
          path.join(repositoryRoot, "fixtures", "recovery", `${fixtureName}.coredrill.zip`),
        ),
      );
      const inspected = await inspectPortableArchiveV1({
        bytes: archiveBytes,
        expectedSchemaVersion: manifest.schemaVersion,
        expectedArchiveSha256: manifest.archiveSha256,
      });
      await expect(createPortableArchiveContentHashV1(inspected)).resolves.toMatchObject({
        sha256: manifest.contentSha256,
      });

      const database = await openNativeSqliteDatabase({
        databaseName: nextDatabaseName(),
        transport,
      });
      try {
        const port = createNativePortableArchiveRestorePortV1({
          database,
          expectedVaultId: manifest.vaultId,
        });
        const preview = await createPortableArchiveRestorePreviewV1({
          archiveBytes,
          expectedSchemaVersion: manifest.schemaVersion,
          expectedArchiveSha256: manifest.archiveSha256,
          port,
        });
        expect(preview).toMatchObject({
          conflict: "none",
          requiredConfirmation: "commit",
          target: { state: "empty", attachmentCount: 0 },
          changes: {
            database: "create",
            attachmentsAdded: manifest.attachmentCount,
            attachmentsReused: 0,
            attachmentsRemoved: 0,
          },
        });
        await expect(
          commitPortableArchiveRestoreV1({ preview, confirmation: "commit" }),
        ).resolves.toMatchObject({
          committed: true,
          archiveSha256: manifest.archiveSha256,
          databaseSha256: manifest.databaseSha256,
          attachmentCount: manifest.attachmentCount,
        });

        const restoredContent = await createPortableVaultContentHashV1({
          database,
          generatedAt: manifest.generatedAt,
          vaultId: manifest.vaultId,
          readAttachment: (contentId) => database.readPortableAttachment(contentId),
        });
        expect(restoredContent.sha256).toBe(manifest.contentSha256);
        const restoredData = await createPortableDataExportV1({
          database,
          generatedAt: manifest.generatedAt,
          vaultId: manifest.vaultId,
        });
        const restoredDocumentDatasets = manifest.documentRoundTrip.datasets.map(
          ({ dataset: datasetName }) => {
            const dataset = restoredData.datasets.find(
              (candidate) => candidate.dataset === datasetName,
            );
            if (dataset === undefined) {
              throw new Error("The native restore omitted a document round-trip dataset.");
            }
            return {
              dataset: dataset.dataset,
              rowCount: dataset.rowCount,
              rows: dataset.rows,
            };
          },
        );
        expect({ specVersion: 1, datasets: restoredDocumentDatasets }).toEqual(
          manifest.documentRoundTrip,
        );
        await expect(
          database.query<{ readonly content_id: string } & QueryRow>(
            sqlStatement("SELECT content_id FROM attachment_manifest ORDER BY content_id"),
          ),
        ).resolves.toEqual(
          manifest.attachmentContentIds.map((contentId) => ({ content_id: contentId })),
        );
        await expect(
          database.query<QueryRow>(
            sqlStatement(
              `SELECT
               (SELECT count(*) FROM job_requirement) AS jobRequirements,
               (SELECT count(*) FROM experience) +
               (SELECT count(*) FROM education) +
               (SELECT count(*) FROM project) +
               (SELECT count(*) FROM skill) +
               (SELECT count(*) FROM accomplishment) +
               (SELECT count(*) FROM certification) +
               (SELECT count(*) FROM publication) +
               (SELECT count(*) FROM volunteer_experience) AS careerEvidence,
               (SELECT count(*) FROM anecdote) AS stories,
               (SELECT count(*) FROM anecdote_evidence_link) AS storyEvidenceLinks,
               (SELECT count(*) FROM skill_evidence) AS skillEvidenceLinks,
               (SELECT count(*) FROM job_requirement_evidence_selection) AS requirementEvidenceSelections,
               (SELECT count(*) FROM job_requirement_coverage_decision) AS requirementCoverageDecisions,
               (SELECT count(*) FROM import_run) AS importRuns,
               (SELECT count(*) FROM career_import_proposal) AS importProposals,
               (SELECT count(*) FROM career_import_resolution) AS importResolutions,
               (SELECT count(*) FROM career_import_resolution_proposal) AS importResolutionLinks,
               (SELECT count(*) FROM answer_library_entry) AS answerEntries,
               (SELECT count(*) FROM answer_library_version) AS answerVersions,
               (SELECT count(*) FROM attachment_manifest) AS attachmentManifests,
               (SELECT count(*) FROM document_version_attachment) AS attachmentLinks,
               (SELECT count(*) FROM document) AS documents,
               (SELECT count(*) FROM document_version) AS documentVersions,
               (SELECT count(*) FROM document_lineage) AS documentLineages,
               (SELECT count(*) FROM document_derivation_origin) AS documentDerivationOrigins,
               (SELECT count(*) FROM document_job_link) AS documentJobLinks,
               (SELECT count(*) FROM document_editor_draft) AS editorDrafts,
               (SELECT count(*) FROM application_answer_selection) AS applicationAnswerSelections,
               (SELECT count(*) FROM submitted_snapshot) AS submittedSnapshots,
               (SELECT count(*) FROM submitted_snapshot_item) AS submittedSnapshotItems`,
            ),
          ),
        ).resolves.toEqual([manifest.phase3Inventory]);
        const restoredDatabase = await database.exportPortable();
        expect(restoredDatabase).toMatchObject({
          schemaVersion: manifest.schemaVersion,
          sha256: expect.stringMatching(/^[a-f0-9]{64}$/u),
        });
        // The restore commit above verifies the original payload hash. Native SQLite
        // re-export bytes need not match the browser archive's physical page layout;
        // preserve canonical content and every dataset row across the upgrade.
        const originalLedger = await database.query<QueryRow>(
          sqlStatement(
            "SELECT version, name, sha256 FROM coredrill_schema_migration ORDER BY version",
          ),
        );
        expect([158, 159, 160]).toContain(manifest.schemaVersion);
        expect(originalLedger).toHaveLength(manifest.schemaVersion);
        await expect(
          database.query<QueryRow>(
            sqlStatement("SELECT name FROM sqlite_schema WHERE type = 'index' AND name = ?", [
              "next_action_job_created_idx",
            ]),
          ),
        ).resolves.toEqual(
          manifest.schemaVersion === 158 ? [] : [{ name: "next_action_job_created_idx" }],
        );
        await expect(
          database.query<QueryRow>(
            sqlStatement("SELECT name FROM sqlite_schema WHERE type = 'index' AND name = ?", [
              "reminder_next_action_job_state_idx",
            ]),
          ),
        ).resolves.toEqual(
          manifest.schemaVersion === 160 ? [{ name: "reminder_next_action_job_state_idx" }] : [],
        );
        await expect(applySqlMigrations(database, migrations(), APPLIED_AT)).resolves.toEqual({
          schemaVersion: 160,
          appliedVersions: Array.from(
            { length: 160 - manifest.schemaVersion },
            (_, index) => manifest.schemaVersion + index + 1,
          ),
        });
        const upgradedLedger = await database.query<QueryRow>(
          sqlStatement(
            "SELECT version, name, sha256 FROM coredrill_schema_migration ORDER BY version",
          ),
        );
        expect(upgradedLedger).toHaveLength(160);
        expect(upgradedLedger.slice(0, manifest.schemaVersion)).toEqual(originalLedger);
        await expect(
          database.query<QueryRow>(
            sqlStatement("SELECT name FROM sqlite_schema WHERE type = 'index' AND name = ?", [
              "next_action_job_created_idx",
            ]),
          ),
        ).resolves.toEqual([{ name: "next_action_job_created_idx" }]);
        await expect(
          database.query<QueryRow>(
            sqlStatement("SELECT name FROM sqlite_schema WHERE type = 'index' AND name = ?", [
              "reminder_next_action_job_state_idx",
            ]),
          ),
        ).resolves.toEqual([{ name: "reminder_next_action_job_state_idx" }]);
        const upgradedData = await createPortableDataExportV1({
          database,
          generatedAt: manifest.generatedAt,
          vaultId: manifest.vaultId,
        });
        expect(upgradedData.datasets).toEqual(
          restoredData.datasets.map((dataset) => ({ ...dataset, sourceSchemaVersion: 160 })),
        );
        for (const contentId of manifest.attachmentContentIds) {
          const attachment = await database.readPortableAttachment(contentId);
          if (attachment === undefined) {
            throw new Error("The schema upgrade lost a restored attachment.");
          }
          expect(createHash("sha256").update(attachment).digest("hex")).toBe(contentId);
        }
        console.info(
          `BKP007_NATIVE_PROOF ${JSON.stringify({
            archiveSha256: manifest.archiveSha256,
            contentSha256: restoredContent.sha256,
            databaseMatchesArchive: restoredDatabase.sha256 === manifest.databaseSha256,
            attachmentCount: manifest.attachmentCount,
            cleanInstallRestore: true,
          })}`,
        );
      } finally {
        await database.delete();
      }
    },
  );

  it.runIf(process.platform === "win32")(
    "runs the complete Phase 1 canonical journey through the Windows native process",
    async () => {
      const databaseName = nextDatabaseName();
      let sourceDatabase: NativeSqliteDatabase | undefined;
      let restoreDatabase: NativeSqliteDatabase | undefined;
      let preview:
        | Readonly<{
            databaseSha256: string;
            previewId: string;
            vaultId: string;
            vaultName: string;
          }>
        | undefined;

      try {
        const proof = await runPhase1CanonicalJourney({
          runtime: "windows-native",
          prepareSource: async () => {
            sourceDatabase = await openNativeSqliteDatabase({ databaseName, transport });
            await applySqlMigrations(sourceDatabase, migrations(), APPLIED_AT);
            return sourceDatabase;
          },
          createVaultDeletionPort: (database) => ({
            preview: async (input) => {
              const rows = await database.query<
                VaultRow & { readonly created_at: string; readonly last_opened_at: string }
              >(
                sqlStatement(
                  "SELECT id, name, schema_version, created_at, last_opened_at FROM vault ORDER BY id",
                ),
              );
              const vault = rows[0];
              if (rows.length !== 1 || vault?.id !== input.vaultId) {
                throw new Error("The native canonical deletion preview changed vault identity.");
              }
              preview = Object.freeze({
                databaseSha256: (await database.exportPortable()).sha256,
                previewId: input.previewId,
                vaultId: vault.id,
                vaultName: vault.name,
              });
              return Object.freeze({
                vaultId: input.vaultId,
                vaultName: vault.name,
                storageMode: "desktop" as const,
                inventory: Object.freeze({
                  attachmentFiles: 0,
                  managedBackups: 0,
                  providerSecrets: 0,
                  sharedAttachmentFiles: 0,
                }),
                lastSuccessfulPortableExportAt: null,
              });
            },
            delete: async (input) => {
              const current = preview;
              const rows = await database.query<VaultRow>(
                sqlStatement("SELECT id, name, schema_version FROM vault ORDER BY id"),
              );
              const vault = rows[0];
              if (
                current === undefined ||
                current.previewId !== input.previewId ||
                current.vaultId !== input.vaultId ||
                rows.length !== 1 ||
                vault?.id !== current.vaultId ||
                vault.name !== current.vaultName ||
                input.confirmation !== `DELETE ${current.vaultName}` ||
                (await database.exportPortable()).sha256 !== current.databaseSha256
              ) {
                throw new Error("The native canonical deletion preview became stale.");
              }
              if (!(await (database as NativeSqliteDatabase).delete())) {
                throw new Error("The native canonical database was not deleted.");
              }
              sourceDatabase = undefined;
              preview = undefined;
              return Object.freeze({
                deletionId: input.deletionId,
                vaultId: input.vaultId,
                status: "deleted" as const,
                deleted: Object.freeze({
                  attachmentFiles: 0,
                  managedBackups: 0,
                  providerSecrets: 0,
                  sharedAttachmentFiles: 0,
                }),
                externalPortableArchivesAffected: false as const,
              });
            },
          }),
          prepareRestoreTarget: async () => {
            restoreDatabase = await openNativeSqliteDatabase({ databaseName, transport });
            await applySqlMigrations(restoreDatabase, migrations(), APPLIED_AT);
            return restoreDatabase;
          },
          createRestorePort: async (database, vaultId) =>
            createNativePortableArchiveRestorePortV1({
              database: database as NativeSqliteDatabase,
              expectedVaultId: vaultId,
            }),
          readRestoredAttachment: (database, contentId) =>
            (database as NativeSqliteDatabase).readPortableAttachment(contentId),
        });

        expect(proof).toMatchObject({
          version: 1,
          runtime: "windows-native",
          adapterName: "native-rusqlite-candidate",
          schemaVersion: 160,
          vaultName: "Canonical local job search",
          jobTitle: "Research Operations Lead",
          finalStage: "Interviewing",
          statusEventCount: 3,
          interviewCount: 1,
          nextActionCount: 1,
          reminderCount: 1,
          deletionStatus: "deleted",
          restoreConflict: "none",
          restoreCommitted: true,
          restoredDatabaseMatchesArchive: true,
          accountRequired: false,
          networkRequired: false,
          aiRequired: false,
        });
        expect(proof.steps.map(({ id }) => id)).toEqual([
          "create_vault",
          "add_job",
          "move_stages",
          "schedule_interview",
          "schedule_follow_up",
          "export_archive",
          "delete_vault",
          "restore_archive",
        ]);
        expect(proof.contentSha256AfterRestore).toBe(proof.contentSha256BeforeDelete);
        const proofOutputDirectory = path.join(repositoryRoot, "test-results");
        await mkdir(proofOutputDirectory, { recursive: true });
        await writeFile(
          path.join(proofOutputDirectory, "phase-1-canonical-native.json"),
          `${JSON.stringify(proof, null, 2)}\n`,
          "utf8",
        );
        console.info(`Q1_CANONICAL_NATIVE_PROOF ${JSON.stringify(proof)}`);
      } finally {
        if (sourceDatabase !== undefined) await sourceDatabase.delete();
        if (restoreDatabase !== undefined) await restoreDatabase.delete();
      }
    },
    120_000,
  );

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
