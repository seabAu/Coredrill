import {
  applicationFailure,
  type ApplicationResult,
  type PreparedVaultExportDto,
  type PrepareVaultExportInput,
  parseVaultExportObservation,
  parseVaultExportVerificationView,
  type RecordVaultExportVerificationInput,
  type VaultExportVerificationView,
} from "@coredrill/application";

export type VaultExportPhase =
  | "idle"
  | "preparing"
  | "prepared"
  | "saving"
  | "download_handoff"
  | "verifying"
  | "saved_copy_verified";
export type VaultExportMetadata = Omit<PreparedVaultExportDto, "bytes" | "state">;
export interface VaultExportSessionState {
  readonly ownerId: string | null;
  readonly phase: VaultExportPhase;
  readonly consent: boolean;
  readonly busy: boolean;
  readonly metadata: VaultExportMetadata | null;
  readonly error: string | null;
  readonly message: string;
  readonly recordStatus: "not_recorded" | "recording" | "recorded" | "failed";
  readonly recordError: string | null;
  readonly recordRetryAvailable: boolean;
  readonly recordRevision: number;
}
export interface VaultExportFile {
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
export interface VaultExportSessionOptions {
  readonly ownerId: string | null;
  readonly prepare: (
    input: PrepareVaultExportInput,
  ) => Promise<ApplicationResult<PreparedVaultExportDto>>;
  readonly save?: ((artifact: PreparedVaultExportDto) => Promise<unknown>) | undefined;
  readonly recordVerification?:
    | ((
        input: RecordVaultExportVerificationInput,
      ) => Promise<ApplicationResult<VaultExportVerificationView>>)
    | undefined;
  readonly now?: (() => string) | undefined;
  readonly onChange: (state: VaultExportSessionState) => void;
}
const record = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** One root session owns bytes; historical recording is separate from file verification. */
export const createVaultExportSession = (options: VaultExportSessionOptions) => {
  const {
    ownerId,
    prepare: preparePort,
    save: savePort,
    onChange,
    recordVerification: recordPort,
  } = options;
  const now = options.now ?? (() => new Date().toISOString());
  let disposed = false;
  const isDisposed = () => disposed;
  let artifact: PreparedVaultExportDto | null = null;
  let pendingRecord: RecordVaultExportVerificationInput | null = null;
  let state: VaultExportSessionState = Object.freeze({
    ownerId,
    phase: "idle",
    consent: false,
    busy: false,
    metadata: null,
    error: null,
    message: "No portable archive is prepared.",
    recordStatus: "not_recorded",
    recordError: null,
    recordRetryAvailable: false,
    recordRevision: 0,
  });
  const publish = (change: Partial<VaultExportSessionState>) => {
    if (disposed) return;
    state = Object.freeze({ ...state, ...change });
    onChange(state);
  };
  const fail = (message: string) => {
    publish({ error: message, message });
    return false;
  };
  const ready = () => !disposed && !state.busy && ownerId !== null;
  const clearRecord = () => {
    pendingRecord = null;
    publish({ recordStatus: "not_recorded", recordError: null, recordRetryAvailable: false });
  };
  const recordFailure = () => {
    publish({
      recordStatus: "failed",
      recordError:
        pendingRecord === null
          ? "The copy was verified, but its observation time could not be recorded. Check the device clock before a new explicit byte verification. No historical timestamp was invented."
          : "The copy was verified, but its historical record could not be confirmed. Retry recording only; this will not save or read the file again.",
      recordRetryAvailable: pendingRecord !== null,
    });
    return false;
  };
  const persistRecord = async () => {
    const captured = pendingRecord;
    if (disposed || recordPort === undefined || captured === null) return false;
    publish({ recordStatus: "recording", recordError: null, recordRetryAvailable: false });
    try {
      const result = await recordPort(captured);
      if (isDisposed()) return false;
      if (!result.ok) return recordFailure();
      const view = parseVaultExportVerificationView(result.value, captured.vaultId);
      if (
        !view.history.observations.some(
          (item) => JSON.stringify(item) === JSON.stringify(captured.observation),
        )
      )
        return recordFailure();
      publish({
        recordStatus: "recorded",
        recordError: null,
        recordRetryAvailable: false,
        recordRevision: state.recordRevision + 1,
      });
      return true;
    } catch {
      return recordFailure();
    }
  };
  const recordVerified = async (
    captured: PreparedVaultExportDto,
    method: "native_readback" | "selected_local_copy",
  ) => {
    if (disposed || recordPort === undefined) return;
    try {
      pendingRecord = Object.freeze({
        vaultId: captured.vaultId,
        observation: parseVaultExportObservation({
          archiveId: captured.archiveId,
          archiveCreatedAt: captured.createdAt,
          schemaVersion: captured.schemaVersion,
          byteLength: captured.byteLength,
          sha256: captured.sha256,
          verifiedAt: now(),
          method,
        }),
      });
      await persistRecord();
    } catch {
      recordFailure();
    }
  };
  return Object.freeze({
    current: () => state,
    setConsent: (consent: boolean) => {
      if (!ready() || artifact !== null) return false;
      publish({ consent, error: null });
      return true;
    },
    prepare: async () => {
      if (!ready() || artifact !== null || !state.consent || ownerId === null) return false;
      publish({
        phase: "preparing",
        busy: true,
        error: null,
        message: "Preparing the complete local archive. No file has been saved.",
      });
      try {
        const result = await preparePort({ vaultId: ownerId, acknowledgeUnencrypted: true });
        if (disposed) return false;
        if (!result.ok)
          return fail(
            result.error.code === "conflict"
              ? "The vault changed during preparation. Review its current state and prepare again."
              : "A complete archive could not be prepared. No file was saved.",
          );
        if (result.value.vaultId !== ownerId)
          return fail("The archive does not belong to the viewed vault. No file was saved.");
        artifact = Object.freeze({ ...result.value, bytes: Uint8Array.from(result.value.bytes) });
        const metadata: VaultExportMetadata = {
          vaultId: artifact.vaultId,
          archiveId: artifact.archiveId,
          createdAt: artifact.createdAt,
          schemaVersion: artifact.schemaVersion,
          fileName: artifact.fileName,
          mediaType: artifact.mediaType,
          encryptionMode: artifact.encryptionMode,
          byteLength: artifact.byteLength,
          sha256: artifact.sha256,
          dataFileCount: artifact.dataFileCount,
          attachmentCount: artifact.attachmentCount,
        };
        publish({
          phase: "prepared",
          metadata: Object.freeze(metadata),
          message:
            "Archive prepared locally, not saved. It is an unencrypted snapshot and excludes later edits.",
        });
        return true;
      } catch {
        return fail("A complete archive could not be prepared. No file was saved.");
      } finally {
        if (!disposed)
          publish({ busy: false, ...(artifact === null ? { phase: "idle" as const } : {}) });
      }
    },
    save: async () => {
      if (!ready() || artifact === null) return false;
      if (savePort === undefined)
        return fail("Saving is not connected for this runtime yet. No file was saved.");
      const captured = artifact;
      clearRecord();
      publish({
        phase: "saving",
        busy: true,
        error: null,
        message: "Handing the prepared archive to the selected local save boundary…",
      });
      try {
        const result = await savePort(
          Object.freeze({ ...captured, bytes: Uint8Array.from(captured.bytes) }),
        );
        if (disposed) return false;
        if (record(result) && result["status"] === "cancelled") {
          publish({
            phase: "prepared",
            message: "Saving was cancelled. The prepared archive remains available.",
          });
          return false;
        }
        if (record(result) && result["status"] === "download_handoff") {
          publish({
            phase: "download_handoff",
            message:
              "Download handed to the browser. A saved file has not been confirmed; select a local copy to verify it.",
          });
          return true;
        }
        if (
          record(result) &&
          result["status"] === "saved_verified" &&
          result["vaultId"] === captured.vaultId &&
          result["archiveId"] === captured.archiveId &&
          result["sha256"] === captured.sha256 &&
          result["byteLength"] === captured.byteLength
        ) {
          publish({
            phase: "saved_copy_verified",
            message:
              "The local save boundary confirmed the exact archive bytes. This is not a restore test or proof of permanent file possession.",
          });
          await recordVerified(captured, "native_readback");
          return true;
        }
        throw new Error("Unconfirmed save.");
      } catch {
        publish({ phase: "prepared" });
        return fail(
          "Saving could not be confirmed. Check the destination before trying again; the prepared archive is retained.",
        );
      } finally {
        if (!disposed) publish({ busy: false });
      }
    },
    verify: async (file: VaultExportFile) => {
      if (!ready() || artifact === null) return false;
      const captured = artifact;
      clearRecord();
      if (file.size !== captured.byteLength) {
        publish({ phase: "prepared" });
        return fail(
          "The selected copy does not match the prepared archive size. No copy was verified.",
        );
      }
      publish({
        phase: "verifying",
        busy: true,
        error: null,
        message: "Checking the selected local copy against the prepared archive…",
      });
      try {
        const bytes = Uint8Array.from(new Uint8Array(await file.arrayBuffer()));
        if (disposed) return false;
        const digest = await globalThis.crypto.subtle.digest("SHA-256", bytes);
        const sha256 = [...new Uint8Array(digest)]
          .map((byte) => byte.toString(16).padStart(2, "0"))
          .join("");
        if (isDisposed()) return false;
        if (bytes.byteLength !== captured.byteLength || sha256 !== captured.sha256) {
          publish({ phase: "prepared" });
          return fail(
            "The selected copy does not match the prepared archive. No copy was verified.",
          );
        }
        publish({
          phase: "saved_copy_verified",
          message:
            "The selected local copy matches the prepared archive. Restore has not been tested and later vault edits are excluded.",
        });
        await recordVerified(captured, "selected_local_copy");
        return true;
      } catch {
        publish({ phase: "prepared" });
        return fail(
          "The selected local copy could not be verified. The prepared archive is retained.",
        );
      } finally {
        if (!disposed) publish({ busy: false });
      }
    },
    discard: () => {
      if (!ready()) return false;
      artifact = null;
      clearRecord();
      publish({
        phase: "idle",
        metadata: null,
        consent: false,
        error: null,
        message:
          "Prepared bytes discarded from this session. Vault records and external files were not changed.",
      });
      return true;
    },
    retryRecord: async () => {
      if (!ready() || pendingRecord === null || state.recordStatus !== "failed") return false;
      publish({ busy: true });
      try {
        return await persistRecord();
      } finally {
        if (!disposed) publish({ busy: false });
      }
    },
    runVaultMutation: async <Result>(
      vaultId: string,
      work: () => Promise<ApplicationResult<Result>>,
    ): Promise<ApplicationResult<Result>> => {
      if (!ready() || vaultId !== ownerId)
        return applicationFailure({
          code: "conflict",
          retryable: false,
          message: "Finish the pending archive or vault operation before continuing.",
        });
      publish({ busy: true, error: null });
      try {
        return await work();
      } catch {
        return applicationFailure({
          code: "unavailable",
          retryable: false,
          message:
            "The local vault operation could not be confirmed. Review its stored state before retrying.",
        });
      } finally {
        if (!disposed) publish({ busy: false });
      }
    },
    dispose: () => {
      disposed = true;
      artifact = null;
      pendingRecord = null;
    },
  });
};
export type VaultExportSession = ReturnType<typeof createVaultExportSession>;
