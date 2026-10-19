import type { ApplicationResult, CreatedAppliedStageDto } from "@coredrill/application";
import { useId, useRef, useState, type SyntheticEvent } from "react";

export const AppliedStageForm = ({
  onCreate,
  disabled = false,
}: {
  readonly onCreate: (name: string) => Promise<ApplicationResult<CreatedAppliedStageDto>>;
  readonly disabled?: boolean;
}) => {
  const id = useId();
  const pending = useRef(false);
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<CreatedAppliedStageDto | null>(null);
  const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (pending.current || disabled) return;
    pending.current = true;
    setSaving(true);
    setError(null);
    setSaved(null);
    try {
      const result = await onCreate(name);
      if (result.ok) setSaved(result.value);
      else setError(result.error.message);
    } catch {
      setError("The local stage could not be created. No application was marked Applied.");
    } finally {
      pending.current = false;
      setSaving(false);
    }
  };
  return (
    <div className="cd-document-creation">
      <form
        aria-label="Create local Applied stage"
        aria-busy={saving}
        onSubmit={(event) => {
          void submit(event);
        }}
      >
        <p>
          Name an Applied-category pipeline stage for your vault. This creates only a stage, not a
          submission or job-status change.
        </p>
        <label htmlFor={id}>Applied stage name</label>
        <input
          id={id}
          value={name}
          required
          maxLength={80}
          disabled={saving || disabled}
          onChange={(event) => {
            setName(event.currentTarget.value);
          }}
        />
        <p>
          Enter the exact name of an existing Applied stage, or name a new one. No default stage
          names are installed.
        </p>
        {error === null ? null : <p role="alert">{error}</p>}
        {saved === null ? null : (
          <p role="status">
            {saved.created ? "Created" : "Reused existing"} Applied stage: {saved.name}. No
            application was marked Applied.
          </p>
        )}
        <button type="submit" disabled={saving || disabled}>
          {saving ? "Saving stage locally…" : "Create Applied stage locally"}
        </button>
      </form>
    </div>
  );
};
