import type {
  ApplicationDocumentCandidateDto,
  ApplicationResult,
  DocumentEditorSessionDto,
} from "@coredrill/application";
import { parseDocumentIr } from "@coredrill/documents";
import {
  createLocalDocumentExportPreview,
  exportDownloadableLocalDocument,
  renderAccessiblePrintDocument,
  type ImmutableDocumentExportSource,
  type LocalDocumentExportFormat,
} from "@coredrill/documents/export";
import { useEffect, useMemo, useRef, useState } from "react";

export interface DocumentExportReviewProps {
  readonly candidate: ApplicationDocumentCandidateDto;
  readonly onClose: () => void;
  readonly onLoadDocument: (
    documentId: string,
  ) => Promise<ApplicationResult<DocumentEditorSessionDto>>;
}

type ExportReviewState =
  | { readonly kind: "loading" }
  | { readonly kind: "error"; readonly message: string }
  | { readonly kind: "ready"; readonly source: ImmutableDocumentExportSource };

const formatLabel = (format: LocalDocumentExportFormat): string => {
  if (format === "docx") return "DOCX";
  if (format === "pdf") return "PDF";
  return "Plain text";
};

const shortHash = (value: string): string => `${value.slice(0, 12)}…${value.slice(-8)}`;

const formatCreatedAt = (value: string): string =>
  `${new Date(value).toISOString().slice(0, 16).replace("T", " ")} UTC`;

const downloadBytes = (bytes: Uint8Array, mediaType: string, fileName: string): void => {
  const url = URL.createObjectURL(new Blob([Uint8Array.from(bytes)], { type: mediaType }));
  const anchor = document.createElement("a");
  anchor.download = fileName;
  anchor.href = url;
  anchor.click();
  URL.revokeObjectURL(url);
};

