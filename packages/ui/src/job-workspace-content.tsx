import { useState, type SyntheticEvent } from "react";

export const JOB_WORKSPACE_CONTENT_TABS = Object.freeze([
  "overview",
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
] as const);
export type JobWorkspaceContentActionId = (typeof JOB_WORKSPACE_CONTENT_ACTIONS)[number];

export type JobWorkspaceContentActionRequest =
  | {
      readonly id: "add-timeline-note";
      readonly value: string;
    }
  | {
      readonly id: Exclude<JobWorkspaceContentActionId, "add-timeline-note">;
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

export const JobWorkspaceContent = ({ activeTab, model, onAction }: JobWorkspaceContentProps) => {
  validateModel(model);
  if (!isJobWorkspaceContentTab(activeTab)) {
    throw new RangeError("Job workspace content tab is unsupported.");
  }

  if (activeTab === "overview") return <OverviewPanel model={model} onAction={onAction} />;
  if (activeTab === "timeline") return <TimelinePanel model={model} onAction={onAction} />;
  if (activeTab === "company") return <CompanyPanel model={model} onAction={onAction} />;
  return <SourcePanel model={model} onAction={onAction} />;
};
