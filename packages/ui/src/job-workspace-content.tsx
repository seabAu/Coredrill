import { useState, type ChangeEvent, type SyntheticEvent } from "react";
import {
  JOB_REQUIREMENT_CATEGORIES,
  type JobRequirementCategory,
  type ListingSnapshotCompensationV1,
  type ListingSnapshotDiffV1,
  type ListingSnapshotValueChangeV1,
} from "@coredrill/application";

export const JOB_WORKSPACE_CONTENT_TABS = Object.freeze([
  "overview",
  "requirements",
  "timeline",
  "company",
  "source",
] as const);
export type JobWorkspaceContentTabId = (typeof JOB_WORKSPACE_CONTENT_TABS)[number];

export const JOB_WORKSPACE_CONTENT_ACTIONS = Object.freeze([
  "add-timeline-note",
  "edit-job-notes",
  "open-timeline",
  "edit-timeline-note",
  "log-interaction",
  "schedule-interview",
  "schedule-follow-up",
  "edit-company-notes",
  "open-company-contacts",
  "open-company-jobs",
  "open-source-snapshot",
  "compare-source",
  "refresh-source",
  "correct-requirement-category",
] as const);
export type JobWorkspaceContentActionId = (typeof JOB_WORKSPACE_CONTENT_ACTIONS)[number];

export type JobWorkspaceContentActionRequest =
  | {
      readonly id: "add-timeline-note";
      readonly value: string;
    }
  | {
      readonly id: "correct-requirement-category";
      readonly targetId: string;
      readonly category: JobRequirementCategory;
      readonly expectedRowVersion: number;
    }
  | {
      readonly id: Exclude<
        JobWorkspaceContentActionId,
        "add-timeline-note" | "correct-requirement-category"
      >;
      readonly targetId?: string;
    };

export type JobWorkspaceTimelineItemKind =
  "status" | "interaction" | "interview" | "reminder" | "note" | "outcome";

export interface JobWorkspaceTimelineItem {
  readonly detail: string;
  readonly editable: boolean;
  readonly id: string;
  readonly kind: JobWorkspaceTimelineItemKind;
  readonly occurredAtLabel: string;
  readonly title: string;
}

export interface JobWorkspaceContentModel {
  readonly jobId: string;
  readonly requirements: readonly {
    readonly id: string;
    readonly category: JobRequirementCategory;
    readonly sourceCategory: JobRequirementCategory;
    readonly normalizedText: string;
    readonly rawText: string;
    readonly sourcePointer: string;
    readonly sourceExcerpt: string;
    readonly extractionMethod: string;
    readonly confidence: number;
    readonly userConfirmed: boolean;
    readonly rowVersion: number;
  }[];
  readonly overview: {
    readonly application: {
      readonly appliedAtLabel: string | null;
      readonly channel: string | null;
      readonly notes: string;
    } | null;
    readonly datePosted: string | null;
    readonly descriptionText: string;
    readonly disclosedCompensation: string | null;
    readonly employmentType: string | null;
    readonly locationLabel: string | null;
    readonly nextAction: {
      readonly dueAtLabel: string | null;
      readonly timeZone: string | null;
      readonly title: string;
    } | null;
    readonly notes: string;
    readonly seniority: string | null;
    readonly tags: readonly string[];
    readonly validThrough: string | null;
    readonly workplaceType: string | null;
  };
  readonly timeline: {
    readonly itemCount: number;
    readonly items: readonly JobWorkspaceTimelineItem[];
    readonly lastInteractionAtLabel: string | null;
    readonly pendingReminderCount: number;
    readonly upcomingInterviewCount: number;
  };
  readonly company: {
    readonly canonicalName: string;
    readonly contactCount: number;
    readonly domain: string | null;
    readonly notes: string;
    readonly otherActiveJobCount: number;
    readonly outcomeCount: number;
    readonly salaryObservationCount: number;
    readonly websiteUrl: string | null;
  } | null;
  readonly source: {
    readonly applyUrl: string | null;
    readonly canonicalUrl: string | null;
    readonly comparison: ListingSnapshotDiffV1 | null;
    readonly comparisonLabel: string;
    readonly extractionLabel: string;
    readonly firstSeenAtLabel: string;
    readonly freshnessLabel: string;
    readonly id: string;
    readonly lastSeenAtLabel: string;
    readonly provenance: readonly {
      readonly basis: string;
      readonly field: string;
      readonly value: string;
    }[];
    readonly refreshPolicy: string;
    readonly snapshotLabel: string;
  } | null;
}

