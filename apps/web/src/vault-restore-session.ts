import {
  applicationFailure,
  parseVaultRestorePreviewDto,
  VAULT_RESTORE_MAX_ARCHIVE_BYTES,
  type ApplicationResult,
  type VaultRestorePreviewDto,
} from "@coredrill/application";
import type { VaultRestorePanelState } from "@coredrill/ui";
import type { StoredVaultRestoreApi } from "./stored-vault-restore.js";

export type VaultRestoreSessionState = VaultRestorePanelState;
export interface RestoreFile {
  readonly size: number;
  arrayBuffer(): Promise<ArrayBuffer>;
}
const unavailable = () =>
  applicationFailure({
    code: "conflict",
    retryable: false,
    message:
      "Another local vault operation is pending. Review the current vault before continuing.",
  });

/** Root-owned review lifetime. Bytes remain in function scope and the runtime capability only. */
export const createVaultRestoreSession = (options: {
  readonly ownerId: string | null;
  readonly runtime: "browser" | "native";
  readonly api: StoredVaultRestoreApi;
  readonly exclusive?: <T>(
    work: () => Promise<ApplicationResult<T>>,
  ) => Promise<ApplicationResult<T>>;
  readonly onChange: (state: VaultRestoreSessionState) => void;
}) => {
  const { ownerId, runtime, api, onChange } = options;
  const exclusive = options.exclusive ?? (<T>(work: () => Promise<ApplicationResult<T>>) => work());
  let disposed = false;
  const isDisposed = () => disposed;
  let retained: VaultRestorePreviewDto | null = null;
  let state: VaultRestoreSessionState = Object.freeze({
    ownerId,
    phase: "idle",
    busy: false,
    preview: null,
    confirmed: false,
    error: null,
    message: "No archive has been selected. Selection and review do not restore data.",
  });
  const publish = (change: Partial<VaultRestoreSessionState>) => {
    if (disposed) return;
    state = Object.freeze({ ...state, ...change });
    onChange(state);
  };
  const retire = (preview: VaultRestorePreviewDto) =>
    api.discard({
      previewId: preview.previewId,
      viewedVaultId: preview.viewedVaultId,
    });
  const canSelect = () => !disposed && !state.busy && retained === null && state.phase !== "reopen";
  const select = async (file?: RestoreFile): Promise<boolean> => {
    if (!canSelect() || (runtime === "browser" ? file === undefined : file !== undefined))
      return false;
    publish({
      busy: true,
      phase: "selecting",
      confirmed: false,
      error: null,
      message: "Reading the selected local archive…",
    });
    try {
      const result = await exclusive<VaultRestorePreviewDto | null>(async () => {
        let bytes: Uint8Array;
        if (runtime === "native") {
          const selected = await api.selectNative();
          if (!selected.ok) return selected;
          if (selected.value.status === "cancelled") return { ok: true as const, value: null };
          bytes = selected.value.bytes;
        } else {
          if (file === undefined) throw new Error("No archive was selected.");
          const size = file.size;
          if (!Number.isSafeInteger(size) || size < 22 || size > VAULT_RESTORE_MAX_ARCHIVE_BYTES)
            throw new Error("Invalid selected archive size.");
          bytes = new Uint8Array(await file.arrayBuffer());
          if (bytes.byteLength !== size) throw new Error("The selected archive changed.");
        }
        if (isDisposed()) return unavailable();
        publish({
          phase: "inspecting",
          message: "Inspecting archive contents and the current target. Nothing has been restored.",
        });
        const inspected = await api.preview({ viewedVaultId: ownerId, bytes });
        if (!inspected.ok) return inspected;
        const preview = parseVaultRestorePreviewDto(inspected.value);
        if (disposed || preview.viewedVaultId !== ownerId) {
          await retire(preview);
          return unavailable();
        }
        retained = preview;
        return { ok: true as const, value: preview };
      });
      if (disposed) return false;
      if (!result.ok) {
        publish({
          phase: "idle",
          error: result.error.message,
          message: "No restore was submitted.",
        });
        return false;
      }
      if (result.value === null) {
        publish({
          phase: "idle",
          message: "Archive selection cancelled. No restore was submitted.",
        });
        return false;
      }
      publish({
        phase: "review",
        preview: result.value,
        message: "Review these exact changes before confirming. No restore has been submitted.",
      });
      return true;
    } catch {
      publish({
        phase: "idle",
        error: "The selected archive could not be reviewed. No restore was submitted.",
      });
      return false;
    } finally {
      publish({ busy: false });
    }
  };
  const discard = async (): Promise<boolean> => {
    if (disposed || state.busy || state.phase === "reopen") return false;
    const preview = retained;
    if (preview === null) return true;
    publish({ busy: true, error: null });
    try {
      const result = await retire(preview);
      if (!result.ok) {
        publish({
          error:
            "The preview could not be retired. Reload the local vault before selecting another archive.",
        });
        return false;
      }
      retained = null;
      publish({
        phase: "idle",
        preview: null,
        confirmed: false,
        message: "Restore preview discarded. No restore was submitted.",
      });
      return true;
    } catch {
      publish({
        error:
          "The preview could not be retired. Reload the local vault before selecting another archive.",
      });
      return false;
    } finally {
      publish({ busy: false });
    }
  };
  return Object.freeze({
    current: () => state,
    select,
    discard,
    confirm: (checked: boolean) => {
      if (disposed || state.busy || retained === null || state.phase !== "review") return false;
      publish({ confirmed: checked });
      return true;
    },
    commit: async (): Promise<boolean> => {
      const preview = retained;
      if (
        disposed ||
        state.busy ||
        state.phase !== "review" ||
        !state.confirmed ||
        preview === null
      )
        return false;
      publish({
        busy: true,
        error: null,
        phase: "committing",
        message: "Restoring the reviewed archive. Do not close this window.",
      });
      let submitted = false;
      const wasSubmitted = () => submitted;
      try {
        const result = await exclusive(async () => {
          if (disposed) return unavailable();
          submitted = true;
          return api.commit({ preview, confirmation: preview.requiredConfirmation });
        });
        if (!wasSubmitted()) {
          publish({
            phase: "review",
            error: result.ok ? "Restore was not submitted." : result.error.message,
          });
          return false;
        }
        retained = null;
        publish({
          phase: "reopen",
          preview: null,
          confirmed: false,
          error: result.ok ? null : result.error.message,
          message: result.ok
            ? "Restore committed and its acknowledgement validated. Reload the local vault to open restored records; current drafts will close."
            : "Restore was not confirmed. The vault may have changed. Reload local storage before a new review; no automatic retry will occur.",
        });
        return result.ok;
      } catch {
        if (wasSubmitted()) {
          retained = null;
          publish({
            phase: "reopen",
            preview: null,
            confirmed: false,
            error:
              "Restore could not be confirmed. The vault may have changed. Reload local storage; do not retry blindly.",
          });
        } else
          publish({
            phase: "review",
            error: "Another local operation prevented restore. Review before trying again.",
          });
        return false;
      } finally {
        publish({ busy: false });
      }
    },
    dispose: () => {
      if (disposed) return;
      disposed = true;
      const preview = retained;
      retained = null;
      // A commit already entered cannot be cancelled or called unchanged by unmounting.
      if (preview !== null && state.phase !== "committing")
        void retire(preview).catch(() => undefined);
    },
  });
};
export type VaultRestoreSession = ReturnType<typeof createVaultRestoreSession>;
