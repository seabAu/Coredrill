import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, describe, expect, it } from "vitest";
import {
  applySqlMigrations,
  defineSqlMigrations,
  inspectPortableArchiveV1,
  sqlStatement,
  type DatabasePort,
  type DatabaseReadSnapshot,
  type DatabaseTransaction,
  type QueryRow,
  type SqlStatement,
} from "../src/index.js";
import { preparePortableVaultArchiveV1 } from "../src/portable-vault-archive.js";

const root = path.resolve(import.meta.dirname, "../../..");
const vaultId = "0198e102-0000-7000-8000-000000000001";
const archiveId = "0198e102-0000-7000-8000-000000000002";
const createdAt = "2026-10-21T06:00:00.000Z";
const attachment = new TextEncoder().encode("Synthetic retained evidence é中🙂");
const hash = (bytes: Uint8Array) => createHash("sha256").update(bytes).digest("hex");
const contentId = hash(attachment);
const migrations = defineSqlMigrations(
  readdirSync(path.join(root, "migrations"))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
    .sort()
    .map((name, index) => {
      const sql = readFileSync(path.join(root, "migrations", name), "utf8");
      return {
        version: index + 1,
        name: name.slice(5, -4).replaceAll("_", "-"),
        sql,
        sha256: hash(new TextEncoder().encode(sql)),
      };
    }),
);
const opened: TestDatabase[] = [];
class TestDatabase implements DatabasePort {
  readonly directory = mkdtempSync(path.join(tmpdir(), "coredrill-export-"));
  readonly file = path.join(this.directory, "vault.sqlite3");
  connection = new DatabaseSync(this.file);
  exports = 0;
  afterExport: (() => void) | undefined;
  beforeExport: (() => void) | undefined;
  corruptSnapshot: number | undefined;
  exportFailure: Error | undefined;
  exportAttempts = 0;
  private tail: Promise<unknown> = Promise.resolve();
  private run<Result>(work: () => Promise<Result>): Promise<Result> {
    const result = this.tail.then(work);
    this.tail = result.catch(() => undefined);
    return result;
  }
  constructor() {
    this.connection.exec("PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;");
    opened.push(this);
  }
  async query<Row extends QueryRow = QueryRow>(statement: SqlStatement) {
    return this.run(() => this.queryDirect<Row>(statement));
  }
  private async queryDirect<Row extends QueryRow = QueryRow>(statement: SqlStatement) {
    return this.connection.prepare(statement.sql).all(...statement.parameters) as Row[];
  }
  async execute(statement: SqlStatement) {
    return this.run(() => this.executeDirect(statement));
  }
  private async executeDirect(statement: SqlStatement) {
    return {
      rowsAffected: Number(
        this.connection.prepare(statement.sql).run(...statement.parameters).changes,
      ),
    };
  }
  async transaction<Result>(work: (transaction: DatabaseTransaction) => Promise<Result>) {
    return this.run(async () => {
      this.connection.exec("BEGIN IMMEDIATE");
      try {
        const result = await work({
          query: <Row extends QueryRow = QueryRow>(statement: SqlStatement) =>
            this.queryDirect<Row>(statement),
          execute: (statement) => this.executeDirect(statement),
        });
        this.connection.exec("COMMIT");
        return result;
      } catch (error) {
        this.connection.exec("ROLLBACK");
        throw error;
      }
    });
  }
  async exportPortable() {
    return this.run(() => this.exportPortableDirect());
  }
  private async exportPortableDirect() {
    this.exportAttempts += 1;
    if (this.exportFailure !== undefined) throw this.exportFailure;
    this.beforeExport?.();
    const bytes = new Uint8Array(readFileSync(this.file));
    this.exports += 1;
    this.afterExport?.();
    return {
      bytes,
      byteLength: bytes.length,
      sha256: this.exports === this.corruptSnapshot ? "0".repeat(64) : hash(bytes),
      schemaVersion: 167,
    };
  }
  async restoreExact(bytes: Uint8Array) {
    return this.run(async () => {
      this.connection.close();
      writeFileSync(this.file, bytes);
      this.connection = new DatabaseSync(this.file);
    });
  }
  async withReadSnapshot<Result>(work: (snapshot: DatabaseReadSnapshot) => Promise<Result>) {
    return this.run(() =>
      work({
        query: <Row extends QueryRow = QueryRow>(statement: SqlStatement) =>
          this.queryDirect<Row>(statement),
        exportPortable: () => this.exportPortableDirect(),
      }),
    );
  }
  async diagnostics() {
    return {
      adapterName: "test",
      health: "ready" as const,
      persistence: "durable" as const,
      readOnly: false,
      schemaVersion: 167,
      details: [],
    };
  }
  close() {
    this.connection.close();
    rmSync(this.directory, { recursive: true, force: true });
  }
}
afterEach(() => {
  for (const database of opened.splice(0)) database.close();
});
const fixture = async () => {
  const database = new TestDatabase();
  await applySqlMigrations(database, migrations, createdAt);
  await database.execute(
    sqlStatement(
      "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
      [vaultId, "Synthetic vault", 160, createdAt, createdAt],
    ),
  );
  await database.execute(
    sqlStatement(
      "INSERT INTO attachment_manifest(content_id,media_type,byte_length,created_at) VALUES(?,?,?,?)",
      [contentId, "text/plain", attachment.length, createdAt],
    ),
  );
  return database;
};
const input = (database: DatabasePort) => ({
  database,
  vaultId,
  archiveId,
  createdAt,
  createdByVersion: "0.0.0",
  readAttachment: async (_contentId: string): Promise<Uint8Array | undefined> => attachment.slice(),
});

