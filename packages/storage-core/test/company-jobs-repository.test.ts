import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import { createCompanyJobsQuery, type ListCompanyJobsInputV1 } from "@coredrill/application";
import { createCompanyJobsRepository } from "../src/company-jobs-repository.js";
import type {
  DatabasePort,
  DatabaseTransaction,
  QueryRow,
  SqlStatement,
} from "../src/database-port.js";

const root = path.resolve(import.meta.dirname, "../../..");
const migrations = readdirSync(path.join(root, "migrations"))
  .filter((name) => /^\d{4}_.*\.sql$/u.test(name))
  .sort();
const id = (n: number) => `0198e131-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = instant("2026-10-24T12:00:00.000Z"),
  later = instant("2026-10-25T12:00:00.000Z");
const context = { operationId: entityId("application-operation", id(90)), initiatedAt: later };
const request = {
  specVersion: 1 as const,
  expectedVaultId: id(1),
  companyId: id(2),
  expectedCompanyRowVersion: 1,
  limit: 10,
};
const literal = "\uFEFFSynthetic <script>literal</script>\0尾😀";
class CompanyDatabase implements DatabasePort {
  readonly connection = new DatabaseSync(":memory:");
  readonly statements: SqlStatement[] = [];
  transactions = 0;
  snapshots = 0;
  withReadSnapshot?: NonNullable<DatabasePort["withReadSnapshot"]>;
  corruptOverflow = false;
  constructor() {
    this.connection.exec("PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;");
    for (const name of migrations)
      this.connection.exec(readFileSync(path.join(root, "migrations", name), "utf8"));
  }
  async query<Row extends QueryRow = QueryRow>(statement: SqlStatement) {
    this.statements.push(statement);
    const rows = this.connection.prepare(statement.sql).all(...statement.parameters);
    if (this.corruptOverflow && statement.sql.includes("FROM job j"))
      rows[rows.length - 1]!["title_bytes"] = new Uint8Array([0x80]);
    return rows as Row[];
  }
  async execute(): Promise<never> {
    throw Error("A relationship read attempted a write");
  }
  async transaction<T>(work: (session: DatabaseTransaction) => Promise<T>) {
    this.transactions++;
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
  async exportPortable(): Promise<never> {
    throw Error("Not an archive test");
  }
  async diagnostics() {
    return {
      adapterName: "synthetic-company-jobs",
      health: "ready" as const,
      persistence: "memory" as const,
      readOnly: false,
      schemaVersion: migrations.length,
      details: [],
    };
  }
}

describe("actual SQLite company-linked saved jobs", () => {
  let db: CompanyDatabase;
  const run = (input: ListCompanyJobsInputV1 = request) =>
    createCompanyJobsQuery(createCompanyJobsRepository(db)).execute(input, context);
  const read = async (input: ListCompanyJobsInputV1 = request) => {
    const result = await run(input);
    if (!result.ok) throw Error(result.error.code);
    return result.value;
  };
  const insertJob = (n: number, company = id(2), archived: string | null = null) =>
    db.connection
      .prepare(
        "INSERT INTO job(id,company_id,title,description_text,current_status_id,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        id(n),
        company,
        n === 100 ? literal : `Synthetic role ${n}`,
        "PRIVATE description",
        id(4),
        archived,
        at,
        later,
      );
  beforeEach(() => {
    db = new CompanyDatabase();
    db.connection
      .prepare(
        "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,182,?,?)",
      )
      .run(id(1), "Synthetic vault", at, later);
    for (const n of [2, 3])
      db.connection
        .prepare(
          "INSERT INTO company(id,canonical_name,notes,created_at,updated_at) VALUES(?,?,?,?,?)",
        )
        .run(id(n), `Synthetic company ${n}`, "PRIVATE company notes", at, at);
    db.connection
      .prepare(
        "INSERT INTO status_definition(id,name,category,sort_order,terminal,created_at,updated_at) VALUES(?,?,'saved',1,0,?,?)",
      )
      .run(id(4), "\uFEFF  Literal saved  ", at, at);
    for (let n = 100; n < 126; n++) insertJob(n);
    insertJob(126, id(2), later);
    insertJob(200, id(3));
  });
  afterEach(() => db.connection.close());

  it("pages all26 equal-time active linked roles without bodies, totals, foreign or skipped rows", async () => {
    const before = db.connection.prepare("SELECT total_changes() AS n").get()!["n"];
    const first = await read(),
      second = await read({ ...request, after: first.nextCursor }),
      third = await read({ ...request, after: second.nextCursor });
    expect([first.items.length, second.items.length, third.items.length]).toEqual([10, 10, 6]);
    expect([...first.items, ...second.items, ...third.items].map((job) => job.id)).toEqual(
      Array.from({ length: 26 }, (_, n) => id(n + 100)),
    );
    expect(first.items[0]?.title).toBe(literal);
    expect(first.items[0]?.status?.name).toBe("\uFEFF  Literal saved  ");
    expect(third).toMatchObject({ hasMore: false, nextCursor: null });
    expect(JSON.stringify(first)).not.toMatch(/PRIVATE|description|total|notes/u);
    expect(db.statements.map((statement) => statement.sql).join(" ")).not.toMatch(
      /description_text|\bnotes\b|count\(|SELECT \*/iu,
    );
    expect(db.connection.prepare("SELECT total_changes() AS n").get()!["n"]).toBe(before);
    expect(db.transactions).toBe(3);
  });
  it("keeps company archival independent of job archival", async () => {
    expect((await read({ ...request, includeArchivedJobs: true, limit: 25 })).hasMore).toBe(true);
    db.connection
      .prepare("UPDATE company SET archived_at=?,updated_at=?,row_version=2 WHERE id=?")
      .run(later, later, id(2));
    expect(
      await run({ ...request, expectedCompanyRowVersion: 2, includeArchivedJobs: true }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    const first = await read({
      ...request,
      expectedCompanyRowVersion: 2,
      includeArchivedCompany: true,
      limit: 25,
    });
    expect(first.items).toHaveLength(25);
    const second = await read({
      ...request,
      expectedCompanyRowVersion: 2,
      includeArchivedCompany: true,
      limit: 25,
      after: first.nextCursor,
    });
    expect(second.items.map((job) => job.id)).toEqual([id(125)]);
    const all = await read({
      ...request,
      expectedCompanyRowVersion: 2,
      includeArchivedCompany: true,
      includeArchivedJobs: true,
      limit: 25,
    });
    const archived = await read({
      ...request,
      expectedCompanyRowVersion: 2,
      includeArchivedCompany: true,
      includeArchivedJobs: true,
      limit: 25,
      after: all.nextCursor,
    });
    expect(archived.items.map((job) => job.id)).toEqual([id(125), id(126)]);
  });
  it.each(["notes", "moved", "archived", "deleted", "clock"] as const)(
    "rejects changed continuation anchor %s",
    async (kind) => {
      const first = await read(),
        anchor = first.nextCursor!.jobId;
      if (kind === "deleted") db.connection.prepare("DELETE FROM job WHERE id=?").run(anchor);
      else if (kind === "moved")
        db.connection
          .prepare("UPDATE job SET company_id=?,row_version=row_version+1 WHERE id=?")
          .run(id(3), anchor);
      else if (kind === "archived")
        db.connection
          .prepare("UPDATE job SET archived_at=?,row_version=row_version+1 WHERE id=?")
          .run(later, anchor);
      else if (kind === "clock")
        db.connection
          .prepare("UPDATE job SET updated_at=?,row_version=row_version+1 WHERE id=?")
          .run(at, anchor);
      else
        db.connection
          .prepare(
            "UPDATE job SET description_text='New private text',row_version=row_version+1 WHERE id=?",
          )
          .run(anchor);
      expect(await run({ ...request, after: first.nextCursor })).toMatchObject({
        ok: false,
        error: { code: "conflict" },
      });
      expect((await read()).items).toHaveLength(10);
    },
  );
  it("rejects a stale viewed company even on the first page; refresh does not silently rebase", async () => {
    db.connection
      .prepare("UPDATE company SET notes='New private notes',row_version=2 WHERE id=?")
      .run(id(2));
    expect(await run()).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(await run({ ...request, expectedCompanyRowVersion: 2 })).toMatchObject({ ok: true });
  });
  it("returns missing owner for a foreign vault or missing company, distinct from zero linked roles", async () => {
    expect(await run({ ...request, expectedVaultId: id(8) })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(await run({ ...request, companyId: id(8) })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    db.connection.prepare("DELETE FROM job WHERE company_id=?").run(id(3));
    expect(await run({ ...request, companyId: id(3) })).toMatchObject({
      ok: true,
      value: { items: [], hasMore: false },
    });
  });
  it("preserves missing current status without inventing an application outcome", async () => {
    db.connection.prepare("UPDATE job SET current_status_id=NULL WHERE id=?").run(id(100));
    expect((await read()).items[0]?.status).toBeNull();
  });
  it("rejects corrupt overflow evidence rather than returning a plausible first page", async () => {
    db.corruptOverflow = true;
    expect(await run()).toMatchObject({ ok: false });
  });
  it("uses the selected read-only snapshot capability without falling back to a writable transaction", async () => {
    db.withReadSnapshot = async (work) => {
      db.snapshots++;
      db.connection.exec("BEGIN DEFERRED");
      try {
        const result = await work({
          query: (statement) => db.query(statement),
          exportPortable: () => db.exportPortable(),
        });
        db.connection.exec("COMMIT");
        return result;
      } catch (error) {
        db.connection.exec("ROLLBACK");
        throw error;
      }
    };
    expect((await read()).items).toHaveLength(10);
    expect(db.snapshots).toBe(1);
    expect(db.transactions).toBe(0);
  });
});
