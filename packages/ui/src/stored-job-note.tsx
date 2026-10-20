import { useId, useState } from "react";

export interface StoredJobNoteModel {
  readonly jobId: string | null;
  readonly text: string;
  readonly busy: boolean;
  readonly error: string | null;
  readonly savedId: string | null;
}
export interface StoredJobNoteProps {
  readonly jobId: string;
  readonly draft: StoredJobNoteModel;
  readonly onEdit: (text: string) => void;
  readonly onSave: () => void;
  readonly onDiscard: (ownerJobId: string) => void;
}

/** Controlled session draft; successful history is supplied by the application, not this form. */
export const StoredJobNote = ({ jobId, draft, onEdit, onSave, onDiscard }: StoredJobNoteProps) => {
  const id = useId();
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const foreign =
    draft.jobId !== null && draft.jobId !== jobId && (draft.text.length > 0 || draft.busy);
  const text = draft.jobId === jobId ? draft.text : "";
  const discard = draft.jobId !== null && draft.text.length > 0;
  return (
    <section
      className="cd-job-content-section cd-stored-job-note"
      aria-label="Local Timeline note"
      data-note-job={jobId}
    >
      <h3>Record a local note</h3>
      <p>
        Record a decision, question or context. Saved activity is append-only. Nothing is sent or
        scheduled.
      </p>
      <p>
        Unsaved text stays in this session, not in the vault. Save before closing or reloading the
        app.
      </p>
      {foreign ? (
        <p role="status">
          {draft.busy
            ? "A note for another job is saving."
            : "An unsaved note belongs to another job."}{" "}
          Return to job {draft.jobId} to continue it, or explicitly discard it before starting a
          different note.
        </p>
      ) : (
        <form
          className="cd-job-quick-note"
          onSubmit={(event) => {
            event.preventDefault();
            onSave();
          }}
        >
          <label htmlFor={id}>Local note text</label>
          <textarea
            id={id}
            data-local-note-text
            rows={4}
            maxLength={2000}
            value={text}
            disabled={draft.busy}
            aria-describedby={`${id}-hint`}
            onChange={(event) => {
              setConfirmDiscard(false);
              onEdit(event.target.value);
            }}
          />
          <p id={`${id}-hint`}>
            {text.length} of 2,000 characters. This note records your context, not employer
            verification.
          </p>
          {draft.jobId === jobId && draft.error !== null ? (
            <p role="alert" data-note-error tabIndex={-1}>
              {draft.error}
            </p>
          ) : null}
          <button
            className="cd-button cd-button-primary"
            type="submit"
            disabled={draft.busy || text.trim().length === 0}
          >
            {draft.busy ? "Saving local note…" : "Save local note"}
          </button>
        </form>
      )}
      {draft.busy ? (
        <p role="status">
          Waiting for local storage acknowledgement. Your note has not been reported saved.
        </p>
      ) : null}
      {draft.jobId === jobId && draft.savedId !== null ? (
        <p role="status">
          Saved locally as note {draft.savedId}. Recorded history is refreshed separately; a
          history-read error does not require saving this note again.
        </p>
      ) : null}
      {discard ? (
        confirmDiscard ? (
          <div>
            <p>Discard this unsaved session draft? Saved notes in the vault are not affected.</p>
            <button
              className="cd-button cd-button-secondary"
              type="button"
              disabled={draft.busy}
              onClick={() => {
                if (draft.jobId !== null) onDiscard(draft.jobId);
                setConfirmDiscard(false);
              }}
            >
              Confirm discard unsaved note
            </button>
            <button
              className="cd-button cd-button-secondary"
              type="button"
              disabled={draft.busy}
              onClick={() => {
                setConfirmDiscard(false);
              }}
            >
              Keep unsaved note
            </button>
          </div>
        ) : (
          <button
            className="cd-button cd-button-secondary"
            type="button"
            disabled={draft.busy}
            onClick={() => {
              setConfirmDiscard(true);
            }}
          >
            Discard unsaved note
          </button>
        )
      ) : null}
    </section>
  );
};
