import type { DatabasePort, DatabaseSession, DatabaseTransaction } from "./database-port.js";

export interface DatabaseContractCase {
  readonly name: string;
  readonly run: (database: DatabasePort) => Promise<void>;
}

export interface DatabaseContractSuite {
  readonly name: string;
  readonly cases: readonly DatabaseContractCase[];
}

export interface DatabaseContractAdapter {
  readonly name: string;
  createIsolatedDatabase(): Promise<DatabasePort>;
  disposeIsolatedDatabase(database: DatabasePort): Promise<void>;
}

export interface DatabaseContractRunResult {
  readonly adapterName: string;
  readonly suiteName: string;
  readonly completedCases: readonly string[];
}

export class DatabaseContractViolation extends Error {
  public constructor(message: string) {
    super(message);
    this.name = "DatabaseContractViolation";
  }
}

const assertContractName = (label: string, value: string): void => {
  if (value.trim().length === 0) {
    throw new TypeError(`${label} must be non-empty.`);
  }
};

const errorFromUnknown = (value: unknown, message: string): Error =>
  value instanceof Error ? value : new Error(message, { cause: value });

export const defineDatabaseContractSuite = (
  name: string,
  cases: readonly DatabaseContractCase[],
): DatabaseContractSuite => {
  assertContractName("Contract suite name", name);
  if (cases.length === 0) throw new TypeError("A contract suite must contain at least one case.");

  const caseNames = cases.map((contractCase) => {
    assertContractName("Contract case name", contractCase.name);
    return contractCase.name;
  });
  if (new Set(caseNames).size !== caseNames.length) {
    throw new TypeError("Contract case names must be unique within a suite.");
  }

  return Object.freeze({
    name,
    cases: Object.freeze(
      cases.map((contractCase) =>
        Object.freeze({ name: contractCase.name, run: contractCase.run }),
      ),
    ),
  });
};

export const runDatabaseContractSuite = async (
  adapter: DatabaseContractAdapter,
  suite: DatabaseContractSuite,
): Promise<DatabaseContractRunResult> => {
  assertContractName("Database adapter name", adapter.name);
  const completedCases: string[] = [];

  for (const contractCase of suite.cases) {
    const database = await adapter.createIsolatedDatabase();
    let caseFailure: Error | undefined;
    try {
      await contractCase.run(database);
      completedCases.push(contractCase.name);
    } catch (error) {
      caseFailure = errorFromUnknown(error, `Database contract case ${contractCase.name} failed.`);
    }

    try {
      await adapter.disposeIsolatedDatabase(database);
    } catch (disposalError) {
      const cleanupFailure = errorFromUnknown(
        disposalError,
        `Database contract case ${contractCase.name} cleanup failed.`,
      );
      if (caseFailure !== undefined) {
        throw new AggregateError(
          [caseFailure, cleanupFailure],
          `Database contract case ${contractCase.name} and its cleanup both failed.`,
          { cause: disposalError },
        );
      }
      throw cleanupFailure;
    }

    if (caseFailure !== undefined) throw caseFailure;
  }

  return Object.freeze({
    adapterName: adapter.name,
    suiteName: suite.name,
    completedCases: Object.freeze(completedCases),
  });
};

export interface TransactionContractProbe<State> {
  prepare(database: DatabasePort): Promise<void>;
  mutate(transaction: DatabaseTransaction): Promise<void>;
  capture(session: DatabaseSession): Promise<State>;
  equivalent(left: State, right: State): boolean;
}

const assertStateChanged = <State>(
  probe: TransactionContractProbe<State>,
  before: State,
  after: State,
): void => {
  if (probe.equivalent(before, after)) {
    throw new DatabaseContractViolation("The transaction probe did not observe its mutation.");
  }
};

export const createTransactionSemanticsSuite = <State>(
  probe: TransactionContractProbe<State>,
): DatabaseContractSuite =>
  defineDatabaseContractSuite("database-transaction-semantics", [
    {
      name: "commits a fulfilled transaction",
      run: async (database) => {
        await probe.prepare(database);
        const before = await probe.capture(database);
        const callbackResult = await database.transaction(async (transaction) => {
          await probe.mutate(transaction);
          const inside = await probe.capture(transaction);
          assertStateChanged(probe, before, inside);
          return inside;
        });
        const committed = await probe.capture(database);
        if (!probe.equivalent(callbackResult, committed)) {
          throw new DatabaseContractViolation(
            "A fulfilled transaction did not commit the callback-visible state.",
          );
        }
      },
    },
    {
      name: "rolls back a rejected transaction",
      run: async (database) => {
        await probe.prepare(database);
        const before = await probe.capture(database);
        const rejection = new Error("intentional transaction contract rejection");
        let observedRejection: unknown;

        try {
          await database.transaction(async (transaction) => {
            await probe.mutate(transaction);
            const inside = await probe.capture(transaction);
            assertStateChanged(probe, before, inside);
            throw rejection;
          });
        } catch (error) {
          observedRejection = error;
        }

        if (observedRejection !== rejection) {
          throw new DatabaseContractViolation(
            "A rejected transaction must reject with the callback's original error.",
          );
        }
        const after = await probe.capture(database);
        if (!probe.equivalent(before, after)) {
          throw new DatabaseContractViolation(
            "A rejected transaction did not roll back its writes.",
          );
        }
      },
    },
  ]);
