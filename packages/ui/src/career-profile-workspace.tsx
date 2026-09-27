import {
  MANUAL_CAREER_PROFILE_KINDS,
  analyzeResumeImportReviewQueue,
  validateCareerStory,
  validateManualCareerProfileEntry,
  type ApplicationResult,
  type CareerProfileEntryDto,
  type CareerProfileValidationIssue,
  type CareerStoryDto,
  type CareerStoryEvidenceKind,
  type CareerStoryValidationIssue,
  type CreateCareerStoryInput,
  type CreateManualCareerProfileEntryInput,
  type ManualCareerProfileKind,
  type ResumeImportQueueItemDto,
  type ResolveResumeImportGroupInput,
  type ResumeImportResolutionDto,
  type ResumeImportReviewGroupDto,
  type UpdateCareerStoryInput,
} from "@coredrill/application";
import {
  useId,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type SyntheticEvent,
} from "react";

export const CAREER_PROFILE_EDITOR_SECTIONS = Object.freeze([
  { id: "basics", label: "Basics & preferences" },
  { id: "employment", label: "Work" },
  { id: "education", label: "Education" },
  { id: "project", label: "Projects" },
  { id: "skill", label: "Skills" },
  { id: "accomplishment", label: "Accomplishments" },
  { id: "certification", label: "Certifications" },
  { id: "publication", label: "Publications" },
  { id: "volunteer", label: "Volunteering" },
  { id: "story", label: "Stories" },
] as const satisfies readonly {
  readonly id: CareerProfileSectionKind;
  readonly label: string;
}[]);

export type CareerProfileSectionKind = ManualCareerProfileKind | "story";

export interface CareerProfileWorkspaceModel {
  readonly entries: readonly CareerProfileEntryDto[];
  readonly imports: readonly ResumeImportQueueItemDto[];
  readonly stories: readonly CareerStoryDto[];
  readonly loading: boolean;
}

export interface ResumeImportFileInput {
  readonly bytes: Uint8Array;
  readonly fileName: string;
  readonly mediaType?: string;
}

export interface CareerProfileWorkspaceProps {
  readonly model: CareerProfileWorkspaceModel;
  readonly onImport: (
    input: ResumeImportFileInput,
  ) => Promise<ApplicationResult<ResumeImportQueueItemDto>>;
  readonly onResolve: (
    input: ResolveResumeImportGroupInput,
  ) => Promise<ApplicationResult<ResumeImportResolutionDto>>;
  readonly onSave: (
    input: CreateManualCareerProfileEntryInput,
  ) => Promise<ApplicationResult<CareerProfileEntryDto>>;
  readonly onCreateStory: (
    input: CreateCareerStoryInput,
  ) => Promise<ApplicationResult<CareerStoryDto>>;
  readonly onUpdateStory: (
    input: UpdateCareerStoryInput,
  ) => Promise<ApplicationResult<CareerStoryDto>>;
}

const LABEL_BY_KIND: Readonly<Record<CareerProfileSectionKind, string>> = Object.freeze(
  Object.fromEntries(CAREER_PROFILE_EDITOR_SECTIONS.map(({ id, label }) => [id, label])) as Record<
    CareerProfileSectionKind,
    string
  >,
);

const inputValue = (data: FormData, name: string): string => {
  const value = data.get(name);
  return typeof value === "string" ? value : "";
};

const listValue = (data: FormData, name: string): readonly string[] =>
  Object.freeze(
    inputValue(data, name)
      .split(",")
      .map((value) => value.trim())
      .filter((value) => value.length > 0),
  );

