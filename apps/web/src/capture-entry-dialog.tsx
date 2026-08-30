import { useEffect, useId, useState, type SyntheticEvent } from "react";
import { createPortal } from "react-dom";

import { ExtensionTransferError } from "./extension-transfer.js";
import {
  prepareSuppliedCaptureDraft,
  SuppliedCaptureInputError,
  type SuppliedCaptureMode,
} from "./supplied-capture.js";

export interface CaptureEntryDialogProps {
  readonly initialMode: SuppliedCaptureMode;
  readonly onClose: () => void;
  readonly onStored: (result: { readonly duplicate: boolean; readonly envelopeId: string }) => void;
}

const MODE_COPY = Object.freeze({
  manual: {
    label: "Manual form",
    heading: "Add a job manually",
    description: "Record what you know now. Every value stays a reviewable capture candidate.",
  },
  paste: {
    label: "Paste text or URL",
    heading: "Paste a listing or source URL",
    description: "Coredrill stores supplied content locally and never fetches a pasted URL.",
  },
  file: {
    label: "Saved file",
    heading: "Import a saved capture",
    description: "Choose HTML, plain text, or JSON. HTML is converted to inert readable text.",
  },
});

export function CaptureEntryDialog({ initialMode, onClose, onStored }: CaptureEntryDialogProps) {
  const headingId = useId();
  const [mode, setMode] = useState(initialMode);
  const [title, setTitle] = useState("");
  const [company, setCompany] = useState("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [text, setText] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "saving" | "stored" | "error">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const closeOnEscape = (event: KeyboardEvent): void => {
      if (event.key === "Escape" && status !== "saving") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [onClose, status]);

  const submit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setStatus("saving");
    setMessage("Validating and writing to the local capture inbox…");
    void prepareSuppliedCaptureDraft({ mode, title, company, sourceUrl, text, file })
      .then((draft) => globalThis.coredrillExtensionInbox.ingestSupplied(draft))
      .then((result) => {
        const duplicate = result.duplicateKind !== "none";
        setStatus("stored");
        setMessage(
          duplicate
            ? "This content already has a durable inbox receipt. No second copy was written."
            : "Stored in the local capture inbox. Review it before creating or merging a job.",
        );
        onStored({ duplicate, envelopeId: result.envelopeId });
      })
      .catch((error: unknown) => {
        setStatus("error");
        setMessage(
          error instanceof SuppliedCaptureInputError || error instanceof ExtensionTransferError
            ? error.message
            : "The supplied capture could not be stored. Your input remains in this form.",
        );
      });
  };

  const copy = MODE_COPY[mode];
  return createPortal(
    <div className="cd-capture-dialog-overlay">
      <section
        aria-labelledby={headingId}
        aria-modal="true"
        className="cd-capture-dialog"
        data-capture-mode={mode}
        role="dialog"
      >
        <div className="cd-capture-dialog__header">
          <div>
            <p className="cd-capture-dialog__eyebrow">Local capture inbox</p>
            <h2 id={headingId}>{copy.heading}</h2>
            <p>{copy.description}</p>
          </div>
          <button
            aria-label="Close capture dialog"
            className="cd-icon-button"
            disabled={status === "saving"}
            onClick={onClose}
            type="button"
          >
            ×
          </button>
        </div>

        <div aria-label="Capture method" className="cd-capture-dialog__tabs" role="group">
          {(Object.keys(MODE_COPY) as SuppliedCaptureMode[]).map((candidate) => (
            <button
              aria-pressed={mode === candidate}
              key={candidate}
              onClick={() => {
                setMode(candidate);
                setStatus("idle");
                setMessage("");
              }}
              type="button"
            >
              {MODE_COPY[candidate].label}
            </button>
          ))}
        </div>

        <form className="cd-capture-form" onSubmit={submit}>
          <div className="cd-capture-form__columns">
            <label>
              Job title {mode === "manual" ? "(required)" : "(optional)"}
              <input
                autoFocus
                maxLength={1024}
                onChange={(event) => {
                  setTitle(event.currentTarget.value);
                }}
                required={mode === "manual"}
                value={title}
              />
            </label>
            <label>
              Company (optional)
              <input
                maxLength={1024}
                onChange={(event) => {
                  setCompany(event.currentTarget.value);
                }}
                value={company}
              />
            </label>
          </div>

          <label>
            Source URL (optional)
            <input
              inputMode="url"
              maxLength={8192}
              onChange={(event) => {
                setSourceUrl(event.currentTarget.value);
              }}
              placeholder="https://employer.example/jobs/role"
              type="url"
              value={sourceUrl}
            />
          </label>

          {mode === "file" ? (
            <label>
              Saved HTML, text, or JSON file
              <input
                accept=".html,.htm,.txt,.json,application/json,text/html,text/plain"
                onChange={(event) => {
                  setFile(event.currentTarget.files?.[0] ?? null);
                }}
                required
                type="file"
              />
              <small>Maximum 2 MiB. Files stay on this device and are not uploaded.</small>
            </label>
          ) : (
            <label>
              {mode === "manual"
                ? "Notes or listing details (optional)"
                : "Pasted listing text or URL"}
              <textarea
                maxLength={512 * 1024}
                onChange={(event) => {
                  setText(event.currentTarget.value);
                }}
                placeholder={
                  mode === "manual"
                    ? "Role notes, responsibilities, or other source-backed details"
                    : "Paste listing text, or paste a complete HTTP(S) URL by itself"
                }
                rows={8}
                value={text}
              />
            </label>
          )}

          <p className="cd-capture-form__boundary">
            Accountless · local only · AI disabled · no URL fetching · review required
          </p>
          {message.length > 0 ? (
            <p aria-live="polite" className={`cd-capture-form__status is-${status}`} role="status">
              {message}
            </p>
          ) : null}
          <div className="cd-capture-form__actions">
            <button
              className="cd-button"
              disabled={status === "saving"}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className="cd-button cd-button-primary"
              disabled={status === "saving"}
              type="submit"
            >
              {status === "saving" ? "Saving locally…" : "Save to capture inbox"}
            </button>
          </div>
        </form>
      </section>
    </div>,
    document.body,
  );
}
