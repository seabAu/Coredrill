import { describe, expect, it } from "vitest";

import {
  applySqlMigrations,
  defineSqlMigrations,
  type DatabasePort,
  type DatabaseTransaction,
  type ExecuteResult,
  type PortableDatabase,
  type QueryRow,
  type SqlMigration,
  type SqlStatement,
  type StorageDiagnostics,
} from "../src/index.js";

interface MigrationState {
  applied: Array<{ version: number; name: string; sha256: string }>;
  schemaVersion: number;
  vaultTable: boolean;
}

const CHECKSUM_A = "a".repeat(64);
const CHECKSUM_B = "b".repeat(64);
const APPLIED_AT = "2026-08-24T08:00:00.000Z";

const migration = (overrides: Partial<SqlMigration> = {}): SqlMigration => ({
  version: 1,
  name: "vault",
  sha256: CHECKSUM_A,
  sql: "CREATE TABLE vault(id TEXT PRIMARY KEY) STRICT",
  ...overrides,
});

class MigrationMemoryDatabase implements DatabasePort {
  public state: MigrationState = { applied: [], schemaVersion: 0, vaultTable: false };

  public async query<Row extends QueryRow = QueryRow>(
    statement: SqlStatement,
  ): Promise<readonly Row[]> {
    return this.queryState(this.state, statement);
  }

  public async execute(statement: SqlStatement): Promise<ExecuteResult> {
    return this.executeState(this.state, statement);
  }

  public async transaction<Result>(
    work: (transaction: DatabaseTransaction) => Promise<Result>,
  ): Promise<Result> {
    const staged = structuredClone(this.state);
    const transaction: DatabaseTransaction = {
      query: async <Row extends QueryRow = QueryRow>(statement: SqlStatement) =>
        this.queryState<Row>(staged, statement),
      execute: async (statement) => this.executeState(staged, statement),
    };
    const result = await work(transaction);
    this.state = staged;
    return result;
  }

  public async exportPortable(): Promise<PortableDatabase> {
    throw new Error("Not used by the migration tests.");
  }

  public async diagnostics(): Promise<StorageDiagnostics> {
    throw new Error("Not used by the migration tests.");
  }

  private queryState<Row extends QueryRow>(
    state: MigrationState,
    statement: SqlStatement,
  ): readonly Row[] {
    if (!statement.sql.includes("FROM coredrill_schema_migration")) {
      throw new Error("Unsupported migration test query.");
    }
    return state.applied.map((entry) => ({ ...entry }) as unknown as Row);
  }

  private executeState(state: MigrationState, statement: SqlStatement): ExecuteResult {
    if (statement.sql.includes("FAIL MIGRATION")) throw new Error("intentional migration failure");
    if (statement.sql.includes("CREATE TABLE IF NOT EXISTS coredrill_schema_migration")) {
      return { rowsAffected: 0 };
    }
    if (statement.sql.includes("CREATE TABLE vault")) {
      if (state.vaultTable) throw new Error("vault already exists");
      state.vaultTable = true;
      return { rowsAffected: 0 };
    }
    if (statement.sql.startsWith("INSERT INTO coredrill_schema_migration")) {
      const [version, name, sha256] = statement.parameters;
      if (typeof version !== "number" || typeof name !== "string" || typeof sha256 !== "string") {
        throw new Error("Invalid migration ledger parameters.");
      }
      state.applied.push({ version, name, sha256 });
      return { rowsAffected: 1 };
    }
    if (statement.sql.startsWith("PRAGMA user_version = ")) {
      state.schemaVersion = Number(statement.sql.slice("PRAGMA user_version = ".length));
      return { rowsAffected: 0 };
    }
    throw new Error("Unsupported migration test execution.");
  }
}

describe("SQL migrations", () => {
  it("applies a reviewed migration transactionally and skips the matching applied version", async () => {
    const database = new MigrationMemoryDatabase();
    const reviewed = defineSqlMigrations([migration()]);

    await expect(applySqlMigrations(database, reviewed, APPLIED_AT)).resolves.toEqual({
      schemaVersion: 1,
      appliedVersions: [1],
    });
    expect(database.state).toEqual({
      applied: [{ version: 1, name: "vault", sha256: CHECKSUM_A }],
      schemaVersion: 1,
      vaultTable: true,
    });
    await expect(applySqlMigrations(database, reviewed, APPLIED_AT)).resolves.toEqual({
      schemaVersion: 1,
      appliedVersions: [],
    });
    expect(Object.isFrozen(reviewed)).toBe(true);
    expect(Object.isFrozen(reviewed[0])).toBe(true);
  });

  it("rejects invalid migration definitions and application times", async () => {
    expect(() => defineSqlMigrations([])).toThrow(TypeError);
    expect(() => defineSqlMigrations([migration({ version: 2 })])).toThrow(TypeError);
    expect(() => defineSqlMigrations([migration({ name: "Vault migration" })])).toThrow(TypeError);
    expect(() => defineSqlMigrations([migration({ sha256: "short" })])).toThrow(TypeError);
    expect(() => defineSqlMigrations([migration({ sql: " " })])).toThrow(TypeError);
    expect(() => defineSqlMigrations([migration({ sql: "SELECT\u0000 1" })])).toThrow(TypeError);
    await expect(
      applySqlMigrations(new MigrationMemoryDatabase(), [migration()], "invalid"),
    ).rejects.toThrow(TypeError);
  });

  it("fails closed when the applied migration ledger differs from reviewed source", async () => {
    const database = new MigrationMemoryDatabase();
    database.state.applied.push({ version: 1, name: "vault", sha256: CHECKSUM_B });

    await expect(applySqlMigrations(database, [migration()], APPLIED_AT)).rejects.toThrow(
      "does not match reviewed source",
    );
  });

  it("rolls back the migration ledger and schema version when migration SQL fails", async () => {
    const database = new MigrationMemoryDatabase();

    await expect(
      applySqlMigrations(database, [migration({ sql: "FAIL MIGRATION" })], APPLIED_AT),
    ).rejects.toThrow("intentional migration failure");
    expect(database.state).toEqual({ applied: [], schemaVersion: 0, vaultTable: false });
  });
});
