import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  createCompanyOutcomesQueryV1,
  type ListCompanyOutcomesInputV1,
} from "@coredrill/application";
import { createCompanyOutcomesRepository } from "../src/company-outcomes-repository.js";
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
const id = (n: number) => `0198e153-0000-7000-8000-${String(n).padStart(12, "0")}`;
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
const literal = "\uFEFFJob <script>inert()</script>\0尾😀";
class OutcomeDatabase implements DatabasePort {
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
    throw Error("History read attempted a write");
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
      adapterName: "synthetic-company-outcomes",
      health: "ready" as const,
      persistence: "memory" as const,
      readOnly: false,
      schemaVersion: migrations.length,
      details: [],
    };
  }
}
describe("actual SQLite company recorded stage and outcome history", () => {
  let db: OutcomeDatabase;
  const run = (input: ListCompanyOutcomesInputV1 = request) =>
    createCompanyOutcomesQueryV1(createCompanyOutcomesRepository(db)).execute(input, context);
  const read = async (input: ListCompanyOutcomesInputV1 = request) => {
    const result = await run(input);
    if (!result.ok) throw Error(result.error.code);
    return result.value;
  };
  const addEvent = (
    n: number,
    job = 100,
    application: number | null = null,
    from: number | null = 40,
    to = 41,
    occurred = later,
  ) =>
    db.connection
      .prepare(
        "INSERT INTO status_event(id,job_id,application_id,from_status_id,to_status_id,occurred_at,note,created_at) VALUES(?,?,?,?,?,?,?,?)",
      )
      .run(
        id(n),
        id(job),
        application === null ? null : id(application),
        from === null ? null : id(from),
        id(to),
        occurred,
        "PRIVATE event notes",
        later,
      );
  const addUndo = (n = 5000, event = 1009, job = 100, application: number | null = null) =>
    db.connection
      .prepare(
        "INSERT INTO mutation_undo_token(id,kind,job_id,status_application_id,status_event_id,previous_status_id,expected_status_id,expected_application_row_version,expected_job_row_version,created_at) VALUES(?,'status_change',?,?,?,?,?,?,?,?)",
      )
      .run(
        id(n),
        id(job),
        application === null ? null : id(application),
        id(event),
        id(40),
        id(41),
        application === null ? null : 1,
        1,
        later,
      );
  beforeEach(() => {
    db = new OutcomeDatabase();
    db.connection
      .prepare(
        "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
      )
      .run(id(1), "Synthetic history vault", migrations.length, at, later);
    for (const n of [2, 3, 4])
      db.connection
        .prepare(
          "INSERT INTO company(id,canonical_name,notes,created_at,updated_at) VALUES(?,?,?,?,?)",
        )
        .run(id(n), `Synthetic company ${n}`, "PRIVATE company notes", at, later);
    for (const [n, company, archived] of [
      [100, 2, false],
      [101, 3, false],
      [102, 2, true],
    ] as const)
      db.connection
        .prepare(
          "INSERT INTO job(id,company_id,title,description_text,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(id(n), id(company), literal, "PRIVATE job body", archived ? later : null, at, later);
    for (const [n, name, category, terminal] of [
      [40, "Synthetic active <script> 😀", "saved", 0],
      [41, "Synthetic rejection", "rejected", 1],
      [42, "Synthetic reopened", "preparing", 0],
    ] as const)
      db.connection
        .prepare(
          "INSERT INTO status_definition(id,name,category,sort_order,terminal,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(id(n), name, category, n, terminal, at, later);
    for (const [n, job, archived] of [
      [300, 100, true],
      [301, 101, false],
    ] as const)
      db.connection
        .prepare(
          "INSERT INTO application(id,job_id,current_status_id,notes,archived_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?)",
        )
        .run(
          id(n),
          id(job),
          id(41),
          "PRIVATE application notes",
          archived ? later : null,
          at,
          later,
        );
    for (let n = 1000; n < 1026; n++)
      addEvent(n, 100, n === 1000 ? 300 : null, n === 1001 ? null : 40);
    addEvent(2000, 101);
    addEvent(3000, 102);
    addUndo();
  });
  afterEach(() => db.connection.close());
  it("reads26 ordered transitions including job-only and archived-application history without private data or writes", async () => {
    const before = db.connection.prepare("SELECT total_changes() AS n").get()?.["n"];
    const first = await read(),
      second = await read({ ...request, after: first.nextCursor }),
      third = await read({ ...request, after: second.nextCursor });
    expect([first.items.length, second.items.length, third.items.length]).toEqual([10, 10, 6]);
    expect([...first.items, ...second.items, ...third.items].map((e) => e.id)).toEqual(
      Array.from({ length: 26 }, (_, n) => id(1000 + n)),
    );
    expect(first.items[0]).toMatchObject({
      currentJob: { title: literal },
      application: { id: id(300), archivedAt: later },
      toStatus: { category: "rejected", terminal: true },
    });
    expect(first.items[1]).toMatchObject({ application: null, fromStatus: null });
    expect(first.items[9]).toMatchObject({ undo: { id: id(5000), consumedAt: null } });
    expect(JSON.stringify([first, second, third])).not.toMatch(
      /PRIVATE|notes|description|total|probability/u,
    );
    expect(db.statements.map((s) => s.sql).join(" ")).not.toMatch(
      /\be\.note\b|\bnotes\b|description_text|raw_text|\bemail\b|SELECT \*|count\(/iu,
    );
    expect(db.connection.prepare("SELECT total_changes() AS n").get()?.["n"]).toBe(before);
  });
  it("retains current definitions, reopening and consumed undo separately while invalidating older anchor metadata", async () => {
    const first = await read();
    db.connection
      .prepare("UPDATE mutation_undo_token SET consumed_at=?,row_version=row_version+1 WHERE id=?")
      .run(later, id(5000));
    expect(await run({ ...request, after: first.nextCursor })).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
    addEvent(7000, 100, null, 41, 42, future);
    const current = await read();
    expect(current.items[0]).toMatchObject({
      id: id(7000),
      occurredAt: future,
      fromStatus: { terminal: true },
      toStatus: { terminal: false },
    });
    expect(
      (await read({ ...request, limit: 25 })).items.find((e) => e.id === id(1009))?.undo
        ?.consumedAt,
    ).toBe(later);
    db.connection
      .prepare(
        "UPDATE status_definition SET name=?,category='withdrawn',row_version=row_version+1 WHERE id=?",
      )
      .run("Synthetic reclassified current definition", id(41));
    expect((await read()).items[1]?.toStatus).toMatchObject({
      name: "Synthetic reclassified current definition",
      category: "withdrawn",
      rowVersion: 2,
    });
  });
  it.each(["job-edit", "job-move", "job-archive", "stage-edit", "from-stage-edit", "undo-consume"])(
    "rejects a changed canonical cursor: %s",
    async (change) => {
      const first = await read();
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
      if (change === "stage-edit" || change === "from-stage-edit")
        db.connection
          .prepare("UPDATE status_definition SET row_version=row_version+1 WHERE id=?")
          .run(id(change === "stage-edit" ? 41 : 40));
      if (change === "undo-consume")
        db.connection
          .prepare(
            "UPDATE mutation_undo_token SET consumed_at=?,row_version=row_version+1 WHERE id=?",
          )
          .run(later, id(5000));
      expect(await run({ ...request, after: first.nextCursor })).toMatchObject({
        ok: false,
        error: { code: "conflict", retryable: false },
      });
    },
  );
  it("invalidates a referenced archived application's revision and does not hide archived stage definitions", async () => {
    const first = await read({ ...request, limit: 1 });
    db.connection
      .prepare("UPDATE application SET row_version=row_version+1 WHERE id=?")
      .run(id(300));
    expect(await run({ ...request, limit: 1, after: first.nextCursor })).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
    db.connection
      .prepare("UPDATE status_definition SET archived_at=?,row_version=row_version+1 WHERE id=?")
      .run(later, id(41));
    expect((await read()).items[0]?.toStatus.archivedAt).toBe(later);
  });
  it("distinguishes empty/absent/stale owners and independent company/job archive choices", async () => {
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
    expect((await read({ ...request, includeArchivedJobs: true, limit: 25 })).hasMore).toBe(true);
    const first = await read({ ...request, includeArchivedJobs: true, limit: 25 });
    expect(
      (
        await read({ ...request, includeArchivedJobs: true, limit: 25, after: first.nextCursor })
      ).items.map((e) => e.id),
    ).toEqual([id(1025), id(3000)]);
    db.connection
      .prepare("UPDATE company SET archived_at=?,row_version=2 WHERE id=?")
      .run(later, id(2));
    expect(await run({ ...request, expectedCompanyRowVersion: 2 })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(
      (
        await read({
          ...request,
          expectedCompanyRowVersion: 2,
          includeArchivedCompany: true,
          includeArchivedJobs: true,
        })
      ).items,
    ).toHaveLength(10);
  });
  it("rejects an application from a different job even on the lookahead row", async () => {
    addEvent(6999, 100, null, 40, 41, future);
    addEvent(7000, 100, 301, 40, 41, future);
    expect(await run({ ...request, limit: 1 })).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
  });
  it("rejects an undo token whose job/application/stage chain does not match the event", async () => {
    addUndo(5001, 1000, 101, 300);
    expect(await run()).toMatchObject({ ok: false, error: { code: "internal" } });
  });
  it("rejects oversized NUL-hidden and malformed UTF-8 metadata within bounded transport", async () => {
    db.connection
      .prepare("UPDATE job SET title=? WHERE id=?")
      .run("Valid\0" + "x".repeat(700000), id(100));
    expect(await run()).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(db.largestBlob).toBeLessThanOrEqual(4097);
    db.connection
      .prepare("UPDATE job SET title=CAST(? AS TEXT) WHERE id=?")
      .run(new Uint8Array([65, 0xff]), id(100));
    expect(await run()).toMatchObject({ ok: false, error: { code: "internal" } });
  });
  it("prefers a single read-snapshot lease and rejects invalid requests before opening it", async () => {
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
