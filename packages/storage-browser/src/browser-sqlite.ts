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
  type BrowserStorageRestoreInspectionResult,
  type BrowserStorageRestoreResult,
} from "./protocol.js";
import { deserializeBrowserStorageError } from "./errors.js";
import {
  inspectBrowserStorageEnvironment,
  withBrowserStorageWarning,
  type BrowserExpectedDatabaseState,
  type BrowserStorageEnvironment,
  type BrowserStorageHealthSnapshot,
  type BrowserStorageManager,
} from "./storage-environment.js";
import {
  acquireBrowserVaultLease,
  type BrowserLockManager,
  type BrowserVaultLease,
} from "./vault-lock.js";

export interface BrowserSqliteOptions {
  readonly databaseName: string;
  readonly coordinateTabs?: boolean;
  readonly expectedExisting?: boolean;
  readonly lockManager?: BrowserLockManager;
  readonly lowQuotaBytes?: number;
  readonly lowQuotaRatio?: number;
  readonly storageManager?: BrowserStorageManager;
  readonly workerFactory?: () => Worker;
}

interface BrowserStorageInspectionOptions {
  readonly lowQuotaBytes?: number;
  readonly lowQuotaRatio?: number;
  readonly storageManager?: BrowserStorageManager;
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
  private expectedDatabase: BrowserExpectedDatabaseState = "not-required";

