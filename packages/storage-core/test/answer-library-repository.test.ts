import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { entityId, instant } from "@coredrill/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applySqlMigrations,
  createAnswerLibraryRepository,
  defineSqlMigrations,
  sqlStatement,
  type DatabasePort,
  type DatabaseTransaction,
  type ExecuteResult,
  type PortableDatabase,
  type QueryRow,
  type SqlStatement,
  type StorageDiagnostics,
} from "../src/index.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const migrations = defineSqlMigrations(
  readdirSync(path.join(repositoryRoot, "migrations"))
    .filter((fileName) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(fileName))
    .sort()
    .map((fileName, index) => {
      const sql = readFileSync(path.join(repositoryRoot, "migrations", fileName), "utf8");
      return {
        version: index + 1,
        name: fileName.slice(5, -4).replaceAll("_", "-"),
        sha256: createHash("sha256").update(sql).digest("hex"),
        sql,
      };
    }),
);

class NodeAnswerDatabase implements DatabasePort {
  private readonly database = new DatabaseSync(":memory:");

  public constructor() {
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF;");
  }

  public async query<Row extends QueryRow = QueryRow>(statement: SqlStatement) {
    return this.database.prepare(statement.sql).all(...statement.parameters) as Row[];
  }

  public async execute(statement: SqlStatement): Promise<ExecuteResult> {
    const result = this.database.prepare(statement.sql).run(...statement.parameters);
    return Object.freeze({ rowsAffected: Number(result.changes) });
  }

  public async transaction<Result>(work: (transaction: DatabaseTransaction) => Promise<Result>) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const value = await work({
        query: (statement) => this.query(statement),
        execute: (statement) => this.execute(statement),
      });
      this.database.exec("COMMIT");
      return value;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  public async exportPortable(): Promise<PortableDatabase> {
    throw new Error("Portable export is outside this repository test.");
  }

  public async diagnostics(): Promise<StorageDiagnostics> {
    return Object.freeze({
      adapterName: "node-answer-library",
      details: Object.freeze(["unit-only"]),
      health: "ready",
      persistence: "memory",
      readOnly: false,
      schemaVersion: 129,
    });
  }

  public close() {
    this.database.close();
  }
}

const IDS = Object.freeze({
  answer: entityId("document", "0199a520-0000-7000-8000-000000000001"),
  version1: entityId("document-version", "0199a520-0000-7000-8000-000000000002"),
  version2: entityId("document-version", "0199a520-0000-7000-8000-000000000003"),
  job: entityId("job", "0199a520-0000-7000-8000-000000000004"),
});
const CREATED_AT = instant("2026-09-27T16:00:00.000Z");
const UPDATED_AT = instant("2026-09-27T16:05:00.000Z");
const USED_AT = instant("2026-09-27T16:10:00.000Z");
const ATTACHMENT_CONTENT_ID = "b".repeat(64);
const ir = (answer: string) => ({
  specVersion: 1,
  document: {
    type: "doc",
    content: [{ type: "paragraph", content: [{ type: "text", text: answer }] }],
  },
});
const hash = (answer: string) => createHash("sha256").update(answer).digest("hex");