export interface JobWorkspaceContentProps {
  readonly activeTab: JobWorkspaceContentTabId;
  readonly model: JobWorkspaceContentModel;
  readonly onAction?: (request: JobWorkspaceContentActionRequest) => void;
}

interface JobWorkspaceContentPanelProps {
  readonly model: JobWorkspaceContentModel;
  readonly onAction: ((request: JobWorkspaceContentActionRequest) => void) | undefined;
}

const TIMELINE_KINDS = new Set<JobWorkspaceTimelineItemKind>([
  "status",
  "interaction",
  "interview",
  "reminder",
  "note",
  "outcome",
]);

const isBoundedText = (value: string, maximum = 200_000): boolean =>
  value.length <= maximum && !value.includes("\u0000");

const isCount = (value: number): boolean =>
  Number.isSafeInteger(value) && value >= 0 && value <= 1_000_000;

const validateModel = (model: JobWorkspaceContentModel): void => {
  if (
    model.jobId.trim().length === 0 ||
    model.jobId.length > 128 ||
    !isBoundedText(model.overview.descriptionText) ||
    !isBoundedText(model.overview.notes) ||
    model.overview.tags.length > 128 ||
    new Set(model.overview.tags.map((tag) => tag.toLocaleLowerCase())).size !==
      model.overview.tags.length ||
    !isCount(model.timeline.itemCount) ||
    !isCount(model.timeline.pendingReminderCount) ||
    !isCount(model.timeline.upcomingInterviewCount) ||
    model.timeline.items.length > 100 ||
    new Set(model.timeline.items.map(({ id }) => id)).size !== model.timeline.items.length ||
    model.timeline.itemCount < model.timeline.items.length
  ) {
    throw new RangeError("Job workspace content model is invalid.");
  }

  for (const item of model.timeline.items) {
    if (
      item.id.trim().length === 0 ||
      !TIMELINE_KINDS.has(item.kind) ||
      item.title.trim().length === 0 ||
      item.occurredAtLabel.trim().length === 0 ||
      !isBoundedText(item.detail) ||
      (item.editable && item.kind !== "note")
    ) {
      throw new RangeError("Job workspace timeline item is invalid.");
    }
  }

  if (
    model.requirements.length > 512 ||
    new Set(model.requirements.map(({ id }) => id)).size !== model.requirements.length
  ) {
    throw new RangeError("Job workspace requirements are invalid.");
  }
  for (const requirement of model.requirements) {
    if (
      requirement.id.trim().length === 0 ||
      !JOB_REQUIREMENT_CATEGORIES.includes(requirement.category) ||
      !JOB_REQUIREMENT_CATEGORIES.includes(requirement.sourceCategory) ||
      requirement.normalizedText.trim().length === 0 ||
      !isBoundedText(requirement.normalizedText, 4_096) ||
      requirement.rawText.trim().length === 0 ||
      !isBoundedText(requirement.rawText, 16_384) ||
      requirement.sourcePointer.trim().length === 0 ||
      !isBoundedText(requirement.sourcePointer, 2_048) ||
      requirement.sourceExcerpt.trim().length === 0 ||
      !isBoundedText(requirement.sourceExcerpt, 4_096) ||
      requirement.extractionMethod.trim().length === 0 ||
      !Number.isFinite(requirement.confidence) ||
      requirement.confidence < 0 ||
      requirement.confidence > 1 ||
      !Number.isSafeInteger(requirement.rowVersion) ||
      requirement.rowVersion < 1
    ) {
      throw new RangeError("Job workspace requirement is invalid.");
    }
  }

  const counts =
    model.company === null
      ? []
      : [
          model.company.contactCount,
          model.company.otherActiveJobCount,
          model.company.outcomeCount,
          model.company.salaryObservationCount,
        ];
  if (
    counts.some((count) => !isCount(count)) ||
    (model.company !== null && model.company.canonicalName.trim().length === 0) ||
    (model.source !== null &&
      (model.source.id.trim().length === 0 ||
        model.source.firstSeenAtLabel.trim().length === 0 ||
        model.source.lastSeenAtLabel.trim().length === 0 ||
        model.source.freshnessLabel.trim().length === 0 ||
        model.source.provenance.length > 32 ||
        new Set(model.source.provenance.map(({ field }) => field)).size !==
          model.source.provenance.length))
  ) {
    throw new RangeError("Job workspace relationship content is invalid.");
  }
};

