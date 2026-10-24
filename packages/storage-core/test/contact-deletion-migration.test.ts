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
    .filter((file) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(file) && Number(file.slice(0, 4)) <= 167)
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
const at = "2026-10-24T19:00:00.000Z";
const id = (n: number) => `0198e109-0000-7000-8000-${String(n).padStart(12, "0")}`;
const vaultId = entityId("vault", id(1));
const historyColumns = [
  "id",
  "job_id",
  "type",
  "occurred_at",
  "direction",
  "summary",
  "next_action_at",
  "created_at",
  "updated_at",
  "row_version",
];

class MigrationDatabase implements DatabasePort {
  public readonly connection = new DatabaseSync(":memory:");
  public failLedgerVersion: number | null = null;
  public constructor() {
    this.connection.exec("PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;");
  }
  public async query<Row extends QueryRow = QueryRow>(statement: SqlStatement) {
    return this.connection.prepare(statement.sql).all(...statement.parameters) as Row[];
  }
  public async execute(statement: SqlStatement) {
    if (
      this.failLedgerVersion !== null &&
      statement.sql.startsWith("INSERT INTO coredrill_schema_migration") &&
      statement.parameters[0] === this.failLedgerVersion
    )
      throw new Error("Synthetic publication failure after guard replacement.");
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
    throw new Error("Concrete archive recovery is separate proof.");
  }
  public async diagnostics(): Promise<StorageDiagnostics> {
    return {
      adapterName: "node-contact-deletion",
      health: "ready",
      persistence: "memory",
      readOnly: false,
      schemaVersion: Number(this.connection.prepare("PRAGMA user_version").get()?.["user_version"]),
      details: [],
    };
  }
}

