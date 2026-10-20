import type { ViewedStatusMove } from "./stored-status-controller.js";
import type { PipelineTableEditResult } from "@coredrill/ui";

export interface WorkspaceStatusContext {
  readonly jobId: string;
  readonly title: string;
  readonly rowVersion: number;
  readonly fromStatusId: string | null;
  readonly terminal: boolean;
}
export interface WorkspaceStatusTarget {
  readonly id: string;
  readonly name: string;
  readonly terminal: boolean;
}
export interface WorkspaceStatusDraft {
  readonly context: WorkspaceStatusContext;
  readonly targets: readonly WorkspaceStatusTarget[];
  readonly targetId: string;
  readonly reopenConfirmed: boolean;
  readonly busy: boolean;
  readonly error: string | null;
}

/** One session-owned gesture. A refresh may invalidate it, never rebase it implicitly. */
export const createWorkspaceStatusDraft = (
  move: (input: ViewedStatusMove) => Promise<PipelineTableEditResult>,
  changed: (draft: WorkspaceStatusDraft | null) => void,
) => {
  let disposed = false;
  const isDisposed = () => disposed;
  let state: WorkspaceStatusDraft | null = null;
  const publish = (next: WorkspaceStatusDraft | null) => {
    if (disposed) return;
    state = next === null ? null : Object.freeze(next);
    changed(state);
  };
  return Object.freeze({
    current: () => state,
    open: (context: WorkspaceStatusContext, targets: readonly WorkspaceStatusTarget[]): boolean => {
      if (disposed || state !== null) return false;
      publish({
        context: Object.freeze({ ...context }),
        targets: Object.freeze(targets.map((target) => Object.freeze({ ...target }))),
        targetId: "",
        reopenConfirmed: false,
        busy: false,
        error: null,
      });
      return true;
    },
    select: (jobId: string, targetId: string): boolean => {
      if (disposed || state === null || state.busy || state.context.jobId !== jobId) return false;
      if (!state.targets.some(({ id }) => id === targetId)) return false;
      publish({ ...state, targetId, reopenConfirmed: false, error: null });
      return true;
    },
    confirmReopen: (jobId: string, confirmed: boolean): boolean => {
      if (disposed || state === null || state.busy || state.context.jobId !== jobId) return false;
      publish({ ...state, reopenConfirmed: confirmed, error: null });
      return true;
    },
    discard: (jobId: string): boolean => {
      if (disposed || state === null || state.busy || state.context.jobId !== jobId) return false;
      publish(null);
      return true;
    },
    save: async (jobId: string): Promise<boolean> => {
      if (disposed || state === null || state.busy || state.context.jobId !== jobId) return false;
      const draft = state;
      const target = draft.targets.find(({ id }) => id === draft.targetId);
      if (target === undefined || target.id === draft.context.fromStatusId) return false;
      if (draft.context.terminal && !target.terminal && !draft.reopenConfirmed) return false;
      publish({ ...draft, busy: true, error: null });
      try {
        const result = await move({
          jobId,
          rowVersion: draft.context.rowVersion,
          fromStatusId: draft.context.fromStatusId,
          toStatusId: target.id,
          allowReopen: draft.reopenConfirmed,
        });
        if (isDisposed()) return false;
        if (result.ok) {
          publish(null);
          return true;
        }
        publish({ ...draft, busy: false, error: result.error });
      } catch {
        publish({
          ...draft,
          busy: false,
          error:
            "The status save could not be confirmed. Refresh the local Pipeline before trying again; your requested value remains here.",
        });
      }
      return false;
    },
    dispose: () => {
      disposed = true;
    },
  });
};
