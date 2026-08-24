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
  BROWSER_STORAGE_PROTOCOL_VERSION,
  isBrowserStorageResponse,
  type BrowserStorageDeleteResult,
  type BrowserStorageOpenResult,
  type BrowserStorageOperation,
  type BrowserStorageRequest,
  type BrowserStorageResponse,
  type BrowserStorageRestoreResult,
} from "./protocol.js";

export interface BrowserSqliteOptions {
  readonly databaseName: string;
  readonly workerFactory?: () => Worker;
}

interface PendingRequest {
  readonly resolve: (value: unknown) => void;
  readonly reject: (error: Error) => void;
}

class SerialOperationQueue {
  private tail: Promise<void> = Promise.resolve();

  public run<Result>(operation: () => Promise<Result>): Promise<Result> {
    const result = this.tail.then(operation, operation);
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

export class BrowserSqliteDatabase implements DatabasePort {
  private readonly worker: Worker;
  private readonly pending = new Map<string, PendingRequest>();
  private readonly queue = new SerialOperationQueue();
  private closed = false;

  private constructor(
    private readonly databaseName: string,
    workerFactory: () => Worker,
  ) {
    this.worker = workerFactory();
    this.worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      this.handleResponse(event.data);
    });
    this.worker.addEventListener("error", () => {
      this.rejectAll(new Error("The dedicated SQLite Worker failed."));
    });
    this.worker.addEventListener("messageerror", () => {
      this.rejectAll(new Error("The dedicated SQLite Worker returned an unreadable response."));
    });
  }

  public static async open(options: BrowserSqliteOptions): Promise<BrowserSqliteDatabase> {
    const database = new BrowserSqliteDatabase(
      options.databaseName,
      options.workerFactory ??
        (() =>
          new Worker(new URL("./sqlite-worker.js", import.meta.url), {
            name: "coredrill-sqlite",
            type: "module",
          })),
    );
    await database.request<BrowserStorageOpenResult>("open", {
      databaseName: options.databaseName,
    });
    return database;
  }

  public query<Row extends QueryRow = QueryRow>(statement: SqlStatement): Promise<readonly Row[]> {
    return this.queue.run(async () => {
      const rows = await this.request<readonly Row[]>("query", { statement });
      return Object.freeze(rows.map((row) => Object.freeze({ ...row }) as Row));
    });
  }

  public execute(statement: SqlStatement): Promise<ExecuteResult> {
    return this.queue.run(async () =>
      Object.freeze(await this.request<ExecuteResult>("execute", { statement })),
    );
  }

  public transaction<Result>(
    work: (transaction: DatabaseTransaction) => Promise<Result>,
  ): Promise<Result> {
    return this.queue.run(async () => {
      await this.request("begin");
      const transaction = Object.freeze({
        query: async <Row extends QueryRow = QueryRow>(statement: SqlStatement) => {
          const rows = await this.request<readonly Row[]>("query", { statement });
          return Object.freeze(rows.map((row) => Object.freeze({ ...row }) as Row));
        },
        execute: async (statement: SqlStatement) =>
          Object.freeze(await this.request<ExecuteResult>("execute", { statement })),
      });

      try {
        const result = await work(transaction);
        await this.request("commit");
        return result;
      } catch (error) {
        try {
          await this.request("rollback");
        } catch {
          // Preserve the callback's original error as required by DatabasePort.
        }
        throw error;
      }
    });
  }

  public exportPortable(): Promise<PortableDatabase> {
    return this.queue.run(async () => {
      const portable = await this.request<PortableDatabase>("export");
      return Object.freeze({ ...portable, bytes: portable.bytes.slice() });
    });
  }

  public restorePortable(portable: PortableDatabase): Promise<BrowserStorageRestoreResult> {
    return this.queue.run(async () =>
      Object.freeze(
        await this.request<BrowserStorageRestoreResult>("restore", {
          databaseName: this.databaseName,
          portable: { ...portable, bytes: portable.bytes.slice() },
        }),
      ),
    );
  }

  public diagnostics(): Promise<StorageDiagnostics> {
    return this.queue.run(async () =>
      Object.freeze(await this.request<StorageDiagnostics>("diagnostics")),
    );
  }

  public delete(): Promise<boolean> {
    return this.queue.run(async () => {
      const result = await this.request<BrowserStorageDeleteResult>("delete", {
        databaseName: this.databaseName,
      });
      this.shutdown();
      return result.deleted;
    });
  }

  public close(): Promise<void> {
    return this.queue.run(async () => {
      try {
        await this.request("close");
      } finally {
        this.shutdown();
      }
    });
  }

  private request<Result = undefined>(
    operation: BrowserStorageOperation,
    fields: Omit<BrowserStorageRequest, "id" | "operation" | "version"> = {},
  ): Promise<Result> {
    if (this.closed) return Promise.reject(new Error("The browser database client is closed."));
    const id = crypto.randomUUID();
    const request: BrowserStorageRequest = {
      version: BROWSER_STORAGE_PROTOCOL_VERSION,
      id,
      operation,
      ...fields,
    };
    return new Promise<Result>((resolve, reject) => {
      this.pending.set(id, {
        resolve: (value) => {
          resolve(value as Result);
        },
        reject,
      });
      this.worker.postMessage(request);
    });
  }

  private handleResponse(value: unknown): void {
    if (!isBrowserStorageResponse(value)) {
      this.rejectAll(new Error("The dedicated SQLite Worker violated its response contract."));
      return;
    }
    const pending = this.pending.get(value.id);
    if (pending === undefined) return;
    this.pending.delete(value.id);
    if (value.ok) pending.resolve(value.result);
    else pending.reject(this.deserializeError(value));
  }

  private deserializeError(
    response: Extract<BrowserStorageResponse, { readonly ok: false }>,
  ): Error {
    const error = new Error(response.error.message);
    error.name = response.error.name;
    return error;
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  private shutdown(): void {
    this.closed = true;
    this.worker.terminate();
    this.rejectAll(new Error("The browser database client was closed."));
  }
}

export const openBrowserSqliteDatabase = (
  options: BrowserSqliteOptions,
): Promise<BrowserSqliteDatabase> => BrowserSqliteDatabase.open(options);