export const isJobWorkspaceContentTab = (tab: string): tab is JobWorkspaceContentTabId =>
  JOB_WORKSPACE_CONTENT_TABS.some((candidate) => candidate === tab);

const valueOrMissing = (value: string | null): string => value ?? "Not recorded";

const OverviewPanel = ({ model, onAction }: JobWorkspaceContentPanelProps) => {
  const [note, setNote] = useState("");
  const overview = model.overview;
  const submitTimelineNote = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const value = note.trim();
    if (value.length === 0) return;
    onAction?.({ id: "add-timeline-note", value });
    setNote("");
  };

  return (
    <div className="cd-job-overview" data-job-content-tab="overview">
      <section aria-labelledby="job-overview-summary" className="cd-job-content-section">
        <div className="cd-job-content-section-heading">
          <div>
            <p className="cd-eyebrow">Normalized local record</p>
            <h3 id="job-overview-summary">Overview</h3>
          </div>
          <button
            className="cd-button cd-button-secondary"
            onClick={() => {
              onAction?.({ id: "open-timeline" });
            }}
            type="button"
          >
            Open timeline
          </button>
        </div>

        <dl className="cd-job-fact-grid">
          <div>
            <dt>Employment</dt>
            <dd>{valueOrMissing(overview.employmentType)}</dd>
          </div>
          <div>
            <dt>Seniority</dt>
            <dd>{valueOrMissing(overview.seniority)}</dd>
          </div>
          <div>
            <dt>Workplace</dt>
            <dd>{valueOrMissing(overview.workplaceType)}</dd>
          </div>
          <div>
            <dt>Location</dt>
            <dd>{valueOrMissing(overview.locationLabel)}</dd>
          </div>
          <div>
            <dt>Posted</dt>
            <dd>{valueOrMissing(overview.datePosted)}</dd>
          </div>
          <div>
            <dt>Application deadline</dt>
            <dd>{valueOrMissing(overview.validThrough)}</dd>
          </div>
          <div className="cd-job-fact-wide">
            <dt>Disclosed compensation</dt>
            <dd>{valueOrMissing(overview.disclosedCompensation)}</dd>
          </div>
        </dl>

        <div className="cd-job-description">
          <h4>Description</h4>
          <p>{overview.descriptionText || "No description recorded."}</p>
        </div>

        <div aria-label="Job tags" className="cd-job-tag-list">
          {overview.tags.length === 0 ? (
            <span className="cd-job-empty-inline">No tags</span>
          ) : (
            overview.tags.map((tag) => <span key={tag}>{tag}</span>)
          )}
        </div>
      </section>

      <div className="cd-job-overview-secondary">
        <section aria-labelledby="job-overview-next-action" className="cd-job-content-section">
          <p className="cd-eyebrow">Attention</p>
          <h3 id="job-overview-next-action">Next action</h3>
          {overview.nextAction === null ? (
            <p className="cd-job-empty-copy">No next action is set.</p>
          ) : (
            <div className="cd-job-next-action">
              <strong>{overview.nextAction.title}</strong>
              <span>{overview.nextAction.dueAtLabel ?? "No due date"}</span>
              {overview.nextAction.timeZone === null ? null : (
                <small>{overview.nextAction.timeZone}</small>
              )}
            </div>
          )}
        </section>

        <section aria-labelledby="job-overview-application" className="cd-job-content-section">
          <p className="cd-eyebrow">Application</p>
          <h3 id="job-overview-application">Application context</h3>
          {overview.application === null ? (
            <p className="cd-job-empty-copy">No application attempt is linked yet.</p>
          ) : (
            <dl className="cd-job-compact-facts">
              <div>
                <dt>Applied</dt>
                <dd>{overview.application.appliedAtLabel ?? "Not recorded"}</dd>
              </div>
              <div>
                <dt>Channel</dt>
                <dd>{overview.application.channel ?? "Not recorded"}</dd>
              </div>
            </dl>
          )}
        </section>
      </div>

      <section aria-labelledby="job-overview-notes" className="cd-job-content-section">
        <div className="cd-job-content-section-heading">
          <div>
            <p className="cd-eyebrow">User-owned</p>
            <h3 id="job-overview-notes">Notes</h3>
          </div>
          <button
            className="cd-button cd-button-secondary"
            onClick={() => {
              onAction?.({ id: "edit-job-notes" });
            }}
            type="button"
          >
            Edit notes
          </button>
        </div>
        <p className="cd-job-notes-copy">{overview.notes || "No job notes yet."}</p>
      </section>

      <form className="cd-job-quick-note" onSubmit={submitTimelineNote}>
        <div>
          <p className="cd-eyebrow">Quick timeline entry</p>
          <label htmlFor={`job-quick-note-${model.jobId}`}>Add a local note</label>
          <p>Notes are editable; status and outcome events remain append-only.</p>
        </div>
        <textarea
          id={`job-quick-note-${model.jobId}`}
          maxLength={2_000}
          onChange={(event) => {
            setNote(event.target.value);
          }}
          placeholder="Record a decision, question, or follow-up context"
          rows={3}
          value={note}
        />
        <button
          className="cd-button cd-button-primary"
          disabled={note.trim().length === 0}
          type="submit"
        >
          Add timeline note
        </button>
      </form>
    </div>
  );
};

