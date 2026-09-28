import { useEffect, useId, useMemo, useState, type ChangeEvent, type SyntheticEvent } from "react";
import type {
  ApplicationSubmissionDocumentDto,
  ApplicationSubmissionReviewDto,
  MarkApplicationAppliedInput,
} from "@coredrill/application";

export interface ApplicationSubmissionReviewModel {
  readonly review: ApplicationSubmissionReviewDto | null;
  readonly loading: boolean;
  readonly saving: boolean;
  readonly error: string | null;
}

export interface ApplicationSubmissionReviewProps {
  readonly model: ApplicationSubmissionReviewModel;
  readonly onMarkApplied?: (input: MarkApplicationAppliedInput) => void;
}

const shortHash = (value: string): string => `${value.slice(0, 12)}…${value.slice(-8)}`;

const roleLabel = (document: ApplicationSubmissionDocumentDto): string => {
  if (document.role === "resume") return "Resume";
  if (document.role === "cover_letter") return "Cover letter";
  return "Application answer";
};

const formatLabel = (format: "docx" | "pdf" | "plain-text"): string => {
  if (format === "docx") return "DOCX";
  if (format === "pdf") return "PDF";
  return "plain text file";
};

const selectionValue = (purpose: string): string => `file:${purpose}`;

export const ApplicationSubmissionReview = ({
  model,
  onMarkApplied = () => undefined,
}: ApplicationSubmissionReviewProps) => {
  const headingId = useId();
  const review = model.review;
  const [appliedStatusId, setAppliedStatusId] = useState("");
  const [channel, setChannel] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [forms, setForms] = useState<Readonly<Record<string, string>>>({});

  const reviewIdentity = useMemo(
    () =>
      review === null
        ? ""
        : `${review.applicationId}:${String(review.applicationRowVersion)}:${review.documents
            .map(
              ({ documentVersionId, artifacts }) =>
                `${documentVersionId}:${artifacts.map(({ attachmentPurpose }) => attachmentPurpose).join(",")}`,
            )
            .join("|")}`,
    [review],
  );

  useEffect(() => {
    if (review === null) return;
    setAppliedStatusId((current) =>
      review.appliedStatuses.some(({ id }) => id === current)
        ? current
        : review.appliedStatuses.length === 1
          ? (review.appliedStatuses[0]?.id ?? "")
          : "",
    );
    setForms((current) => {
      const next: Record<string, string> = {};
      for (const document of review.documents) {
        const selected = current[document.documentVersionId];
        next[document.documentVersionId] =
          selected === "plain_text" ||
          document.artifacts.some(
            ({ attachmentPurpose }) => selectionValue(attachmentPurpose) === selected,
          )
            ? (selected ?? "")
            : "";
      }
      return Object.freeze(next);
    });
    if (review.snapshot !== null) {
      setChannel(review.snapshot.channel);
      setAppliedStatusId(review.snapshot.statusId);
      setConfirmed(true);
    }
  }, [reviewIdentity, review]);

  const allFormsSelected =
    review !== null &&
    review.documents.length > 0 &&
    review.documents.every(({ documentVersionId }) => (forms[documentVersionId] ?? "") !== "");

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (
      review?.snapshot !== null ||
      !confirmed ||
      appliedStatusId === "" ||
      channel.trim() === "" ||
      !allFormsSelected
    ) {
      return;
    }
    onMarkApplied({
      applicationId: review.applicationId,
      expectedApplicationRowVersion: review.applicationRowVersion,
      appliedStatusId,
      channel: channel.trim(),
      confirmed: true,
      items: review.documents.map((document) => {
        const selected = forms[document.documentVersionId];
        if (selected === "plain_text") {
          return Object.freeze({
            role: document.role,
            documentVersionId: document.documentVersionId,
            submissionFormat: "plain_text" as const,
            contentId: null,
            attachmentPurpose: null,
          });
        }
        const artifact = document.artifacts.find(
          ({ attachmentPurpose }) => selectionValue(attachmentPurpose) === selected,
        );
        if (artifact === undefined) throw new Error("The selected export artifact is unavailable.");
        return Object.freeze({
          role: document.role,
          documentVersionId: document.documentVersionId,
          submissionFormat: "file" as const,
          contentId: artifact.contentId,
          attachmentPurpose: artifact.attachmentPurpose,
        });
      }),
    });
  };

  return (
    <section aria-labelledby={headingId} className="cd-application-submission-review">
      <header>
        <p className="cd-eyebrow">Separate confirmation</p>
        <h4 id={headingId}>Mark Applied</h4>
        <p>
          Record what you already submitted outside Coredrill. This does not upload, autofill, send,
          or verify receipt.
        </p>
      </header>

      {model.loading ? (
        <p role="status">Loading exact local submission choices…</p>
      ) : model.error !== null ? (
        <p role="alert">{model.error}</p>
      ) : review === null ? (
        <p>Select and save an exact resume version before marking this application Applied.</p>
      ) : review.snapshot !== null ? (
        <section aria-label="Immutable submitted snapshot" className="cd-submitted-snapshot">
          <h5>Applied recorded</h5>
          <p>
            {new Date(review.snapshot.appliedAt).toISOString().replace("T", " ").slice(0, 19)} UTC
            {" · "}
            {review.snapshot.channel}
          </p>
          <p>
            This immutable local record reflects your confirmation. Coredrill does not claim that
            the employer received it.
          </p>
          <ol>
            {review.snapshot.items.map((item) => (
              <li key={item.id}>
                <strong>{item.role.replace("_", " ")}</strong>
                {" · version "}
                <code>{item.documentVersionId}</code>
                {item.submissionFormat === "file" ? (
                  <span>
                    {" · "}
                    {item.logicalName}
                    {" · SHA-256 "}
                    <code title={item.contentId ?? undefined}>
                      {item.contentId === null ? "Unavailable" : shortHash(item.contentId)}
                    </code>
                  </span>
                ) : (
                  <span> · exact version text</span>
                )}
              </li>
            ))}
          </ol>
        </section>
      ) : review.documents.length === 0 ? (
        <p role="note">Select and save an exact resume version first.</p>
      ) : (
        <form onSubmit={submit}>
          <fieldset disabled={model.saving}>
            <legend>Exact submitted set</legend>
            {review.documents.map((document) => (
              <label key={document.documentVersionId}>
                {roleLabel(document)} · {document.title} · version {String(document.versionNumber)}
                <select
                  onChange={(event: ChangeEvent<HTMLSelectElement>) => {
                    const value = event.currentTarget.value;
                    setForms((current) =>
                      Object.freeze({
                        ...current,
                        [document.documentVersionId]: value,
                      }),
                    );
                    setConfirmed(false);
                  }}
                  value={forms[document.documentVersionId] ?? ""}
                >
                  <option value="">Choose what you submitted</option>
                  <option value="plain_text">Pasted or entered as exact version text</option>
                  {document.artifacts.map((artifact) => (
                    <option
                      key={artifact.attachmentPurpose}
                      value={selectionValue(artifact.attachmentPurpose)}
                    >
                      {formatLabel(artifact.format)} · {artifact.logicalName} · SHA-256{" "}
                      {shortHash(artifact.contentId)}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <p role="note">
              File choices appear only after Coredrill has retained their exact local SHA-256
              identity. Use each document’s export review to generate or retain a file.
            </p>
          </fieldset>

          <div className="cd-application-submission-fields">
            <label>
              Applied status
              <select
                disabled={model.saving}
                onChange={(event) => {
                  setAppliedStatusId(event.currentTarget.value);
                  setConfirmed(false);
                }}
                value={appliedStatusId}
              >
                <option value="">Choose an Applied status</option>
                {review.appliedStatuses.map((status) => (
                  <option key={status.id} value={status.id}>
                    {status.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Application channel
              <input
                disabled={model.saving}
                maxLength={128}
                onChange={(event) => {
                  setChannel(event.currentTarget.value);
                  setConfirmed(false);
                }}
                placeholder="Company portal"
                required
                type="text"
                value={channel}
              />
            </label>
          </div>

          <label className="cd-application-submission-confirmation">
            <input
              checked={confirmed}
              disabled={
                model.saving || !allFormsSelected || appliedStatusId === "" || channel.trim() === ""
              }
              onChange={(event) => {
                setConfirmed(event.currentTarget.checked);
              }}
              type="checkbox"
            />
            I confirm that I submitted these exact versions and file identities outside Coredrill.
          </label>

          <button
            className="cd-button cd-button-primary"
            disabled={
              model.saving ||
              !confirmed ||
              !allFormsSelected ||
              appliedStatusId === "" ||
              channel.trim() === ""
            }
            type="submit"
          >
            {model.saving ? "Recording locally…" : "Mark Applied and freeze submitted set"}
          </button>
        </form>
      )}
    </section>
  );
};
