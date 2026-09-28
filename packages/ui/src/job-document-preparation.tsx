import { useEffect, useId, useState, type ChangeEvent, type SyntheticEvent } from "react";
import type {
  ApplicationDocumentCandidateDto,
  ApplicationDocumentPreparationDto,
  ApplicationResult,
  DocumentEditorSessionDto,
  SaveApplicationDocumentPreparationInput,
} from "@coredrill/application";

import { DocumentExportReview } from "./document-export-review.js";

export interface JobDocumentPreparationModel {
  readonly preparation: ApplicationDocumentPreparationDto | null;
  readonly loading: boolean;
  readonly saving: boolean;
  readonly error: string | null;
}

export interface JobDocumentPreparationProps {
  readonly model: JobDocumentPreparationModel;
  readonly onSave?: (input: SaveApplicationDocumentPreparationInput) => void;
  readonly onLoadDocument?: (
    documentId: string,
  ) => Promise<ApplicationResult<DocumentEditorSessionDto>>;
}

const statusLabel = (status: ApplicationDocumentPreparationDto["status"]): string => {
  switch (status) {
    case "missing":
      return "Missing required selection";
    case "draft":
      return "Draft changes need a version";
    case "review_needed":
      return "Selected version needs review";
    case "ready":
      return "Ready for export review";
  }
};

const statusExplanation = (preparation: ApplicationDocumentPreparationDto): string => {
  switch (preparation.status) {
    case "missing":
      return "Select an exact resume version. Cover letters and answers are optional unless the application asks for them.";
    case "draft":
      return "At least one selected document has recoverable edits that are not in an immutable version yet.";
    case "review_needed":
      return "At least one selection points to an older immutable version. Keep it intentionally or choose the latest version.";
    case "ready":
      return "Every selected item is an exact current local version. Claims remain unevaluated; nothing has been exported or submitted.";
  }
};

const candidateLabel = (candidate: ApplicationDocumentCandidateDto): string =>
  `${candidate.title} — version ${String(candidate.versionNumber)}${
    candidate.versionLabel === null ? "" : ` (${candidate.versionLabel})`
  }${candidate.latestVersion ? " — latest" : " — older version"}`;

const SelectedSummary = ({
  candidate,
  onReviewExport,
}: {
  readonly candidate: ApplicationDocumentCandidateDto;
  readonly onReviewExport?: ((candidate: ApplicationDocumentCandidateDto) => void) | undefined;
}) => (
  <article className="cd-job-document-selected-item">
    <div>
      <strong>{candidate.title}</strong>
      <span>
        Version {String(candidate.versionNumber)}
        {candidate.versionLabel === null ? "" : ` · ${candidate.versionLabel}`}
      </span>
    </div>
    <dl>
      <div>
        <dt>Lineage</dt>
        <dd>
          {candidate.lineageRole === "job_derivative"
            ? "Job derivative"
            : candidate.lineageRole === "base"
              ? "Reusable base"
              : "Unclassified local document"}
        </dd>
      </div>
      <div>
        <dt>Claims</dt>
        <dd>Not evaluated</dd>
      </div>
    </dl>
    {onReviewExport === undefined ? null : (
      <button
        className="cd-text-button"
        onClick={() => {
          onReviewExport(candidate);
        }}
        type="button"
      >
        Review export for {candidate.title} version {String(candidate.versionNumber)}
      </button>
    )}
  </article>
);

