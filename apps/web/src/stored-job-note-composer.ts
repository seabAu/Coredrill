import { STORED_JOB_NOTE_MAX_CHARACTERS, type StoredJobNoteApi } from "./stored-job-notes.js";

export interface StoredJobNoteDraft {
  readonly jobId: string | null;
  readonly text: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly savedId: string | null;
}

/** One bounded session draft, not canonical history; navigation never silently discards it. */
export const createStoredJobNoteComposer = (
  api: () => StoredJobNoteApi,
  changed: (draft: StoredJobNoteDraft) => void,
) => {
  let disposed = false;
  let state: StoredJobNoteDraft = Object.freeze({
    jobId: null,
    text: "",
    busy: false,
    error: null,
    savedId: null,
  });
  const inactive = () => disposed;
  const publish = (next: StoredJobNoteDraft) => {
    if (inactive()) return;
    state = Object.freeze(next);
    changed(state);
  };
  return Object.freeze({
    current: () => state,
    edit: (jobId: string, text: string): boolean => {
      if (
        inactive() ||
        state.busy ||
        text.length > STORED_JOB_NOTE_MAX_CHARACTERS ||
        (state.jobId !== jobId && state.text.length > 0)
      )
        return false;
      publish({ jobId, text, busy: false, error: null, savedId: null });
      return true;
    },
    discard: (jobId: string): boolean => {
      if (inactive() || state.busy || state.jobId !== jobId) return false;
      publish({ jobId: null, text: "", busy: false, error: null, savedId: null });
      return true;
    },
    save: async (jobId: string): Promise<boolean> => {
      if (inactive() || state.busy || state.jobId !== jobId || state.text.trim().length === 0)
        return false;
      const text = state.text;
      publish({ ...state, busy: true, error: null, savedId: null });
      try {
        const result = await api().recordNote({ jobId, summary: text });
        if (inactive()) return false;
        if (
          !result.ok ||
          result.value.jobId !== jobId ||
          result.value.summary !== text ||
          result.value.type !== "note"
        )
          throw new TypeError();
        publish({ jobId, text: "", busy: false, error: null, savedId: result.value.id });
        return true;
      } catch {
        if (inactive()) return false;
        publish({
          jobId,
          text,
          busy: false,
          error:
            "The note save could not be confirmed. Your text remains here. Refresh history before trying again to avoid a duplicate note.",
          savedId: null,
        });
        return false;
      }
    },
    dispose: () => {
      disposed = true;
    },
  });
};
