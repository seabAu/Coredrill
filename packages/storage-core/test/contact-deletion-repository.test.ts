import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import { type ContactDeletionTargetV1 } from "@coredrill/application";
import { createContactDeletionRepository } from "../src/contact-deletion-repository.js";
import {
  type DatabasePort,
  type DatabaseTransaction,
  type DatabaseReadSnapshot,
  type QueryRow,
  type SqlStatement,
} from "../src/database-port.js";

const root = path.resolve(import.meta.dirname, "..", "..", "..");
const id = (n: number) => `0198e114-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = instant("2026-10-24T19:00:00.000Z");
const literal = "\uFEFFSynthetic contact history\0<script>inert</script>尾😀";
const target: ContactDeletionTargetV1 = {
  specVersion: 1,
  expectedVaultId: entityId("vault", id(1)),
  contactId: entityId("contact", id(2)),
  expectedRowVersion: 1,
  expectedCreatedAt: at,
  expectedUpdatedAt: at,
  expectedArchivedAt: null,
  expectedCompanyId: entityId("company", id(2)),
  expectedManualCreationOperationId: entityId("application-operation", id(9)),
};
class DeletionDatabase implements DatabasePort {
  public readonly connection = new DatabaseSync(":memory:");
  public readonly writes: SqlStatement[] = [];
  public failAfterContactDelete = false;
  public constructor() {
    this.connection.exec("PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;");
    for (const file of readdirSync(path.join(root, "migrations"))
      .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(name))
      .sort())
      this.connection.exec(readFileSync(path.join(root, "migrations", file), "utf8"));
  }
  public async query<Row extends QueryRow = QueryRow>(statement: SqlStatement) {
    return this.connection.prepare(statement.sql).all(...statement.parameters) as Row[];
  }
  public async execute(statement: SqlStatement) {
    this.writes.push(statement);
    const result = this.connection.prepare(statement.sql).run(...statement.parameters);
    if (this.failAfterContactDelete && statement.sql.startsWith("DELETE FROM contact "))
      throw new Error("Synthetic failure after actual parent deletion.");
    return { rowsAffected: Number(result.changes) };
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
    throw new Error("Archive proof is separate.");
  }
  public async diagnostics() {
    return {
      adapterName: "node-deletion",
      health: "ready" as const,
      persistence: "memory" as const,
      readOnly: false,
      schemaVersion: 167,
      details: [],
    };
  }
}
describe("viewed contact deletion repository", () => {
  let database: DeletionDatabase;
  const tables = [
    "vault",
    "company",
    "contact",
    "contact_manual_creation",
    "contact_point_provenance",
    "field_value",
    "job",
    "job_source",
    "source_snapshot",
    "provenance",
    "application",
    "interview",
    "interaction",
  ];
  const snapshot = () =>
    Object.fromEntries(
      tables.map((table) => [
        table,
        database.connection
          .prepare(`SELECT * FROM ${table} ORDER BY 1`)
          .all()
          .map((row) => ({ ...row })),
      ]),
    );
  const port = () => createContactDeletionRepository(database);
  const result = (state: string) => ({
    specVersion: 1,
    vaultId: target.expectedVaultId,
    contactId: target.contactId,
    state,
  });
  beforeEach(() => {
    database = new DeletionDatabase();
    const db = database.connection;
    db.prepare(
      "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,167,?,?)",
    ).run(id(1), "Synthetic deletion vault", at, at);
    db.prepare("INSERT INTO company(id,canonical_name,created_at,updated_at) VALUES(?,?,?,?)").run(
      id(2),
      "Synthetic shared company",
      at,
      at,
    );
    for (const n of [2, 12])
      db.prepare(
        "INSERT INTO contact(id,company_id,name,notes,user_confirmed,created_at,updated_at) VALUES(?,?,?,?,1,?,?)",
      ).run(id(n), id(2), `Synthetic ${String(n)}`, literal, at, at);
    db.prepare(
      "INSERT INTO contact_manual_creation(contact_id,operation_id,created_at,name_hash) VALUES(?,?,?,?)",
    ).run(id(2), id(9), at, createHash("sha256").update("Synthetic 2").digest("hex"));
    db.prepare(
      "INSERT INTO status_definition(id,name,category,sort_order,created_at,updated_at) VALUES(?,'Synthetic saved','saved',0,?,?)",
    ).run(id(8), at, at);
    db.prepare(
      "INSERT INTO job(id,title,company_id,current_status_id,created_at,updated_at) VALUES(?,'Synthetic job',?,?,?,?)",
    ).run(id(3), id(2), id(8), at, at);
    db.prepare(
      "INSERT INTO application(id,job_id,current_status_id,created_at,updated_at) VALUES(?,?,?,?,?)",
    ).run(id(10), id(3), id(8), at, at);
    db.prepare(
      "INSERT INTO interview(id,application_id,stage_name,starts_at,timezone,duration_minutes,contact_ids_json,created_at,updated_at) VALUES(?,?,'Synthetic interview',?,'UTC',30,?,?,?)",
    ).run(id(11), id(10), at, JSON.stringify([id(2), id(12)]), at, at);
    db.prepare(
      "INSERT INTO interaction(id,job_id,contact_id,type,occurred_at,direction,summary,created_at,updated_at) VALUES(?,?,?,'note',?,'unknown',?,?,?)",
    ).run(id(7), id(3), id(2), at, literal, at, at);
    db.prepare(
      "INSERT INTO job_source(id,job_id,first_seen_at,last_seen_at,created_at,updated_at) VALUES(?,?,?,?,?,?)",
    ).run(id(4), id(3), at, at, at, at);
    db.prepare(
      "INSERT INTO source_snapshot(id,job_source_id,captured_at,extractor_id,extractor_version,content_hash,retention_class,raw_text,created_at) VALUES(?,?,?,'synthetic','1',?,'synthetic',?,?)",
    ).run(id(5), id(4), at, "a".repeat(64), literal, at);
    db.prepare(
      "INSERT INTO provenance(id,source_snapshot_id,extraction_method,source_pointer,source_excerpt,confidence,captured_at,created_at) VALUES(?,?,'user','/synthetic',?,1,?,?)",
    ).run(id(6), id(5), literal, at, at);
    db.prepare(
      "INSERT INTO contact_point_provenance(id,contact_id,field_name,value_hash,provenance_id,created_at) VALUES(?,?,'name',?,?,?)",
    ).run(id(13), id(2), "b".repeat(64), id(6), at);
    for (const [n, kind, replacement] of [
      [20, "contact", null],
      [21, "contact", id(20)],
      [22, "company", null],
    ] as const)
      db.prepare(
        "INSERT INTO field_value(id,entity_type,entity_id,field_name,normalized_json,provenance_id,superseded_by_id,created_at,updated_at) VALUES(?,?,?,'name',?,?,?,?,?)",
      ).run(id(n), kind, id(2), JSON.stringify(literal), id(6), replacement, at, at);
    db.prepare(
      "UPDATE field_value SET is_user_confirmed=1,user_confirmation_id=?,confirmed_at=?,confirmed_value_hash=? WHERE id=?",
    ).run(id(50), at, "c".repeat(64), id(20));
  });
  afterEach(() => database.connection.close());
  it("reads original state without writes and atomically removes only owned data", async () => {
    const before = snapshot();
    expect(await port().inspect(target)).toEqual(result("original_present"));
    expect(database.writes).toEqual([]);
    expect(snapshot()).toEqual(before);
    expect(await port().remove(target)).toEqual(result("deleted"));
    expect(snapshot()).toEqual({
      ...before,
      contact: before["contact"]?.filter((row) => row["id"] !== id(2)),
      contact_manual_creation: [],
      contact_point_provenance: [],
      field_value: before["field_value"]?.filter((row) => row["entity_type"] !== "contact"),
      interaction: before["interaction"]?.map((row) => ({ ...row, contact_id: null })),
    });
    const after = snapshot();
    expect(await port().inspect(target)).toEqual(result("absent_complete"));
    await expect(port().remove(target)).rejects.toMatchObject({ code: "not_found" });
    expect(snapshot()).toEqual(after);
    expect(database.connection.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
  });
  it.each([
    { expectedRowVersion: 2 },
    { expectedUpdatedAt: instant("2026-10-24T20:00:00.000Z") },
    { expectedCreatedAt: instant("2026-10-23T19:00:00.000Z") },
    { expectedCompanyId: null },
    { expectedManualCreationOperationId: null },
    { expectedArchivedAt: at },
  ])("rejects changed original identity without effects: %j", async (change) => {
    const before = snapshot();
    const input = { ...target, ...change };
    expect(await port().inspect(input)).toEqual(result("changed"));
    await expect(port().remove(input)).rejects.toMatchObject({ code: "stale" });
    expect(database.writes).toEqual([]);
    expect(snapshot()).toEqual(before);
  });
  it("rejects foreign vault and malformed contracts before writes", async () => {
    const before = snapshot();
    await expect(
      port().remove({ ...target, expectedVaultId: entityId("vault", id(99)) }),
    ).rejects.toMatchObject({ code: "not_found" });
    await expect(port().remove({ ...target, unexpected: true } as never)).rejects.toThrow();
    expect(database.writes).toEqual([]);
    expect(snapshot()).toEqual(before);
  });
  it("does not call a missing contact fully deleted when owned candidates remain", async () => {
    database.connection.prepare("DELETE FROM contact WHERE id=?").run(id(2));
    const before = snapshot();
    expect(await port().inspect(target)).toEqual(result("unresolved"));
    await expect(port().remove(target)).rejects.toMatchObject({ code: "not_found" });
    expect(database.writes).toEqual([]);
    expect(snapshot()).toEqual(before);
  });
  it.each(["external-reference", "late-failure", "postcondition"])(
    "rolls back all cleanup on %s",
    async (mode) => {
      if (mode === "external-reference")
        database.connection
          .prepare("UPDATE field_value SET superseded_by_id=? WHERE id=?")
          .run(id(20), id(22));
      if (mode === "late-failure") database.failAfterContactDelete = true;
      if (mode === "postcondition")
        database.connection.exec(
          `CREATE TRIGGER synthetic_retained_value AFTER DELETE ON contact WHEN OLD.id='${id(2)}' BEGIN INSERT INTO field_value(id,entity_type,entity_id,field_name,normalized_json,provenance_id,created_at,updated_at) VALUES('${id(23)}','contact','${id(2)}','name','"synthetic"','${id(6)}','${at}','${at}'); END;`,
        );
      const before = snapshot();
      await expect(port().remove(target)).rejects.toThrow();
      expect(snapshot()).toEqual(before);
    },
  );
  it("handles cyclic owned histories without touching same-UUID company candidates", async () => {
    database.connection
      .prepare("UPDATE field_value SET superseded_by_id=? WHERE id=?")
      .run(id(21), id(20));
    expect(await port().remove(target)).toEqual(result("deleted"));
    expect(database.connection.prepare("SELECT entity_type FROM field_value").all()).toEqual([
      { entity_type: "company" },
    ]);
  });
  it("allows an explicitly reviewed archived original without implicit unarchiving", async () => {
    database.connection.prepare("UPDATE contact SET archived_at=? WHERE id=?").run(at, id(2));
    const archived = { ...target, expectedArchivedAt: at };
    expect(await port().inspect(archived)).toEqual(result("original_present"));
    expect(await port().remove(archived)).toEqual(result("deleted"));
  });
  it("uses the read-snapshot capability without dispatching any write or write transaction", async () => {
    let snapshots = 0;
    const selected: DatabasePort = {
      query: (statement) => database.query(statement),
      execute: async () => {
        throw new Error("Inspection attempted a write.");
      },
      transaction: async () => {
        throw new Error("Inspection attempted a write lease.");
      },
      exportPortable: () => database.exportPortable(),
      diagnostics: () => database.diagnostics(),
      withReadSnapshot: async <Result>(
        work: (snapshot: DatabaseReadSnapshot) => Promise<Result>,
      ) => {
        snapshots += 1;
        return work({
          query: (statement) => database.query(statement),
          exportPortable: () => database.exportPortable(),
        });
      },
    };
    expect(await createContactDeletionRepository(selected).inspect(target)).toEqual(
      result("original_present"),
    );
    expect(snapshots).toBe(1);
    expect(database.writes).toEqual([]);
  });
  it("deletes a reviewed legacy contact without inventing a manual receipt or changing other owners", async () => {
    const before = snapshot();
    const legacy = {
      ...target,
      contactId: entityId("contact", id(12)),
      expectedManualCreationOperationId: null,
    };
    expect(await port().inspect(legacy)).toEqual({
      ...result("original_present"),
      contactId: id(12),
    });
    expect(await port().remove(legacy)).toEqual({ ...result("deleted"), contactId: id(12) });
    expect(snapshot()).toEqual({
      ...before,
      contact: before["contact"]?.filter((row) => row["id"] !== id(12)),
    });
  });
});
