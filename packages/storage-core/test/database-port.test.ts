import { describe, expect, expectTypeOf, it } from "vitest";

import {
  createTransactionSemanticsSuite,
  DatabaseContractViolation,
  defineDatabaseContractSuite,
  runDatabaseContractSuite,
  sqlStatement,
  type DatabaseContractAdapter,
  type DatabasePort,
  type DatabaseSession,
  type DatabaseTransaction,
  type ExecuteResult,
  type PortableDatabase,
  type QueryRow,
  type SqlStatement,
  type StorageDiagnostics,
  type TransactionContractProbe,
} from "../src/index.js";

const SELECT_ENTRIES = sqlStatement("SELECT value FROM entries ORDER BY value");
const CLEAR_ENTRIES = sqlStatement("DELETE FROM entries");
const INSERT_ENTRY = (value: string): SqlStatement =>
  sqlStatement("INSERT INTO entries(value) VALUES (?)", [value]);

class MemoryDatabase implements DatabasePort {
  protected entries: string[] = [];

  public async query<Row extends QueryRow = QueryRow>(
    statement: SqlStatement,
  ): Promise<readonly Row[]> {
    if (statement.sql !== SELECT_ENTRIES.sql) throw new Error("Unsupported query.");
    return this.entries.map((value) => ({ value }) as unknown as Row);
  }

  public async execute(statement: SqlStatement): Promise<ExecuteResult> {
    return this.executeAgainst(this.entries, statement);
  }

  public async transaction<Result>(
    work: (transaction: DatabaseTransaction) => Promise<Result>,
  ): Promise<Result> {
    const stagedEntries = [...this.entries];
    const result = await work(this.createTransactionSession(stagedEntries));
    this.entries = stagedEntries;
    return result;
  }

  protected createTransactionSession(stagedEntries: string[]): DatabaseTransaction {
    return {
      query: async <Row extends QueryRow = QueryRow>(statement: SqlStatement) => {
        if (statement.sql !== SELECT_ENTRIES.sql) throw new Error("Unsupported query.");
        return stagedEntries.map((value) => ({ value }) as unknown as Row);
      },
      execute: async (statement) => this.executeAgainst(stagedEntries, statement),
    };
  }

  public async exportPortable(): Promise<PortableDatabase> {
    return {
      schemaVersion: 0,
      byteLength: 3,
      sha256: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      bytes: new Uint8Array([1, 2, 3]),
    };
  }

  public async diagnostics(): Promise<StorageDiagnostics> {
    return {
      adapterName: "memory-test",
      health: "ready",
      persistence: "memory",
      readOnly: false,
      schemaVersion: 0,
      details: [],
    };
  }

  protected async executeAgainst(
    entries: string[],
    statement: SqlStatement,
  ): Promise<ExecuteResult> {
    if (statement.sql === CLEAR_ENTRIES.sql) {
      const rowsAffected = entries.length;
      entries.splice(0, entries.length);
      return { rowsAffected };
    }
    if (statement.sql === INSERT_ENTRY("").sql) {
      const value = statement.parameters[0];
      if (typeof value !== "string") throw new Error("Expected a bound string value.");
      entries.push(value);
      return { rowsAffected: 1, lastInsertRowId: BigInt(entries.length) };
    }
    throw new Error("Unsupported execution.");
  }
}

class DiscardingCommitDatabase extends MemoryDatabase {
  public override async transaction<Result>(
    work: (transaction: DatabaseTransaction) => Promise<Result>,
  ): Promise<Result> {
    const stagedEntries = [...this.entries];
    return work(this.createTransactionSession(stagedEntries));
  }
}

class WrappingRejectionDatabase extends MemoryDatabase {
  public override async transaction<Result>(
    work: (transaction: DatabaseTransaction) => Promise<Result>,
  ): Promise<Result> {
    try {
      return await super.transaction(work);
    } catch (error) {
      throw new Error("wrapped transaction failure", { cause: error });
    }
  }
}

class CommittingRejectionDatabase extends MemoryDatabase {
  public override async transaction<Result>(
    work: (transaction: DatabaseTransaction) => Promise<Result>,
  ): Promise<Result> {
    const stagedEntries = [...this.entries];
    try {
      const result = await work(this.createTransactionSession(stagedEntries));
      this.entries = stagedEntries;
      return result;
    } catch (error) {
      this.entries = stagedEntries;
      throw error;
    }
  }
}