describe("AnswerLibraryRepository", () => {
  let database: NodeAnswerDatabase;

  beforeEach(async () => {
    database = new NodeAnswerDatabase();
    await applySqlMigrations(database, migrations, CREATED_AT);
  });

  afterEach(() => database.close());

  it("creates, versions, and records explicit reuse without losing provenance", async () => {
    const repository = createAnswerLibraryRepository(database);
    const created = await repository.create({
      id: IDS.answer,
      versionId: IDS.version1,
      question: "Why are you interested in this role?",
      answer: "I value local-first products and careful evidence handling.",
      sensitivity: "standard",
      sourceKind: "manual",
      sourceJobId: null,
      sourceContext: "Prepared in Career Profile",
      contentIr: ir("I value local-first products and careful evidence handling."),
      contentHash: hash("I value local-first products and careful evidence handling."),
      createdAt: CREATED_AT,
    });
    expect(created).toMatchObject({
      sourceKind: "manual",
      sourceJobId: null,
      lastUsedAt: null,
      rowVersion: 1,
      currentVersion: { versionNumber: 1, sensitivity: "standard" },
    });

    const updated = await repository.update({
      id: IDS.answer,
      versionId: IDS.version2,
      question: "Why are you interested in this role?",
      answer: "I value local-first products, transparent evidence, and user control.",
      sensitivity: "sensitive",
      contentIr: ir("I value local-first products, transparent evidence, and user control."),
      contentHash: hash("I value local-first products, transparent evidence, and user control."),
      expectedRowVersion: 1,
      updatedAt: UPDATED_AT,
    });
    expect(updated).toMatchObject({
      sourceKind: "manual",
      sourceContext: "Prepared in Career Profile",
      rowVersion: 2,
      currentVersion: { versionNumber: 2, sensitivity: "sensitive" },
    });
    expect(
      updated.versions.map(({ versionNumber, sensitivity }) => ({ versionNumber, sensitivity })),
    ).toEqual([
      { versionNumber: 1, sensitivity: "standard" },
      { versionNumber: 2, sensitivity: "sensitive" },
    ]);

    const used = await repository.markUsed(IDS.answer, 2, USED_AT);
    expect(used).toMatchObject({ lastUsedAt: USED_AT, rowVersion: 3 });
    await expect(repository.listActive()).resolves.toEqual([used]);
  });

  it("rolls back an appended version when optimistic concurrency fails", async () => {
    const repository = createAnswerLibraryRepository(database);
    await repository.create({
      id: IDS.answer,
      versionId: IDS.version1,
      question: "Work authorization?",
      answer: "I will answer this directly for each application.",
      sensitivity: "restricted",
      sourceKind: "manual",
      sourceJobId: null,
      sourceContext: null,
      contentIr: ir("I will answer this directly for each application."),
      contentHash: hash("I will answer this directly for each application."),
      createdAt: CREATED_AT,
    });
    await expect(
      repository.update({
        id: IDS.answer,
        versionId: IDS.version2,
        question: "Work authorization?",
        answer: "A stale edit must not survive.",
        sensitivity: "restricted",
        contentIr: ir("A stale edit must not survive."),
        contentHash: hash("A stale edit must not survive."),
        expectedRowVersion: 2,
        updatedAt: UPDATED_AT,
      }),
    ).rejects.toThrow("stale");
    const rows = await database.query(
      sqlStatement(
        "SELECT id FROM document_version WHERE document_id = ? ORDER BY version_number",
        [IDS.answer],
      ),
    );
    expect(rows).toHaveLength(1);
  });

  it("retains application provenance instead of silently severing its source job", async () => {
    await database.execute(
      sqlStatement("INSERT INTO job(id, title, created_at, updated_at) VALUES (?, ?, ?, ?)", [
        IDS.job,
        "Product Engineer",
        CREATED_AT,
        CREATED_AT,
      ]),
    );
    const repository = createAnswerLibraryRepository(database);
    const stored = await repository.create({
      id: IDS.answer,
      versionId: IDS.version1,
      question: "Why this company?",
      answer: "The mission and evidence discipline match how I work.",
      sensitivity: "standard",
      sourceKind: "application",
      sourceJobId: IDS.job,
      sourceContext: "Accepted while preparing the Product Engineer application",
      contentIr: ir("The mission and evidence discipline match how I work."),
      contentHash: hash("The mission and evidence discipline match how I work."),
      createdAt: CREATED_AT,
    });
    expect(stored).toMatchObject({ sourceKind: "application", sourceJobId: IDS.job });
    await expect(
      database.execute(sqlStatement("DELETE FROM job WHERE id = ?", [IDS.job])),
    ).rejects.toThrow();
    await expect(repository.listActive()).resolves.toEqual([stored]);
  });

  it("cascades answer metadata and logical attachment links while retaining shared content facts", async () => {
    const repository = createAnswerLibraryRepository(database);
    const answer = "It gives users durable control of their own application evidence.";
    await repository.create({
      id: IDS.answer,
      versionId: IDS.version1,
      question: "What makes this work meaningful?",
      answer,
      sensitivity: "standard",
      sourceKind: "manual",
      sourceJobId: null,
      sourceContext: null,
      contentIr: ir(answer),
      contentHash: hash(answer),
      createdAt: CREATED_AT,
    });
    await database.execute(
      sqlStatement(
        `INSERT INTO attachment_manifest(content_id, media_type, byte_length, created_at)
         VALUES (?, 'text/plain', 12, ?)`,
        [ATTACHMENT_CONTENT_ID, CREATED_AT],
      ),
    );
    await database.execute(
      sqlStatement(
        `INSERT INTO document_version_attachment(
           document_version_id, content_id, purpose, logical_name, sort_order, created_at
         ) VALUES (?, ?, 'supporting_evidence', 'context.txt', 0, ?)`,
        [IDS.version1, ATTACHMENT_CONTENT_ID, CREATED_AT],
      ),
    );

    await database.execute(sqlStatement("DELETE FROM document WHERE id = ?", [IDS.answer]));

    for (const table of [
      "answer_library_entry",
      "answer_library_version",
      "document_version",
      "document_version_attachment",
    ]) {
      await expect(
        database.query(sqlStatement(`SELECT count(*) AS count FROM ${table}`)),
      ).resolves.toEqual([{ count: 0 }]);
    }
    await expect(
      database.query(sqlStatement("SELECT content_id FROM attachment_manifest")),
    ).resolves.toEqual([{ content_id: ATTACHMENT_CONTENT_ID }]);
    await expect(
      database.execute(
        sqlStatement("DELETE FROM attachment_manifest WHERE content_id = ?", [
          ATTACHMENT_CONTENT_ID,
        ]),
      ),
    ).resolves.toMatchObject({ rowsAffected: 1 });
  });
});
