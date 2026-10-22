import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { entityId } from "@coredrill/domain";
import { applySqlMigrations, defineSqlMigrations } from "../src/migrations.js";
import { createPortableDataExportV1 } from "../src/portable-data-export.js";
import {
  sqlStatement,
  type DatabasePort,
  type DatabaseTransaction,
  type QueryRow,
  type SqlStatement,
  type StorageDiagnostics,
} from "../src/database-port.js";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const migrations = defineSqlMigrations(
  readdirSync(path.join(root, "migrations"))
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(file) && Number(file.slice(0, 4)) <= 165)
    .sort()
    .map((file) => {
      const sql = readFileSync(path.join(root, "migrations", file), "utf8");
      return {
        version: Number(file.slice(0, 4)),
        name: file.slice(5, -4).replaceAll("_", "-"),
        sql,
        sha256: createHash("sha256").update(sql).digest("hex"),
      };
    }),
);
const at = "2026-10-22T04:00:00.000Z";
const id = (suffix: number) => `0198e107-0000-7000-8000-${String(suffix).padStart(12, "0")}`;
const vaultId = entityId("vault", id(1));
const indexName = "interaction_contact_history_idx";

class MigrationDatabase implements DatabasePort {
  public readonly connection = new DatabaseSync(":memory:");
  public failIndexLedger = false;
  public constructor() {
    this.connection.exec("PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;");
  }
  public async query<Row extends QueryRow = QueryRow>(statement: SqlStatement) {
    return this.connection.prepare(statement.sql).all(...statement.parameters) as Row[];
  }
  public async execute(statement: SqlStatement) {
    if (
      this.failIndexLedger &&
      statement.sql.startsWith("INSERT INTO coredrill_schema_migration") &&
      statement.parameters[0] === 165
    )
      throw new Error("Synthetic failure after index creation, before ledger publication.");
    return {
      rowsAffected: Number(
        this.connection.prepare(statement.sql).run(...statement.parameters).changes,
      ),
    };
  }
  public async transaction<Result>(work: (session: DatabaseTransaction) => Promise<Result>) {
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      const result = await work(this);
      this.connection.exec("COMMIT");
      return result;
    } catch (error) {
      this.connection.exec("ROLLBACK");
      throw error;
    }
  }
  public async exportPortable(): Promise<never> {
    throw new Error("Byte archive proof is a separate gate.");
  }
  public async diagnostics(): Promise<StorageDiagnostics> {
    const row = this.connection.prepare("PRAGMA user_version").get();
    return {
      adapterName: "node-index-migration",
      health: "ready",
      persistence: "memory",
      readOnly: false,
      schemaVersion: Number(row?.["user_version"]),
      details: [],
    };
  }
}