const categoryLabel = (category: JobRequirementCategory): string =>
  `${category.slice(0, 1).toLocaleUpperCase()}${category.slice(1)}`;

const RequirementsPanel = ({ model, onAction }: JobWorkspaceContentPanelProps) => {
  const correctCategory = (
    event: ChangeEvent<HTMLSelectElement>,
    requirement: JobWorkspaceContentModel["requirements"][number],
  ): void => {
    const category = event.currentTarget.value as JobRequirementCategory;
    if (!JOB_REQUIREMENT_CATEGORIES.includes(category) || category === requirement.category) return;
    onAction?.({
      id: "correct-requirement-category",
      targetId: requirement.id,
      category,
      expectedRowVersion: requirement.rowVersion,
    });
  };

  return (
    <div className="cd-job-requirements" data-job-content-tab="requirements">
      <section aria-labelledby="job-requirements-heading" className="cd-job-content-section">
        <div className="cd-job-content-section-heading">
          <div>
            <p className="cd-eyebrow">Source-backed interpretation</p>
            <h3 id="job-requirements-heading">Requirements</h3>
          </div>
          <span className="cd-chip">{model.requirements.length} recorded</span>
        </div>
        <p className="cd-job-requirements__boundary">
          Category and confidence describe extraction evidence, not employer verification or hiring
          probability. Coverage and evidence matching are separate review steps.
        </p>
        {model.requirements.length === 0 ? (
          <div className="cd-job-empty-state">
            <h4>No requirements recorded</h4>
            <p>A validated source extraction can add reviewable requirements here.</p>
          </div>
        ) : (
          <ol aria-label="Job requirements" className="cd-job-requirement-list">
            {model.requirements.map((requirement) => (
              <li className="cd-job-requirement" key={requirement.id}>
                <div className="cd-job-requirement__heading">
                  <div>
                    <h4>{requirement.normalizedText}</h4>
                    <p>
                      {requirement.userConfirmed
                        ? "User-confirmed category"
                        : "Needs category review"}
                      {requirement.category !== requirement.sourceCategory
                        ? ` · extracted as ${categoryLabel(requirement.sourceCategory)}`
                        : ""}
                    </p>
                  </div>
                  <span className="cd-chip">
                    {Math.round(requirement.confidence * 100)}% extraction confidence
                  </span>
                </div>
                <label className="cd-job-requirement__category">
                  <span>Category for {requirement.normalizedText}</span>
                  <select
                    onChange={(event) => {
                      correctCategory(event, requirement);
                    }}
                    value={requirement.category}
                  >
                    {JOB_REQUIREMENT_CATEGORIES.map((category) => (
                      <option key={category} value={category}>
                        {categoryLabel(category)}
                      </option>
                    ))}
                  </select>
                </label>
                <blockquote>{requirement.sourceExcerpt}</blockquote>
                <dl className="cd-job-requirement__provenance">
                  <div>
                    <dt>Method</dt>
                    <dd>{requirement.extractionMethod}</dd>
                  </div>
                  <div>
                    <dt>Source path</dt>
                    <dd>{requirement.sourcePointer}</dd>
                  </div>
                </dl>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
};

const TimelinePanel = ({ model, onAction }: JobWorkspaceContentPanelProps) => (
  <div className="cd-job-timeline" data-job-content-tab="timeline">
    <section aria-labelledby="job-timeline-heading" className="cd-job-content-section">
      <div className="cd-job-content-section-heading">
        <div>
          <p className="cd-eyebrow">Local chronology</p>
          <h3 id="job-timeline-heading">Timeline</h3>
          <p>
            {String(model.timeline.itemCount)} items · status and outcome history is append-only.
          </p>
        </div>
        <div className="cd-job-inline-actions">
          <button
            className="cd-button cd-button-secondary"
            onClick={() => {
              onAction?.({ id: "log-interaction" });
            }}
            type="button"
          >
            Log interaction
          </button>
          <button
            className="cd-button cd-button-secondary"
            onClick={() => {
              onAction?.({ id: "schedule-interview" });
            }}
            type="button"
          >
            Schedule interview
          </button>
          <button
            className="cd-button cd-button-secondary"
            onClick={() => {
              onAction?.({ id: "schedule-follow-up" });
            }}
            type="button"
          >
            Add follow-up
          </button>
        </div>
      </div>

      <dl className="cd-job-timeline-summary">
        <div>
          <dt>Last interaction</dt>
          <dd>{model.timeline.lastInteractionAtLabel ?? "None recorded"}</dd>
        </div>
        <div>
          <dt>Upcoming interviews</dt>
          <dd>{String(model.timeline.upcomingInterviewCount)}</dd>
        </div>
        <div>
          <dt>Pending reminders</dt>
          <dd>{String(model.timeline.pendingReminderCount)}</dd>
        </div>
      </dl>

      {model.timeline.items.length === 0 ? (
        <div className="cd-job-empty-state">
          <h4>No timeline items yet</h4>
          <p>Add a note or record an interaction without inventing activity.</p>
        </div>
      ) : (
        <ol aria-label="Job timeline items" className="cd-job-timeline-list">
          {model.timeline.items.map((item) => (
            <li data-timeline-kind={item.kind} key={item.id}>
              <div className="cd-job-timeline-marker" aria-hidden="true" />
              <article>
                <div className="cd-job-timeline-item-heading">
                  <div>
                    <span className="cd-job-timeline-kind">{item.kind}</span>
                    <h4>{item.title}</h4>
                  </div>
                  <time>{item.occurredAtLabel}</time>
                </div>
                <p>{item.detail}</p>
                {item.editable ? (
                  <button
                    className="cd-text-button"
                    onClick={() => {
                      onAction?.({ id: "edit-timeline-note", targetId: item.id });
                    }}
                    type="button"
                  >
                    Edit note
                  </button>
                ) : (
                  <small>Immutable history event</small>
                )}
              </article>
            </li>
          ))}
        </ol>
      )}
    </section>
  </div>
);

const CompanyPanel = ({ model, onAction }: JobWorkspaceContentPanelProps) => (
  <div className="cd-job-company" data-job-content-tab="company">
    {model.company === null ? (
      <section className="cd-job-empty-state">
        <p className="cd-eyebrow">Company relationship</p>
        <h3>No company is linked</h3>
        <p>Link a local company record before adding contacts or company notes.</p>
      </section>
    ) : (
      <>
        <section aria-labelledby="job-company-heading" className="cd-job-content-section">
          <div className="cd-job-content-section-heading">
            <div>
              <p className="cd-eyebrow">Company relationship</p>
              <h3 id="job-company-heading">{model.company.canonicalName}</h3>
              <p>{model.company.domain ?? "No official domain recorded"}</p>
            </div>
            <button
              className="cd-button cd-button-secondary"
              onClick={() => {
                onAction?.({ id: "edit-company-notes" });
              }}
              type="button"
            >
              Edit company notes
            </button>
          </div>

          <dl className="cd-job-company-stats">
            <div>
              <dt>Contacts</dt>
              <dd className="cd-job-company-stat-with-action">
                <span>{String(model.company.contactCount)}</span>
                <button
                  className="cd-text-button"
                  onClick={() => {
                    onAction?.({ id: "open-company-contacts" });
                  }}
                  type="button"
                >
                  Open contacts
                </button>
              </dd>
            </div>
            <div>
              <dt>Other active roles</dt>
              <dd className="cd-job-company-stat-with-action">
                <span>{String(model.company.otherActiveJobCount)}</span>
                <button
                  className="cd-text-button"
                  onClick={() => {
                    onAction?.({ id: "open-company-jobs" });
                  }}
                  type="button"
                >
                  Open roles
                </button>
              </dd>
            </div>
            <div>
              <dt>Recorded outcomes</dt>
              <dd>{String(model.company.outcomeCount)}</dd>
            </div>
            <div>
              <dt>Salary observations</dt>
              <dd>{String(model.company.salaryObservationCount)}</dd>
            </div>
          </dl>

          <div className="cd-job-company-notes">
            <h4>Company notes</h4>
            <p>{model.company.notes || "No company notes yet."}</p>
          </div>

          <dl className="cd-job-compact-facts">
            <div>
              <dt>Official website</dt>
              <dd>{model.company.websiteUrl ?? "Not recorded"}</dd>
            </div>
          </dl>
        </section>

        <aside className="cd-job-policy-note">
          Contact details stay nullable and provenance-aware. Coredrill never guesses an email
          address or sends outreach automatically.
        </aside>
      </>
    )}
  </div>
);

const SourcePanel = ({ model, onAction }: JobWorkspaceContentPanelProps) => (
  <div className="cd-job-source" data-job-content-tab="source">
    {model.source === null ? (
      <section className="cd-job-empty-state">
        <p className="cd-eyebrow">Source and provenance</p>
        <h3>No source is linked</h3>
        <p>Add or paste a source manually; Coredrill will not crawl for one in the background.</p>
      </section>
    ) : (
      <>
        <section aria-labelledby="job-source-heading" className="cd-job-content-section">
          <div className="cd-job-content-section-heading">
            <div>
              <p className="cd-eyebrow">Source and provenance</p>
              <h3 id="job-source-heading">Primary source</h3>
              <p>{model.source.freshnessLabel}</p>
            </div>
            <div className="cd-job-inline-actions">
              <button
                className="cd-button cd-button-secondary"
                onClick={() => {
                  onAction?.({ id: "open-source-snapshot" });
                }}
                type="button"
              >
                View snapshot
              </button>
              <button
                className="cd-button cd-button-secondary"
                onClick={() => {
                  onAction?.({ id: "compare-source" });
                }}
                type="button"
              >
                Compare changes
              </button>
              <button
                className="cd-button cd-button-secondary"
                onClick={() => {
                  onAction?.({ id: "refresh-source" });
                }}
                type="button"
              >
                Refresh manually
              </button>
            </div>
          </div>

          <dl className="cd-job-source-facts">
            <div>
              <dt>Source record</dt>
              <dd>{model.source.id}</dd>
            </div>
            <div>
              <dt>First seen</dt>
              <dd>{model.source.firstSeenAtLabel}</dd>
            </div>
            <div>
              <dt>Last seen</dt>
              <dd>{model.source.lastSeenAtLabel}</dd>
            </div>
            <div>
              <dt>Canonical URL</dt>
              <dd>{model.source.canonicalUrl ?? "Not recorded"}</dd>
            </div>
            <div>
              <dt>Apply URL</dt>
              <dd>{model.source.applyUrl ?? "Not recorded"}</dd>
            </div>
          </dl>
        </section>

        <div className="cd-job-source-status-grid">
          <section>
            <h4>Captured snapshot</h4>
            <p>{model.source.snapshotLabel}</p>
          </section>
          <section>
            <h4>Extraction</h4>
            <p>{model.source.extractionLabel}</p>
          </section>
          <section>
            <h4>Change comparison</h4>
            <p>{model.source.comparisonLabel}</p>
          </section>
          <section>
            <h4>Refresh policy</h4>
            <p>{model.source.refreshPolicy}</p>
          </section>
        </div>

        {model.source.comparison === null ? null : (
          <ListingSnapshotDiff comparison={model.source.comparison} />
        )}

        <section aria-labelledby="job-provenance-heading" className="cd-job-content-section">
          <p className="cd-eyebrow">Current resolved fields</p>
          <h3 id="job-provenance-heading">Provenance summary</h3>
          {model.source.provenance.length === 0 ? (
            <div className="cd-job-empty-state">
              <h4>No extracted candidates</h4>
              <p>User-entered values remain local and are not presented as source-verified.</p>
            </div>
          ) : (
            <div
              aria-label="Field provenance"
              className="cd-job-provenance-table-wrap"
              role="region"
              tabIndex={0}
            >
              <table className="cd-job-provenance-table">
                <thead>
                  <tr>
                    <th scope="col">Field</th>
                    <th scope="col">Current value</th>
                    <th scope="col">Basis</th>
                  </tr>
                </thead>
                <tbody>
                  {model.source.provenance.map((item) => (
                    <tr key={item.field}>
                      <th scope="row">{item.field}</th>
                      <td>{item.value}</td>
                      <td>{item.basis}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <aside className="cd-job-policy-note">
          New source candidates never silently replace user-confirmed values. Refresh is
          user-invoked and subject to the connector policy registry.
        </aside>
      </>
    )}
  </div>
);

function compensationValue(value: ListingSnapshotCompensationV1 | null): string {
  if (value === null) return "Not listed";
  const amount = (minor: number | null): string =>
    minor === null
      ? "unspecified"
      : `${value.currency} ${(minor / 100).toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
  const range =
    value.minMinor !== null && value.maxMinor !== null
      ? `${amount(value.minMinor)}–${amount(value.maxMinor)}`
      : amount(value.minMinor ?? value.maxMinor);
  return `${range} per ${value.interval}`;
}

function valueChangeText<T>(
  change: ListingSnapshotValueChangeV1<T>,
  format: (value: T | null) => string,
): string {
  if (change.kind === "unchanged") return "No change.";
  if (change.kind === "added") return `Added: ${format(change.after)}`;
  if (change.kind === "removed") return `Removed: ${format(change.before)}`;
  return `Changed from ${format(change.before)} to ${format(change.after)}.`;
}

function ListingSnapshotDiff({ comparison }: { readonly comparison: ListingSnapshotDiffV1 }) {
  const requirementChanges =
    comparison.requirements.added.length +
    comparison.requirements.removed.length +
    comparison.requirements.changed.length;
  const locationChanges = comparison.locations.added.length + comparison.locations.removed.length;
  return (
    <section aria-labelledby="job-source-diff-heading" className="cd-job-source-diff">
      <div className="cd-job-source-diff__heading">
        <div>
          <p className="cd-eyebrow">Read-only snapshot comparison</p>
          <h3 id="job-source-diff-heading">Listing changes</h3>
        </div>
        <strong>{comparison.changeCount} retained changes</strong>
      </div>
      <p>
        Compared {comparison.baselineCapturedAt} with {comparison.currentCapturedAt}. This did not
        refresh a source or update any trusted field.
      </p>
      <div className="cd-job-source-diff__grid">
        <article data-change-count={requirementChanges}>
          <h4>Requirements</h4>
          {requirementChanges === 0 ? (
            <p>No requirement changes.</p>
          ) : (
            <ul>
              {comparison.requirements.added.map((item) => (
                <li key={`added-${item.key}`}>
                  <strong>Added:</strong> {item.text}
                </li>
              ))}
              {comparison.requirements.removed.map((item) => (
                <li key={`removed-${item.key}`}>
                  <strong>Removed:</strong> {item.text}
                </li>
              ))}
              {comparison.requirements.changed.map((item) => (
                <li key={`changed-${item.key}`}>
                  <strong>Changed:</strong> {item.before.text} → {item.after.text}
                </li>
              ))}
            </ul>
          )}
        </article>
        <article data-change-kind={comparison.compensation.kind}>
          <h4>Compensation</h4>
          <p>{valueChangeText(comparison.compensation, compensationValue)}</p>
        </article>
        <article data-change-kind={comparison.deadline.kind}>
          <h4>Deadline</h4>
          <p>{valueChangeText(comparison.deadline, (value) => value ?? "Not listed")}</p>
        </article>
        <article data-change-count={locationChanges}>
          <h4>Locations</h4>
          {locationChanges === 0 ? (
            <p>No location changes.</p>
          ) : (
            <ul>
              {comparison.locations.added.map((location) => (
                <li key={`added-${location}`}>
                  <strong>Added:</strong> {location}
                </li>
              ))}
              {comparison.locations.removed.map((location) => (
                <li key={`removed-${location}`}>
                  <strong>Removed:</strong> {location}
                </li>
              ))}
            </ul>
          )}
        </article>
        <article data-change-kind={comparison.content.kind}>
          <h4>Captured content</h4>
          <p>
            {comparison.content.kind === "changed"
              ? "The retained content hash changed between snapshots. View both snapshots for exact source text."
              : "The retained content hash is unchanged."}
          </p>
        </article>
      </div>
      <p className="cd-job-source-diff__boundary">
        Comparison is evidence for review. Confirmed values remain unchanged until you explicitly
        accept a replacement.
      </p>
    </section>
  );
}

export const JobWorkspaceContent = ({ activeTab, model, onAction }: JobWorkspaceContentProps) => {
  validateModel(model);
  if (!isJobWorkspaceContentTab(activeTab)) {
    throw new RangeError("Job workspace content tab is unsupported.");
  }

  if (activeTab === "overview") return <OverviewPanel model={model} onAction={onAction} />;
  if (activeTab === "requirements") return <RequirementsPanel model={model} onAction={onAction} />;
  if (activeTab === "timeline") return <TimelinePanel model={model} onAction={onAction} />;
  if (activeTab === "company") return <CompanyPanel model={model} onAction={onAction} />;
  return <SourcePanel model={model} onAction={onAction} />;
};
