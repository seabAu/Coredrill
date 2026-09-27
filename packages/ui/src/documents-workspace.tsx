import type { DocumentWorkspaceItemDto, DocumentsWorkspaceViewId } from "@coredrill/application";
import { useId, useMemo, useState, type KeyboardEvent } from "react";

export const DOCUMENTS_WORKSPACE_VIEWS = Object.freeze([
  Object.freeze({ id: "all" as const, label: "All" }),
  Object.freeze({ id: "resumes" as const, label: "Resumes" }),
  Object.freeze({ id: "cover_letters" as const, label: "Cover letters" }),
  Object.freeze({ id: "answers" as const, label: "Answers" }),
  Object.freeze({ id: "templates" as const, label: "Templates" }),
  Object.freeze({ id: "submitted" as const, label: "Submitted" }),
]);

export interface DocumentsWorkspaceModel {
  readonly items: readonly DocumentWorkspaceItemDto[];
  readonly loading: boolean;
  readonly error: string | null;
}

export interface DocumentsWorkspaceProps {
  readonly model: DocumentsWorkspaceModel;
  readonly onOpenDocument?: (document: DocumentWorkspaceItemDto) => void;
}

const kindLabel = (kind: DocumentWorkspaceItemDto["kind"]): string => {
  switch (kind) {
    case "application_answer":
      return "Answer";
    case "cover_letter":
      return "Cover letter";
    case "follow_up":
      return "Follow-up";
    case "other":
      return "Other";
    case "resume":
      return "Resume";
  }
};

const lineageLabel = (document: DocumentWorkspaceItemDto): string => {
  switch (document.lineageRole) {
    case "base":
      return "Reusable base";
    case "template":
      return "Template";
    case "job_derivative":
      return [
        "Job derivative",
        document.baseDocumentTitle === null ? null : `Base: ${document.baseDocumentTitle}`,
        document.templateDocumentTitle === null
          ? null
          : `Template: ${document.templateDocumentTitle}`,
      ]
        .filter((value): value is string => value !== null)
        .join(" · ");
    case null:
      return "Lineage not classified";
  }
};

const viewIncludes = (
  view: DocumentsWorkspaceViewId,
  document: DocumentWorkspaceItemDto,
): boolean => {
  switch (view) {
    case "all":
      return true;
    case "answers":
      return document.kind === "application_answer";
    case "cover_letters":
      return document.kind === "cover_letter";
    case "resumes":
      return document.kind === "resume";
    case "submitted":
      return document.submission !== null;
    case "templates":
      return document.lineageRole === "template";
  }
};

const searchText = (document: DocumentWorkspaceItemDto): string =>
  [
    document.title,
    document.baseDocumentTitle,
    document.templateDocumentTitle,
    document.relatedJob?.title,
    document.relatedJob?.companyName,
    document.searchText,
  ]
    .filter((value): value is string => value !== null && value !== undefined)
    .join(" ")
    .toLocaleLowerCase();

const focusTab = (id: DocumentsWorkspaceViewId): void => {
  document.querySelector<HTMLElement>(`[data-documents-view="${id}"]`)?.focus();
};

