import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import { createCompanySourcesQuery, type ListCompanySourcesInputV1 } from "@coredrill/application";
import { createCompanySourcesRepository } from "../src/company-sources-repository.js";
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
const id = (n: number) => `0198e151-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = instant("2026-10-24T12:00:00.000Z"),
  later = instant("2026-10-25T12:00:00.000Z"),
  future = instant("2027-01-01T00:00:00.000Z");
const context = { operationId: entityId("application-operation", id(90)), initiatedAt: later };
const request = {
  specVersion: 1 as const,
  expectedVaultId: id(1),
  companyId: id(2),
  expectedCompanyRowVersion: 1,
};
const literal = "\uFEFF<source>\0尾😀",
  literalUrl = "https://EXAMPLE.test:443/%7eRole?q=%2f";
class SourceDatabase implements DatabasePort {
  readonly connection = new DatabaseSync(":memory:");
  readonly statements: SqlStatement[] = [];
  transactions = 0;
  snapshots = 0;
  largestReturnedBlob = 0;
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
          this.largestReturnedBlob = Math.max(this.largestReturnedBlob, value.byteLength);
    return rows as Row[];
  }
  async execute(): Promise<never> {
    throw Error("Source read attempted a write");
  }
  async transaction<T>(work: (session: DatabaseTransaction) => Promise<T>) {
    this.transactions++;
    this.connection.exec("BEGIN IMMEDIATE");
    try {
      const value = await work(this);
      this.connection.exec("COMMIT");
      return value;
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
      adapterName: "synthetic-company-sources",
      health: "ready" as const,
      persistence: "memory" as const,
      readOnly: false,
      schemaVersion: migrations.length,
      details: [],
    };
  }
}
describe("actual SQLite company currently linked listing sources", () => {
  let db: SourceDatabase;
  const run = (input: ListCompanySourcesInputV1 = request) =>
    createCompanySourcesQuery(createCompanySourcesRepository(db)).execute(input, context);
  const read = async (input: ListCompanySourcesInputV1 = request) => {
    const result = await run(input);
    if (!result.ok) throw Error(result.error.code);
    return result.value;
  };
  const addSource = (n: number, job = 100, updated = later) =>
    db.connection
      .prepare(
        "INSERT INTO job_source(id,job_id,connector_id,external_id,canonical_url,apply_url,first_seen_at,last_seen_at,content_hash,is_primary,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)",
      )
      .run(
        id(n),
        id(job),
        null,
        n === 1000 ? literal : null,
        n === 1000 ? literalUrl : null,
        null,
        at,
        at,
        n === 1000 ? "a".repeat(64) : null,
        n === 1000 ? 1 : 0,
        at,
        updated,
      );
  const addSnapshot = (n: number, source = 1000, captured = at, created = later, hash = "b") =>
    db.connection
      .prepare(
        "INSERT INTO source_snapshot(id,job_source_id,captured_at,extractor_id,extractor_version,raw_text,sanitized_html,structured_json,content_hash,retention_class,created_at) VALUES(?,?,?,'synthetic.extractor','1.0.0',?,?,'{}',?,'synthetic',?)",
      )
      .run(
        id(n),
        id(source),
        captured,
        `PRIVATE retained ${"x".repeat(10000)}`,
        "PRIVATE retained HTML",
        hash.repeat(64),
        created,
      );
  beforeEach(() => {
    db = new SourceDatabase();
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
        .run(id(n), `Synthetic company ${n}`, "PRIVATE notes", at, at);
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
    for (let n = 1000; n < 1026; n++) addSource(n);
    addSource(2000, 101);
    addSource(3000, 102);
    addSnapshot(5000, 1000, at, future, "a");
    addSnapshot(5001, 1000, later, later, "b");
    addSnapshot(5002, 1000, later, later, "c");
  });
  afterEach(() => db.connection.close());
  it("pages26 equal-time sources including source-only rows, preserves literal URLs and excludes all private bodies", async () => {
    const before = db.connection.prepare("SELECT total_changes() AS n").get()?.["n"];
    const first = await read(),
      second = await read({ ...request, after: first.nextCursor }),
      third = await read({ ...request, after: second.nextCursor });
    expect([first.items.length, second.items.length, third.items.length]).toEqual([10, 10, 6]);
    expect([...first.items, ...second.items, ...third.items].map((source) => source.id)).toEqual(
      Array.from({ length: 26 }, (_, n) => id(n + 1000)),
    );
    expect(first.items[0]).toMatchObject({
      externalId: literal,
      currentJob: { title: literal },
      canonicalUrl: { text: literalUrl, href: "https://example.test/%7eRole?q=%2f" },
      contentHash: "a".repeat(64),
      latestSnapshot: { id: id(5001), contentHash: "b".repeat(64) },
    });
    expect(first.items[1]).toMatchObject({ canonicalUrl: null, latestSnapshot: null });
    expect(JSON.stringify(first)).not.toMatch(/PRIVATE|rawText|raw_text|description|notes|total/u);
    expect(db.statements.map((statement) => statement.sql).join(" ")).not.toMatch(
      /raw_text|sanitized_html|structured_json|description_text|\bnotes\b|\bemail\b|count\(|SELECT \*/iu,
    );
    expect(db.connection.prepare("SELECT total_changes() AS n").get()?.["n"]).toBe(before);
    expect(third).toMatchObject({ hasMore: false, nextCursor: null });
  });
  it("selects latest by captured time then ID and treats appended snapshots as live metadata without reordering sources", async () => {
    const first = await read();
    addSnapshot(5003, 1000, future, future, "d");
    expect((await read()).items[0]?.latestSnapshot).toMatchObject({
      id: id(5003),
      capturedAt: future,
    });
    expect((await read({ ...request, after: first.nextCursor })).items[0]?.id).toBe(id(1010));
    addSource(500, 100, future);
    expect((await read()).items[0]?.id).toBe(id(500));
  });
  it("distinguishes empty, absent/foreign and stale viewed companies", async () => {
    expect((await read({ ...request, companyId: id(4) })).items).toEqual([]);
    for (const change of [{ companyId: id(9) }, { expectedVaultId: id(9) }])
      expect(await run({ ...request, ...change })).toMatchObject({
        ok: false,
        error: { code: "not_found" },
      });
    expect(await run({ ...request, expectedCompanyRowVersion: 2 })).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
  });
  it.each([
    "edit-source",
    "move-source",
    "delete-source",
    "edit-job",
    "move-job",
    "archive-job",
    "delete-job",
  ])("invalidates the exact canonical source/job anchor after %s", async (action) => {
    const first = await read(),
      anchor = first.nextCursor;
    if (anchor === null) throw Error();
    if (action === "edit-source")
      db.connection
        .prepare("UPDATE job_source SET external_id='Edited',row_version=2 WHERE id=?")
        .run(anchor.sourceId);
    if (action === "move-source")
      db.connection
        .prepare("UPDATE job_source SET job_id=?,row_version=2 WHERE id=?")
        .run(id(101), anchor.sourceId);
    if (action === "delete-source")
      db.connection.prepare("DELETE FROM job_source WHERE id=?").run(anchor.sourceId);
    if (action === "edit-job")
      db.connection.prepare("UPDATE job SET title='Edited',row_version=2 WHERE id=?").run(id(100));
    if (action === "move-job")
      db.connection
        .prepare("UPDATE job SET company_id=?,row_version=2 WHERE id=?")
        .run(id(3), id(100));
    if (action === "archive-job")
      db.connection
        .prepare("UPDATE job SET archived_at=?,row_version=2 WHERE id=?")
        .run(later, id(100));
    if (action === "delete-job") db.connection.prepare("DELETE FROM job WHERE id=?").run(id(100));
    expect(await run({ ...request, after: anchor })).toMatchObject({
      ok: false,
      error: { code: "conflict", retryable: false },
    });
  });
  it("keeps archived-company and archived-job choices independent", async () => {
    db.connection
      .prepare("UPDATE company SET archived_at=?,updated_at=?,row_version=2 WHERE id=?")
      .run(later, later, id(2));
    expect(
      await run({ ...request, expectedCompanyRowVersion: 2, includeArchivedJobs: true }),
    ).toMatchObject({ ok: false, error: { code: "not_found" } });
    const owner = {
      ...request,
      expectedCompanyRowVersion: 2,
      includeArchivedCompany: true,
      limit: 25,
    };
    const active = await read(owner);
    expect((await read({ ...owner, after: active.nextCursor })).items).toHaveLength(1);
    const all = await read({ ...owner, includeArchivedJobs: true });
    expect(
      (await read({ ...owner, includeArchivedJobs: true, after: all.nextCursor })).items,
    ).toHaveLength(2);
  });
  it("rejects corrupt overflow URL data before returning an apparently valid page", async () => {
    db.connection
      .prepare("UPDATE job_source SET canonical_url='javascript:alert(1)' WHERE id=?")
      .run(id(1001));
    expect(await run({ ...request, limit: 1 })).toMatchObject({
      ok: false,
      error: { code: "internal", retryable: false },
    });
  });
  it("bounds metadata transport and rejects a NUL-hidden oversized value rather than truncating it", async () => {
    db.connection
      .prepare("UPDATE job_source SET external_id=? WHERE id=?")
      .run(`x\0${"PRIVATE".repeat(100000)}`, id(1000));
    expect(await run({ ...request, limit: 1 })).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
    expect(db.largestReturnedBlob).toBeLessThanOrEqual(4097);
  });
  it("rejects invalid UTF-8 metadata using fatal bounded decoding", async () => {
    db.connection
      .prepare("UPDATE job_source SET external_id=CAST(x'80' AS TEXT) WHERE id=?")
      .run(id(1000));
    expect(await run()).toMatchObject({ ok: false, error: { code: "internal" } });
  });
  it("uses the read snapshot capability without canonical writes", async () => {
    db.withReadSnapshot = async (work) => {
      db.snapshots++;
      return work({ query: db.query.bind(db), exportPortable: db.exportPortable.bind(db) });
    };
    expect((await read()).items).toHaveLength(10);
    expect(db.snapshots).toBe(1);
    expect(db.transactions).toBe(0);
  });
});
