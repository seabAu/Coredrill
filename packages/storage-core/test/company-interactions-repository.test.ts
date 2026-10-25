import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  companyInteractionReferenceV1,
  createCompanyInteractionsQuery,
  createCompanyInteractionSummaryQuery,
  type ListCompanyInteractionsInputV1,
} from "@coredrill/application";
import { createCompanyInteractionsRepository } from "../src/company-interactions-repository.js";
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
const id = (n: number) => `0198e141-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = instant("2026-10-24T12:00:00.000Z"),
  later = instant("2026-10-25T12:00:00.000Z");
const context = { operationId: entityId("application-operation", id(90)), initiatedAt: later };
const request = {
  specVersion: 1 as const,
  expectedVaultId: id(1),
  companyId: id(2),
  expectedCompanyRowVersion: 1,
};
const literal = "\uFEFF<script>inert</script>\0尾😀";
class HistoryDatabase implements DatabasePort {
  readonly connection = new DatabaseSync(":memory:");
  readonly statements: SqlStatement[] = [];
  transactions = 0;
  snapshots = 0;
  withReadSnapshot?: NonNullable<DatabasePort["withReadSnapshot"]>;
  constructor() {
    this.connection.exec("PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;");
    for (const name of migrations)
      this.connection.exec(readFileSync(path.join(root, "migrations", name), "utf8"));
  }
  async query<Row extends QueryRow = QueryRow>(statement: SqlStatement) {
    this.statements.push(statement);
    return this.connection.prepare(statement.sql).all(...statement.parameters) as Row[];
  }
  async execute(): Promise<never> {
    throw Error("Read attempted a write");
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
    throw Error("Not an archive operation");
  }
  async diagnostics() {
    return {
      adapterName: "synthetic-company-history",
      health: "ready" as const,
      persistence: "memory" as const,
      readOnly: false,
      schemaVersion: migrations.length,
      details: [],
    };
  }
}

describe("actual SQLite current-company interaction history", () => {
  let db: HistoryDatabase;
  const run = (input: ListCompanyInteractionsInputV1 = request) =>
    createCompanyInteractionsQuery(createCompanyInteractionsRepository(db)).execute(input, context);
  const read = async (input: ListCompanyInteractionsInputV1 = request) => {
    const result = await run(input);
    if (!result.ok) throw Error(result.error.code);
    return result.value;
  };
  const summary = (
    reference: Parameters<ReturnType<typeof createCompanyInteractionSummaryQuery>["execute"]>[0],
  ) =>
    createCompanyInteractionSummaryQuery(createCompanyInteractionsRepository(db)).execute(
      reference,
      context,
    );
  const add = (
    n: number,
    job = 100,
    contact: number | null = null,
    body = literal,
    occurred = at,
    created = later,
  ) =>
    db.connection
      .prepare(
        "INSERT INTO interaction(id,job_id,contact_id,type,direction,summary,occurred_at,created_at,updated_at) VALUES(?,?,?,'note','unknown',?,?,?,?)",
      )
      .run(id(n), id(job), contact === null ? null : id(contact), body, occurred, created, created);
  beforeEach(() => {
    db = new HistoryDatabase();
    db.connection
      .prepare(
        "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,182,?,?)",
      )
      .run(id(1), "Synthetic vault", at, later);
    for (const n of [2, 3, 4])
      db.connection
        .prepare(
          "INSERT INTO company(id,canonical_name,notes,created_at,updated_at) VALUES(?,?,?,?,?)",
        )
        .run(id(n), `Synthetic company ${n}`, "PRIVATE company notes", at, at);
    for (const [n, company] of [
      [6, 3],
      [7, 2],
    ])
      db.connection
        .prepare(
          "INSERT INTO contact(id,company_id,name,email,notes,user_confirmed,created_at,updated_at) VALUES(?,?,?,?,?,1,?,?)",
        )
        .run(
          id(n!),
          id(company!),
          "PRIVATE contact name",
          "private@example.test",
          "PRIVATE contact notes",
          at,
          at,
        );
    for (const [n, company, archived] of [
      [100, 2, false],
      [101, 3, false],
      [102, 2, true],
    ])
      db.connection
        .prepare(
          "INSERT INTO job(id,company_id,title,description_text,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          id(Number(n)),
          id(Number(company)),
          literal,
          "PRIVATE job body",
          archived ? later : null,
          at,
          later,
        );
    for (let n = 1000; n < 1026; n++) add(n, 100, n % 2 === 0 ? 6 : null);
    add(2000, 101, 7);
    add(3000, 102, 6);
  });
  afterEach(() => db.connection.close());

  it("pages26 equal-time records by actual job membership, not contact employment, without writes or private overfetch", async () => {
    const before = db.connection.prepare("SELECT total_changes() AS n").get()?.["n"];
    const first = await read(),
      second = await read({ ...request, after: first.nextCursor }),
      third = await read({ ...request, after: second.nextCursor });
    expect([first.items.length, second.items.length, third.items.length]).toEqual([10, 10, 6]);
    expect([...first.items, ...second.items, ...third.items].map((item) => item.id)).toEqual(
      Array.from({ length: 26 }, (_, n) => id(n + 1000)),
    );
    expect(first.items[0]).toMatchObject({
      contactId: id(6),
      summaryPreview: literal,
      currentJob: { title: literal, companyId: id(2) },
    });
    expect(first.items[1]?.contactId).toBeNull();
    expect(JSON.stringify(first)).not.toMatch(/PRIVATE|private@example|total|notes|description/u);
    expect(db.statements.map((statement) => statement.sql).join(" ")).not.toMatch(
      /\bemail\b|\bphone\b|\bnotes\b|description_text|count\(|SELECT \*/iu,
    );
    expect(db.connection.prepare("SELECT total_changes() AS n").get()?.["n"]).toBe(before);
    expect(third).toMatchObject({ hasMore: false, nextCursor: null });
  });
  it("keeps archived company and linked-job choices independent", async () => {
    expect((await read({ ...request, limit: 25, includeArchivedJobs: true })).hasMore).toBe(true);
    db.connection
      .prepare("UPDATE company SET archived_at=?,updated_at=?,row_version=2 WHERE id=?")
      .run(later, later, id(2));
    expect(await run({ ...request, expectedCompanyRowVersion: 2 })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    const first = await read({
      ...request,
      expectedCompanyRowVersion: 2,
      includeArchivedCompany: true,
      limit: 25,
    });
    expect(
      (
        await read({
          ...request,
          expectedCompanyRowVersion: 2,
          includeArchivedCompany: true,
          after: first.nextCursor,
        })
      ).items,
    ).toHaveLength(1);
    const all = await read({
      ...request,
      expectedCompanyRowVersion: 2,
      includeArchivedCompany: true,
      includeArchivedJobs: true,
      limit: 25,
    });
    expect(
      (
        await read({
          ...request,
          expectedCompanyRowVersion: 2,
          includeArchivedCompany: true,
          includeArchivedJobs: true,
          after: all.nextCursor,
        })
      ).items,
    ).toHaveLength(2);
  });
  it("distinguishes empty company, missing/foreign vault and obsolete viewed company", async () => {
    expect((await read({ ...request, companyId: id(4) })).items).toEqual([]);
    for (const change of [{ companyId: id(9) }, { expectedVaultId: id(9) }])
      expect(await run({ ...request, ...change })).toMatchObject({
        ok: false,
        error: { code: "not_found" },
      });
    expect(await run({ ...request, expectedCompanyRowVersion: 2 })).toMatchObject({
      ok: false,
      error: { code: "conflict", retryable: false },
    });
  });
  it.each(["move", "edit", "archive", "delete"])(
    "invalidates canonical anchor after job %s",
    async (action) => {
      const first = await read();
      if (action === "move")
        db.connection
          .prepare("UPDATE job SET company_id=?,row_version=2 WHERE id=?")
          .run(id(3), id(100));
      if (action === "edit")
        db.connection
          .prepare("UPDATE job SET title='Edited',row_version=2 WHERE id=?")
          .run(id(100));
      if (action === "archive")
        db.connection
          .prepare("UPDATE job SET archived_at=?,row_version=2 WHERE id=?")
          .run(later, id(100));
      if (action === "delete") db.connection.prepare("DELETE FROM job WHERE id=?").run(id(100));
      expect(await run({ ...request, after: first.nextCursor })).toMatchObject({
        ok: false,
        error: { code: "conflict", retryable: false },
      });
    },
  );
  it("preserves detached and archived-contact history while rejecting obsolete contact-aware references", async () => {
    const first = await read({ ...request, limit: 1 });
    const ref = first.nextCursor;
    if (ref === null) throw Error();
    db.connection
      .prepare("UPDATE contact SET archived_at=?,updated_at=?,row_version=2 WHERE id=?")
      .run(later, later, id(6));
    expect((await read({ ...request, limit: 1 })).items[0]?.contactId).toBe(id(6));
    db.connection.prepare("DELETE FROM contact WHERE id=?").run(id(6));
    expect(await run({ ...request, limit: 1, after: ref })).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
    expect(
      await summary({
        specVersion: 1,
        reference: ref,
        summaryByteLength: first.items[0]!.summaryByteLength,
      }),
    ).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect((await read({ ...request, limit: 1 })).items[0]).toMatchObject({
      contactId: null,
      summaryPreview: literal,
      rowVersion: 1,
    });
  });
  it("reconstructs a long literal summary across UTF-8 scalar/BOM/NUL boundaries with bounded slices", async () => {
    const body = `\uFEFF${"a".repeat(1020)}😀\0尾${"x".repeat(17_000)}\uFEFF`;
    add(500, 100, null, body, later, later);
    const first = await read(),
      record = first.items[0];
    if (record === undefined) throw Error();
    expect(record.summaryTruncated).toBe(true);
    expect(record.summaryPreview).toBe(`\uFEFF${"a".repeat(1020)}`);
    const reference = companyInteractionReferenceV1(first, record);
    let offset = 0,
      reconstructed = "",
      parts = 0;
    do {
      const result = await summary({
        specVersion: 1,
        reference,
        summaryByteLength: record.summaryByteLength,
        byteOffset: offset,
        limitBytes: 1024,
      });
      if (!result.ok) throw Error(result.error.code);
      reconstructed += result.value.text;
      parts++;
      offset = result.value.nextByteOffset ?? record.summaryByteLength;
    } while (offset < record.summaryByteLength);
    expect(parts).toBeGreaterThan(10);
    expect(reconstructed).toBe(body);
    expect(
      await summary({ specVersion: 1, reference, summaryByteLength: record.summaryByteLength + 1 }),
    ).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(
      await summary({
        specVersion: 1,
        reference,
        summaryByteLength: record.summaryByteLength,
        byteOffset: 1024,
      }),
    ).toMatchObject({ ok: false, error: { code: "internal" } });
  });
  it("reads retained empty summaries and preserves valid future-dated imported history without a wall-clock ceiling", async () => {
    const future = instant("2027-01-01T12:00:00.000Z");
    add(500, 100, null, "", future, future);
    const first = await read(),
      record = first.items[0];
    if (record === undefined) throw Error();
    expect(record).toMatchObject({
      id: id(500),
      summaryPreview: "",
      summaryTruncated: false,
      summaryByteLength: 0,
    });
    expect(
      await summary({
        specVersion: 1,
        reference: companyInteractionReferenceV1(first, record),
        summaryByteLength: 0,
      }),
    ).toMatchObject({ ok: true, value: { text: "", bytesRead: 0, hasMore: false } });
  });
  it("validates even corrupt lookahead bytes rather than reporting an apparently valid first page", async () => {
    db.connection
      .prepare(
        "INSERT INTO interaction(id,job_id,type,direction,summary,occurred_at,created_at,updated_at) VALUES(?,?,'note','unknown',CAST(x'80' AS TEXT),?,?,?)",
      )
      .run(id(10001), id(100), later, later, later);
    // One valid row sorts before the corrupt lookahead, independent of all older rows.
    add(10000, 100, null, literal, later, later);
    expect(await run({ ...request, limit: 1 })).toMatchObject({
      ok: false,
      error: { code: "internal", retryable: false },
    });
  });
  it("uses the read snapshot capability for owner, anchor and bounded summary without write calls", async () => {
    db.withReadSnapshot = async (work) => {
      db.snapshots++;
      return work({ query: db.query.bind(db), exportPortable: db.exportPortable.bind(db) });
    };
    const first = await read(),
      record = first.items[0];
    if (record === undefined) throw Error();
    expect(
      await summary({
        specVersion: 1,
        reference: companyInteractionReferenceV1(first, record),
        summaryByteLength: record.summaryByteLength,
      }),
    ).toMatchObject({ ok: true });
    expect(db.snapshots).toBe(2);
    expect(db.transactions).toBe(0);
  });
});