const buildInput = (
  kind: ManualCareerProfileKind,
  data: FormData,
): CreateManualCareerProfileEntryInput => {
  switch (kind) {
    case "basics":
      return {
        kind,
        displayName: inputValue(data, "displayName"),
        summary: inputValue(data, "summary"),
        targetRoles: listValue(data, "targetRoles"),
        workModes: listValue(data, "workModes"),
      };
    case "employment":
    case "volunteer":
      return {
        kind,
        organization: inputValue(data, "organization"),
        role: inputValue(data, "role"),
        startDate: inputValue(data, "startDate"),
        endDate: inputValue(data, "endDate"),
        current: data.get("current") === "on",
        description: inputValue(data, "description"),
      };
    case "education":
      return {
        kind,
        institution: inputValue(data, "institution"),
        credential: inputValue(data, "credential"),
        field: inputValue(data, "field"),
        startDate: inputValue(data, "startDate"),
        endDate: inputValue(data, "endDate"),
        details: inputValue(data, "details"),
      };
    case "project":
      return {
        kind,
        name: inputValue(data, "name"),
        summary: inputValue(data, "summary"),
        url: inputValue(data, "url"),
        startDate: inputValue(data, "startDate"),
        endDate: inputValue(data, "endDate"),
      };
    case "skill":
      return {
        kind,
        canonicalName: inputValue(data, "canonicalName"),
        category: inputValue(data, "category"),
        aliases: listValue(data, "aliases"),
      };
    case "accomplishment":
      return {
        kind,
        action: inputValue(data, "action"),
        result: inputValue(data, "result"),
      };
    case "certification":
      return {
        kind,
        name: inputValue(data, "name"),
        issuer: inputValue(data, "issuer"),
        issuedDate: inputValue(data, "issuedDate"),
        expiresDate: inputValue(data, "expiresDate"),
        credentialUrl: inputValue(data, "credentialUrl"),
      };
    case "publication":
      return {
        kind,
        title: inputValue(data, "title"),
        publisher: inputValue(data, "publisher"),
        publishedDate: inputValue(data, "publishedDate"),
        url: inputValue(data, "url"),
        summary: inputValue(data, "summary"),
      };
  }
};

interface FieldProps {
  readonly children?: ReactNode;
  readonly hint?: string | undefined;
  readonly issue?: CareerProfileValidationIssue | undefined;
  readonly label: string;
  readonly name: string;
  readonly required?: boolean;
  readonly type?: "date" | "text" | "url";
}

