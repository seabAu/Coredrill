import { entityId, instant, timeZone } from "@coredrill/domain";
import type { PipelineTableEditResult } from "@coredrill/ui";
import type { InteractiveNextActionInput } from "./stored-next-actions.js";

export interface WorkspaceNextActionContext {
  readonly jobId: string;
  readonly title: string;
  readonly rowVersion: number;
}
export type LocalScheduleResolution =
  | { readonly kind: "gap" | "invalid" }
  | {
      readonly kind: "resolved";
      readonly timeZone: string;
      readonly candidates: readonly string[];
    };
export interface ResolvedNextActionSchedule {
  readonly timeZone: string;
  readonly candidates: readonly string[];
}
export interface WorkspaceNextActionDraft {
  readonly context: WorkspaceNextActionContext;
  readonly title: string;
  readonly scheduled: boolean;
  readonly localDateTime: string;
  readonly timeZone: string;
  readonly resolution: ResolvedNextActionSchedule | null;
  readonly selectedDueAt: string | null;
  readonly busy: boolean;
  readonly error: string | null;
}

/** Owns intent and acknowledgement, not clock conversion or canonical task storage. */
export const createWorkspaceNextActionDraft = (
  save: (input: InteractiveNextActionInput) => Promise<PipelineTableEditResult>,
  resolve: (localDateTime: string, zone: string) => LocalScheduleResolution,
  changed: (draft: WorkspaceNextActionDraft | null) => void,
) => {
  let disposed = false;
  const isDisposed = () => disposed;
  let state: WorkspaceNextActionDraft | null = null;
  const publish = (next: WorkspaceNextActionDraft | null) => {
    if (disposed) return;
    state = next === null ? null : Object.freeze(next);
    changed(state);
  };
  const editable = (jobId: string): WorkspaceNextActionDraft | null =>
    disposed || state === null || state.busy || state.context.jobId !== jobId ? null : state;
  return Object.freeze({
    current: () => state,
    open: (context: WorkspaceNextActionContext): boolean => {
      if (
        disposed ||
        state !== null ||
        !Number.isSafeInteger(context.rowVersion) ||
        context.rowVersion < 1
      )
        return false;
      try {
        const jobId = entityId("job", context.jobId);
        publish({
          context: Object.freeze({ jobId, title: context.title, rowVersion: context.rowVersion }),
          title: "",
          scheduled: false,
          localDateTime: "",
          timeZone: "",
          resolution: null,
          selectedDueAt: null,
          busy: false,
          error: null,
        });
        return true;
      } catch {
        return false;
      }
    },
    editTitle: (jobId: string, title: string): boolean => {
      const draft = editable(jobId);
      if (draft === null || title.length > 512) return false;
      publish({ ...draft, title, error: null });
      return true;
    },
    setScheduled: (jobId: string, scheduled: boolean): boolean => {
      const draft = editable(jobId);
      if (draft === null) return false;
      publish({ ...draft, scheduled, resolution: null, selectedDueAt: null, error: null });
      return true;
    },
    editSchedule: (jobId: string, localDateTime: string, zone: string): boolean => {
      const draft = editable(jobId);
      if (draft === null || localDateTime.length > 40 || zone.length > 128) return false;
      publish({
        ...draft,
        localDateTime,
        timeZone: zone,
        resolution: null,
        selectedDueAt: null,
        error: null,
      });
      return true;
    },
    resolveSchedule: (jobId: string): boolean => {
      const draft = editable(jobId);
      if (draft?.scheduled !== true) return false;
      try {
        if (draft.localDateTime.trim().length === 0)
          throw new TypeError("Missing local clock time.");
        const zone = timeZone(draft.timeZone);
        const result = resolve(draft.localDateTime, draft.timeZone);
        if (result.kind !== "resolved") {
          publish({
            ...draft,
            resolution: null,
            selectedDueAt: null,
            error:
              result.kind === "gap"
                ? "This clock time does not exist in the selected time zone. Choose another time."
                : "Enter a valid local date, time and IANA time zone, then resolve the schedule.",
          });
          return false;
        }
        if (timeZone(result.timeZone) !== zone || result.candidates.length === 0)
          throw new TypeError("Invalid schedule resolution.");
        const candidates = result.candidates.map((candidate) => instant(candidate)).sort();
        if (new Set(candidates).size !== candidates.length)
          throw new TypeError("Duplicate schedule candidates.");
        publish({
          ...draft,
          resolution: Object.freeze({ timeZone: zone, candidates: Object.freeze(candidates) }),
          selectedDueAt: candidates.length === 1 ? (candidates[0] ?? null) : null,
          error: null,
        });
        return true;
      } catch {
        publish({
          ...draft,
          resolution: null,
          selectedDueAt: null,
          error:
            "The schedule could not be resolved. Your clock time and zone remain here; nothing was saved.",
        });
        return false;
      }
    },
    selectOccurrence: (jobId: string, dueAt: string): boolean => {
      const draft = editable(jobId);
      if (draft === null) return false;
      if (draft.resolution?.candidates.includes(dueAt) !== true) return false;
      publish({ ...draft, selectedDueAt: dueAt, error: null });
      return true;
    },
    discard: (jobId: string): boolean => {
      if (editable(jobId) === null) return false;
      publish(null);
      return true;
    },
    save: async (jobId: string): Promise<boolean> => {
      const draft = editable(jobId);
      if (draft === null || draft.title.trim().length === 0) return false;
      if (
        draft.scheduled &&
        (draft.resolution === null ||
          draft.selectedDueAt === null ||
          !draft.resolution.candidates.includes(draft.selectedDueAt))
      )
        return false;
      const request: InteractiveNextActionInput = Object.freeze({
        jobId: draft.context.jobId,
        title: draft.title,
        expected: Object.freeze({ jobRowVersion: draft.context.rowVersion }),
        dueAt: draft.scheduled ? draft.selectedDueAt : null,
        timeZone: draft.scheduled ? (draft.resolution?.timeZone ?? null) : null,
      });
      publish({ ...draft, busy: true, error: null });
      try {
        const result = await save(request);
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
            "The next-action save could not be confirmed. Refresh to check stored tasks before trying again; your draft remains here.",
        });
      }
      return false;
    },
    dispose: () => {
      disposed = true;
    },
  });
};
