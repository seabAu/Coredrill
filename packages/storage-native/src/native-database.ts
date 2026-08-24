import type {
  DatabasePort,
  DatabaseTransaction,
  ExecuteResult,
  PortableDatabase,
  QueryRow,
  SqlStatement,
  StorageDiagnostics,
} from "@coredrill/storage-core";

import {
  decodeNativeSqlValue,
  deserializeNativeStorageError,
  encodeNativeStatement,
  NATIVE_STORAGE_PROTOCOL_VERSION,
  NativeStorageCapabilityError,
  NativeStorageProtocolError,
  parseNativeStorageResponse,
  type NativeStorageOperation,
  type NativeStorageResponseData,
  type NativeStorageTransport,
} from "./protocol.js";

export interface OpenNativeSqliteOptions {
  readonly databaseName: string;
  readonly transport: NativeStorageTransport;
}

export interface NativeSqliteDatabase extends DatabasePort {
  close(): Promise<void>;
  delete(): Promise<boolean>;
}

const expectData = <Type extends NativeStorageResponseData["type"]>(
  data: NativeStorageResponseData,
  type: Type,
): Extract<NativeStorageResponseData, { readonly type: Type }> => {
  if (data.type !== type) {
    throw new NativeStorageProtocolError(
      "invalid_response",
      `Native storage returned ${data.type} while ${type} was required.`,
      false,
    );
  }
  return data as Extract<NativeStorageResponseData, { readonly type: Type }>;
};

class NativeSqliteDatabaseAdapter implements NativeSqliteDatabase {
  private closed = false;
  private requestSequence = 1;
  private queue: Promise<void> = Promise.resolve();

  public constructor(
    private readonly transport: NativeStorageTransport,
    private readonly sessionId: string,
  ) {}

  public query<Row extends QueryRow = QueryRow>(statement: SqlStatement): Promise<readonly Row[]> {
    return this.runExclusive(() => this.queryDirect<Row>(statement));
  }

  public execute(statement: SqlStatement): Promise<ExecuteResult> {
    return this.runExclusive(() => this.executeDirect(statement));
  }

  public transaction<Result>(
    work: (transaction: DatabaseTransaction) => Promise<Result>,
  ): Promise<Result> {
    return this.runExclusive(async () => {
      const begun = expectData(
        await this.send({ type: "begin", sessionId: this.sessionId }),
        "transaction_state",
      );
      if (!begun.active) throw this.invalidTransactionResponse();
      const transaction: DatabaseTransaction = Object.freeze({
        query: <Row extends QueryRow = QueryRow>(statement: SqlStatement) =>
          this.queryDirect<Row>(statement),
        execute: (statement: SqlStatement) => this.executeDirect(statement),
      });
      try {
        const result = await work(transaction);
        const committed = expectData(
          await this.send({ type: "commit", sessionId: this.sessionId }),
          "transaction_state",
        );
        if (committed.active) throw this.invalidTransactionResponse();
        return result;
      } catch (error) {
        try {
          const rolledBack = expectData(
            await this.send({ type: "rollback", sessionId: this.sessionId }),
            "transaction_state",
          );
          if (rolledBack.active) throw this.invalidTransactionResponse();
        } catch (rollbackError) {
          throw new AggregateError(
            [error, rollbackError],
            "Native SQLite transaction and rollback both failed.",
            { cause: rollbackError },
          );
        }
        throw error;
      }
    });
  }

  public exportPortable(): Promise<PortableDatabase> {
    return Promise.reject(new NativeStorageCapabilityError("portable-export"));
  }

  public diagnostics(): Promise<StorageDiagnostics> {
    return this.runExclusive(async () => {
      const result = expectData(
        await this.send({ type: "diagnostics", sessionId: this.sessionId }),
        "diagnostics",
      );
      const ready = result.foreignKeysEnabled;
      return Object.freeze({
        adapterName: "native-rusqlite-candidate",
        health: ready ? "ready" : "unavailable",
        persistence: "durable",
        readOnly: false,
        schemaVersion: result.schemaVersion,
        details: Object.freeze([
          `sqlite-${result.sqliteVersion}`,
          ready ? "foreign-keys-enabled" : "foreign-keys-disabled",
          "portable-export-pending-nat-006",
        ]),
      });
    });
  }