export const DocumentsWorkspace = ({
  model,
  onOpenDocument = () => undefined,
}: DocumentsWorkspaceProps) => {
  const [activeView, setActiveView] = useState<DocumentsWorkspaceViewId>("all");
  const [query, setQuery] = useState("");
  const panelId = useId();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const visibleItems = useMemo(
    () =>
      model.items.filter(
        (item) =>
          viewIncludes(activeView, item) &&
          (normalizedQuery === "" || searchText(item).includes(normalizedQuery)),
      ),
    [activeView, model.items, normalizedQuery],
  );
  const counts = useMemo(
    () =>
      Object.fromEntries(
        DOCUMENTS_WORKSPACE_VIEWS.map(({ id }) => [
          id,
          model.items.filter((item) => viewIncludes(id, item)).length,
        ]),
      ) as Readonly<Record<DocumentsWorkspaceViewId, number>>,
    [model.items],
  );

  const moveTabFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    current: DocumentsWorkspaceViewId,
  ): void => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = DOCUMENTS_WORKSPACE_VIEWS.findIndex(({ id }) => id === current);
    const nextIndex =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? DOCUMENTS_WORKSPACE_VIEWS.length - 1
          : (currentIndex +
              (event.key === "ArrowRight" ? 1 : -1) +
              DOCUMENTS_WORKSPACE_VIEWS.length) %
            DOCUMENTS_WORKSPACE_VIEWS.length;
    const next = DOCUMENTS_WORKSPACE_VIEWS[nextIndex];
    if (next === undefined) return;
    setActiveView(next.id);
    focusTab(next.id);
  };

  return (
    <section aria-labelledby={`${panelId}-heading`} className="cd-documents-workspace">
      <div className="cd-documents-summary">
        <div>
          <p className="cd-eyebrow">Versioned local library</p>
          <h2 id={`${panelId}-heading`}>Application materials</h2>
          <p>
            Bases, templates, job derivatives, and exact submitted versions stay visibly distinct.
            Nothing here uploads or submits a document.
          </p>
        </div>
        <label className="cd-documents-search">
          <span>Search documents</span>
          <input
            onChange={(event) => {
              setQuery(event.currentTarget.value);
            }}
            placeholder="Title, company, job, base, or template"
            type="search"
            value={query}
          />
        </label>
      </div>

      <nav aria-label="Document views" className="cd-documents-tabs" role="tablist">
        {DOCUMENTS_WORKSPACE_VIEWS.map(({ id, label }) => (
          <button
            aria-controls={panelId}
            aria-selected={activeView === id}
            data-documents-view={id}
            id={`${panelId}-${id}-tab`}
            key={id}
            onClick={() => {
              setActiveView(id);
            }}
            onKeyDown={(event) => {
              moveTabFocus(event, id);
            }}
            role="tab"
            tabIndex={activeView === id ? 0 : -1}
            type="button"
          >
            <span>{label}</span>
            <span aria-label={`${String(counts[id])} documents`}>{counts[id]}</span>
          </button>
        ))}
      </nav>

      <section
        aria-labelledby={`${panelId}-${activeView}-tab`}
        className="cd-documents-panel"
        data-documents-active-view={activeView}
        id={panelId}
        role="tabpanel"
      >
        <div className="cd-documents-panel-heading">
          <div>
            <h3>{DOCUMENTS_WORKSPACE_VIEWS.find(({ id }) => id === activeView)?.label}</h3>
            <p>
              {String(visibleItems.length)} matching local document
              {visibleItems.length === 1 ? "" : "s"}
            </p>
          </div>
          <span>Sorted by latest immutable version</span>
        </div>

        {model.loading ? (
          <p className="cd-documents-empty" role="status">
            Loading local documents…
          </p>
        ) : model.error !== null ? (
          <p className="cd-documents-empty" role="alert">
            {model.error}
          </p>
        ) : visibleItems.length === 0 ? (
          <p className="cd-documents-empty">
            {normalizedQuery === ""
              ? "No local documents in this view yet."
              : "No local documents match this search."}
          </p>
        ) : (
          <ul aria-label="Local documents" className="cd-documents-grid">
            {visibleItems.map((item) => (
              <li className="cd-document-card" data-document-kind={item.kind} key={item.id}>
                <div className="cd-document-card-heading">
                  <div>
                    <span className="cd-document-kind">{kindLabel(item.kind)}</span>
                    <button
                      className="cd-document-title"
                      onClick={() => {
                        onOpenDocument(item);
                      }}
                      type="button"
                    >
                      {item.title}
                    </button>
                  </div>
                  <span className="cd-document-version">
                    {item.latestVersion === null
                      ? "No version"
                      : `Version ${String(item.latestVersion.versionNumber)}`}
                  </span>
                </div>

                <dl className="cd-document-metadata">
                  <div>
                    <dt>Lineage</dt>
                    <dd>{lineageLabel(item)}</dd>
                  </div>
                  <div>
                    <dt>Related job</dt>
                    <dd>
                      {item.relatedJob === null
                        ? "Reusable · no job"
                        : `${item.relatedJob.title}${
                            item.relatedJob.companyName === null
                              ? ""
                              : ` · ${item.relatedJob.companyName}`
                          }`}
                    </dd>
                  </div>
                  <div>
                    <dt>Last edited</dt>
                    <dd>
                      <time dateTime={item.lastEditedAt}>{item.lastEditedAt.slice(0, 10)}</time>
                    </dd>
                  </div>
                </dl>

                <div className="cd-document-state-list" aria-label="Document state">
                  <span data-document-export={item.exportStatus}>
                    {item.exportStatus === "exported" ? "Export available" : "Not exported"}
                  </span>
                  <span data-document-claims={item.claimStatus}>Claims not evaluated</span>
                  {item.submission === null ? (
                    <span>Not submitted</span>
                  ) : (
                    <span data-document-submitted="true">
                      Submitted version {String(item.submission.versionNumber)} ·{" "}
                      {item.submission.format === "file" ? "exact file" : "exact text"} ·{" "}
                      <time dateTime={item.submission.submittedAt}>
                        {item.submission.submittedAt.slice(0, 10)}
                      </time>
                      {item.submission.channel === null ? "" : ` · ${item.submission.channel}`}
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <aside className="cd-documents-boundary" aria-label="Documents capability boundary">
        <strong>Local read-only view:</strong> editing, generation, export orchestration, and Mark
        Applied remain separate reviewed steps.
      </aside>
    </section>
  );
};
