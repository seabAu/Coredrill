import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  applySqlMigrations,
  CAREER_REPOSITORY_CONTRACT_CASE_NAMES,
  CAREER_REPOSITORY_CONTRACT_MANIFEST,
  createCareerRepositoryContractSuite,
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

class NodeCareerDatabase implements DatabasePort {
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
    throw new Error("Portable export is outside this repository contract adapter.");
  }

  public async diagnostics(): Promise<StorageDiagnostics> {
    return Object.freeze({
      adapterName: "node-sqlite-career-contract",
      health: "ready",
      persistence: "memory",
      readOnly: false,
      schemaVersion: 129,
      details: Object.freeze(["unit-contract-only"]),
    });
  }

  public close(): void {
    this.database.close();
  }
}

const adapter: DatabaseContractAdapter = {
  name: "node-sqlite-career-contract",
  createIsolatedDatabase: async () => new NodeCareerDatabase(),
  disposeIsolatedDatabase: async (database) => {
    (database as NodeCareerDatabase).close();
  },
};

describe("Career Profile repository contracts", () => {
  it("passes the shared schema and transaction suite in fast SQLite", async () => {
    const suite = createCareerRepositoryContractSuite({
      migrate: async (database) => {
        const result = await applySqlMigrations(database, migrations, "2026-09-27T12:00:00.000Z");
        expect(result.schemaVersion).toBe(129);
      },
    });

    await expect(runDatabaseContractSuite(adapter, suite)).resolves.toEqual({
      adapterName: adapter.name,
      suiteName: CAREER_REPOSITORY_CONTRACT_MANIFEST.suiteName,
      completedCases: CAREER_REPOSITORY_CONTRACT_CASE_NAMES,
    });
  });
});
