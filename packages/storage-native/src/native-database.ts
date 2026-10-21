import type {
  DatabasePort,
  DatabaseReadSnapshot,
  DatabaseTransaction,
  ExecuteResult,
  PortableDatabase,
  PortableArchiveDatabaseInspectionV1,
  PortableArchiveRestoreCommitPayloadV1,
  PortableArchiveRestorePortV1,
  PortableArchiveRestoreTargetSnapshotV1,
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
import {
  deserializeNativeArchiveError,
  NATIVE_ARCHIVE_PROTOCOL_VERSION,
  NATIVE_ATTACHMENT_MAX_BYTES,
  NATIVE_PORTABLE_SAVE_LIMITS,
  NATIVE_PORTABLE_READ_LIMITS,
  type NativePortableReadOutcome,
  type NativePortableSaveInput,
  type NativePortableSaveOutcome,
  parseNativeArchiveResponse,
  type NativeArchiveOperation,
  type NativeArchiveOutcome,
  type NativeArchiveResponseData,
  type NativeArchiveTransport,
  type NativeAutomaticBackupMetadata,
  type NativePortableDatabase,
} from "./archive-protocol.js";
import {
  NATIVE_VAULT_PROTOCOL_VERSION,
  parseNativeVaultResponse,
  deserializeNativeVaultError,
  NativeVaultProtocolError,
  type NativeVaultTransport,
  type NativeVaultDeletionPreview,
  type NativeVaultDeleted,
} from "./vault-protocol.js";

export interface OpenNativeSqliteOptions {
  readonly databaseName: string;
  readonly transport: NativeStorageTransport;
  readonly archiveTransport?: NativeArchiveTransport;
  readonly vaultTransport?: NativeVaultTransport;
}

export interface NativeSqliteDatabase extends DatabasePort {
  withReadSnapshot<Result>(
    work: (snapshot: DatabaseReadSnapshot) => Promise<Result>,
  ): Promise<Result>;
  previewVaultDeletion(input: {
    readonly vaultId: string;
    readonly previewId: string;
  }): Promise<NativeVaultDeletionPreview>;
  deleteVault(input: {
    readonly vaultId: string;
    readonly previewId: string;
    readonly deletionId: string;
    readonly confirmation: string;
  }): Promise<NativeVaultDeleted>;
  writePortableAttachment(input: {
    readonly contentId: string;
    readonly byteLength: number;
    readonly sha256: string;
    readonly bytes: Uint8Array;
  }): Promise<void>;
  exportRecoveryArchive(): Promise<NativeArchiveOutcome>;
  savePortableArchive(input: NativePortableSaveInput): Promise<NativePortableSaveOutcome>;
  selectPortableArchive(): Promise<NativePortableReadOutcome>;
  restoreRecoveryArchive(): Promise<NativeArchiveOutcome>;
  createAutomaticBackup(retentionCount: number): Promise<NativeAutomaticBackupMetadata>;
  inspectPortable(
    database: PortableDatabase,
    expectedVaultId: string,
  ): Promise<PortableArchiveDatabaseInspectionV1>;
  inspectPortableTarget(): Promise<PortableArchiveRestoreTargetSnapshotV1>;
  readPortableAttachment(contentId: string): Promise<Uint8Array | undefined>;
  commitPortableRestore(payload: PortableArchiveRestoreCommitPayloadV1): Promise<void>;
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

const supportsNativeArchive = (
  transport: NativeStorageTransport,
): transport is NativeStorageTransport & NativeArchiveTransport => {
  const candidate = transport as NativeStorageTransport & Partial<NativeArchiveTransport>;
  return typeof candidate.invokeArchive === "function";
};

const encodePortableDatabase = (database: PortableDatabase): NativePortableDatabase =>
  Object.freeze({
    schemaVersion: database.schemaVersion,
    byteLength: database.byteLength,
    sha256: database.sha256,
    bytes: Object.freeze([...database.bytes]),
  });

const decodePortableDatabase = (database: NativePortableDatabase): PortableDatabase =>
  Object.freeze({
    schemaVersion: database.schemaVersion,
    byteLength: database.byteLength,
    sha256: database.sha256,
    bytes: Uint8Array.from(database.bytes),
  });

class NativeSqliteDatabaseAdapter implements NativeSqliteDatabase {
  private closed = false;
  private requestSequence = 1;
  private queue: Promise<void> = Promise.resolve();

  public constructor(
    private readonly transport: NativeStorageTransport,
    private readonly sessionId: string,
    private readonly archiveTransport?: NativeArchiveTransport,
    private readonly vaultTransport?: NativeVaultTransport,
  ) {}

  public previewVaultDeletion(input: {
    readonly vaultId: string;
    readonly previewId: string;
  }): Promise<NativeVaultDeletionPreview> {
    const { vaultId, previewId } = input;
    return this.runExclusive(async () => {
      const data = await this.sendVaultData({
        type: "preview_deletion",
        sessionId: this.sessionId,
        vaultId,
        previewId,
      });
      if (
        data.type !== "deletion_preview" ||
        data.vaultId !== vaultId ||
        data.previewId !== previewId ||
        data.requiredConfirmation !== `DELETE ${data.vaultName}`
      )
        throw new NativeVaultProtocolError(
          "invalid_response",
          "The native deletion preview did not match its request.",
          false,
        );
      return data;
    });
  }

  public deleteVault(input: {
    readonly vaultId: string;
    readonly previewId: string;
    readonly deletionId: string;
    readonly confirmation: string;
  }): Promise<NativeVaultDeleted> {
    const { vaultId, previewId, deletionId, confirmation } = input;
    return this.runExclusive(async () => {
      const data = await this.sendVaultData({
        type: "delete",
        sessionId: this.sessionId,
        vaultId,
        previewId,
        deletionId,
        confirmation,
      });
      if (data.type !== "deleted" || data.vaultId !== vaultId || data.deletionId !== deletionId)
        throw new NativeVaultProtocolError(
          "invalid_response",
          "The native deletion result did not match its request.",
          false,
        );
      this.closed = true;
      return data;
    });
  }

  private async sendVaultData(
    operation: Parameters<NativeVaultTransport["invokeVault"]>[0]["operation"],
  ) {
    this.assertOpen();
    if (this.vaultTransport === undefined)
      throw new NativeStorageCapabilityError("native-vault-deletion");
    const requestId = `native-vault-${String(this.requestSequence)}`;
    this.requestSequence += 1;
    try {
      return parseNativeVaultResponse(
        await this.vaultTransport.invokeVault({
          protocolVersion: NATIVE_VAULT_PROTOCOL_VERSION,
          requestId,
          operation,
        }),
        requestId,
      ).data;
    } catch (error) {
      if (error instanceof NativeVaultProtocolError) throw error;
      throw deserializeNativeVaultError(error);
    }
  }

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
    return this.runExclusive(() => this.exportPortableDirect());
  }

  private async exportPortableDirect(): Promise<PortableDatabase> {
    const data = await this.sendArchiveData({ type: "portable_export", sessionId: this.sessionId });
    if (data.type !== "portable_database")
      throw this.invalidArchiveResponse("portable_database", data.type);
    return decodePortableDatabase(data.database);
  }

  public withReadSnapshot<Result>(
    work: (snapshot: DatabaseReadSnapshot) => Promise<Result>,
  ): Promise<Result> {
    return this.runExclusive(async () => {
      let active = true;
      const assertActive = () => {
        if (!active) throw new Error("The snapshot read lease has ended.");
      };
      const snapshot: DatabaseReadSnapshot = Object.freeze({
        query: async <Row extends QueryRow = QueryRow>(statement: SqlStatement) => {
          assertActive();
          return this.queryDirect<Row>(statement);
        },
        exportPortable: async () => {
          assertActive();
          return this.exportPortableDirect();
        },
      });
      try {
        return await work(snapshot);
      } finally {
        active = false;
      }
    });
  }

  public inspectPortable(
    database: PortableDatabase,
    expectedVaultId: string,
  ): Promise<PortableArchiveDatabaseInspectionV1> {
    return this.runExclusive(async () => {
      const data = await this.sendArchiveData({
        type: "portable_inspect",
        sessionId: this.sessionId,
        database: encodePortableDatabase(database),
        expectedVaultId,
      });
      if (data.type !== "portable_inspection") {
        throw this.invalidArchiveResponse("portable_inspection", data.type);
      }
      return Object.freeze({
        integrity: data.integrity,
        schemaVersion: data.schemaVersion,
        vaultId: data.vaultId,
      });
    });
  }

  public inspectPortableTarget(): Promise<PortableArchiveRestoreTargetSnapshotV1> {
    return this.runExclusive(async () => {
      const data = await this.sendArchiveData({
        type: "portable_target",
        sessionId: this.sessionId,
      });
      if (data.type !== "portable_target")
        throw this.invalidArchiveResponse("portable_target", data.type);
      return data.target;
    });
  }

  public async writePortableAttachment(input: {
    readonly contentId: string;
    readonly byteLength: number;
    readonly sha256: string;
    readonly bytes: Uint8Array;
  }): Promise<void> {
    const { contentId, byteLength, sha256 } = input;
    if (
      !/^[a-f0-9]{64}$/u.test(contentId) ||
      sha256 !== contentId ||
      !Number.isSafeInteger(byteLength) ||
      byteLength < 0 ||
      byteLength > NATIVE_ATTACHMENT_MAX_BYTES ||
      !(input.bytes instanceof Uint8Array) ||
      input.bytes.byteLength !== byteLength
    ) {
      throw new NativeStorageProtocolError(
        "invalid_request",
        "Attachment bytes do not match their content identity.",
        false,
      );
    }
    const bytes = Uint8Array.from(input.bytes);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    if ([...digest].map((value) => value.toString(16).padStart(2, "0")).join("") !== contentId) {
      throw new NativeStorageProtocolError(
        "invalid_request",
        "Attachment bytes do not match their content identity.",
        false,
      );
    }
    return this.runExclusive(async () => {
      const data = await this.sendArchiveData({
        type: "attachment_put",
        sessionId: this.sessionId,
        attachment: { contentId, byteLength, sha256, bytes: Object.freeze([...bytes]) },
      });
      if (
        data.type !== "attachment_stored" ||
        data.contentId !== contentId ||
        data.byteLength !== byteLength ||
        data.sha256 !== sha256
      ) {
        throw this.invalidArchiveResponse("attachment_stored", data.type);
      }
    });
  }

  public readPortableAttachment(contentId: string): Promise<Uint8Array | undefined> {
    return this.runExclusive(async () => {
      const data = await this.sendArchiveData({
        type: "attachment_read",
        sessionId: this.sessionId,
        contentId,
      });
      if (data.type === "attachment_missing") {
        if (data.contentId !== contentId)
          throw this.invalidArchiveResponse("attachment_data", data.type);
        return undefined;
      }
      if (data.type !== "attachment_data" || data.contentId !== contentId) {
        throw this.invalidArchiveResponse("attachment_data", data.type);
      }
      return Uint8Array.from(data.bytes);
    });
  }

  public commitPortableRestore(payload: PortableArchiveRestoreCommitPayloadV1): Promise<void> {
    return this.runExclusive(async () => {
      const data = await this.sendArchiveData({
        type: "portable_commit",
        sessionId: this.sessionId,
        expectedTargetFingerprint: payload.expectedTargetFingerprint,
        vaultId: payload.vaultId,
        database: encodePortableDatabase(payload.database),
        attachments: Object.freeze(
          payload.attachments.map((attachment) =>
            Object.freeze({
              contentId: attachment.contentId,
              mediaType: attachment.mediaType,
              ...(attachment.logicalName === undefined
                ? {}
                : { logicalName: attachment.logicalName }),
              byteLength: attachment.byteLength,
              sha256: attachment.sha256,
              bytes: Object.freeze([...attachment.bytes]),
            }),
          ),
        ),
      });
      if (
        data.type !== "portable_committed" ||
        data.databaseSha256 !== payload.database.sha256 ||
        data.attachmentCount !== payload.attachments.length
      ) {
        throw this.invalidArchiveResponse("portable_committed", data.type);
      }
    });
  }

  public async savePortableArchive(
    input: NativePortableSaveInput,
  ): Promise<NativePortableSaveOutcome> {
    const { vaultId, archiveId, byteLength, sha256 } = input;
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    if (
      !uuid.test(vaultId) ||
      !uuid.test(archiveId) ||
      !Number.isSafeInteger(byteLength) ||
      byteLength < 22 ||
      byteLength > NATIVE_PORTABLE_SAVE_LIMITS.maxArchiveBytes ||
      !/^[0-9a-f]{64}$/.test(sha256) ||
      !(input.bytes instanceof Uint8Array) ||
      input.bytes.byteLength !== byteLength
    ) {
      throw new NativeStorageProtocolError(
        "invalid_request",
        "The portable archive save input is invalid.",
        false,
      );
    }
    const bytes = Uint8Array.from(input.bytes);
    const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
    if ([...digest].map((value) => value.toString(16).padStart(2, "0")).join("") !== sha256) {
      throw new NativeStorageProtocolError(
        "invalid_request",
        "The portable archive bytes do not match their identity.",
        false,
      );
    }
    const identity = Object.freeze({ vaultId, archiveId, byteLength, sha256 });
    return this.runExclusive(async () => {
      let terminal = false;
      try {
        const begin = await this.sendArchiveData({
          type: "portable_save_begin",
          sessionId: this.sessionId,
          ...identity,
        });
        if (
          begin.type !== "portable_save_progress" ||
          begin.archiveId !== archiveId ||
          begin.receivedBytes !== 0
        )
          throw this.invalidArchiveResponse("portable_save_progress", begin.type);
        for (
          let offset = 0;
          offset < bytes.byteLength;
          offset += NATIVE_PORTABLE_SAVE_LIMITS.maxChunkBytes
        ) {
          const chunk = Object.freeze([
            ...bytes.subarray(offset, offset + NATIVE_PORTABLE_SAVE_LIMITS.maxChunkBytes),
          ]);
          const progress = await this.sendArchiveData({
            type: "portable_save_append",
            sessionId: this.sessionId,
            archiveId,
            offset,
            bytes: chunk,
          });
          if (
            progress.type !== "portable_save_progress" ||
            progress.archiveId !== archiveId ||
            progress.receivedBytes !== offset + chunk.length
          )
            throw this.invalidArchiveResponse("portable_save_progress", progress.type);
        }
        const saved = await this.sendArchiveData({
          type: "portable_save_finish",
          sessionId: this.sessionId,
          ...identity,
        });
        if (saved.type === "portable_save_cancelled" && saved.archiveId === archiveId) {
          terminal = true;
          return Object.freeze({ status: "cancelled" as const });
        }
        if (
          saved.type !== "portable_saved" ||
          saved.vaultId !== vaultId ||
          saved.archiveId !== archiveId ||
          saved.byteLength !== byteLength ||
          saved.sha256 !== sha256
        )
          throw this.invalidArchiveResponse("portable_saved", saved.type);
        terminal = true;
        return Object.freeze({ status: "saved_verified" as const, ...identity });
      } finally {
        if (!terminal) {
          // Best-effort cleanup only; never retry finish/publication after uncertain acknowledgement.
          try {
            await this.sendArchiveData({
              type: "portable_save_abort",
              sessionId: this.sessionId,
              archiveId,
            });
          } catch {
            /* Session close/retirement also releases bounded staging. */
          }
        }
      }
    });
  }

  public exportRecoveryArchive(): Promise<NativeArchiveOutcome> {
    return this.runExclusive(() => this.sendArchive({ type: "export", sessionId: this.sessionId }));
  }

  public selectPortableArchive(): Promise<NativePortableReadOutcome> {
    return this.runExclusive(async () => {
      const selectionId = [...globalThis.crypto.getRandomValues(new Uint8Array(32))]
        .map((byte) => byte.toString(16).padStart(2, "0"))
        .join("");
      const release = async () => {
        const released = await this.sendArchiveData({
          type: "portable_read_release",
          sessionId: this.sessionId,
          selectionId,
        });
        if (released.type !== "portable_read_released" || released.selectionId !== selectionId)
          throw this.invalidArchiveResponse("correlated portable_read_released", released.type);
      };
      let outcome: NativePortableReadOutcome;
      try {
        outcome = await (async (): Promise<NativePortableReadOutcome> => {
          const selected = await this.sendArchiveData({
            type: "portable_read_begin",
            sessionId: this.sessionId,
            selectionId,
          });
          if (selected.type === "portable_read_cancelled" && selected.selectionId === selectionId) {
            return Object.freeze({ status: "cancelled" as const });
          }
          if (selected.type !== "portable_read_ready" || selected.selectionId !== selectionId)
            throw this.invalidArchiveResponse("correlated portable_read_ready", selected.type);
          const bytes = new Uint8Array(selected.byteLength);
          for (let offset = 0; offset < selected.byteLength;) {
            const chunk = await this.sendArchiveData({
              type: "portable_read_chunk",
              sessionId: this.sessionId,
              selectionId,
              offset,
            });
            const expectedLength = Math.min(
              NATIVE_PORTABLE_READ_LIMITS.maxChunkBytes,
              selected.byteLength - offset,
            );
            if (
              chunk.type !== "portable_read_chunk" ||
              chunk.selectionId !== selectionId ||
              chunk.offset !== offset ||
              chunk.bytes.length !== expectedLength ||
              chunk.complete !== (offset + expectedLength === selected.byteLength)
            )
              throw this.invalidArchiveResponse("correlated portable_read_chunk", chunk.type);
            bytes.set(chunk.bytes, offset);
            offset += expectedLength;
          }
          const sha256 = [
            ...new Uint8Array(await globalThis.crypto.subtle.digest("SHA-256", bytes)),
          ]
            .map((byte) => byte.toString(16).padStart(2, "0"))
            .join("");
          if (sha256 !== selected.sha256)
            throw this.invalidArchiveResponse(
              "verified portable archive bytes",
              "checksum_mismatch",
            );
          return Object.freeze({
            status: "selected" as const,
            byteLength: bytes.byteLength,
            sha256,
            bytes,
          });
        })();
      } catch (error) {
        // Preserve the primary failure if cleanup also fails; never fabricate selected bytes.
        await release().catch(() => undefined);
        if (
          error instanceof NativeStorageProtocolError ||
          error instanceof NativeStorageCapabilityError
        )
          throw error;
        throw new NativeStorageProtocolError(
          "archive_io_failed",
          "The selected portable archive could not be read. The local vault was not restored.",
          false,
        );
      }
      await release();
      return outcome;
    });
  }

  public restoreRecoveryArchive(): Promise<NativeArchiveOutcome> {
    return this.runExclusive(() =>
      this.sendArchive({ type: "restore", sessionId: this.sessionId }),
    );
  }

  public createAutomaticBackup(retentionCount: number): Promise<NativeAutomaticBackupMetadata> {
    if (!Number.isSafeInteger(retentionCount) || retentionCount < 1 || retentionCount > 90) {
      return Promise.reject(
        new NativeStorageProtocolError(
          "invalid_request",
          "Automatic backup retention must be an integer from 1 through 90.",
          false,
        ),
      );
    }
    return this.runExclusive(() => this.sendAutomaticBackup(retentionCount));
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
          this.archiveTransport === undefined
            ? "native-recovery-archive-unavailable"
            : "native-recovery-archive-picker",
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

  private async sendArchive(
    operation: Extract<NativeArchiveOperation, { readonly type: "export" | "restore" }>,
  ): Promise<NativeArchiveOutcome> {
    this.assertOpen();
    const data = await this.sendArchiveData(operation);
    if (data.type === "cancelled") {
      if (data.operation !== operation.type) {
        throw new NativeStorageProtocolError(
          "invalid_response",
          "The native archive boundary returned a mismatched cancellation.",
          false,
        );
      }
      return Object.freeze({ status: "cancelled" });
    }
    const expected = operation.type === "export" ? "exported" : "restored";
    if (data.type !== expected) {
      throw new NativeStorageProtocolError(
        "invalid_response",
        `Native archive returned ${data.type} while ${expected} was required.`,
        false,
      );
    }
    return Object.freeze({ status: "completed", archive: data.archive });
  }

  private async sendAutomaticBackup(
    retentionCount: number,
  ): Promise<NativeAutomaticBackupMetadata> {
    this.assertOpen();
    const data = await this.sendArchiveData({
      type: "automatic_backup",
      sessionId: this.sessionId,
      retentionCount,
    });
    if (data.type !== "backup_created") {
      throw new NativeStorageProtocolError(
        "invalid_response",
        `Native archive returned ${data.type} while backup_created was required.`,
        false,
      );
    }
    return data.backup;
  }

  private async sendArchiveData(
    operation: NativeArchiveOperation,
  ): Promise<NativeArchiveResponseData> {
    this.assertOpen();
    if (this.archiveTransport === undefined) {
      throw new NativeStorageCapabilityError(
        operation.type.startsWith("portable_") || operation.type.startsWith("attachment_")
          ? "portable-recovery"
          : operation.type === "automatic_backup"
            ? "native-automatic-backup"
            : "native-recovery-archive",
      );
    }
    const requestId = `native-archive-${String(this.requestSequence)}`;
    this.requestSequence += 1;
    try {
      const response = await this.archiveTransport.invokeArchive({
        protocolVersion: NATIVE_ARCHIVE_PROTOCOL_VERSION,
        requestId,
        operation,
      });
      return parseNativeArchiveResponse(response, requestId).data;
    } catch (error) {
      const protocolError =
        error instanceof NativeStorageProtocolError ? error : deserializeNativeArchiveError(error);
      if (protocolError.code === "archive_recovery_failed") this.closed = true;
      throw protocolError;
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

  private invalidArchiveResponse(expected: string, actual: string): NativeStorageProtocolError {
    return new NativeStorageProtocolError(
      "invalid_response",
      `Native archive returned ${actual} while ${expected} was required.`,
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
  return new NativeSqliteDatabaseAdapter(
    options.transport,
    opened.sessionId,
    options.archiveTransport ??
      (supportsNativeArchive(options.transport) ? options.transport : undefined),
    options.vaultTransport ??
      (typeof (options.transport as NativeStorageTransport & Partial<NativeVaultTransport>)
        .invokeVault === "function"
        ? (options.transport as NativeStorageTransport & NativeVaultTransport)
        : undefined),
  );
};

export const createNativePortableArchiveRestorePortV1 = (input: {
  readonly database: NativeSqliteDatabase;
  readonly expectedVaultId: string;
}): PortableArchiveRestorePortV1 =>
  Object.freeze({
    inspectTarget: () => input.database.inspectPortableTarget(),
    inspectDatabase: (database: PortableDatabase) =>
      input.database.inspectPortable(database, input.expectedVaultId),
    commit: (payload: PortableArchiveRestoreCommitPayloadV1) => {
      if (payload.vaultId !== input.expectedVaultId) {
        return Promise.reject(new TypeError("The native restore payload changed vault identity."));
      }
      return input.database.commitPortableRestore(payload);
    },
  });
