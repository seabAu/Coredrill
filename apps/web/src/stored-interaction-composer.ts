import { applicationFailure, type ApplicationResult } from "@coredrill/application";
import {
  STORED_INTERACTION_TYPES,
  type InteractionRecordingScopeV1,
  type StoredInteractionRecording,
  type StoredInteractionRecordingApi,
} from "./stored-interaction-recording.js";

export interface InteractionDraftFields {
  readonly type: (typeof STORED_INTERACTION_TYPES)[number];
  readonly direction: "inbound" | "outbound" | "mutual" | "unknown";
  readonly summary: string;
  readonly occurredAt: string;
}
export interface StoredInteractionDraft {
  readonly scope: InteractionRecordingScopeV1;
  readonly labels: { readonly job: string; readonly contact: string | null };
  readonly fields: InteractionDraftFields;
  readonly interactionId: string;
  readonly busy: boolean;
  readonly phase: "editing" | "uncertain" | "not_recorded" | "recorded";
  readonly recovered: boolean;
  readonly error: string | null;
}
export const sameInteractionOwner = (
  a: InteractionRecordingScopeV1,
  b: InteractionRecordingScopeV1,
) =>
  a.expectedVaultId === b.expectedVaultId &&
  a.jobId === b.jobId &&
  a.jobRowVersion === b.jobRowVersion &&
  a.contactId === b.contactId &&
  a.contactRowVersion === b.contactRowVersion;

/** One ephemeral draft. The captured runtime capability alone owns dispatched identity/context. */
export const createStoredInteractionComposer = (options: {
  readonly api: () => StoredInteractionRecordingApi;
  readonly changed: (draft: StoredInteractionDraft | null) => void;
  readonly allowed: () => boolean;
  readonly exclusive: (
    vaultId: string,
    work: () => Promise<ApplicationResult<unknown>>,
  ) => Promise<ApplicationResult<unknown>>;
}) => {
  let state: StoredInteractionDraft | null = null;
  let recording: StoredInteractionRecording | null = null;
  let retired = false;
  const allowed = () => !retired && options.allowed();
  const publish = (next: StoredInteractionDraft | null) => {
    if (retired) return;
    state =
      next === null
        ? null
        : Object.freeze({
            ...next,
            scope: Object.freeze({ ...next.scope }),
            labels: Object.freeze({ ...next.labels }),
            fields: Object.freeze({ ...next.fields }),
          });
    options.changed(state);
  };
  const stopped = () =>
    applicationFailure({
      code: "conflict",
      retryable: false,
      message: "Review the current vault before continuing.",
    });
  const run = async (mode: "save" | "check", vaultId: string) => {
    const draft = state,
      captured = recording;
    if (
      !allowed() ||
      draft === null ||
      captured === null ||
      draft.busy ||
      draft.scope.expectedVaultId !== vaultId ||
      draft.phase === "recorded" ||
      (mode === "check" ? draft.phase !== "uncertain" : draft.phase === "uncertain")
    )
      return false;
    let entered = false;
    const wasEntered = () => entered;
    publish({ ...draft, busy: true, error: null });
    try {
      const result = await options.exclusive(vaultId, async () => {
        if (!allowed() || recording !== captured) return stopped();
        entered = true;
        return mode === "check"
          ? captured.check()
          : captured.save({
              type: draft.fields.type,
              direction: draft.fields.direction,
              summary: draft.fields.summary,
              ...(draft.fields.occurredAt === "" ? {} : { occurredAt: draft.fields.occurredAt }),
            });
      });
      if (retired || recording !== captured) return false;
      const phase = captured.phase();
      if (result.ok && phase === "recorded") {
        publish({
          ...draft,
          busy: false,
          phase: "recorded",
          error: null,
          recovered: mode === "check",
        });
        return true;
      }
      const nextPhase =
        !wasEntered() || phase === "editing"
          ? draft.phase
          : result.ok && phase === "not_recorded"
            ? "not_recorded"
            : "uncertain";
      publish({
        ...draft,
        busy: false,
        phase: nextPhase,
        error:
          nextPhase === "not_recorded"
            ? null
            : nextPhase === "uncertain"
              ? "The save acknowledgement is uncertain. Check the original record; do not record a new copy."
              : "The interaction was not submitted or its fields were invalid. Review the original owner and fields before trying again.",
      });
    } catch {
      if (!retired && recording === captured)
        publish({
          ...draft,
          busy: false,
          phase: wasEntered() ? "uncertain" : draft.phase,
          error:
            "The local operation could not be acknowledged. Input is retained; no automatic retry occurred.",
        });
    }
    return false;
  };
  return Object.freeze({
    current: () => state,
    hasUnsaved: () => state !== null && (state.busy || state.phase !== "recorded"),
    start: (scope: InteractionRecordingScopeV1, labels: StoredInteractionDraft["labels"]) => {
      if (!allowed() || state !== null) return false;
      try {
        const owned = Object.freeze({ ...scope });
        const selected = options.api().beginRecording(owned);
        recording = selected;
        publish({
          scope: owned,
          labels,
          interactionId: selected.interactionId,
          busy: false,
          phase: "editing",
          recovered: false,
          error: null,
          fields: { type: "note", direction: "unknown", summary: "", occurredAt: "" },
        });
        return true;
      } catch {
        return false;
      }
    },
    edit: (
      scope: InteractionRecordingScopeV1,
      field: keyof InteractionDraftFields,
      value: string,
    ) => {
      const draft = state;
      if (
        !allowed() ||
        draft === null ||
        draft.busy ||
        draft.phase !== "editing" ||
        !sameInteractionOwner(draft.scope, scope) ||
        typeof value !== "string" ||
        value.includes("\0") ||
        (field === "summary"
          ? value.length > 200_000
          : field === "occurredAt"
            ? value.length > 32
            : field === "type"
              ? !STORED_INTERACTION_TYPES.some((kind) => kind === value)
              : !["inbound", "outbound", "mutual", "unknown"].includes(value))
      )
        return false;
      // Dynamic assignment is narrowed through the allowlist above; no unknown fields survive.
      const fields: InteractionDraftFields = {
        type:
          field === "type"
            ? (STORED_INTERACTION_TYPES.find((kind) => kind === value) ?? draft.fields.type)
            : draft.fields.type,
        direction:
          field === "direction" &&
          (value === "inbound" || value === "outbound" || value === "mutual" || value === "unknown")
            ? value
            : draft.fields.direction,
        summary: field === "summary" ? value : draft.fields.summary,
        occurredAt: field === "occurredAt" ? value : draft.fields.occurredAt,
      };
      publish({ ...draft, fields, error: null });
      return true;
    },
    save: (view: InteractionRecordingScopeV1) =>
      state !== null && sameInteractionOwner(state.scope, view)
        ? run("save", view.expectedVaultId)
        : Promise.resolve(false),
    check: (vaultId: string) => run("check", vaultId),
    discard: (vaultId: string) => {
      if (retired || state === null || state.busy || state.scope.expectedVaultId !== vaultId)
        return false;
      recording?.dispose();
      recording = null;
      publish(null);
      return true;
    },
    dispose: () => {
      retired = true;
      recording?.dispose();
      recording = null;
      state = null;
    },
  });
};
