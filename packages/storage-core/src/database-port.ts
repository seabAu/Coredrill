export type SqlValue = null | bigint | number | string | Uint8Array;

export type QueryRow = Readonly<Record<string, SqlValue>>;

export interface SqlStatement {
  readonly sql: string;
  readonly parameters: readonly SqlValue[];
}

export interface ExecuteResult {
  readonly rowsAffected: number;
  readonly lastInsertRowId?: bigint;
}

export interface DatabaseSession {
  query<Row extends QueryRow = QueryRow>(statement: SqlStatement): Promise<readonly Row[]>;
  execute(statement: SqlStatement): Promise<ExecuteResult>;
}

/**
 * Deliberately narrower than DatabasePort: a transaction callback cannot start a
 * nested transaction or perform export and diagnostic operations.
 */
export type DatabaseTransaction = DatabaseSession;

export interface PortableDatabase {
  readonly schemaVersion: number;
  readonly byteLength: number;
  readonly sha256: string;
  readonly bytes: Uint8Array;
}

export type StorageHealth = "ready" | "degraded" | "unavailable";
export type StoragePersistence = "durable" | "best-effort" | "memory";

export interface StorageDiagnostics {
  readonly adapterName: string;
  readonly health: StorageHealth;
  readonly persistence: StoragePersistence;
  readonly readOnly: boolean;
  readonly schemaVersion: number;
  readonly details: readonly string[];
}

export interface DatabasePort extends DatabaseSession {
  /** Commits only when work fulfills; rejects after rolling back when work rejects. */
  transaction<Result>(work: (transaction: DatabaseTransaction) => Promise<Result>): Promise<Result>;
  exportPortable(): Promise<PortableDatabase>;
  diagnostics(): Promise<StorageDiagnostics>;
}

const copySqlValue = (value: SqlValue): SqlValue =>
  value instanceof Uint8Array ? value.slice() : value;

const assertBindableSqlValue = (value: SqlValue): void => {
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("SQL number parameters must be finite.");
  }
};

/** Creates an immutable statement envelope so values stay separate from SQL text. */
export const sqlStatement = (sql: string, parameters: readonly SqlValue[] = []): SqlStatement => {
  if (sql.trim().length === 0 || sql.includes("\u0000")) {
    throw new TypeError("SQL text must be non-empty and cannot contain NUL characters.");
  }

  parameters.forEach(assertBindableSqlValue);
  const copiedParameters = Object.freeze(parameters.map(copySqlValue));
  return Object.freeze({ sql, parameters: copiedParameters });
};
