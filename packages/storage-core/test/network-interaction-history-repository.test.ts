import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  createNetworkInteractionsQuery,
  createNetworkInteractionSummaryQuery,
  networkInteractionReferenceV1,
  type ListNetworkInteractionsInputV1,
} from "@coredrill/application";
import { createNetworkInteractionHistoryRepository } from "../src/network-interaction-history-repository.js";
import type {
  DatabasePort,
  DatabaseTransaction,
  QueryRow,
  SqlStatement,
} from "../src/database-port.js";
const root = path.resolve(import.meta.dirname, "../../.."),
  migrations = readdirSync(path.join(root, "migrations"))
    .filter((name) => /^\d{4}_.*\.sql$/u.test(name))
    .sort();
const id = (n: number) => `0198e157-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = instant("2026-10-24T12:00:00.000Z"),
  later = instant("2026-10-25T12:00:00.000Z"),
  future = instant("2027-01-01T00:00:00.000Z");
const context = { operationId: entityId("application-operation", id(90)), initiatedAt: later },
  request = { specVersion: 1 as const, expectedVaultId: id(1) };
const title = "\uFEFFJob <script>inert()</script>\0尾😀",
  companyName = "\uFEFFCompany\0尾😀",
  literal = "\uFEFF" + "a".repeat(1020) + "😀\0尾" + "z".repeat(17000) + "\uFEFF";
class HistoryDatabase implements DatabasePort {
  readonly connection = new DatabaseSync(":memory:");
  readonly statements: SqlStatement[] = [];
  largestBlob = 0;
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
    const rows = this.connection.prepare(statement.sql).all(...statement.parameters);
    for (const row of rows)
      for (const value of Object.values(row))
        if (value instanceof Uint8Array)
          this.largestBlob = Math.max(this.largestBlob, value.byteLength);
    return rows as Row[];
  }
  async execute(): Promise<never> {
    throw Error("History query attempted a write");
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
    throw Error("Not an archive action");
  }
  async diagnostics() {
    return {
      adapterName: "synthetic-network-history",
      health: "ready" as const,
      persistence: "memory" as const,
      readOnly: false,
      schemaVersion: migrations.length,
      details: [],
    };
  }
}
describe("actual SQLite top-level Network interaction history", () => {
  let db: HistoryDatabase;
  const run = (input: ListNetworkInteractionsInputV1 = request) =>
    createNetworkInteractionsQuery(createNetworkInteractionHistoryRepository(db)).execute(
      input,
      context,
    );
  const read = async (input: ListNetworkInteractionsInputV1 = request) => {
    const result = await run(input);
    if (!result.ok) throw Error(result.error.code);
    return result.value;
  };
  const add = (
    n: number,
    job = 100,
    contact: number | null = null,
    summary: string | Uint8Array = "Synthetic short summary",
    occurred = later,
  ) =>
    db.connection
      .prepare(
        "INSERT INTO interaction(id,job_id,contact_id,type,direction,summary,occurred_at,created_at,updated_at) VALUES(?,?,?,'note','unknown',CAST(? AS TEXT),?,?,?)",
      )
      .run(id(n), id(job), contact === null ? null : id(contact), summary, occurred, later, later);
  beforeEach(() => {
    db = new HistoryDatabase();
    db.connection
      .prepare(
        "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
      )
      .run(id(1), "Synthetic Network vault", migrations.length, at, later);
    for (const n of [2, 3, 4])
      db.connection
        .prepare(
          "INSERT INTO company(id,canonical_name,notes,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?)",
        )
        .run(
          id(n),
          n === 2 ? companyName : `Synthetic company ${n}`,
          "PRIVATE company notes",
          n === 4 ? later : null,
          at,
          later,
        );
    for (const [n, company, archived] of [
      [100, 2, false],
      [101, null, false],
      [102, 2, true],
      [103, 4, false],
      [104, 3, false],
    ] as const)
      db.connection
        .prepare(
          "INSERT INTO job(id,company_id,title,description_text,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          id(n),
          company === null ? null : id(company),
          title,
          "PRIVATE job body",
          archived ? later : null,
          at,
          later,
        );
    db.connection
      .prepare(
        "INSERT INTO contact(id,company_id,name,email,phone,notes,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        id(30),
        id(3),
        "PRIVATE contact name",
        "private@example.test",
        "PRIVATE phone",
        "PRIVATE contact notes",
        at,
        later,
      );
    for (let n = 1000; n < 1026; n++)
      add(
        n,
        n === 1001 ? 101 : n === 1002 ? 103 : 100,
        n % 2 === 0 ? 30 : null,
        n === 1000 ? literal : n === 1001 ? "" : "Synthetic short summary",
      );
    add(500, 100, null, "Synthetic future import", future);
    add(2000, 102);
    add(3000, 104);
  });
  afterEach(() => db.connection.close());
  it("pages the whole viewed vault with future/tied/job-only/archived-company metadata and no private preloads or writes", async () => {
    const before = db.connection.prepare("SELECT total_changes() AS n").get()?.["n"],
      first = await read(),
      second = await read({ ...request, after: first.nextCursor }),
      third = await read({ ...request, after: second.nextCursor });
    expect([first.items.length, second.items.length, third.items.length]).toEqual([10, 10, 8]);
    expect([...first.items, ...second.items, ...third.items].map((e) => e.id)).toEqual([
      id(500),
      ...Array.from({ length: 26 }, (_, n) => id(n + 1000)),
      id(3000),
    ]);
    expect(first.items[1]).toMatchObject({
      contactId: id(30),
      currentJob: { title, company: { name: companyName } },
      summaryTruncated: true,
    });
    expect(first.items[2]).toMatchObject({
      contactId: null,
      currentJob: { company: null },
      summaryPreview: "",
      summaryByteLength: 0,
      summaryTruncated: false,
    });
    expect(first.items[3]?.currentJob.company?.archivedAt).toBe(later);
    expect(JSON.stringify([first, second, third])).not.toMatch(
      /PRIVATE|private@example|description|notes|totals/u,
    );
    expect(db.statements.map((s) => s.sql).join(" ")).not.toMatch(
      /description_text|\bnotes\b|JOIN contact|\bemail\b|\bphone\b|SELECT \*|count\(/iu,
    );
    expect(db.largestBlob).toBeLessThanOrEqual(4097);
    expect(db.connection.prepare("SELECT total_changes() AS n").get()?.["n"]).toBe(before);
    expect(third).toMatchObject({ hasMore: false, nextCursor: null });
  });
  it("reconstructs the complete literal body by bounded scalar-safe parts, including an empty retained summary, read-only", async () => {
    const first = await read(),
      item = first.items.find((e) => e.id === id(1000));
    expect(item).toBeDefined();
    if (item === undefined) return;
    const reference = networkInteractionReferenceV1(first, item),
      query = createNetworkInteractionSummaryQuery(createNetworkInteractionHistoryRepository(db)),
      before = db.connection.prepare("SELECT total_changes() AS n").get()?.["n"];
    let offset = 0,
      value = "",
      parts = 0;
    while (parts++ < 30) {
      const result = await query.execute(
        {
          specVersion: 1,
          reference,
          summaryByteLength: item.summaryByteLength,
          byteOffset: offset,
          limitBytes: 1024,
        },
        context,
      );
      expect(result.ok).toBe(true);
      if (!result.ok) return;
      value += result.value.text;
      if (!result.value.hasMore) break;
      expect(result.value.nextByteOffset).toBeGreaterThan(offset);
      offset = result.value.nextByteOffset!;
    }
    expect(value).toBe(literal);
    expect(parts).toBeLessThan(30);
    const empty = first.items.find((e) => e.id === id(1001));
    if (empty === undefined) throw Error("Missing empty summary");
    expect(
      await query.execute(
        {
          specVersion: 1,
          reference: networkInteractionReferenceV1(first, empty),
          summaryByteLength: 0,
        },
        context,
      ),
    ).toMatchObject({ ok: true, value: { text: "", bytesRead: 0, hasMore: false } });
    expect(db.connection.prepare("SELECT total_changes() AS n").get()?.["n"]).toBe(before);
    expect(
      await query.execute(
        { specVersion: 1, reference, summaryByteLength: item.summaryByteLength + 1 },
        context,
      ),
    ).toMatchObject({ ok: false, error: { code: "conflict" } });
    expect(
      await query.execute(
        {
          specVersion: 1,
          reference,
          summaryByteLength: item.summaryByteLength,
          byteOffset: 1024,
          limitBytes: 4,
        },
        context,
      ),
    ).toMatchObject({ ok: false, error: { code: "internal" } });
  });
  it.each([
    "job-edit",
    "job-move",
    "job-archive",
    "company-edit",
    "company-archive",
    "company-delete",
    "contact-delete",
    "event-delete",
  ])("rejects changed canonical continuation and summary references: %s", async (change) => {
    const first = await read(),
      anchor = first.items.at(-1);
    if (anchor === undefined || first.nextCursor === null) throw Error("Missing cursor");
    if (change === "job-edit")
      db.connection.prepare("UPDATE job SET row_version=row_version+1 WHERE id=?").run(id(100));
    if (change === "job-move")
      db.connection
        .prepare("UPDATE job SET company_id=?,row_version=row_version+1 WHERE id=?")
        .run(id(3), id(100));
    if (change === "job-archive")
      db.connection
        .prepare("UPDATE job SET archived_at=?,row_version=row_version+1 WHERE id=?")
        .run(later, id(100));
    if (change === "company-edit")
      db.connection
        .prepare("UPDATE company SET canonical_name=?,row_version=row_version+1 WHERE id=?")
        .run("Synthetic renamed company", id(2));
    if (change === "company-archive")
      db.connection
        .prepare("UPDATE company SET archived_at=?,row_version=row_version+1 WHERE id=?")
        .run(later, id(2));
    if (change === "company-delete")
      db.connection.prepare("DELETE FROM company WHERE id=?").run(id(2));
    if (change === "contact-delete")
      db.connection.prepare("DELETE FROM contact WHERE id=?").run(id(30));
    if (change === "event-delete")
      db.connection.prepare("DELETE FROM interaction WHERE id=?").run(anchor.id);
    expect(await run({ ...request, after: first.nextCursor })).toMatchObject({
      ok: false,
      error: { code: "conflict", retryable: false },
    });
    expect(
      await createNetworkInteractionSummaryQuery(
        createNetworkInteractionHistoryRepository(db),
      ).execute(
        {
          specVersion: 1,
          reference: first.nextCursor,
          summaryByteLength: anchor.summaryByteLength,
        },
        context,
      ),
    ).toMatchObject({ ok: false, error: { code: "conflict" } });
    if (change === "contact-delete")
      expect((await read()).items.find((e) => e.id === anchor.id)?.contactId).toBeNull();
    if (change === "company-delete")
      expect((await read()).items.find((e) => e.id === anchor.id)?.currentJob.company).toBeNull();
  });
  it("treats appended records as live pages and keeps archived jobs explicit without filtering archived companies", async () => {
    const first = await read();
    add(400, 100, null, "Synthetic later same-time import", future);
    expect((await read()).items[0]?.id).toBe(id(400));
    expect((await read({ ...request, after: first.nextCursor })).items[0]?.id).toBe(id(1009));
    const all = await read({ ...request, includeArchivedJobs: true, limit: 25 }),
      last = await read({
        ...request,
        includeArchivedJobs: true,
        limit: 25,
        after: all.nextCursor,
      });
    expect(last.items.some((e) => e.id === id(2000))).toBe(true);
    expect(
      await run({ ...request, after: { ...first.nextCursor!, includeArchivedJobs: true } }),
    ).toMatchObject({ ok: false, error: { code: "validation" } });
  });
  it("distinguishes missing/foreign root from confirmed empty and rejects a corrupt lookahead summary", async () => {
    expect(await run({ ...request, expectedVaultId: id(9) })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    db.connection.exec("DELETE FROM interaction");
    expect((await read()).items).toEqual([]);
    add(7000, 100, null, "Valid first", future);
    add(7001, 100, null, new Uint8Array([0xff]), future);
    expect(await run({ ...request, limit: 1 })).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
  });
  it("rejects NUL-hidden oversized metadata/summary and malformed UTF-8 within bounded transport", async () => {
    db.connection
      .prepare("UPDATE company SET canonical_name=? WHERE id=?")
      .run("Valid\0" + "x".repeat(700000), id(2));
    expect(await run()).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(db.largestBlob).toBeLessThanOrEqual(4097);
    db.connection
      .prepare("UPDATE company SET canonical_name=CAST(? AS TEXT) WHERE id=?")
      .run(new Uint8Array([65, 0xff]), id(2));
    expect(await run()).toMatchObject({ ok: false, error: { code: "internal" } });
    db.connection.prepare("UPDATE company SET canonical_name=? WHERE id=?").run(companyName, id(2));
    add(400, 100, null, "Valid\0" + "x".repeat(800001), future);
    expect(await run()).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(db.largestBlob).toBeLessThanOrEqual(4097);
  });
  it("uses a single read snapshot and validates requests before opening it", async () => {
    db.withReadSnapshot = async (work) => {
      db.snapshots++;
      return work(db);
    };
    expect((await read()).items).toHaveLength(10);
    expect([db.snapshots, db.transactions]).toEqual([1, 0]);
    expect(await run({ ...request, limit: 26 })).toMatchObject({
      ok: false,
      error: { code: "validation" },
    });
    expect(db.snapshots).toBe(1);
  });
});