  public close(): Promise<void> {
    return this.runExclusive(async () => {
      if (this.closed) return;
      expectData(await this.send({ type: "close", sessionId: this.sessionId }), "closed");
      this.closed = true;
    }, true);
  }

  public delete(): Promise<boolean> {
    return this.runExclusive(async () => {
      this.assertOpen();
      const result = expectData(
        await this.send({ type: "delete", sessionId: this.sessionId }),
        "deleted",
      );
      this.closed = true;
      return result.deleted;
    });
  }

  private queryDirect<Row extends QueryRow>(statement: SqlStatement): Promise<readonly Row[]> {
    this.assertOpen();
    return this.send({
      type: "query",
      sessionId: this.sessionId,
      statement: encodeNativeStatement(statement),
    }).then((data) => {
      const result = expectData(data, "rows");
      if (new Set(result.columns).size !== result.columns.length) {
        throw new NativeStorageProtocolError(
          "duplicate_columns",
          "Native SQLite returned duplicate column names.",
          false,
        );
      }
      return result.rows.map(
        (values) =>
          Object.freeze(
            Object.fromEntries(
              result.columns.map((column, index) => {
                const value = values[index];
                if (value === undefined) {
                  throw new NativeStorageProtocolError(
                    "invalid_response",
                    "Native SQLite returned a row with missing values.",
                    false,
                  );
                }
                return [column, decodeNativeSqlValue(value)];
              }),
            ),
          ) as Row,
      );
    });
  }

  private executeDirect(statement: SqlStatement): Promise<ExecuteResult> {
    this.assertOpen();
    return this.send({
      type: "execute",
      sessionId: this.sessionId,
      statement: encodeNativeStatement(statement),
    }).then((data) => {
      const result = expectData(data, "executed");
      return Object.freeze({
        rowsAffected: result.rowsAffected,
        lastInsertRowId: BigInt(result.lastInsertRowId),
      });
    });
  }

  private async send(operation: NativeStorageOperation): Promise<NativeStorageResponseData> {
    const requestId = `native-${String(this.requestSequence)}`;
    this.requestSequence += 1;
    try {
      const response = await this.transport.invoke({
        protocolVersion: NATIVE_STORAGE_PROTOCOL_VERSION,
        requestId,
        operation,
      });
      return parseNativeStorageResponse(response, requestId).data;
    } catch (error) {
      if (error instanceof NativeStorageProtocolError) throw error;
      throw deserializeNativeStorageError(error);
    }
  }

  private runExclusive<Result>(work: () => Promise<Result>, allowClosed = false): Promise<Result> {
    const previous = this.queue;
    let release: (() => void) | undefined;
    this.queue = new Promise<void>((resolve) => {
      release = resolve;
    });
    return previous
      .then(async () => {
        if (!allowClosed) this.assertOpen();
        return work();
      })
      .finally(() => release?.());
  }

  private assertOpen(): void {
    if (this.closed) {
      throw new NativeStorageProtocolError(
        "session_closed",
        "The native SQLite session is closed.",
        false,
      );
    }
  }

  private invalidTransactionResponse(): NativeStorageProtocolError {
    return new NativeStorageProtocolError(
      "invalid_response",
      "Native SQLite returned an invalid transaction state.",
      false,
    );
  }
}

export const openNativeSqliteDatabase = async (
  options: OpenNativeSqliteOptions,
): Promise<NativeSqliteDatabase> => {
  const requestId = "native-open-1";
  let rawResponse: unknown;
  try {
    rawResponse = await options.transport.invoke({
      protocolVersion: NATIVE_STORAGE_PROTOCOL_VERSION,
      requestId,
      operation: { type: "open", databaseName: options.databaseName },
    });
  } catch (error) {
    throw deserializeNativeStorageError(error);
  }
  const opened = expectData(parseNativeStorageResponse(rawResponse, requestId).data, "opened");
  return new NativeSqliteDatabaseAdapter(options.transport, opened.sessionId);
};