describe("complete stable portable vault archive preparation", () => {
  it("fails closed without the read-lease capability instead of using only outer hashes", async () => {
    const database = await fixture();
    const noLease: DatabasePort = {
      query: database.query.bind(database),
      execute: database.execute.bind(database),
      transaction: database.transaction.bind(database),
      exportPortable: database.exportPortable.bind(database),
      diagnostics: database.diagnostics.bind(database),
    };
    await expect(preparePortableVaultArchiveV1(input(noLease))).rejects.toMatchObject({
      code: "archive_unavailable",
    });
    expect(database.exports).toBe(0);
  });
  it("never mixes an exact restored database with an intervening projection (ABA)", async () => {
    const database = await fixture();
    const original = new Uint8Array(readFileSync(database.file));
    database.afterExport = () => {
      if (database.exports === 1)
        void database.execute(
          sqlStatement("UPDATE vault SET name = ? WHERE id = ?", ["Intervening vault", vaultId]),
        );
    };
    database.beforeExport = () => {
      if (database.exports === 1) void database.restoreExact(original);
    };
    const outcome = await preparePortableVaultArchiveV1(input(database)).then(
      (archive) => ({ archive, code: "prepared" }),
      (error: unknown) => ({
        code: error instanceof Error && "code" in error ? error.code : "unknown",
      }),
    );
    if (outcome.code !== "prepared") {
      expect(outcome.code).toBe("source_changed");
      return;
    }
    if (!("archive" in outcome)) throw new Error("Expected archive result.");
    const inspected = await inspectPortableArchiveV1({
      bytes: outcome.archive.bytes,
      expectedSchemaVersion: 167,
    });
    const vaultData = inspected.dataFiles.find(({ path }) => path === "data/vault.json");
    if (vaultData === undefined) throw new Error("Missing vault projection.");
    const projected = JSON.parse(new TextDecoder().decode(vaultData.bytes)) as {
      rows: { name: string }[];
    };
    expect(inspected.database.sha256).toBe(hash(original));
    expect(projected.rows[0]?.name).toBe("Synthetic vault");
  });
  it.each([
    { vaultId: "invalid" },
    { archiveId: "invalid" },
    { createdAt: "not-an-instant" },
    { createdByVersion: "PRIVATE_INVALID_VERSION" },
  ])("rejects invalid context before touching storage: %j", async (override) => {
    const database = await fixture();
    await expect(
      preparePortableVaultArchiveV1({ ...input(database), ...override }),
    ).rejects.toMatchObject({ code: "invalid_input" });
    expect(database.exports).toBe(0);
  });
  it("assembles all canonical datasets and retained bytes from actual migrated SQLite without writes", async () => {
    const database = await fixture();
    const before = hash(new Uint8Array(readFileSync(database.file)));
    const archive = await preparePortableVaultArchiveV1(input(database));
    expect(archive.manifest).toMatchObject({
      archiveId,
      createdAt,
      encryption: { mode: "none" },
      vault: { id: vaultId, schemaVersion: 167 },
    });
    expect(archive.manifest.dataFiles).toHaveLength(116);
    expect(archive.manifest.vault.migrationHistory).toHaveLength(167);
    const inspected = await inspectPortableArchiveV1({
      bytes: archive.bytes,
      expectedSchemaVersion: 167,
      expectedArchiveSha256: archive.sha256,
    });
    expect(inspected.attachments).toHaveLength(1);
    expect(inspected.attachments[0]?.bytes).toEqual(attachment);
    expect(database.exports).toBe(2);
    expect(hash(new Uint8Array(readFileSync(database.file)))).toBe(before);
  });
  it("rejects source changes during attachment assembly without undoing the other write or retrying", async () => {
    const database = await fixture();
    const request = input(database);
    request.readAttachment = async () => {
      await database.execute(
        sqlStatement("UPDATE vault SET name = ? WHERE id = ?", ["Changed externally", vaultId]),
      );
      return attachment.slice();
    };
    await expect(preparePortableVaultArchiveV1(request)).rejects.toMatchObject({
      code: "source_changed",
    });
    expect(database.exports).toBe(2);
    expect(await database.query(sqlStatement("SELECT name FROM vault"))).toEqual([
      { name: "Changed externally" },
    ]);
  });
  it("copies identity and time before awaiting the first snapshot", async () => {
    const database = await fixture();
    const request = input(database);
    database.afterExport = () => {
      request.vaultId = archiveId;
      request.createdAt = "PRIVATE_INVALID_TIME";
    };
    const archive = await preparePortableVaultArchiveV1(request);
    expect(archive.manifest.vault.id).toBe(vaultId);
    expect(archive.manifest.createdAt).toBe(createdAt);
  });
  it.each([undefined, new Uint8Array([1, 2, 3])])(
    "rejects unavailable/corrupt retained attachment bytes",
    async (bytes) => {
      const database = await fixture();
      await expect(
        preparePortableVaultArchiveV1({ ...input(database), readAttachment: async () => bytes }),
      ).rejects.toMatchObject({ code: "archive_unavailable" });
    },
  );
  it("rejects a different viewed vault without producing a partial archive", async () => {
    const database = await fixture();
    await expect(
      preparePortableVaultArchiveV1({ ...input(database), vaultId: archiveId }),
    ).rejects.toMatchObject({ code: "archive_unavailable" });
  });
  it("redacts private storage and attachment errors", async () => {
    const database = await fixture();
    let failure: unknown;
    try {
      await preparePortableVaultArchiveV1({
        ...input(database),
        readAttachment: async () => {
          throw new Error("PRIVATE_PATH_OR_CONTENT");
        },
      });
    } catch (error) {
      failure = error;
    }
    expect(failure).toMatchObject({ code: "archive_unavailable" });
    expect(String(failure)).not.toContain("PRIVATE_PATH_OR_CONTENT");
  });
  it.each([1, 2])(
    "independently verifies snapshot %i rather than trusting its checksum metadata",
    async (badSnapshot) => {
      const database = await fixture();
      database.corruptSnapshot = badSnapshot;
      await expect(preparePortableVaultArchiveV1(input(database))).rejects.toMatchObject({
        code: "archive_unavailable",
      });
      expect(database.exports).toBe(badSnapshot);
    },
  );
  it("redacts a failed database snapshot and never retries it", async () => {
    const database = await fixture();
    database.exportFailure = new Error("PRIVATE_DATABASE_PATH");
    const failure = await preparePortableVaultArchiveV1(input(database)).catch(
      (error: unknown) => error,
    );
    expect(failure).toMatchObject({ code: "archive_unavailable" });
    expect(String(failure)).not.toContain("PRIVATE_DATABASE_PATH");
    expect(database.exportAttempts).toBe(1);
  });
});
