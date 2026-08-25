import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  applySqlMigrations,
  createPipelineRepositoryContractSuite,
  createTrackerRepositoryContractSuite,
  defineSqlMigrations,
  runDatabaseContractSuite,
  type DatabaseContractAdapter,
  type DatabasePort,
  type DatabaseTransaction,
  type ExecuteResult,
  type PortableDatabase,
  type QueryRow,
  type SqlStatement,
  type StorageDiagnostics,
} from "../src/index.js";

const repositoryRoot = path.resolve(import.meta.dirname, "..", "..", "..");
const APPLIED_AT = "2026-08-25T12:00:00.000Z";
const migrationDefinitions = [
  ["0001_vault.sql", "vault"],
  ["0002_capture_inbox.sql", "capture-inbox"],
  ["0003_app_setting.sql", "app-setting"],
  ["0004_location.sql", "location"],
  ["0005_company.sql", "company"],
  ["0006_contact.sql", "contact"],
  ["0007_job.sql", "job"],
  ["0008_job_source.sql", "job-source"],
  ["0009_source_snapshot.sql", "source-snapshot"],
  ["0010_provenance.sql", "provenance"],
  ["0011_company_alias.sql", "company-alias"],
  ["0012_contact_point_provenance.sql", "contact-point-provenance"],
  ["0013_field_value.sql", "field-value"],
  ["0014_status_definition.sql", "status-definition"],
  ["0015_job_current_status.sql", "job-current-status"],
  ["0016_job_next_action.sql", "job-next-action"],
  ["0017_application.sql", "application"],
  ["0018_status_event.sql", "status-event"],
  ["0019_interaction.sql", "interaction"],
  ["0020_next_action.sql", "next-action"],
  ["0021_interview.sql", "interview"],
  ["0022_reminder.sql", "reminder"],
] as const;

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

class NodeSqliteTestDatabase implements DatabasePort {
  private readonly database = new DatabaseSync(":memory:");
  private closed = false;

  public constructor() {
    this.database.exec("PRAGMA foreign_keys = ON; PRAGMA trusted_schema = OFF;");
  }

  public async query<Row extends QueryRow = QueryRow>(
    statement: SqlStatement,
  ): Promise<readonly Row[]> {
    const rows = this.database.prepare(statement.sql).all(...statement.parameters);
    return rows as Row[];
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
    const transaction: DatabaseTransaction = {
      query: (statement) => this.query(statement),
      execute: (statement) => this.execute(statement),
    };
    try {
      const result = await work(transaction);
      this.database.exec("COMMIT");
      return result;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  public async exportPortable(): Promise<PortableDatabase> {
    throw new Error("Portable export is outside this in-memory repository contract adapter.");
  }

  public async diagnostics(): Promise<StorageDiagnostics> {
    const row = this.database.prepare("PRAGMA user_version").get() as
      { readonly user_version: number } | undefined;
    return Object.freeze({
      adapterName: "node-sqlite-unit-contract",
      health: "ready",
      persistence: "memory",
      readOnly: false,
      schemaVersion: row?.user_version ?? 0,
      details: Object.freeze(["unit-contract-only"]),
    });
  }

  public close(): void {
    if (this.closed) return;
    this.database.close();
    this.closed = true;
  }
}

const adapter: DatabaseContractAdapter = {
  name: "node-sqlite-unit-contract",
  createIsolatedDatabase: async () => new NodeSqliteTestDatabase(),
  disposeIsolatedDatabase: async (database) => {
    (database as NodeSqliteTestDatabase).close();
  },
};

describe("Phase 1 tracker repository contracts", () => {
  it("passes the same migration and repository cases in fast in-memory SQLite", async () => {
    const suite = createTrackerRepositoryContractSuite({
      migrate: async (database) => {
        await applySqlMigrations(database, migrations, APPLIED_AT);
      },
    });

    await expect(runDatabaseContractSuite(adapter, suite)).resolves.toEqual({
      adapterName: "node-sqlite-unit-contract",
      suiteName: "phase-1-tracker-repositories",
      completedCases: [
        "migrates vault settings and preserves typed JSON",
        "persists company contact job source snapshot and provenance with bound values",
        "retains field candidates and requires explicit confirmed replacement",
        "enforces foreign keys and rolls back an invalid aggregate",
      ],
    });
  });

  it("passes pipeline projections and history in fast in-memory SQLite", async () => {
    const suite = createPipelineRepositoryContractSuite({
      migrate: async (database) => {
        await applySqlMigrations(database, migrations, APPLIED_AT);
      },
    });

    await expect(runDatabaseContractSuite(adapter, suite)).resolves.toEqual({
      adapterName: "node-sqlite-unit-contract",
      suiteName: "phase-1-pipeline-repositories",
      completedCases: [
        "stores custom stages without selecting default display vocabulary",
        "changes job and application status with atomic append-only history",
        "persists interactions actions interviews and local reminders transactionally",
      ],
    });
  });
});