const entryProbe: TransactionContractProbe<readonly string[]> = {
  prepare: async (database) => {
    await database.execute(CLEAR_ENTRIES);
  },
  mutate: async (transaction) => {
    await transaction.execute(INSERT_ENTRY("alpha"));
  },
  capture: async (session: DatabaseSession) => {
    const rows = await session.query(SELECT_ENTRIES);
    return rows.map((row) => {
      const value = row["value"];
      if (typeof value !== "string") throw new Error("Expected a string row value.");
      return value;
    });
  },
  equivalent: (left, right) =>
    left.length === right.length && left.every((value, index) => value === right[index]),
};

const createMemoryAdapter = () => {
  const created: DatabasePort[] = [];
  const disposed: DatabasePort[] = [];
  const adapter: DatabaseContractAdapter = {
    name: "memory-test",
    createIsolatedDatabase: async () => {
      const database = new MemoryDatabase();
      created.push(database);
      return database;
    },
    disposeIsolatedDatabase: async (database) => {
      disposed.push(database);
    },
  };
  return { adapter, created, disposed };
};

const createAdapterFor = (name: string, createDatabase: () => DatabasePort) => ({
  name,
  createIsolatedDatabase: async () => createDatabase(),
  disposeIsolatedDatabase: async () => undefined,
});

describe("DatabasePort", () => {
  it("keeps SQL text and defensive copies of bound parameters separate", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    const parameters = [bytes, 7, 9n, "value", null] as const;
    const statement = sqlStatement("SELECT ?", parameters);
    bytes[0] = 99;

    expect(statement.sql).toBe("SELECT ?");
    expect(statement.parameters).toEqual([new Uint8Array([1, 2, 3]), 7, 9n, "value", null]);
    expect(Object.isFrozen(statement)).toBe(true);
    expect(Object.isFrozen(statement.parameters)).toBe(true);
  });

  it("rejects unsafe statement envelopes", () => {
    expect(() => sqlStatement("   ")).toThrow(TypeError);
    expect(() => sqlStatement("SELECT\u0000 1")).toThrow(TypeError);
    expect(() => sqlStatement("SELECT ?", [Number.POSITIVE_INFINITY])).toThrow(TypeError);
    expect(() => sqlStatement("SELECT ?", [Number.NEGATIVE_INFINITY])).toThrow(TypeError);
    expect(() => sqlStatement("SELECT ?", [Number.NaN])).toThrow(TypeError);
  });

  it("exposes only query and execute inside the transaction callback", async () => {
    const database = new MemoryDatabase();
    const result = await database.transaction(async (transaction) => {
      expect("transaction" in transaction).toBe(false);
      expect("exportPortable" in transaction).toBe(false);
      expect("diagnostics" in transaction).toBe(false);
      expectTypeOf(transaction).toMatchTypeOf<DatabaseTransaction>();
      await transaction.execute(INSERT_ENTRY("alpha"));
      return "committed";
    });

    expect(result).toBe("committed");
    await expect(entryProbe.capture(database)).resolves.toEqual(["alpha"]);
    await expect(database.exportPortable()).resolves.toMatchObject({ byteLength: 3 });
    await expect(database.diagnostics()).resolves.toMatchObject({ health: "ready" });
  });
});

