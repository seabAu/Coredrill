import type { ApplicationResult, StartedApplicationAttemptDto } from "@coredrill/application";
import { useId, useRef, useState, type SyntheticEvent } from "react";

export const ApplicationAttemptForm = ({
  onStart,
}: {
  readonly onStart: (stageName: string) => Promise<ApplicationResult<StartedApplicationAttemptDto>>;
}) => {
  const id = useId();
  const pending = useRef(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current) return;
    pending.current = true;
    setSaving(true);
    setError(null);
    try {
      const result = await onStart(name);
      if (!result.ok) setError(result.error.message);
    } catch {
      setError("The local preparation record could not be created. Nothing was submitted.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return (
    <div className="cd-document-creation">
      <form
        aria-label="Start local application preparation"
        aria-busy={saving}
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <p>
          This creates a local preparation record, not an employer submission. No document is
          selected automatically.
        </p>
        <label htmlFor={id}>Preparation stage name</label>
        <input
          id={id}
          value={name}
          required
          maxLength={80}
          disabled={saving}
          onChange={(event) => {
            setName(event.currentTarget.value);
          }}
        />
        <p>
          Enter the exact name of an existing Preparing stage, or name a new one. No default stages
          are installed.
        </p>
        {error === null ? null : <p role="alert">{error}</p>}
        <button type="submit" disabled={saving}>
          {saving ? "Starting locally…" : "Start preparation locally"}
        </button>
      </form>
    </div>
  );
};
