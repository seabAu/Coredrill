import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { entityId, instant } from "@coredrill/domain";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  applySqlMigrations,
  createJobRequirementRepository,
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

class NodeRequirementDatabase implements DatabasePort {
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
      adapterName: "node-job-requirement",
      details: Object.freeze(["unit-only"]),
      health: "ready",
      persistence: "memory",
      readOnly: false,
      schemaVersion: 133,
    });
  }
  public close() {
    this.database.close();
  }
}

const IDS = Object.freeze({
  job: entityId("job", "0199a710-0000-7000-8000-000000000001"),
  source: entityId("job-source", "0199a710-0000-7000-8000-000000000002"),
  snapshot: entityId("source-snapshot", "0199a710-0000-7000-8000-000000000003"),
  provenance: entityId("provenance", "0199a710-0000-7000-8000-000000000004"),
  requirement: entityId("job-requirement", "0199a710-0000-7000-8000-000000000005"),
});
const CREATED_AT = instant("2026-09-27T20:30:00.000Z");
const UPDATED_AT = instant("2026-09-27T20:35:00.000Z");

describe("JobRequirementRepository", () => {
  let database: NodeRequirementDatabase;

  beforeEach(async () => {
    database = new NodeRequirementDatabase();
    await applySqlMigrations(database, migrations, CREATED_AT);
    await database.execute(
      sqlStatement("INSERT INTO job(id, title, created_at, updated_at) VALUES (?, ?, ?, ?)", [
        IDS.job,
        "Product Operations Lead",
        CREATED_AT,
        CREATED_AT,
      ]),
    );
    await database.execute(
      sqlStatement(
        `INSERT INTO job_source(
           id, job_id, canonical_url, first_seen_at, last_seen_at, is_primary, created_at, updated_at
         ) VALUES (?, ?, 'https://example.test/jobs/1', ?, ?, 1, ?, ?)`,
        [IDS.source, IDS.job, CREATED_AT, CREATED_AT, CREATED_AT, CREATED_AT],
      ),
    );
    await database.execute(
      sqlStatement(
        `INSERT INTO source_snapshot(
           id, job_source_id, captured_at, extractor_id, extractor_version,
           raw_text, content_hash, retention_class, created_at
         ) VALUES (?, ?, ?, 'jsonld-job-posting', '1.0.0', ?, ?, 'standard', ?)`,
        [
          IDS.snapshot,
          IDS.source,
          CREATED_AT,
          "You will lead delivery.",
          "a".repeat(64),
          CREATED_AT,
        ],
      ),
    );
    await database.execute(
      sqlStatement(
        `INSERT INTO provenance(
           id, source_snapshot_id, extraction_method, source_pointer,
           source_excerpt, confidence, captured_at, created_at
         ) VALUES (?, ?, 'jsonld', '/description/requirements/0', ?, 0.91, ?, ?)`,
        [IDS.provenance, IDS.snapshot, "You will lead delivery.\n", CREATED_AT, CREATED_AT],
      ),
    );
  });

  afterEach(() => database.close());

  it("persists exact provenance and retains the extracted category across correction", async () => {
    const repository = createJobRequirementRepository(database);
    const created = await repository.create({
      id: IDS.requirement,
      jobId: IDS.job,
      category: "required",
      sourceCategory: "required",
      normalizedText: "Lead delivery",
      rawText: "You will lead delivery.",
      provenanceId: IDS.provenance,
      sortOrder: 0,
      createdAt: CREATED_AT,
      userConfirmed: false,
    });
    expect(created).toMatchObject({
      category: "required",
      sourceCategory: "required",
      sourceExcerpt: "You will lead delivery.\n",
      sourcePointer: "/description/requirements/0",
      confidence: 0.91,
      userConfirmed: false,
      rowVersion: 1,
    });

    const corrected = await repository.correct({
      id: IDS.requirement,
      category: "responsibility",
      expectedRowVersion: 1,
      updatedAt: UPDATED_AT,
    });
    expect(corrected).toMatchObject({
      category: "responsibility",
      sourceCategory: "required",
      userConfirmed: true,
      rowVersion: 2,
    });
    await expect(repository.listForJob(IDS.job)).resolves.toEqual([corrected]);
  });

  it("persists an explicitly reviewed parser proposal without rewriting its source category", async () => {
    const repository = createJobRequirementRepository(database);
    const created = await repository.create({
      id: IDS.requirement,
      jobId: IDS.job,
      category: "desired",
      sourceCategory: "required",
      normalizedText: "Lead delivery",
      rawText: "You will lead delivery.",
      provenanceId: IDS.provenance,
      sortOrder: 0,
      createdAt: CREATED_AT,
      userConfirmed: true,
    });

    expect(created).toMatchObject({
      category: "desired",
      sourceCategory: "required",
      sourceExcerpt: "You will lead delivery.\n",
      userConfirmed: true,
      rowVersion: 1,
    });
  });

  it("rejects stale corrections and direct mutation of immutable source facts", async () => {
    const repository = createJobRequirementRepository(database);
    await repository.create({
      id: IDS.requirement,
      jobId: IDS.job,
      category: "required",
      sourceCategory: "required",
      normalizedText: "Lead delivery",
      rawText: "You will lead delivery.",
      provenanceId: IDS.provenance,
      sortOrder: 0,
      createdAt: CREATED_AT,
      userConfirmed: false,
    });
    await expect(
      repository.correct({
        id: IDS.requirement,
        category: "desired",
        expectedRowVersion: 2,
        updatedAt: UPDATED_AT,
      }),
    ).rejects.toThrow("stale");
    await expect(
      database.execute(
        sqlStatement("UPDATE job_requirement SET source_category = 'context' WHERE id = ?", [
          IDS.requirement,
        ]),
      ),
    ).rejects.toThrow("immutable");
  });
});
