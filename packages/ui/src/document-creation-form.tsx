import type {
  ApplicationResult,
  CreatedReusableDocumentDto,
  CreateReusableDocumentInput,
} from "@coredrill/application";
import { useId, useRef, useState, type SyntheticEvent } from "react";

export interface DocumentCreationFormProps {
  readonly onCreate: (
    input: CreateReusableDocumentInput,
  ) => Promise<ApplicationResult<CreatedReusableDocumentDto>>;
}

export const DocumentCreationForm = ({ onCreate }: DocumentCreationFormProps) => {
  const id = useId();
  const pending = useRef(false);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<CreateReusableDocumentInput["kind"]>("resume");
  const [initialText, setInitialText] = useState("");
  const trigger = useRef<HTMLButtonElement>(null);

  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await onCreate({ title, kind, initialText });
      if (!result.ok) {
        setError(result.error.message);
        return;
      }
      setTitle("");
      setInitialText("");
      setOpen(false);
      trigger.current?.focus();
    } catch {
      setError("The local creation action failed. Your entered text has been kept.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };

  return (
    <section aria-label="Create a reusable document" className="cd-document-creation">
      <button
        aria-expanded={open}
        aria-controls={open ? id : undefined}
        onClick={() => {
          setOpen(!open);
        }}
        ref={trigger}
        disabled={saving}
        type="button"
      >
        New document
      </button>
      {open ? (
        <form
          id={id}
          onSubmit={(event) => {
            void submit(event);
          }}
          aria-label="New reusable document"
          aria-busy={saving}
        >
          <p>
            Create a reusable base locally. Text is manually authored, not verified evidence.
            Nothing uploads, applies, or selects it for a job.
          </p>
          <label htmlFor={`${id}-title`}>Document title</label>
          <input
            id={`${id}-title`}
            required
            maxLength={512}
            value={title}
            onChange={(event) => {
              setTitle(event.currentTarget.value);
            }}
            disabled={saving}
          />
          <label htmlFor={`${id}-kind`}>Document kind</label>
          <select
            id={`${id}-kind`}
            value={kind}
            onChange={(event) => {
              setKind(event.currentTarget.value === "cover_letter" ? "cover_letter" : "resume");
            }}
            disabled={saving}
          >
            <option value="resume">Resume</option>
            <option value="cover_letter">Cover letter</option>
          </select>
          <label htmlFor={`${id}-text`}>Initial document text</label>
          <textarea
            id={`${id}-text`}
            maxLength={100_000}
            rows={6}
            value={initialText}
            onChange={(event) => {
              setInitialText(event.currentTarget.value);
            }}
            disabled={saving}
          />
          <p>
            A blank first version is allowed. You can edit and create later versions in the document
            editor.
          </p>
          {error === null ? null : <p role="alert">{error}</p>}
          <button type="submit" disabled={saving}>
            {saving ? "Creating locally…" : "Create document locally"}
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => {
              setOpen(false);
              trigger.current?.focus();
            }}
          >
            Cancel
          </button>
        </form>
      ) : null}
    </section>
  );
};
