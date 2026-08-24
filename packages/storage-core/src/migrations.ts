import { sqlStatement, type DatabasePort, type QueryRow } from "./database-port.js";

export interface SqlMigration {
  readonly version: number;
  readonly name: string;
  readonly sha256: string;
  readonly sql: string;
}

export interface MigrationResult {
  readonly schemaVersion: number;
  readonly appliedVersions: readonly number[];
}

type AppliedMigrationRow = QueryRow & {
  readonly version: number;
  readonly name: string;
  readonly sha256: string;
};

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MIGRATION_NAME_PATTERN = /^[a-z][a-z0-9-]{0,63}$/u;

const assertMigration = (migration: SqlMigration, previousVersion: number): void => {
  if (!Number.isSafeInteger(migration.version) || migration.version !== previousVersion + 1) {
    throw new TypeError("SQL migration versions must be contiguous positive safe integers.");
  }
  if (!MIGRATION_NAME_PATTERN.test(migration.name)) {
    throw new TypeError("SQL migration names must be stable lowercase kebab-case tokens.");
  }
  if (!SHA256_PATTERN.test(migration.sha256)) {
    throw new TypeError("SQL migration checksums must be lowercase SHA-256 values.");
  }
  if (migration.sql.trim().length === 0 || migration.sql.includes("\u0000")) {
    throw new TypeError("SQL migration text must be non-empty and cannot contain NUL characters.");
  }
};

export const defineSqlMigrations = (
  migrations: readonly SqlMigration[],
): readonly SqlMigration[] => {
  if (migrations.length === 0) throw new TypeError("At least one SQL migration is required.");

  let previousVersion = 0;
  const defined = migrations.map((migration) => {
    assertMigration(migration, previousVersion);
    previousVersion = migration.version;
    return Object.freeze({ ...migration });
  });
  return Object.freeze(defined);
};

const MIGRATION_LEDGER_SQL = sqlStatement(`
  CREATE TABLE IF NOT EXISTS coredrill_schema_migration (
    version INTEGER PRIMARY KEY NOT NULL CHECK (version > 0),
    name TEXT NOT NULL UNIQUE,
    sha256 TEXT NOT NULL CHECK (length(sha256) = 64),
    applied_at TEXT NOT NULL
  ) STRICT
`);

const APPLIED_MIGRATIONS_SQL = sqlStatement(
  "SELECT version, name, sha256 FROM coredrill_schema_migration ORDER BY version",
);

const assertAppliedMigration = (
  row: AppliedMigrationRow,
  expected: SqlMigration | undefined,
): void => {
  if (!expected) {
    throw new Error(`Applied SQL migration ${String(row.version)} does not match reviewed source.`);
  }
  if (
    row.version !== expected.version ||
    row.name !== expected.name ||
    row.sha256 !== expected.sha256
  ) {
    throw new Error(`Applied SQL migration ${String(row.version)} does not match reviewed source.`);
  }
};

export const applySqlMigrations = async (
  database: DatabasePort,
  migrations: readonly SqlMigration[],
  appliedAt: string,
): Promise<MigrationResult> => {
  const reviewedMigrations = defineSqlMigrations(migrations);
  if (appliedAt.trim().length === 0 || !Number.isFinite(Date.parse(appliedAt))) {
    throw new TypeError("Migration application time must be a valid timestamp.");
  }

  return database.transaction(async (transaction) => {
    await transaction.execute(MIGRATION_LEDGER_SQL);
    const existing = await transaction.query<AppliedMigrationRow>(APPLIED_MIGRATIONS_SQL);
    existing.forEach((row, index) => {
      assertAppliedMigration(row, reviewedMigrations[index]);
    });

    const appliedVersions: number[] = [];
    for (const migration of reviewedMigrations.slice(existing.length)) {
      await transaction.execute(sqlStatement(migration.sql));
      await transaction.execute(
        sqlStatement(
          "INSERT INTO coredrill_schema_migration(version, name, sha256, applied_at) VALUES (?, ?, ?, ?)",
          [migration.version, migration.name, migration.sha256, appliedAt],
        ),
      );
      await transaction.execute(sqlStatement(`PRAGMA user_version = ${String(migration.version)}`));
      appliedVersions.push(migration.version);
    }

    const schemaVersion = reviewedMigrations.at(-1)?.version ?? 0;
    return Object.freeze({
      schemaVersion,
      appliedVersions: Object.freeze(appliedVersions),
    });
  });
};