export const JobDocumentPreparation = ({
  model,
  onLoadDocument,
  onSave = () => undefined,
}: JobDocumentPreparationProps) => {
  const headingId = useId();
  const preparation = model.preparation;
  const [resumeVersionId, setResumeVersionId] = useState("");
  const [coverLetterVersionId, setCoverLetterVersionId] = useState("");
  const [answerVersionIds, setAnswerVersionIds] = useState<readonly string[]>([]);
  const [exportCandidate, setExportCandidate] = useState<ApplicationDocumentCandidateDto | null>(
    null,
  );

  useEffect(() => {
    setResumeVersionId(preparation?.selected.resume?.documentVersionId ?? "");
    setCoverLetterVersionId(preparation?.selected.coverLetter?.documentVersionId ?? "");
    setAnswerVersionIds(
      preparation?.selected.answers.map(({ documentVersionId }) => documentVersionId) ?? [],
    );
  }, [preparation?.applicationId, preparation?.applicationRowVersion]);

  useEffect(() => {
    if (
      exportCandidate !== null &&
      preparation !== null &&
      ![
        preparation.selected.resume,
        preparation.selected.coverLetter,
        ...preparation.selected.answers,
      ].some((candidate) => candidate?.documentVersionId === exportCandidate.documentVersionId)
    ) {
      setExportCandidate(null);
    }
  }, [exportCandidate, preparation]);

  const toggleAnswer = (event: ChangeEvent<HTMLInputElement>): void => {
    const { checked, value: id } = event.currentTarget;
    setAnswerVersionIds((current) =>
      checked
        ? Object.freeze([...current, id])
        : Object.freeze(current.filter((candidate) => candidate !== id)),
    );
  };

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (preparation === null || preparation.submitted) return;
    onSave({
      applicationId: preparation.applicationId,
      expectedApplicationRowVersion: preparation.applicationRowVersion,
      resumeVersionId: resumeVersionId === "" ? null : resumeVersionId,
      coverLetterVersionId: coverLetterVersionId === "" ? null : coverLetterVersionId,
      answerVersionIds,
    } as SaveApplicationDocumentPreparationInput);
  };

  return (
    <section
      aria-labelledby={headingId}
      className="cd-job-document-preparation"
      data-job-content-tab="documents"
    >
      <div className="cd-job-content-section-heading">
        <div>
          <p className="cd-eyebrow">Exact local application set</p>
          <h3 id={headingId}>Documents</h3>
          <p>
            Choose immutable versions for this application. Selection never exports, uploads, or
            submits a file.
          </p>
        </div>
      </div>

      {model.loading ? (
        <p className="cd-job-empty-state" role="status">
          Loading local application documents…
        </p>
      ) : model.error !== null ? (
        <p className="cd-job-empty-state" role="alert">
          {model.error}
        </p>
      ) : preparation === null ? (
        <div className="cd-job-empty-state">
          <h4>No application attempt yet</h4>
          <p>Create a local application attempt before selecting its exact document versions.</p>
        </div>
      ) : (
        <>
          <section
            aria-labelledby={`${headingId}-status`}
            className="cd-job-document-status"
            data-preparation-status={preparation.status}
          >
            <div>
              <p className="cd-eyebrow">Preparation status</p>
              <h4 id={`${headingId}-status`}>{statusLabel(preparation.status)}</h4>
            </div>
            <p>{statusExplanation(preparation)}</p>
          </section>

          {preparation.submitted ? (
            <aside className="cd-job-policy-note" role="note">
              This application has an immutable submitted snapshot. Its selected identities cannot
              be changed; the exact submitted set remains separate from current document versions.
            </aside>
          ) : null}

          <form className="cd-job-document-form" onSubmit={submit}>
            <fieldset disabled={model.saving || preparation.submitted}>
              <legend>Resume</legend>
              <label>
                Exact resume version <span aria-hidden="true">*</span>
                <select
                  aria-required="true"
                  onChange={(event) => {
                    setResumeVersionId(event.currentTarget.value);
                  }}
                  value={resumeVersionId}
                >
                  <option value="">No resume selected</option>
                  {preparation.candidates.resumes.map((candidate) => (
                    <option key={candidate.documentVersionId} value={candidate.documentVersionId}>
                      {candidateLabel(candidate)}
                    </option>
                  ))}
                </select>
              </label>
              {preparation.selected.resume === null ? (
                <p>No exact resume version is selected.</p>
              ) : (
                <SelectedSummary
                  candidate={preparation.selected.resume}
                  onReviewExport={onLoadDocument === undefined ? undefined : setExportCandidate}
                />
              )}
            </fieldset>

            <fieldset disabled={model.saving || preparation.submitted}>
              <legend>Cover letter</legend>
              <label>
                Exact cover-letter version
                <select
                  onChange={(event) => {
                    setCoverLetterVersionId(event.currentTarget.value);
                  }}
                  value={coverLetterVersionId}
                >
                  <option value="">No cover letter selected</option>
                  {preparation.candidates.coverLetters.map((candidate) => (
                    <option key={candidate.documentVersionId} value={candidate.documentVersionId}>
                      {candidateLabel(candidate)}
                    </option>
                  ))}
                </select>
              </label>
              {preparation.selected.coverLetter === null ? (
                <p>Optional · no exact cover-letter version selected.</p>
              ) : (
                <SelectedSummary
                  candidate={preparation.selected.coverLetter}
                  onReviewExport={onLoadDocument === undefined ? undefined : setExportCandidate}
                />
              )}
            </fieldset>

            <fieldset disabled={model.saving || preparation.submitted}>
              <legend>Application answers</legend>
              {preparation.candidates.answers.length === 0 ? (
                <p>No eligible local answer documents exist for this job.</p>
              ) : (
                <ul aria-label="Eligible exact answer versions" className="cd-job-answer-options">
                  {preparation.candidates.answers.map((candidate) => (
                    <li key={candidate.documentVersionId}>
                      <label>
                        <input
                          checked={answerVersionIds.includes(candidate.documentVersionId)}
                          onChange={toggleAnswer}
                          type="checkbox"
                          value={candidate.documentVersionId}
                        />
                        <span>{candidateLabel(candidate)}</span>
                      </label>
                    </li>
                  ))}
                </ul>
              )}
              <p>
                {String(preparation.selected.answers.length)} exact answer version
                {preparation.selected.answers.length === 1 ? "" : "s"} currently selected.
              </p>
              {preparation.selected.answers.map((candidate) => (
                <SelectedSummary
                  candidate={candidate}
                  key={candidate.documentVersionId}
                  onReviewExport={onLoadDocument === undefined ? undefined : setExportCandidate}
                />
              ))}
            </fieldset>

            <div className="cd-job-document-actions">
              <button
                className="cd-button cd-button-primary"
                disabled={model.saving || preparation.submitted}
                type="submit"
              >
                {model.saving ? "Saving locally…" : "Save exact selections"}
              </button>
              <p role="note">
                Export and Mark Applied are separate reviewed steps. This status is not a hiring or
                ATS score.
              </p>
            </div>
          </form>
          {exportCandidate === null || onLoadDocument === undefined ? null : (
            <DocumentExportReview
              candidate={exportCandidate}
              onClose={() => {
                setExportCandidate(null);
              }}
              onLoadDocument={onLoadDocument}
            />
          )}
        </>
      )}
    </section>
  );
};