export const DocumentExportReview = ({
  candidate,
  onClose,
  onLoadDocument,
}: DocumentExportReviewProps) => {
  const [format, setFormat] = useState<LocalDocumentExportFormat>("docx");
  const [requestedBaseName, setRequestedBaseName] = useState(candidate.title);
  const [state, setState] = useState<ExportReviewState>({ kind: "loading" });
  const [actionStatus, setActionStatus] = useState("");
  const previewTarget = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let active = true;
    setState({ kind: "loading" });
    setActionStatus("");
    void onLoadDocument(candidate.documentId)
      .then((result) => {
        if (!active) return;
        if (!result.ok) {
          setState({ kind: "error", message: result.error.message });
          return;
        }
        const version = result.value.versions.find(({ id }) => id === candidate.documentVersionId);
        if (version === undefined) {
          setState({
            kind: "error",
            message: "The selected immutable version is no longer available locally.",
          });
          return;
        }
        try {
          setState({
            kind: "ready",
            source: Object.freeze({
              documentVersionId: version.id,
              title: candidate.title,
              versionNumber: version.versionNumber,
              versionLabel: version.label,
              createdAt: version.createdAt,
              contentHash: version.contentHash,
              content: parseDocumentIr(version.content),
            }),
          });
        } catch {
          setState({
            kind: "error",
            message: "The selected immutable version is outside the supported export schema.",
          });
        }
      })
      .catch(() => {
        if (active) {
          setState({
            kind: "error",
            message: "The selected immutable version could not be loaded from the local vault.",
          });
        }
      });
    return () => {
      active = false;
    };
  }, [candidate, onLoadDocument]);

  const preview = useMemo(
    () =>
      state.kind === "ready"
        ? createLocalDocumentExportPreview(state.source, format, requestedBaseName)
        : null,
    [format, requestedBaseName, state],
  );

  useEffect(() => {
    if (preview === null || previewTarget.current === null) return;
    previewTarget.current.replaceChildren(
      renderAccessiblePrintDocument(preview.content, { title: preview.title }),
    );
  }, [preview]);

  const exportDocument = async (): Promise<void> => {
    if (preview === null) return;
    setActionStatus("");
    if (preview.format === "pdf") {
      const previousTitle = document.title;
      document.title = preview.suggestedFileName.replace(/\.pdf$/iu, "");
      document.documentElement.dataset["documentExportPrinting"] = "true";
      try {
        window.print();
        setActionStatus(
          "Local print opened. Choose Save as PDF and review paper size, margins, and scaling before saving.",
        );
      } finally {
        delete document.documentElement.dataset["documentExportPrinting"];
        document.title = previousTitle;
      }
      return;
    }
    try {
      const exported = await exportDownloadableLocalDocument(preview);
      downloadBytes(exported.bytes, exported.mediaType, exported.suggestedFileName);
      setActionStatus(
        `${formatLabel(preview.format)} generated locally · SHA-256 ${exported.sha256}`,
      );
    } catch {
      setActionStatus("The local export failed safely. The immutable version was not changed.");
    }
  };

  return (
    <section
      aria-label={`Export review for ${candidate.title} version ${String(candidate.versionNumber)}`}
      className="cd-document-export-review"
      data-document-export-review={candidate.documentVersionId}
    >
      <header className="cd-document-export-review__heading">
        <div>
          <p className="cd-eyebrow">Local export review</p>
          <h4>
            {candidate.title} · version {String(candidate.versionNumber)}
          </h4>
          <p>Preview an exact immutable version before creating a local file.</p>
        </div>
        <button className="cd-text-button" onClick={onClose} type="button">
          Close export review
        </button>
      </header>

      {state.kind === "loading" ? (
        <p aria-live="polite" role="status">
          Loading the exact local version…
        </p>
      ) : state.kind === "error" ? (
        <p role="alert">{state.message}</p>
      ) : preview === null ? null : (
        <>
          <div className="cd-document-export-review__controls">
            <label>
              Export format
              <select
                onChange={(event) => {
                  setFormat(event.currentTarget.value as LocalDocumentExportFormat);
                  setActionStatus("");
                }}
                value={format}
              >
                <option value="docx">DOCX</option>
                <option value="pdf">PDF through local print</option>
                <option value="plain-text">Plain text</option>
              </select>
            </label>
            <label>
              File name
              <input
                maxLength={96}
                onChange={(event) => {
                  setRequestedBaseName(event.currentTarget.value);
                  setActionStatus("");
                }}
                type="text"
                value={requestedBaseName}
              />
            </label>
          </div>

          <dl className="cd-document-export-metadata" aria-label="Export metadata">
            <div>
              <dt>Exact version</dt>
              <dd>
                {String(preview.versionNumber)}
                {preview.versionLabel === null ? "" : ` · ${preview.versionLabel}`}
              </dd>
            </div>
            <div>
              <dt>Created</dt>
              <dd>{formatCreatedAt(preview.createdAt)}</dd>
            </div>
            <div>
              <dt>Source hash</dt>
              <dd title={preview.contentHash}>{shortHash(preview.contentHash)}</dd>
            </div>
            <div>
              <dt>Local file</dt>
              <dd>{preview.suggestedFileName}</dd>
            </div>
          </dl>

          <section aria-label="Format warnings" className="cd-document-export-warnings">
            <h5>Format warnings</h5>
            {preview.warnings.length === 0 ? (
              <p>No unsupported formatting is expected for this restricted document.</p>
            ) : (
              <ul>
                {preview.warnings.map((warning) => (
                  <li data-warning-code={warning.code} key={warning.code}>
                    {warning.message}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-label="Document preview" className="cd-document-export-preview">
            <div className="cd-document-export-preview__toolbar">
              <h5>Preview</h5>
              <span>
                Page 1 of {String(preview.pageCount)} · {formatLabel(preview.format)}
              </span>
            </div>
            <div className="cd-document-export-page" ref={previewTarget} />
          </section>

          <div className="cd-document-export-review__actions">
            <button
              className="cd-button cd-button-primary"
              onClick={() => {
                void exportDocument();
              }}
              type="button"
            >
              {preview.format === "pdf"
                ? "Print or save PDF"
                : `Download ${formatLabel(preview.format)}`}
            </button>
            <p role="note">
              This uses local processing only. It does not mutate the version, upload, submit, or
              mark the application applied.
            </p>
          </div>
          <p aria-live="polite" className="cd-document-export-status" role="status">
            {actionStatus}
          </p>
        </>
      )}
    </section>
  );
};
