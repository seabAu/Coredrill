import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { StoredJobNote, restoreFocusAfterChange, type StoredJobNoteModel } from "@coredrill/ui";
import { createStoredJobNoteComposer } from "./stored-job-note-composer.js";

export interface StoredNoteAcknowledgement {
  readonly jobId: string;
  readonly id: string;
}
const empty: StoredJobNoteModel = Object.freeze({
  jobId: null,
  text: "",
  busy: false,
  error: null,
  savedId: null,
});

/** One bounded draft above responsive routes; changing the viewed job never discards private text. */
export const useStoredJobNote = ({
  jobId,
  enabled,
  onSaved,
}: {
  readonly jobId: string | null;
  readonly enabled: boolean;
  readonly onSaved: (saved: StoredNoteAcknowledgement) => void;
}) => {
  const [draft, setDraft] = useState<StoredJobNoteModel>(empty);
  const composer = useRef<ReturnType<typeof createStoredJobNoteComposer> | null>(null);
  const viewedJob = useRef(jobId);
  viewedJob.current = jobId;
  const onSavedRef = useRef(onSaved);
  onSavedRef.current = onSaved;
  const container = useRef<HTMLDivElement>(null);
  const [focusRequest, setFocusRequest] = useState<{
    readonly owner: NonNullable<typeof composer.current>;
    readonly jobId: string;
    readonly origin: Element | null;
    readonly error: boolean;
  } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    const current = createStoredJobNoteComposer(
      () => globalThis.coredrillStorageSpike.jobNotes,
      setDraft,
    );
    composer.current = current;
    setDraft(current.current());
    return () => {
      current.dispose();
      composer.current = null;
    };
  }, [enabled]);
  useEffect(() => {
    if (!enabled || (draft.text.length === 0 && !draft.busy)) return;
    const warn = (event: BeforeUnloadEvent) => {
      const current = composer.current?.current();
      if (current !== undefined && (current.text.length > 0 || current.busy)) {
        event.preventDefault();
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
    };
  }, [enabled, draft.text.length, draft.busy]);
  useLayoutEffect(() => {
    if (focusRequest === null || draft.busy) return;
    const request = focusRequest;
    restoreFocusAfterChange(request.origin, () => {
      if (composer.current !== request.owner || viewedJob.current !== request.jobId) return null;
      return (
        container.current?.querySelector<HTMLElement>(
          request.error ? "[data-note-error]" : "[data-local-note-text]",
        ) ?? null
      );
    });
    setFocusRequest(null);
  }, [focusRequest, draft.busy]);
  if (!enabled || jobId === null) return null;
  return (
    <div ref={container}>
      <StoredJobNote
        key={jobId}
        jobId={jobId}
        draft={draft}
        onEdit={(text) => {
          composer.current?.edit(jobId, text);
        }}
        onDiscard={(ownerJobId) => {
          const current = composer.current;
          const origin = document.activeElement;
          if (current?.discard(ownerJobId) === true)
            setFocusRequest({ owner: current, jobId, origin, error: false });
        }}
        onSave={() => {
          const current = composer.current;
          if (current === null || current.current().busy) return;
          const origin = document.activeElement;
          void current.save(jobId).then((saved) => {
            if (composer.current !== current || viewedJob.current !== jobId) return;
            const result = current.current();
            if (saved && result.savedId !== null) onSavedRef.current({ jobId, id: result.savedId });
            if (saved || result.error !== null)
              setFocusRequest({ owner: current, jobId, origin, error: !saved });
          });
        }}
      />
    </div>
  );
};
