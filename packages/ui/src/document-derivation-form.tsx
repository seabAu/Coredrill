import type {
  ApplicationDocumentPreparationDto,
  ApplicationResult,
  CreatedReusableDocumentDto,
  DeriveJobDocumentInput,
} from "@coredrill/application";
import { useId, useRef, useState, type SyntheticEvent } from "react";

export const DocumentDerivationForm = ({
  preparation,
  onCreate,
}: {
  readonly preparation: ApplicationDocumentPreparationDto;
  readonly onCreate: (
    input: DeriveJobDocumentInput,
  ) => Promise<ApplicationResult<CreatedReusableDocumentDto>>;
}) => {
  const id = useId();
  const pending = useRef(false);
  const [saving, setSaving] = useState(false);
  const [sourceVersionId, setSourceVersionId] = useState("");
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState(false);
  const candidates = [
    ...preparation.candidates.resumes,
    ...preparation.candidates.coverLetters,
  ].filter((candidate) => candidate.lineageRole === "base");
  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError(null);
    setCreated(false);
    try {
      const result = await onCreate({
        applicationId: preparation.applicationId,
        expectedApplicationRowVersion: preparation.applicationRowVersion,
        sourceVersionId,
        title,
      });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setTitle("");
      setSourceVersionId("");
      setCreated(true);
    } catch {
      setError("The local copy action failed. Your choices have been kept.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return (
    <section className="cd-document-creation" aria-labelledby={`${id}-heading`}>
      <h4 id={`${id}-heading`}>Create a job-specific copy</h4>
      <p>
        Copy an exact saved reusable resume or cover-letter version. Unsaved drafts are not copied.
        Nothing is selected, verified, uploaded, or submitted.
      </p>
      {candidates.length === 0 ? (
        <p>Create a reusable resume or cover letter in Documents first.</p>
      ) : (
        <form
          aria-label="Create a job-specific document"
          aria-busy={saving}
          onSubmit={(event) => {
            void submit(event);
          }}
        >
          <label htmlFor={`${id}-source`}>Reusable source version</label>
          <select
            id={`${id}-source`}
            required
            disabled={saving}
            value={sourceVersionId}
            onChange={(event) => {
              setSourceVersionId(event.currentTarget.value);
            }}
          >
            <option value="">Choose a saved version</option>
            {candidates.map((candidate) => (
              <option key={candidate.documentVersionId} value={candidate.documentVersionId}>
                {candidate.title} — {candidate.kind === "resume" ? "Resume" : "Cover letter"}{" "}
                version {candidate.versionNumber}
                {candidate.latestVersion ? " (latest)" : " (older saved version)"}
              </option>
            ))}
          </select>
          <label htmlFor={`${id}-title`}>Job-specific document title</label>
          <input
            id={`${id}-title`}
            required
            maxLength={512}
            disabled={saving}
            value={title}
            onChange={(event) => {
              setTitle(event.currentTarget.value);
            }}
          />
          <button type="submit" disabled={saving}>
            {saving ? "Copying locally…" : "Create job-specific copy"}
          </button>
          {error === null ? null : <p role="alert">{error}</p>}
          {created ? (
            <p role="status">
              Created the job-specific copy. It is available in Documents and has not been selected
              for this application.
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
};