describe("actual schema164 to165 contact-history index migration", () => {
  let database: MigrationDatabase;
  const exported = () => createPortableDataExportV1({ database, vaultId, generatedAt: at });
  const seed = async (version: number) => {
    await database.execute(
      sqlStatement(
        "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
        [vaultId, "Synthetic index-upgrade vault", version, at, at],
      ),
    );
    await database.execute(
      sqlStatement(
        "INSERT INTO contact(id,name,user_confirmed,notes,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        [id(2), "Synthetic contact", 1, "\uFEFFLiteral\0尾", at, at],
      ),
    );
    await database.execute(
      sqlStatement(
        "INSERT INTO contact_manual_creation(contact_id,operation_id,created_at,name_hash) VALUES(?,?,?,?)",
        [id(2), id(5), at, createHash("sha256").update("Synthetic contact").digest("hex")],
      ),
    );
    await database.execute(
      sqlStatement("INSERT INTO job(id,title,created_at,updated_at) VALUES(?,?,?,?)", [
        id(3),
        "Synthetic role",
        at,
        at,
      ]),
    );
    await database.execute(
      sqlStatement(
        "INSERT INTO interaction(id,job_id,contact_id,type,occurred_at,direction,summary,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
        [id(4), id(3), id(2), "meeting", at, "mutual", "\uFEFFLiteral\0😀 note", at, at],
      ),
    );
  };
  const hasIndex = () =>
    database.connection
      .prepare("SELECT name FROM sqlite_schema WHERE type='index' AND name=?")
      .all(indexName);
  beforeEach(() => {
    database = new MigrationDatabase();
  });
  afterEach(() => database.connection.close());

  it("upgrades exact164 and preserves every canonical export row, column and receipt", async () => {
    await applySqlMigrations(database, migrations.slice(0, 164), at);
    await seed(164);
    const before = await exported();
    const ledger = await database.query(
      sqlStatement("SELECT * FROM coredrill_schema_migration ORDER BY version"),
    );
    expect(before.sourceSchemaVersion).toBe(164);
    expect(hasIndex()).toEqual([]);
    expect(await applySqlMigrations(database, migrations, at)).toEqual({
      schemaVersion: 165,
      appliedVersions: [165],
    });
    const after = await exported();
    expect(after.sourceSchemaVersion).toBe(165);
    expect(after.datasetCount).toBe(58);
    expect(after.dataFiles).toHaveLength(116);
    expect(after.datasets).toEqual(
      before.datasets.map((dataset) => ({ ...dataset, sourceSchemaVersion: 165 })),
    );
    expect(
      (
        await database.query(
          sqlStatement("SELECT * FROM coredrill_schema_migration ORDER BY version"),
        )
      ).slice(0, 164),
    ).toEqual(ledger);
    expect(hasIndex()).toEqual([{ name: indexName }]);
    expect(await applySqlMigrations(database, migrations, at)).toEqual({
      schemaVersion: 165,
      appliedVersions: [],
    });
  });

  it("proves exact index column direction and actual bounded contact query planning", async () => {
    await applySqlMigrations(database, migrations, at);
    await seed(165);
    expect(
      database.connection
        .prepare(`PRAGMA index_xinfo('${indexName}')`)
        .all()
        .filter((row) => row["key"] === 1)
        .map((row) => ({ name: row["name"], desc: row["desc"] })),
    ).toEqual([
      { name: "contact_id", desc: 0 },
      { name: "occurred_at", desc: 1 },
      { name: "id", desc: 0 },
    ]);
    const plan = database.connection
      .prepare(
        "EXPLAIN QUERY PLAN SELECT id FROM interaction WHERE contact_id=? ORDER BY occurred_at DESC,id ASC LIMIT ?",
      )
      .all(id(2), 25)
      .map((row) => String(row["detail"]));
    expect(plan.some((detail) => detail.includes(indexName))).toBe(true);
    expect(plan.some((detail) => detail.includes("TEMP B-TREE"))).toBe(false);
    expect((await exported()).datasetCount).toBe(58);
  });

  it("rolls back index, ledger and version after a real post-index publication failure", async () => {
    await applySqlMigrations(database, migrations.slice(0, 164), at);
    await seed(164);
    const before = await exported();
    const schema = await database.query(
      sqlStatement("SELECT name,sql FROM sqlite_schema ORDER BY name"),
    );
    database.failIndexLedger = true;
    await expect(applySqlMigrations(database, migrations, at)).rejects.toThrow(
      "Synthetic failure after index creation",
    );
    expect((await database.diagnostics()).schemaVersion).toBe(164);
    expect(hasIndex()).toEqual([]);
    expect(
      await database.query(sqlStatement("SELECT name,sql FROM sqlite_schema ORDER BY name")),
    ).toEqual(schema);
    expect(await exported()).toEqual(before);
    expect(
      await database.query(
        sqlStatement("SELECT version FROM coredrill_schema_migration WHERE version>164"),
      ),
    ).toEqual([]);
    database.failIndexLedger = false;
    expect((await applySqlMigrations(database, migrations, at)).appliedVersions).toEqual([165]);
  });

  it("refuses an older reviewed migration set without downgrading or changing records", async () => {
    await applySqlMigrations(database, migrations, at);
    await seed(165);
    const before = await exported();
    await expect(applySqlMigrations(database, migrations.slice(0, 164), at)).rejects.toThrow(
      "does not match reviewed source",
    );
    expect((await database.diagnostics()).schemaVersion).toBe(165);
    expect(hasIndex()).toEqual([{ name: indexName }]);
    expect(await exported()).toEqual(before);
  });
});