describe("actual schema165 to167 deleted-contact history detachment", () => {
  let database: MigrationDatabase;
  const rows = (table: string) =>
    database.connection
      .prepare(`SELECT * FROM ${table} ORDER BY 1`)
      .all()
      .map((row) => ({ ...row }));
  const state = () =>
    Object.fromEntries(
      [
        "vault",
        "contact",
        "contact_manual_creation",
        "job",
        "interaction",
        "coredrill_schema_migration",
      ].map((table) => [table, rows(table)]),
    );
  const exported = () => createPortableDataExportV1({ database, vaultId, generatedAt: at });
  const guard = () =>
    database.connection
      .prepare(
        "SELECT sql FROM sqlite_schema WHERE type='trigger' AND name='interaction_immutable_update_guard'",
      )
      .get();
  const remove = () => database.connection.prepare("DELETE FROM contact WHERE id=?").run(id(2));
  beforeEach(async () => {
    database = new MigrationDatabase();
    await applySqlMigrations(database, migrations.slice(0, 165), at);
    database.connection
      .prepare(
        "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,165,?,?)",
      )
      .run(vaultId, "Synthetic detachment vault", at, at);
    database.connection
      .prepare("INSERT INTO job(id,title,created_at,updated_at) VALUES(?,?,?,?)")
      .run(id(4), "Synthetic linked role", at, at);
    for (const n of [2, 3]) {
      const name = `Synthetic contact ${n}`;
      database.connection
        .prepare(
          "INSERT INTO contact(id,name,user_confirmed,created_at,updated_at) VALUES(?,?,1,?,?)",
        )
        .run(id(n), name, at, at);
      database.connection
        .prepare(
          "INSERT INTO contact_manual_creation(contact_id,operation_id,created_at,name_hash) VALUES(?,?,?,?)",
        )
        .run(id(n), id(n + 10), at, createHash("sha256").update(name).digest("hex"));
    }
    for (const n of [5, 6, 7])
      database.connection
        .prepare(
          "INSERT INTO interaction(id,job_id,contact_id,type,occurred_at,direction,summary,created_at,updated_at) VALUES(?,?,?,'note',?,'unknown',?,?,?)",
        )
        .run(
          id(n),
          id(4),
          id(n === 7 ? 3 : 2),
          at,
          `\uFEFFSynthetic ${n}\0<script>inert</script>尾`,
          at,
          at,
        );
  });
  afterEach(() => database.connection.close());

  it("applies exactly167 and preserves every canonical export row and prior ledger identity", async () => {
    const before = await exported();
    const beforeState = state();
    const oldGuard = guard();
    expect(() => remove()).toThrow("interactions are append-only");
    expect(state()).toEqual(beforeState);
    expect(await applySqlMigrations(database, migrations, at)).toEqual({
      schemaVersion: 167,
      appliedVersions: [166, 167],
    });
    const after = await exported();
    expect(after.sourceSchemaVersion).toBe(167);
    expect(after.datasetCount).toBe(58);
    expect(after.dataFiles).toHaveLength(116);
    expect(after.datasets).toEqual(
      before.datasets.map((dataset) => ({ ...dataset, sourceSchemaVersion: 167 })),
    );
    const afterState = state();
    expect({
      ...afterState,
      coredrill_schema_migration: afterState["coredrill_schema_migration"]?.slice(0, 165),
    }).toEqual(beforeState);
    expect(guard()).not.toEqual(oldGuard);
    expect(await applySqlMigrations(database, migrations, at)).toEqual({
      schemaVersion: 167,
      appliedVersions: [],
    });
  });

  it.each([false, true])(
    "detaches only deleted contact links with recursive triggers %s",
    async (recursive) => {
      await applySqlMigrations(database, migrations, at);
      database.connection.exec(`PRAGMA recursive_triggers=${recursive ? "ON" : "OFF"}`);
      const before = state();
      expect(remove().changes).toBe(1);
      const after = state();
      expect(after["interaction"]).toEqual(
        before["interaction"]?.map((row) =>
          row["contact_id"] === id(2) ? { ...row, contact_id: null } : row,
        ),
      );
      expect(after["contact"]).toEqual(before["contact"]?.filter((row) => row["id"] !== id(2)));
      expect(after["contact_manual_creation"]).toEqual(
        before["contact_manual_creation"]?.filter((row) => row["contact_id"] !== id(2)),
      );
      for (const table of ["vault", "job", "coredrill_schema_migration"])
        expect(after[table]).toEqual(before[table]);
      expect(database.connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
      const afterDelete = state();
      expect(() =>
        database.connection
          .prepare("UPDATE interaction SET contact_id=? WHERE id=?")
          .run(id(3), id(5)),
      ).toThrow("interactions are append-only");
      expect(state()).toEqual(afterDelete);
    },
  );

  it.each([
    ["id", id(99)],
    ["job_id", id(4)],
    ["type", "call"],
    ["occurred_at", "2026-10-24T20:00:00.000Z"],
    ["direction", "outbound"],
    ["summary", "changed"],
    ["next_action_at", at],
    ["created_at", at],
    ["updated_at", at],
    ["row_version", 2],
    ["contact_id", null],
    ["contact_id", id(3)],
  ] as const)("rejects ordinary history editing of %s without writes", async (column, value) => {
    await applySqlMigrations(database, migrations, at);
    const before = state();
    expect(() =>
      database.connection
        .prepare(`UPDATE interaction SET ${column}=? WHERE id=?`)
        .run(value, id(5)),
    ).toThrow("interactions are append-only");
    expect(state()).toEqual(before);
    expect(() =>
      database.connection
        .prepare("UPDATE interaction SET contact_id=NULL,summary='changed' WHERE id=?")
        .run(id(5)),
    ).toThrow("interactions are append-only");
    expect(state()).toEqual(before);
  });

  it("checks that the guard accounts for every other stored interaction column", async () => {
    await applySqlMigrations(database, migrations, at);
    expect(
      database.connection
        .prepare("PRAGMA table_info(interaction)")
        .all()
        .map((row) => row["name"])
        .filter((name) => name !== "contact_id")
        .sort(),
    ).toEqual([...historyColumns].sort());
    const sql = String(guard()?.["sql"]);
    for (const column of historyColumns) expect(sql).toContain(`NEW.${column} IS OLD.${column}`);
  });

  it("rolls back the whole deletion if a late parent trigger fails after detachment", async () => {
    await applySqlMigrations(database, migrations, at);
    const before = state();
    database.connection.exec(`CREATE TRIGGER synthetic_late_delete_failure AFTER DELETE ON contact
      WHEN OLD.id='${id(2)}' BEGIN SELECT RAISE(ABORT, 'synthetic late deletion failure'); END;`);
    expect(() => remove()).toThrow("synthetic late deletion failure");
    expect(state()).toEqual(before);
    expect(database.connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });

  it.each([166, 167])(
    "rolls back the actual trigger replacement, ledger and schema after publication failure at%s",
    async (version) => {
      const before = await exported();
      const beforeState = state();
      const oldGuard = guard();
      database.failLedgerVersion = version;
      await expect(applySqlMigrations(database, migrations, at)).rejects.toThrow(
        "Synthetic publication failure",
      );
      expect((await database.diagnostics()).schemaVersion).toBe(165);
      expect(state()).toEqual(beforeState);
      expect(guard()).toEqual(oldGuard);
      expect(await exported()).toEqual(before);
      expect(() => remove()).toThrow("interactions are append-only");
      database.failLedgerVersion = null;
      expect((await applySqlMigrations(database, migrations, at)).appliedVersions).toEqual([
        166, 167,
      ]);
    },
  );

  it("refuses the older165 migration set without downgrade or canonical changes", async () => {
    await applySqlMigrations(database, migrations, at);
    const before = await exported();
    const beforeState = state();
    await expect(applySqlMigrations(database, migrations.slice(0, 165), at)).rejects.toThrow(
      "does not match reviewed source",
    );
    expect((await database.diagnostics()).schemaVersion).toBe(167);
    expect(state()).toEqual(beforeState);
    expect(await exported()).toEqual(before);
  });

  it("does not expose the intermediate unguarded166 schema as an export milestone", async () => {
    await applySqlMigrations(database, migrations.slice(0, 166), at);
    const beforeState = state();
    expect((await database.diagnostics()).schemaVersion).toBe(166);
    await expect(exported()).rejects.toMatchObject({ code: "schema_mismatch" });
    expect(state()).toEqual(beforeState);
    await expect(applySqlMigrations(database, migrations.slice(0, 165), at)).rejects.toThrow(
      "does not match reviewed source",
    );
    expect(state()).toEqual(beforeState);
    expect((await applySqlMigrations(database, migrations, at)).appliedVersions).toEqual([167]);
    expect(guard()).toBeDefined();
  });
});