  private constructor(
    private readonly databaseName: string,
    private environment: BrowserStorageEnvironment,
    private readonly inspectionOptions: BrowserStorageInspectionOptions,
    private readonly lease: BrowserVaultLease | undefined,
    workerFactory: () => Worker,
  ) {
    this.worker = workerFactory();
    this.worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      this.handleResponse(event.data);
    });
    this.worker.addEventListener("error", () => {
      this.failWorker(new Error("The dedicated SQLite Worker failed."));
    });
    this.worker.addEventListener("messageerror", () => {
      this.failWorker(new Error("The dedicated SQLite Worker returned an unreadable response."));
    });
  }

  public static async open(options: BrowserSqliteOptions): Promise<BrowserSqliteDatabase> {
    let environment = await inspectBrowserStorageEnvironment({
      ...(options.lowQuotaBytes === undefined ? {} : { lowQuotaBytes: options.lowQuotaBytes }),
      ...(options.lowQuotaRatio === undefined ? {} : { lowQuotaRatio: options.lowQuotaRatio }),
      requestPersistence: false,
      ...(options.storageManager === undefined ? {} : { storageManager: options.storageManager }),
    });
    const lease =
      options.coordinateTabs === false
        ? undefined
        : await acquireBrowserVaultLease(options.lockManager);
    const database = new BrowserSqliteDatabase(
      options.databaseName,
      environment,
      {
        ...(options.lowQuotaBytes === undefined ? {} : { lowQuotaBytes: options.lowQuotaBytes }),
        ...(options.lowQuotaRatio === undefined ? {} : { lowQuotaRatio: options.lowQuotaRatio }),
        ...(options.storageManager === undefined ? {} : { storageManager: options.storageManager }),
      },
      lease,
      options.workerFactory ??
        (() =>
          new Worker(new URL("./sqlite-worker.js", import.meta.url), {
            name: "coredrill-sqlite",
            type: "module",
          })),
    );
    try {
      const opened = await database.request<BrowserStorageOpenResult>("open", {
        databaseName: options.databaseName,
      });
      if (options.expectedExisting === true && !opened.existedBeforeOpen) {
        environment = withBrowserStorageWarning(environment, "expected-database-missing");
        database.environment = environment;
      }
      database.expectedDatabase =
        options.expectedExisting === true
          ? opened.existedBeforeOpen
            ? "found"
            : "missing"
          : "not-required";
      return database;
    } catch (error) {
      database.shutdown();
      throw error;
    }
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

  public inspectPortable(
    portable: PortableDatabase,
    expectedVaultId: string,
  ): Promise<BrowserStorageRestoreInspectionResult> {
    return this.queue.run(async () =>
      Object.freeze(
        await this.request<BrowserStorageRestoreInspectionResult>("inspect_restore", {
          databaseName: this.databaseName,
          portable: { ...portable, bytes: portable.bytes.slice() },
          expectedVaultId,
        }),
      ),
    );
  }

  public restorePortable(
    portable: PortableDatabase,
    options: {
      readonly expectedTargetSha256?: string;
      readonly expectedVaultId?: string;
    } = {},
  ): Promise<BrowserStorageRestoreResult> {
    return this.queue.run(async () =>
      Object.freeze(
        await this.request<BrowserStorageRestoreResult>("restore", {
          databaseName: this.databaseName,
          portable: { ...portable, bytes: portable.bytes.slice() },
          ...(options.expectedTargetSha256 === undefined
            ? {}
            : { expectedTargetSha256: options.expectedTargetSha256 }),
          ...(options.expectedVaultId === undefined
            ? {}
            : { expectedVaultId: options.expectedVaultId }),
        }),
      ),
    );
  }

  public diagnostics(): Promise<StorageDiagnostics> {
    return this.queue.run(async () => {
      const workerDiagnostics = await this.request<StorageDiagnostics>("diagnostics");
      const warningDetails = this.environment.warnings.map(
        (warning) => `storage-warning:${warning}`,
      );
      return Object.freeze({
        ...workerDiagnostics,
        health: warningDetails.length === 0 ? workerDiagnostics.health : "degraded",
        persistence: this.environment.persistence === "granted" ? "durable" : "best-effort",
        details: Object.freeze([
          ...workerDiagnostics.details,
          `storage-persistence:${this.environment.persistence}`,
          `storage-quota:${this.environment.quota}`,
          ...warningDetails,
        ]),
      });
    });
  }

  /** Re-observes browser storage without requesting a persistence grant. */
  public refreshStorageHealth(): Promise<BrowserStorageHealthSnapshot> {
    return this.queue.run(async () => {
      this.environment = await this.inspectStorageEnvironment(false);
      return this.storageHealth();
    });
  }

  /** Must be called only from an explicit user action such as a Settings button. */
  public requestPersistentStorage(): Promise<BrowserStorageHealthSnapshot> {
    return this.queue.run(async () => {
      this.environment = await this.inspectStorageEnvironment(true);
      return this.storageHealth();
    });
  }

  public storageHealth(): BrowserStorageHealthSnapshot {
    return Object.freeze({
      ...this.environment,
      expectedDatabase: this.expectedDatabase,
      warnings: Object.freeze([...this.environment.warnings]),
    });
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
      try {
        this.worker.postMessage(request);
      } catch (error) {
        this.pending.delete(id);
        reject(error instanceof Error ? error : new Error("The SQLite Worker request failed."));
      }
    });
  }

  private async inspectStorageEnvironment(
    requestPersistence: boolean,
  ): Promise<BrowserStorageEnvironment> {
    const environment = await inspectBrowserStorageEnvironment({
      ...this.inspectionOptions,
      requestPersistence,
    });
    return this.expectedDatabase === "missing"
      ? withBrowserStorageWarning(environment, "expected-database-missing")
      : environment;
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
    else pending.reject(deserializeBrowserStorageError(value.error));
  }

  private rejectAll(error: Error): void {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  private failWorker(error: Error): void {
    this.rejectAll(error);
    this.shutdown();
  }

  private shutdown(): void {
    if (this.closed) return;
    this.closed = true;
    this.worker.terminate();
    this.rejectAll(new Error("The browser database client was closed."));
    this.lease?.release();
  }
}

export const openBrowserSqliteDatabase = (
  options: BrowserSqliteOptions,
): Promise<BrowserSqliteDatabase> => BrowserSqliteDatabase.open(options);
