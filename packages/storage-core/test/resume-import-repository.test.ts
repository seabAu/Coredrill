import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import type { ResumeEvidenceProposalDto, ResumeImportPortInput } from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applySqlMigrations,
  createResumeImportRepository,
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
const migrationDefinitions = readdirSync(path.join(repositoryRoot, "migrations"))
  .filter((fileName) => /^\d{4}_[a-z0-9_]+\.sql$/u.test(fileName))
  .sort()
  .map((fileName) => [fileName, fileName.slice(5, -4).replaceAll("_", "-")] as const);
const migrations = defineSqlMigrations(
  migrationDefinitions.map(([fileName, name], index) => {
    const sql = readFileSync(path.join(repositoryRoot, "migrations", fileName), "utf8");
    return {
      version: index + 1,
      name,
      sha256: createHash("sha256").update(sql).digest("hex"),
      sql,
    };
  }),
);

class NodeResumeDatabase implements DatabasePort {
  private readonly database = new DatabaseSync(":memory:");

  public constructor() {
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF;");
  }

  public async query<Row extends QueryRow = QueryRow>(
    statement: SqlStatement,
  ): Promise<readonly Row[]> {
    return this.database.prepare(statement.sql).all(...statement.parameters) as Row[];
  }

  public async execute(statement: SqlStatement): Promise<ExecuteResult> {
    const result = this.database.prepare(statement.sql).run(...statement.parameters);
    return Object.freeze({
      rowsAffected: Number(result.changes),
      lastInsertRowId: BigInt(result.lastInsertRowid),
    });
  }

  public async transaction<Result>(
    work: (transaction: DatabaseTransaction) => Promise<Result>,
  ): Promise<Result> {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const result = await work({
        query: (statement) => this.query(statement),
        execute: (statement) => this.execute(statement),
      });
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  public async exportPortable(): Promise<PortableDatabase> {
    throw new Error("Portable export is outside the resume-import repository test.");
  }

  public async diagnostics(): Promise<StorageDiagnostics> {
    return Object.freeze({
      adapterName: "node-sqlite-resume-import",
      details: Object.freeze(["unit-only"]),
      health: "ready",
      persistence: "memory",
      readOnly: false,
      schemaVersion: 115,
    });
  }

  public close(): void {
    this.database.close();
  }
}

const IMPORT_ID = entityId("import-run", "0199a210-0000-7000-8000-000000000001");
const PROPOSAL_ID = entityId("career-import-proposal", "0199a210-0000-7000-8000-000000000002");
const AT = instant("2026-09-27T15:00:00.000Z");

const proposal = (id = PROPOSAL_ID): ResumeEvidenceProposalDto =>
  Object.freeze({
    confidence: 0.82,
    evidenceStatus: "proposal",
    fieldName: "organization",
    groupKey: "block-8",
    id,
    importRunId: IMPORT_ID,
    proposedValue: "Coredrill Labs",
    reviewState: "pending",
    sourceExcerpt: "Coredrill Labs — Product Engineer — 2024–2026",
    sourcePointer: "/word/document.xml#paragraph=8",
    target: "employment",
  });

const input = (
  proposals: readonly ResumeEvidenceProposalDto[] = [proposal()],
): ResumeImportPortInput =>
  Object.freeze({
    blocks: Object.freeze([
      Object.freeze({
        sourceExcerpt: "Coredrill Labs — Product Engineer — 2024–2026",
        sourcePointer: "/word/document.xml#paragraph=8",
        text: "Coredrill Labs — Product Engineer — 2024–2026",
      }),
    ]),
    completedAt: AT,
    id: IMPORT_ID,
    proposalCount: proposals.length,
    proposals,
    source: Object.freeze({
      byteLength: 4_096,
      fileName: "synthetic-resume.docx",
      format: "docx",
      mediaType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      pageCount: null,
      sha256: "a".repeat(64),
    }),
    startedAt: AT,
    status: "completed",
    warnings: Object.freeze([]),
  });

describe("resume import proposal repository", () => {
  let database: NodeResumeDatabase;

  beforeEach(async () => {
    database = new NodeResumeDatabase();
    await expect(
      applySqlMigrations(database, migrations, "2026-09-27T15:00:00.000Z"),
    ).resolves.toMatchObject({ schemaVersion: 115 });
  });

  afterEach(() => {
    database.close();
  });

  it("persists and reloads immutable pending proposals with field provenance", async () => {
    const repository = createResumeImportRepository(database);
    const stored = await repository.enqueue(input());

    expect(stored).toMatchObject({
      id: IMPORT_ID,
      proposalCount: 1,
      proposals: [
        {
          evidenceStatus: "proposal",
          proposedValue: "Coredrill Labs",
          reviewState: "pending",
          sourcePointer: "/word/document.xml#paragraph=8",
        },
      ],
    });
    await expect(repository.listPending()).resolves.toEqual([stored]);
    await expect(
      database.query(
        sqlStatement("SELECT source_mapping_json FROM import_run WHERE id = ?", [IMPORT_ID]),
      ),
    ).resolves.toEqual([
      {
        source_mapping_json: JSON.stringify(input().blocks),
      },
    ]);
  });

  it("does not create or overwrite Career Profile evidence", async () => {
    const repository = createResumeImportRepository(database);
    await repository.enqueue(input());

    for (const table of [
      "experience",
      "education",
      "project",
      "skill",
      "accomplishment",
      "certification",
      "publication",
      "volunteer_experience",
      "candidate_profile",
    ]) {
      const rows = await database.query(sqlStatement(`SELECT count(*) AS total FROM ${table}`));
      expect(rows, table).toEqual([{ total: 0 }]);
    }
  });

  it("rolls the complete import back when any proposal fails", async () => {
    const repository = createResumeImportRepository(database);
    await expect(repository.enqueue(input([proposal(), proposal()]))).rejects.toThrow();

    await expect(
      database.query(sqlStatement("SELECT count(*) AS total FROM import_run")),
    ).resolves.toEqual([{ total: 0 }]);
    await expect(
      database.query(sqlStatement("SELECT count(*) AS total FROM career_import_proposal")),
    ).resolves.toEqual([{ total: 0 }]);
  });

  it("retains a scanned-file warning even when no proposals are available", async () => {
    const repository = createResumeImportRepository(database);
    const empty: ResumeImportPortInput = {
      ...input([]),
      blocks: Object.freeze([]),
      source: Object.freeze({
        ...input([]).source,
        fileName: "synthetic-scanned.pdf",
        format: "pdf",
      }),
      warnings: Object.freeze(["No extractable text was found; explicit local OCR is optional."]),
    };

    await expect(repository.enqueue(empty)).resolves.toMatchObject({
      proposalCount: 0,
      warnings: ["No extractable text was found; explicit local OCR is optional."],
    });
  });
});