describe("database contract harness", () => {
  it("runs every case against an isolated database and disposes each one", async () => {
    const { adapter, created, disposed } = createMemoryAdapter();
    const suite = defineDatabaseContractSuite("repository-example", [
      {
        name: "writes one record",
        run: async (database) => {
          await database.execute(INSERT_ENTRY("first"));
        },
      },
      {
        name: "starts empty",
        run: async (database) => {
          await expect(entryProbe.capture(database)).resolves.toEqual([]);
        },
      },
    ]);

    await expect(runDatabaseContractSuite(adapter, suite)).resolves.toEqual({
      adapterName: "memory-test",
      suiteName: "repository-example",
      completedCases: ["writes one record", "starts empty"],
    });
    expect(created).toHaveLength(2);
    expect(disposed).toEqual(created);
    expect(Object.isFrozen(suite)).toBe(true);
    expect(Object.isFrozen(suite.cases)).toBe(true);
  });

  it("rejects ambiguous suite and adapter definitions", async () => {
    const noOpCase = { name: "case", run: async () => undefined };
    expect(() => defineDatabaseContractSuite("", [noOpCase])).toThrow(TypeError);
    expect(() => defineDatabaseContractSuite("suite", [])).toThrow(TypeError);
    expect(() => defineDatabaseContractSuite("suite", [{ ...noOpCase, name: " " }])).toThrow(
      TypeError,
    );
    expect(() => defineDatabaseContractSuite("suite", [noOpCase, noOpCase])).toThrow(TypeError);

    const { adapter } = createMemoryAdapter();
    const suite = defineDatabaseContractSuite("suite", [noOpCase]);
    await expect(runDatabaseContractSuite({ ...adapter, name: " " }, suite)).rejects.toThrow(
      TypeError,
    );
  });

  it("always cleans up and preserves failures, including dual case/cleanup failures", async () => {
    const caseFailure = new Error("case failed");
    const cleanupFailure = new Error("cleanup failed");
    const database = new MemoryDatabase();
    let disposalCount = 0;
    const suite = defineDatabaseContractSuite("failure", [
      { name: "fails", run: async () => Promise.reject(caseFailure) },
    ]);

    await expect(
      runDatabaseContractSuite(
        {
          name: "case-only-failure",
          createIsolatedDatabase: async () => database,
          disposeIsolatedDatabase: async () => {
            disposalCount += 1;
          },
        },
        suite,
      ),
    ).rejects.toBe(caseFailure);
    expect(disposalCount).toBe(1);

    await expect(
      runDatabaseContractSuite(
        {
          name: "dual-failure",
          createIsolatedDatabase: async () => database,
          disposeIsolatedDatabase: async () => Promise.reject(cleanupFailure),
        },
        suite,
      ),
    ).rejects.toMatchObject({ errors: [caseFailure, cleanupFailure] });

    const passingSuite = defineDatabaseContractSuite("cleanup-only", [
      { name: "passes", run: async () => undefined },
    ]);
    await expect(
      runDatabaseContractSuite(
        {
          name: "cleanup-only-failure",
          createIsolatedDatabase: async () => database,
          disposeIsolatedDatabase: async () => Promise.reject(cleanupFailure),
        },
        passingSuite,
      ),
    ).rejects.toBe(cleanupFailure);
  });

  it("proves commit and rollback semantics through a reusable adapter-neutral suite", async () => {
    const { adapter, created, disposed } = createMemoryAdapter();
    const suite = createTransactionSemanticsSuite(entryProbe);

    await expect(runDatabaseContractSuite(adapter, suite)).resolves.toEqual({
      adapterName: "memory-test",
      suiteName: "database-transaction-semantics",
      completedCases: ["commits a fulfilled transaction", "rolls back a rejected transaction"],
    });
    expect(created).toHaveLength(2);
    expect(disposed).toEqual(created);
  });

  it("reports a probe that cannot observe a transaction mutation", async () => {
    const { adapter } = createMemoryAdapter();
    const inertProbe: TransactionContractProbe<readonly string[]> = {
      ...entryProbe,
      mutate: async () => undefined,
    };

    await expect(
      runDatabaseContractSuite(adapter, createTransactionSemanticsSuite(inertProbe)),
    ).rejects.toThrow(DatabaseContractViolation);
  });

  it("detects adapters that discard commits, wrap rejections, or commit rejected writes", async () => {
    const suite = createTransactionSemanticsSuite(entryProbe);

    await expect(
      runDatabaseContractSuite(
        createAdapterFor("discarding-commit", () => new DiscardingCommitDatabase()),
        suite,
      ),
    ).rejects.toThrow("did not commit the callback-visible state");

    await expect(
      runDatabaseContractSuite(
        createAdapterFor("wrapping-rejection", () => new WrappingRejectionDatabase()),
        suite,
      ),
    ).rejects.toThrow("must reject with the callback's original error");

    await expect(
      runDatabaseContractSuite(
        createAdapterFor("committing-rejection", () => new CommittingRejectionDatabase()),
        suite,
      ),
    ).rejects.toThrow("did not roll back its writes");
  });
});
