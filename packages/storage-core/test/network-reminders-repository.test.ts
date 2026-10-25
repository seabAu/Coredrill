import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { entityId, instant } from "@coredrill/domain";
import {
  createNetworkRemindersQuery,
  type ListNetworkRemindersInputV1,
  type NetworkReminderReferenceV1,
} from "@coredrill/application";
import { createNetworkRemindersRepository } from "../src/network-reminders-repository.js";
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
const id = (n: number) => `0198e159-0000-7000-8000-${String(n).padStart(12, "0")}`;
const at = instant("2026-10-24T12:00:00.000Z"),
  later = instant("2026-10-25T12:00:00.000Z"),
  future = instant("2027-01-01T00:00:00.000Z");
const context = { operationId: entityId("application-operation", id(90)), initiatedAt: later },
  request = { specVersion: 1 as const, expectedVaultId: id(1) };
const literal = "\uFEFFLiteral <script>inert()</script>\0尾😀";
class ReminderDatabase implements DatabasePort {
  readonly connection = new DatabaseSync(":memory:");
  readonly statements: SqlStatement[] = [];
  largestBlob = 0;
  transactions = 0;
  withReadSnapshot?: NonNullable<DatabasePort["withReadSnapshot"]>;
  constructor() {
    this.connection.exec("PRAGMA foreign_keys=ON; PRAGMA trusted_schema=OFF;");
    for (const name of migrations)
      this.connection.exec(readFileSync(path.join(root, "migrations", name), "utf8"));
  }
  async query<Row extends QueryRow = QueryRow>(statement: SqlStatement) {
    expect(statement.sql.trimStart().startsWith("SELECT ")).toBe(true);
    this.statements.push(statement);
    const rows = this.connection.prepare(statement.sql).all(...statement.parameters);
    for (const row of rows)
      for (const value of Object.values(row))
        if (value instanceof Uint8Array)
          this.largestBlob = Math.max(this.largestBlob, value.byteLength);
    return rows as Row[];
  }
  async execute(): Promise<never> {
    throw Error("Reminder read attempted a write");
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
    throw Error("Not an export operation");
  }
  async diagnostics() {
    return {
      adapterName: "synthetic-reminders",
      health: "ready" as const,
      persistence: "memory" as const,
      readOnly: false,
      schemaVersion: migrations.length,
      details: [],
    };
  }
  witness() {
    return JSON.stringify(
      ["vault", "company", "job", "application", "next_action", "interview", "reminder"].map(
        (name) => this.connection.prepare(`SELECT * FROM ${name} ORDER BY id`).all(),
      ),
    );
  }
}
describe("actual SQLite original-vault pending Network reminders", () => {
  let db: ReminderDatabase;
  const run = (input: ListNetworkRemindersInputV1 = request) =>
    createNetworkRemindersQuery(createNetworkRemindersRepository(db)).execute(input, context);
  const read = async (input: ListNetworkRemindersInputV1 = request) => {
    const result = await run(input);
    if (!result.ok) throw Error(result.error.code);
    return result.value;
  };
  const add = (
    n: number,
    job = 100,
    task: number | null = 200,
    interview: number | null = 300,
    state = "pending",
    remindAt = future,
  ) =>
    db.connection
      .prepare(
        "INSERT INTO reminder(id,job_id,next_action_id,interview_id,remind_at,timezone,state,note,fired_at,created_at,updated_at) VALUES(?,?,?,?,?,'America/New_York',?,'PRIVATE reminder note',?,?,?)",
      )
      .run(
        id(n),
        id(job),
        task === null ? null : id(task),
        interview === null ? null : id(interview),
        remindAt,
        state,
        state === "fired" ? later : null,
        at,
        later,
      );
  beforeEach(() => {
    db = new ReminderDatabase();
    db.connection
      .prepare(
        "INSERT INTO vault(id,name,schema_version,created_at,last_opened_at) VALUES(?,?,?,?,?)",
      )
      .run(id(1), "Synthetic reminder vault", migrations.length, at, later);
    for (const n of [2, 3])
      db.connection
        .prepare(
          "INSERT INTO company(id,canonical_name,notes,archived_at,created_at,updated_at) VALUES(?,?,'PRIVATE company notes',?,?,?)",
        )
        .run(id(n), literal, n === 2 ? later : null, at, later);
    for (const [n, company, archived] of [
      [100, 2, false],
      [101, null, false],
      [102, 2, true],
      [103, 3, false],
    ] as const)
      db.connection
        .prepare(
          "INSERT INTO job(id,company_id,title,description_text,archived_at,created_at,updated_at) VALUES(?,?,?,'PRIVATE job body',?,?,?)",
        )
        .run(
          id(n),
          company === null ? null : id(company),
          literal,
          archived ? later : null,
          at,
          later,
        );
    db.connection
      .prepare(
        "INSERT INTO status_definition(id,name,category,sort_order,terminal,created_at,updated_at) VALUES(?,'Synthetic saved','saved',900,0,?,?)",
      )
      .run(id(500), at, later);
    for (const [n, job] of [
      [5000, 100],
      [5001, 103],
    ] as const)
      db.connection
        .prepare(
          "INSERT INTO application(id,job_id,current_status_id,notes,created_at,updated_at) VALUES(?,?,?,'PRIVATE application notes',?,?)",
        )
        .run(id(n), id(job), id(500), at, later);
    for (const [n, job, scheduled, completed] of [
      [200, 100, true, false],
      [201, 103, true, false],
      [202, 100, false, false],
      [203, 100, true, true],
    ] as const)
      db.connection
        .prepare(
          "INSERT INTO next_action(id,job_id,title,due_at,timezone,state,completed_at,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?)",
        )
        .run(
          id(n),
          id(job),
          literal,
          scheduled ? future : null,
          scheduled ? "America/New_York" : null,
          completed ? "completed" : "pending",
          completed ? later : null,
          at,
          later,
        );
    for (const [n, application] of [
      [300, 5000],
      [301, 5001],
    ] as const)
      db.connection
        .prepare(
          "INSERT INTO interview(id,application_id,stage_name,starts_at,timezone,duration_minutes,location_or_url,preparation_notes,outcome,created_at,updated_at) VALUES(?,?,?,?,'America/New_York',60,'PRIVATE location','PRIVATE preparation','PRIVATE outcome',?,?)",
        )
        .run(id(n), id(application), literal, future, at, later);
    for (let n = 1000; n < 1027; n++) add(n);
    add(1100, 101, null, null);
    add(1200, 102, null, null);
    add(1300, 103, 201, 301);
    add(1400, 100, 200, 300, "fired");
    add(1401, 100, 200, 300, "dismissed");
  });
  afterEach(() => db.connection.close());
  it("pages actual equal-time pending rows, preserves nullable links/future alerts and current archived-company context", async () => {
    const before = db.witness(),
      all: string[] = [];
    let after: NetworkReminderReferenceV1 | null = null;
    do {
      const value = await read({ ...request, limit: 10, after });
      all.push(...value.items.map((item) => item.id));
      after = value.nextCursor;
    } while (after !== null);
    expect(all).toEqual([
      ...Array.from({ length: 27 }, (_, n) => id(1000 + n)),
      id(1100),
      id(1300),
    ]);
    const first = (await read()).items[0]!;
    expect(first).toMatchObject({
      remindAt: future,
      currentJob: { title: literal, company: { name: literal, archivedAt: later } },
      nextAction: { title: literal, dueAt: future, jobId: id(100) },
      interview: {
        stageName: literal,
        startsAt: future,
        application: { id: id(5000), jobId: id(100) },
      },
    });
    expect(db.witness()).toBe(before);
    expect(JSON.stringify(first)).not.toContain("PRIVATE");
    const sql = db.statements.map((statement) => statement.sql).join("\n");
    expect(sql).not.toMatch(
      /r\.note|preparation_notes|location_or_url|contact_ids_json|\.description_text|\.notes|i\.outcome|\bcontact\b/iu,
    );
  });
  it("separates pending vs fired/dismissed and explicit archived-job inclusion", async () => {
    const included = await read({ ...request, limit: 25, includeArchivedJobs: true });
    const next = await read({
      ...request,
      limit: 25,
      includeArchivedJobs: true,
      after: included.nextCursor,
    });
    expect(next.items.map((item) => item.id)).toEqual([
      id(1025),
      id(1026),
      id(1100),
      id(1200),
      id(1300),
    ]);
    expect(next.items.find((item) => item.id === id(1200))?.currentJob.archivedAt).toBe(later);
    expect(next.items.find((item) => item.id === id(1100))).toMatchObject({
      nextAction: null,
      interview: null,
      currentJob: { company: null },
    });
  });
  it("retains unscheduled/terminal linked task facts without changing task or interview time", async () => {
    add(900, 100, 202, null, "pending", at);
    add(901, 100, 203, null, "pending", at);
    const before = db.witness(),
      value = await read();
    expect(value.items[0]?.nextAction).toMatchObject({
      dueAt: null,
      timeZone: null,
      state: "pending",
    });
    expect(value.items[1]?.nextAction).toMatchObject({ state: "completed", dueAt: future });
    expect(db.witness()).toBe(before);
  });
  it("distinguishes foreign/missing physical roots from confirmed empty pending scope", async () => {
    expect(await run({ ...request, expectedVaultId: id(9) })).toMatchObject({
      ok: false,
      error: { code: "not_found" },
    });
    expect(db.statements).toHaveLength(1);
    db.connection.exec("DELETE FROM reminder");
    expect((await read()).items).toEqual([]);
    db.connection.exec("DELETE FROM vault");
    expect(await run()).toMatchObject({ ok: false, error: { code: "not_found" } });
  });
  it.each(["reminder", "job", "company", "task", "interview", "application"])(
    "invalidates a cursor after its %s version changes",
    async (owner) => {
      const first = await read({ ...request, limit: 1 });
      const table = {
        reminder: "reminder",
        job: "job",
        company: "company",
        task: "next_action",
        interview: "interview",
        application: "application",
      }[owner]!;
      const n = {
        reminder: 1000,
        job: 100,
        company: 2,
        task: 200,
        interview: 300,
        application: 5000,
      }[owner]!;
      db.connection.prepare(`UPDATE ${table} SET row_version=row_version+1 WHERE id=?`).run(id(n));
      expect(await run({ ...request, limit: 1, after: first.nextCursor })).toMatchObject({
        ok: false,
        error: { code: "conflict", retryable: false },
      });
    },
  );
  it.each(["fired", "dismissed"])(
    "invalidates a pending cursor after transition to %s",
    async (state) => {
      const first = await read({ ...request, limit: 1 });
      db.connection
        .prepare("UPDATE reminder SET state=?,fired_at=?,row_version=row_version+1 WHERE id=?")
        .run(state, state === "fired" ? later : null, id(1000));
      expect(await run({ ...request, limit: 1, after: first.nextCursor })).toMatchObject({
        ok: false,
        error: { code: "conflict" },
      });
    },
  );
  it("invalidates original parent membership after company deletion without a job-version step", async () => {
    const first = await read({ ...request, limit: 1 });
    db.connection.prepare("DELETE FROM company WHERE id=?").run(id(2));
    expect(
      db.connection.prepare("SELECT row_version FROM job WHERE id=?").get(id(100))?.["row_version"],
    ).toBe(1);
    expect(await run({ ...request, limit: 1, after: first.nextCursor })).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
  });
  it("rejects cross-job task/interview/application linkage instead of manufacturing a relationship", async () => {
    for (const change of [
      "UPDATE reminder SET next_action_id=? WHERE id=?",
      "UPDATE reminder SET interview_id=? WHERE id=?",
    ]) {
      db.connection.prepare(change).run(id(change.includes("next_action") ? 201 : 301), id(1000));
      expect(await run()).toMatchObject({ ok: false, error: { code: "internal" } });
      db.connection.prepare(change).run(id(change.includes("next_action") ? 200 : 300), id(1000));
    }
    db.connection
      .prepare("UPDATE next_action SET application_id=? WHERE id=?")
      .run(id(5001), id(200));
    expect(await run()).toMatchObject({ ok: false, error: { code: "internal" } });
  });
  it("rejects malformed lookahead and bounded hidden-NUL metadata before transport", async () => {
    db.connection
      .prepare("UPDATE reminder SET job_id=?,next_action_id=?,interview_id=? WHERE id=?")
      .run(id(103), id(201), id(301), id(1001));
    db.connection
      .prepare("UPDATE job SET title=? WHERE id=?")
      .run("J\0" + "x".repeat(10000), id(103));
    expect(await run({ ...request, limit: 1 })).toMatchObject({
      ok: false,
      error: { code: "internal" },
    });
    expect(db.largestBlob).toBeLessThanOrEqual(4097);
  });
  it("rejects malformed scalar UTF-8 and invalid historical zones without private exception disclosure", async () => {
    db.connection
      .prepare("UPDATE company SET canonical_name=CAST(x'FF' AS TEXT) WHERE id=?")
      .run(id(2));
    expect(await run()).toMatchObject({ ok: false, error: { code: "internal" } });
    db.connection.prepare("UPDATE company SET canonical_name=? WHERE id=?").run(literal, id(2));
    db.connection
      .prepare("UPDATE reminder SET timezone='PRIVATE/invalid' WHERE id=?")
      .run(id(1000));
    const value = await run();
    expect(value).toMatchObject({ ok: false, error: { code: "internal" } });
    expect(JSON.stringify(value)).not.toContain("PRIVATE");
  });
  it("invalidates deleted/cascaded and archived original anchors", async () => {
    const first = await read({ ...request, limit: 1 });
    db.connection
      .prepare("UPDATE job SET archived_at=?,updated_at=?,row_version=row_version+1 WHERE id=?")
      .run(later, later, id(100));
    expect(await run({ ...request, limit: 1, after: first.nextCursor })).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
    db.connection.prepare("DELETE FROM interview WHERE id=?").run(id(300));
    expect(await run({ ...request, limit: 1, after: first.nextCursor })).toMatchObject({
      ok: false,
      error: { code: "conflict" },
    });
    expect(
      db.connection.prepare("SELECT count(*) AS total FROM reminder WHERE id=?").get(id(1000))?.[
        "total"
      ],
    ).toBe(0);
  });
  it("uses the supplied actual read lease once and copies scope before an awaited lease", async () => {
    let release!: () => void,
      leases = 0;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    db.withReadSnapshot = async (work) => {
      leases++;
      await gate;
      return db.transaction(() => work(db));
    };
    const mutable = { ...request },
      pending = run(mutable);
    mutable.expectedVaultId = id(9);
    release();
    expect(await pending).toMatchObject({ ok: true, value: { expectedVaultId: id(1) } });
    expect(leases).toBe(1);
    expect(db.transactions).toBe(1);
  });
});
