import type { JobWorkspaceDto } from "@coredrill/application";
import type { StoredPipelineApi } from "./stored-pipeline.js";

export interface StoredJobDetailsState {
  readonly jobId: string;
  readonly value: JobWorkspaceDto | null;
  readonly busy: boolean;
  readonly error: string | null;
}

/** Ephemeral read coordination only; SQLite remains canonical. */
export const createStoredJobDetailsReader = (
  jobId: string,
  read: StoredPipelineApi["workspace"],
  changed: (state: StoredJobDetailsState) => void,
) => {
  const lifetime = { disposed: false };
  const isDisposed = (): boolean => lifetime.disposed;
  let state: StoredJobDetailsState = Object.freeze({
    jobId,
    value: null,
    busy: false,
    error: null,
  });
  const publish = (next: StoredJobDetailsState) => {
    state = Object.freeze(next);
    changed(state);
  };
  return {
    current: () => state,
    dispose: () => {
      lifetime.disposed = true;
    },
    refresh: async () => {
      if (isDisposed() || state.busy) return false;
      publish({ ...state, busy: true, error: null });
      try {
        const result = await read({ jobId });
        if (isDisposed()) return false;
        if (!result.ok || result.value.job.id !== jobId) throw new Error("unavailable");
        publish({ jobId, value: result.value, busy: false, error: null });
      } catch {
        if (isDisposed()) return false;
        publish({
          ...state,
          busy: false,
          error: "Local job details could not be refreshed. Retry to read the vault again.",
        });
      }
      return true;
    },
  };
};