const Field = ({
  children,
  hint,
  issue,
  label,
  name,
  required = false,
  type = "text",
}: FieldProps) => {
  const descriptionId = `${name}-description`;
  return (
    <div className="cd-career-field">
      <label htmlFor={name}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      {children ?? (
        <input
          aria-describedby={hint !== undefined || issue !== undefined ? descriptionId : undefined}
          aria-invalid={issue === undefined ? undefined : true}
          id={name}
          name={name}
          required={required}
          type={type}
        />
      )}
      {issue !== undefined ? (
        <p className="cd-career-field-error" id={descriptionId}>
          {issue.message}
        </p>
      ) : hint !== undefined ? (
        <p className="cd-career-field-hint" id={descriptionId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
};

const TextAreaField = ({
  issue,
  label,
  name,
  required = false,
}: Pick<FieldProps, "issue" | "label" | "name" | "required">) => {
  const descriptionId = `${name}-description`;
  return (
    <div className="cd-career-field cd-career-field-wide">
      <label htmlFor={name}>
        {label}
        {required ? <span aria-hidden="true"> *</span> : null}
      </label>
      <textarea
        aria-describedby={issue === undefined ? undefined : descriptionId}
        aria-invalid={issue === undefined ? undefined : true}
        id={name}
        maxLength={200_000}
        name={name}
        required={required}
        rows={4}
      />
      {issue !== undefined ? (
        <p className="cd-career-field-error" id={descriptionId}>
          {issue.message}
        </p>
      ) : null}
    </div>
  );
};

const DateRangeFields = ({
  issues,
}: {
  readonly issues: ReadonlyMap<string, CareerProfileValidationIssue>;
}) => (
  <>
    <Field issue={issues.get("startDate")} label="Start date" name="startDate" type="date" />
    <Field issue={issues.get("endDate")} label="End date" name="endDate" type="date" />
  </>
);

const EditorFields = ({
  issues,
  kind,
}: {
  readonly issues: ReadonlyMap<string, CareerProfileValidationIssue>;
  readonly kind: ManualCareerProfileKind;
}) => {
  switch (kind) {
    case "basics":
      return (
        <>
          <Field
            issue={issues.get("displayName")}
            label="Display name"
            name="displayName"
            required
          />
          <Field
            hint="Separate roles with commas."
            issue={issues.get("targetRoles")}
            label="Target roles"
            name="targetRoles"
          />
          <Field
            hint="For example: remote, hybrid, on-site."
            issue={issues.get("workModes")}
            label="Work modes"
            name="workModes"
          />
          <TextAreaField
            issue={issues.get("summary")}
            label="Professional summary"
            name="summary"
          />
        </>
      );
    case "employment":
    case "volunteer":
      return (
        <>
          <Field
            issue={issues.get("organization")}
            label="Organization"
            name="organization"
            required
          />
          <Field issue={issues.get("role")} label="Role" name="role" required />
          <DateRangeFields issues={issues} />
          <div className="cd-career-field cd-career-checkbox">
            <input id="current" name="current" type="checkbox" />
            <label htmlFor="current">This is current</label>
          </div>
          <TextAreaField issue={issues.get("description")} label="Description" name="description" />
        </>
      );
    case "education":
      return (
        <>
          <Field
            issue={issues.get("institution")}
            label="Institution"
            name="institution"
            required
          />
          <Field issue={issues.get("credential")} label="Credential" name="credential" required />
          <Field issue={issues.get("field")} label="Field of study" name="field" />
          <DateRangeFields issues={issues} />
          <TextAreaField issue={issues.get("details")} label="Details" name="details" />
        </>
      );
    case "project":
      return (
        <>
          <Field issue={issues.get("name")} label="Project name" name="name" required />
          <Field issue={issues.get("url")} label="Project URL" name="url" type="url" />
          <DateRangeFields issues={issues} />
          <TextAreaField issue={issues.get("summary")} label="Summary" name="summary" />
        </>
      );
    case "skill":
      return (
        <>
          <Field issue={issues.get("canonicalName")} label="Skill" name="canonicalName" required />
          <Field issue={issues.get("category")} label="Category" name="category" />
          <Field
            hint="Separate aliases with commas."
            issue={issues.get("aliases")}
            label="Aliases"
            name="aliases"
          />
        </>
      );
    case "accomplishment":
      return (
        <>
          <TextAreaField issue={issues.get("action")} label="Action" name="action" required />
          <TextAreaField issue={issues.get("result")} label="Result" name="result" required />
        </>
      );
    case "certification":
      return (
        <>
          <Field issue={issues.get("name")} label="Certification" name="name" required />
          <Field issue={issues.get("issuer")} label="Issuer" name="issuer" required />
          <Field
            issue={issues.get("issuedDate")}
            label="Issue date"
            name="issuedDate"
            type="date"
          />
          <Field
            issue={issues.get("expiresDate")}
            label="Expiration date"
            name="expiresDate"
            type="date"
          />
          <Field
            issue={issues.get("credentialUrl")}
            label="Credential URL"
            name="credentialUrl"
            type="url"
          />
        </>
      );
    case "publication":
      return (
        <>
          <Field issue={issues.get("title")} label="Title" name="title" required />
          <Field issue={issues.get("publisher")} label="Publisher" name="publisher" />
          <Field
            issue={issues.get("publishedDate")}
            label="Publication date"
            name="publishedDate"
            type="date"
          />
          <Field issue={issues.get("url")} label="Publication URL" name="url" type="url" />
          <TextAreaField issue={issues.get("summary")} label="Summary" name="summary" />
        </>
      );
  }
};

const dateLabel = (entry: CareerProfileEntryDto): string | null => {
  if (entry.startDate === null && entry.endDate === null && !entry.current) return null;
  if (entry.current) return `${entry.startDate ?? "Start not recorded"} – Present`;
  if (entry.startDate === null) return entry.endDate;
  if (entry.endDate === null) return entry.startDate;
  return `${entry.startDate} – ${entry.endDate}`;
};

const storyEvidenceKey = (kind: string, id: string): string => `${kind}:${id}`;

const StoryEditorFields = ({
  entries,
  issues,
  story,
}: {
  readonly entries: readonly CareerProfileEntryDto[];
  readonly issues: ReadonlyMap<string, CareerStoryValidationIssue>;
  readonly story: CareerStoryDto | null;
}) => {
  const selected = new Set(
    story?.linkedEvidence.map(({ evidenceId, evidenceKind }) =>
      storyEvidenceKey(evidenceKind, evidenceId),
    ) ?? [],
  );
  const linkable = entries.filter(({ kind }) => kind !== "basics");
  return (
    <>
      <div className="cd-career-field cd-career-field-wide">
        <label htmlFor="story-title">Story title *</label>
        <input
          aria-invalid={issues.has("title") || undefined}
          defaultValue={story?.title ?? ""}
          id="story-title"
          maxLength={512}
          name="title"
          required
          type="text"
        />
        {issues.has("title") ? (
          <p className="cd-career-field-error">{issues.get("title")?.message}</p>
        ) : null}
      </div>
      {(["situation", "action", "result"] as const).map((field) => (
        <div className="cd-career-field cd-career-field-wide" key={field}>
          <label htmlFor={`story-${field}`}>
            {field[0]?.toUpperCase()}
            {field.slice(1)} *
          </label>
          <textarea
            aria-invalid={issues.has(field) || undefined}
            defaultValue={story?.[field] ?? ""}
            id={`story-${field}`}
            maxLength={20_000}
            name={field}
            required
            rows={4}
          />
          {issues.has(field) ? (
            <p className="cd-career-field-error">{issues.get(field)?.message}</p>
          ) : null}
        </div>
      ))}
      <Field hint="Separate reusable topic or skill labels with commas." label="Tags" name="tags">
        <input defaultValue={story?.tags.join(", ") ?? ""} id="tags" name="tags" type="text" />
      </Field>
      <Field
        hint="Optional content-free labels such as nda or confidential-client. Tagged stories stay out of later external AI context by default."
        issue={issues.get("privacyTags")}
        label="Privacy tags"
        name="privacyTags"
      >
        <input
          aria-invalid={issues.has("privacyTags") || undefined}
          defaultValue={story?.privacyTags.join(", ") ?? ""}
          id="privacyTags"
          name="privacyTags"
          type="text"
        />
      </Field>
      <fieldset className="cd-career-story-evidence">
        <legend>Linked Career Profile evidence</legend>
        <p>
          Choose the canonical records that support this story. Linking never copies or changes
          those records.
        </p>
        {linkable.length === 0 ? (
          <p className="cd-career-empty">Add Career Profile evidence before linking a story.</p>
        ) : (
          <ul>
            {linkable.map((entry) => {
              const key = storyEvidenceKey(entry.kind, entry.id);
              return (
                <li key={key}>
                  <label>
                    <input
                      defaultChecked={selected.has(key)}
                      name="linkedEvidence"
                      type="checkbox"
                      value={key}
                    />
                    <span>
                      <strong>{entry.primaryLabel}</strong>
                      <small>
                        {LABEL_BY_KIND[entry.kind]}
                        {entry.secondaryLabel === null ? "" : ` · ${entry.secondaryLabel}`} ·{" "}
                        {entry.verificationState === "imported"
                          ? "Imported · not confirmed"
                          : "User-confirmed"}
                      </small>
                    </span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
        {issues.has("linkedEvidence") ? (
          <p className="cd-career-field-error">{issues.get("linkedEvidence")?.message}</p>
        ) : null}
      </fieldset>
    </>
  );
};

export const CareerProfileWorkspace = ({
  model,
  onCreateStory,
  onImport,
  onResolve,
  onSave,
  onUpdateStory,
}: CareerProfileWorkspaceProps) => {
  const panelId = useId();
  const [activeKind, setActiveKind] = useState<CareerProfileSectionKind>("basics");
  const [issues, setIssues] = useState<readonly CareerProfileValidationIssue[]>([]);
  const [storyIssues, setStoryIssues] = useState<readonly CareerStoryValidationIssue[]>([]);
  const [editingStoryId, setEditingStoryId] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importStatus, setImportStatus] = useState("");
  const [resolvingGroup, setResolvingGroup] = useState<string | null>(null);
  const issueMap = new Map(issues.map((value) => [value.field, value]));
  const storyIssueMap = new Map(storyIssues.map((value) => [value.field, value]));
  const visibleEntries = model.entries.filter(
    ({ kind }) => activeKind !== "story" && kind === activeKind,
  );
  const editingStory = model.stories.find(({ id }) => id === editingStoryId) ?? null;
  const reviewGroups = analyzeResumeImportReviewQueue(model.imports, model.entries);

  const selectKind = (kind: CareerProfileSectionKind): void => {
    setActiveKind(kind);
    setIssues([]);
    setStoryIssues([]);
    setStatus("");
  };

  const moveSectionFocus = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    kind: CareerProfileSectionKind,
  ): void => {
    const currentIndex = CAREER_PROFILE_EDITOR_SECTIONS.findIndex(({ id }) => id === kind);
    let nextIndex: number | null = null;
    if (event.key === "ArrowRight" || event.key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % CAREER_PROFILE_EDITOR_SECTIONS.length;
    } else if (event.key === "ArrowLeft" || event.key === "ArrowUp") {
      nextIndex =
        (currentIndex - 1 + CAREER_PROFILE_EDITOR_SECTIONS.length) %
        CAREER_PROFILE_EDITOR_SECTIONS.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = CAREER_PROFILE_EDITOR_SECTIONS.length - 1;
    }
    if (nextIndex === null) return;

    event.preventDefault();
    const nextKind = CAREER_PROFILE_EDITOR_SECTIONS[nextIndex]?.id;
    if (nextKind === undefined) return;
    selectKind(nextKind);
    document.getElementById(`${panelId}-${nextKind}-tab`)?.focus();
  };

  if (
    model.entries.length > 10_000 ||
    model.stories.length > 10_000 ||
    model.imports.length > 1_000 ||
    new Set(model.entries.map(({ id }) => id)).size !== model.entries.length ||
    model.entries.some(({ kind }) => !MANUAL_CAREER_PROFILE_KINDS.includes(kind)) ||
    new Set(model.stories.map(({ id }) => id)).size !== model.stories.length
  ) {
    throw new RangeError("Career Profile workspace model is invalid.");
  }

  const importResume = async (event: SyntheticEvent<HTMLInputElement>): Promise<void> => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (file === undefined) return;
    setImporting(true);
    setImportStatus("Reading the local resume…");
    try {
      const result = await onImport({
        bytes: new Uint8Array(await file.arrayBuffer()),
        fileName: file.name,
        ...(file.type.length === 0 ? {} : { mediaType: file.type }),
      });
      setImportStatus(
        result.ok
          ? `${String(result.value.proposalCount)} proposal${result.value.proposalCount === 1 ? "" : "s"} queued for review. Nothing was verified or added to your profile.`
          : result.error.message,
      );
    } catch {
      setImportStatus("This local resume could not be read safely.");
    } finally {
      setImporting(false);
      input.value = "";
    }
  };

  const resolveGroup = async (
    group: ResumeImportReviewGroupDto,
    input: ResolveResumeImportGroupInput,
  ): Promise<void> => {
    const key = `${group.importRunId}:${group.groupKey}`;
    setResolvingGroup(key);
    setImportStatus("Saving the explicit proposal decision locally…");
    try {
      const result = await onResolve(input);
      setImportStatus(
        result.ok
          ? result.value.decision === "rejected"
            ? "Proposal rejected. Its source excerpt remains in the local resolution history."
            : result.value.decision === "merged_existing"
              ? "Proposal linked to the existing entry without overwriting it."
              : "Proposal accepted as imported evidence. It is not user-confirmed."
          : result.error.message,
      );
    } catch {
      setImportStatus("The proposal decision could not be saved safely.");
    } finally {
      setResolvingGroup(null);
    }
  };

  const acceptGroup = async (
    event: SyntheticEvent<HTMLFormElement>,
    group: ResumeImportReviewGroupDto,
  ): Promise<void> => {
    event.preventDefault();
    if (group.target === "skill") {
      await resolveGroup(group, {
        decision: "accepted_new",
        groupKey: group.groupKey,
        importRunId: group.importRunId,
        target: "skill",
      });
      return;
    }
    if (group.target !== "employment") return;
    const data = new FormData(event.currentTarget);
    const dateDecision = inputValue(data, "dateDecision");
    if (dateDecision !== "explicit" && dateDecision !== "unknown") {
      setImportStatus("Choose exact dates or explicitly keep the imported dates unknown.");
      return;
    }
    await resolveGroup(group, {
      current: data.get("current") === "on",
      dateDecision,
      decision: "accepted_new",
      endDate: inputValue(data, "endDate") || null,
      groupKey: group.groupKey,
      importRunId: group.importRunId,
      startDate: inputValue(data, "startDate") || null,
      target: "employment",
    });
  };

  const submit = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (activeKind === "story") return;
    setStatus("");
    const form = event.currentTarget;
    const input = buildInput(activeKind, new FormData(form));
    const validation = validateManualCareerProfileEntry(input);
    if (!validation.ok) {
      setIssues(validation.issues);
      setStatus("Review the highlighted fields.");
      return;
    }

    setIssues([]);
    setSaving(true);
    const result = await onSave(input);
    setSaving(false);
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    form.reset();
    setStatus(`${LABEL_BY_KIND[activeKind]} saved locally as user-confirmed information.`);
  };

  const submitStory = async (event: SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const input: CreateCareerStoryInput = {
      title: inputValue(data, "title"),
      situation: inputValue(data, "situation"),
      action: inputValue(data, "action"),
      result: inputValue(data, "result"),
      tags: listValue(data, "tags"),
      privacyTags: listValue(data, "privacyTags"),
      linkedEvidence: Object.freeze(
        data
          .getAll("linkedEvidence")
          .filter((value): value is string => typeof value === "string")
          .map((value) => {
            const separator = value.indexOf(":");
            return Object.freeze({
              evidenceKind: value.slice(0, separator) as CareerStoryEvidenceKind,
              evidenceId: value.slice(separator + 1),
            });
          }),
      ),
    };
    const validation = validateCareerStory(input);
    if (!validation.ok) {
      setStoryIssues(validation.issues);
      setStatus("Review the highlighted story fields.");
      return;
    }

    setStoryIssues([]);
    setSaving(true);
    const result =
      editingStory === null
        ? await onCreateStory(input)
        : await onUpdateStory({
            ...input,
            id: editingStory.id,
            expectedRowVersion: editingStory.rowVersion,
          });
    setSaving(false);
    if (!result.ok) {
      setStatus(result.error.message);
      return;
    }
    form.reset();
    setEditingStoryId(null);
    setStatus(
      editingStory === null
        ? "Story saved locally as user-confirmed evidence."
        : "Story and its evidence links updated locally.",
    );
  };

  return (
    <section className="cd-career-workspace" data-testid="career-profile-workspace">
      <header className="cd-career-header">
        <div>
          <p className="cd-eyebrow">Local, user-confirmed evidence</p>
          <h2>Build your Career Profile</h2>
          <p>
            Add only what you want to use. Manual entries stay on this device and never invent a
            source, confidence value, or AI verification.
          </p>
        </div>
        <div
          className="cd-career-count"
          aria-label={`${String(model.entries.length)} saved entries`}
        >
          <strong>{model.entries.length}</strong>
          <span>saved entries</span>
        </div>
      </header>

      <section aria-labelledby={`${panelId}-import-heading`} className="cd-career-import">
        <div className="cd-career-import-heading">
          <div>
            <p className="cd-eyebrow">Proposal-only local import</p>
            <h3 id={`${panelId}-import-heading`}>Review resume evidence before it becomes yours</h3>
            <p>
              PDF, DOCX, Markdown, and text files are read locally. Extracted fields retain their
              source excerpt and confidence, stay pending, and never overwrite saved information.
            </p>
          </div>
          <label className="cd-button cd-button-secondary cd-career-import-button">
            <span>{importing ? "Importing locally…" : "Choose resume"}</span>
            <input
              accept=".docx,.pdf,.md,.markdown,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/markdown,text/plain"
              disabled={importing}
              onChange={(event) => void importResume(event)}
              type="file"
            />
          </label>
        </div>
        <p aria-live="polite" className="cd-career-status" role="status">
          {importStatus}
        </p>

        {model.imports.length === 0 ? (
          <p className="cd-career-empty">No resume proposals are waiting for review.</p>
        ) : (
          <ol className="cd-career-import-queue">
            {model.imports.map((item) => (
              <li key={item.id}>
                <div className="cd-career-import-summary">
                  <div>
                    <strong>{item.source.fileName}</strong>
                    <span>
                      {item.source.format.toUpperCase()} · {String(item.proposalCount)} pending
                      proposal{item.proposalCount === 1 ? "" : "s"}
                    </span>
                  </div>
                  <span className="cd-career-proposal-badge">Proposal only · not verified</span>
                </div>
                {item.warnings.map((warning) => (
                  <p className="cd-career-import-warning" key={warning}>
                    {warning}
                  </p>
                ))}
                {item.proposals.length === 0 ? (
                  <p className="cd-career-empty">
                    No extractable text was found. The original file was not changed.
                  </p>
                ) : (
                  <ul className="cd-career-proposals">
                    {reviewGroups
                      .filter(({ importRunId }) => importRunId === item.id)
                      .map((group) => {
                        const key = `${group.importRunId}:${group.groupKey}`;
                        const mergeCandidates = group.conflicts.filter(
                          ({ candidateId, kind }) =>
                            candidateId !== null &&
                            (kind === "duplicate_role" ||
                              kind === "duplicate_skill" ||
                              kind === "ambiguous_skill"),
                        );
                        return (
                          <li key={key}>
                            <div className="cd-career-proposal-content">
                              <strong>
                                {group.proposals
                                  .map(({ proposedValue }) => proposedValue)
                                  .join(" · ")}
                              </strong>
                              <span>
                                {group.target} · {String(group.proposals.length)} source-backed
                                field
                                {group.proposals.length === 1 ? "" : "s"}
                              </span>
                              <span>
                                extraction confidence{" "}
                                {Math.round(
                                  Math.max(...group.proposals.map(({ confidence }) => confidence)) *
                                    100,
                                )}
                                %
                              </span>
                              {group.conflicts.length === 0 ? (
                                <span className="cd-career-conflict-clear">No conflict found</span>
                              ) : (
                                <ul className="cd-career-conflicts" aria-label="Detected conflicts">
                                  {group.conflicts.map((item, index) => (
                                    <li key={`${item.kind}:${item.candidateId ?? String(index)}`}>
                                      <strong>{item.kind.replaceAll("_", " ")}</strong>
                                      <span>
                                        {item.message}
                                        {item.candidateLabel === null
                                          ? ""
                                          : ` Existing: ${item.candidateLabel}.`}
                                      </span>
                                    </li>
                                  ))}
                                </ul>
                              )}
                              <details>
                                <summary>Source excerpts</summary>
                                {group.sourceExcerpts.map((excerpt) => (
                                  <p key={excerpt}>{excerpt}</p>
                                ))}
                                {group.sourcePointers.map((pointer) => (
                                  <code key={pointer}>{pointer}</code>
                                ))}
                              </details>
                            </div>
                            <div className="cd-career-resolution-actions">
                              {group.actionable ? (
                                <form onSubmit={(event) => void acceptGroup(event, group)}>
                                  {group.target === "employment" ? (
                                    <>
                                      <label>
                                        <span>Date decision</span>
                                        <select defaultValue="" name="dateDecision">
                                          <option disabled value="">
                                            Review dates…
                                          </option>
                                          <option value="explicit">Use exact dates</option>
                                          <option value="unknown">Keep dates unknown</option>
                                        </select>
                                      </label>
                                      <label>
                                        <span>Start date</span>
                                        <input
                                          defaultValue={group.suggestedDates.startDate ?? ""}
                                          name="startDate"
                                          type="date"
                                        />
                                      </label>
                                      <label>
                                        <span>End date</span>
                                        <input
                                          defaultValue={group.suggestedDates.endDate ?? ""}
                                          name="endDate"
                                          type="date"
                                        />
                                      </label>
                                      <label className="cd-career-checkbox">
                                        <input
                                          defaultChecked={group.suggestedDates.current}
                                          name="current"
                                          type="checkbox"
                                        />
                                        <span>Current role</span>
                                      </label>
                                    </>
                                  ) : null}
                                  <button
                                    className="cd-button cd-button-primary"
                                    disabled={resolvingGroup === key}
                                    type="submit"
                                  >
                                    Accept as imported
                                  </button>
                                </form>
                              ) : (
                                <p>
                                  Incomplete imported fields can be rejected or retained for later
                                  review.
                                </p>
                              )}
                              {[
                                ...new Map(
                                  mergeCandidates.map((item) => [item.candidateId, item]),
                                ).values(),
                              ].map((candidate) => (
                                <button
                                  className="cd-button cd-button-secondary"
                                  disabled={resolvingGroup === key}
                                  key={candidate.candidateId}
                                  onClick={() =>
                                    void resolveGroup(group, {
                                      decision: "merged_existing",
                                      groupKey: group.groupKey,
                                      importRunId: group.importRunId,
                                      target: group.target as "employment" | "skill",
                                      targetId: candidate.candidateId as string,
                                    })
                                  }
                                  type="button"
                                >
                                  Merge with {candidate.candidateLabel}
                                </button>
                              ))}
                              <button
                                className="cd-button cd-button-quiet"
                                disabled={resolvingGroup === key}
                                onClick={() =>
                                  void resolveGroup(group, {
                                    decision: "rejected",
                                    groupKey: group.groupKey,
                                    importRunId: group.importRunId,
                                  })
                                }
                                type="button"
                              >
                                Reject proposal
                              </button>
                            </div>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </li>
            ))}
          </ol>
        )}
      </section>

      <div className="cd-career-layout">
        <nav aria-label="Career Profile sections" className="cd-career-sections" role="tablist">
          {CAREER_PROFILE_EDITOR_SECTIONS.map(({ id, label }) => (
            <button
              aria-controls={panelId}
              aria-selected={activeKind === id}
              className="cd-career-section-button"
              id={`${panelId}-${id}-tab`}
              key={id}
              onClick={() => {
                selectKind(id);
              }}
              onKeyDown={(event) => {
                moveSectionFocus(event, id);
              }}
              role="tab"
              tabIndex={activeKind === id ? 0 : -1}
              type="button"
            >
              <span>{label}</span>
              <span
                aria-label={`${String(
                  id === "story"
                    ? model.stories.length
                    : model.entries.filter(({ kind }) => kind === id).length,
                )} entries`}
              >
                {id === "story"
                  ? model.stories.length
                  : model.entries.filter(({ kind }) => kind === id).length}
              </span>
            </button>
          ))}
        </nav>

        <div
          aria-labelledby={`${panelId}-${activeKind}-tab`}
          className="cd-career-panel"
          id={panelId}
          role="tabpanel"
        >
          {activeKind === "story" ? (
            <>
              <div className="cd-career-panel-heading">
                <div>
                  <p className="cd-eyebrow">Situation / Action / Result</p>
                  <h3>{editingStory === null ? "Add a story" : "Edit story"}</h3>
                </div>
                <span className="cd-career-verification-badge">
                  {editingStory?.verificationState === "source_backed"
                    ? "Source-backed state retained"
                    : "User-confirmed on save"}
                </span>
              </div>
              <form
                className="cd-career-form"
                key={editingStory?.id ?? "new-story"}
                noValidate
                onSubmit={(event) => void submitStory(event)}
              >
                <StoryEditorFields
                  entries={model.entries}
                  issues={storyIssueMap}
                  story={editingStory}
                />
                <div className="cd-career-form-actions">
                  <button className="cd-button cd-button-primary" disabled={saving} type="submit">
                    {saving
                      ? "Saving locally…"
                      : editingStory === null
                        ? "Save story"
                        : "Update story"}
                  </button>
                  {editingStory === null ? null : (
                    <button
                      className="cd-button cd-button-secondary"
                      onClick={() => {
                        setEditingStoryId(null);
                        setStoryIssues([]);
                        setStatus("");
                      }}
                      type="button"
                    >
                      Cancel editing
                    </button>
                  )}
                  <p aria-live="polite" className="cd-career-status" role="status">
                    {status}
                  </p>
                </div>
              </form>
              <section aria-labelledby={`${panelId}-stories-heading`} className="cd-career-saved">
                <div className="cd-career-saved-heading">
                  <h4 id={`${panelId}-stories-heading`}>Saved stories</h4>
                  <span>
                    {model.loading
                      ? "Loading local records…"
                      : `${String(model.stories.length)} stored`}
                  </span>
                </div>
                {model.stories.length === 0 ? (
                  <p className="cd-career-empty">No local stories yet.</p>
                ) : (
                  <ul>
                    {model.stories.map((story) => (
                      <li className="cd-career-story-card" key={story.id}>
                        <div>
                          <strong>{story.title}</strong>
                          <span>Situation: {story.situation}</span>
                          <span>Action: {story.action}</span>
                          <span>Result: {story.result}</span>
                          <span>
                            {String(story.linkedEvidence.length)} linked evidence record
                            {story.linkedEvidence.length === 1 ? "" : "s"}
                          </span>
                          {story.privacyTags.length === 0 ? null : (
                            <span>Privacy: {story.privacyTags.join(", ")}</span>
                          )}
                        </div>
                        <div className="cd-career-story-card-actions">
                          <span className="cd-career-verification-badge">
                            {story.verificationState.replaceAll("_", " ")}
                          </span>
                          <button
                            className="cd-button cd-button-secondary"
                            onClick={() => {
                              setEditingStoryId(story.id);
                              setStoryIssues([]);
                              setStatus("");
                            }}
                            type="button"
                          >
                            Edit story
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          ) : (
            <>
              <div className="cd-career-panel-heading">
                <div>
                  <p className="cd-eyebrow">Manual editor</p>
                  <h3>{LABEL_BY_KIND[activeKind]}</h3>
                </div>
                <span className="cd-career-verification-badge">User-confirmed on save</span>
              </div>

              <form
                className="cd-career-form"
                key={activeKind}
                noValidate
                onSubmit={(event) => void submit(event)}
              >
                <EditorFields issues={issueMap} kind={activeKind} />
                <div className="cd-career-form-actions">
                  <button className="cd-button cd-button-primary" disabled={saving} type="submit">
                    {saving ? "Saving locally…" : `Save ${LABEL_BY_KIND[activeKind]}`}
                  </button>
                  <p aria-live="polite" className="cd-career-status" role="status">
                    {status}
                  </p>
                </div>
              </form>

              <section aria-labelledby={`${panelId}-saved-heading`} className="cd-career-saved">
                <div className="cd-career-saved-heading">
                  <h4 id={`${panelId}-saved-heading`}>
                    Saved {LABEL_BY_KIND[activeKind].toLowerCase()}
                  </h4>
                  <span>
                    {model.loading
                      ? "Loading local records…"
                      : `${String(visibleEntries.length)} stored`}
                  </span>
                </div>
                {visibleEntries.length === 0 ? (
                  <p className="cd-career-empty">No local entries in this section yet.</p>
                ) : (
                  <ul>
                    {visibleEntries.map((entry) => (
                      <li key={entry.id}>
                        <div>
                          <strong>{entry.primaryLabel}</strong>
                          {entry.secondaryLabel === null ? null : (
                            <span>{entry.secondaryLabel}</span>
                          )}
                          {dateLabel(entry) === null ? null : <span>{dateLabel(entry)}</span>}
                        </div>
                        {entry.verificationState === null ? null : (
                          <span className="cd-career-verification-badge">
                            {entry.verificationState === "imported"
                              ? "Imported · not confirmed"
                              : "User-confirmed"}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </div>

      <aside className="cd-career-later" aria-label="Later Career Profile capabilities">
        <strong>Kept for later reviewed slices:</strong> the Answer Library and any AI-assisted
        drafting.
      </aside>
    </section>
  );
};
