import { useId, type ReactNode } from "react";

import { Icon } from "./icon.js";

export const PIPELINE_VIEW_IDS = Object.freeze(["inbox", "board", "table", "discover"] as const);
export type PipelineViewId = (typeof PIPELINE_VIEW_IDS)[number];

export const PIPELINE_BULK_ACTION_IDS = Object.freeze([
  "change-status",
  "add-tags",
  "archive",
] as const);
export type PipelineBulkActionId = (typeof PIPELINE_BULK_ACTION_IDS)[number];

export type PipelineShellActionId = "open-filters" | "open-sort" | "open-more";

export interface PipelineSavedView {
  readonly id: string;
  readonly label: string;
}

export interface PipelineFilterChip {
  readonly id: string;
  readonly label: string;
}

export interface PipelineShellModel {
  readonly activeSavedViewId: string;
  readonly activeView: PipelineViewId;
  readonly filters: readonly PipelineFilterChip[];
  readonly inboxCount: number;
  readonly matchingCount: number;
  readonly savedViews: readonly PipelineSavedView[];
  readonly searchQuery: string;
  readonly selectedCount: number;
  readonly sortLabel: string;
  readonly totalCount: number;
}

export interface PipelineShellProps {
  readonly children?: ReactNode;
  readonly model: PipelineShellModel;
  readonly onAction?: (action: PipelineShellActionId) => void;
  readonly onBulkAction?: (action: PipelineBulkActionId) => void;
  readonly onClearFilters?: () => void;
  readonly onClearSelection?: () => void;
  readonly onRemoveFilter?: (filter: PipelineFilterChip) => void;
  readonly onSavedViewChange?: (savedView: PipelineSavedView) => void;
  readonly onSearchQueryChange?: (query: string) => void;
  readonly onViewChange?: (view: PipelineViewId) => void;
}

const PIPELINE_VIEW_COPY: Readonly<
  Record<PipelineViewId, { readonly description: string; readonly label: string }>
> = Object.freeze({
  board: {
    description: "Orient by the current semantic stage.",
    label: "Board",
  },
  discover: {
    description: "Review only approved discovery sources.",
    label: "Discover",
  },
  inbox: {
    description: "Review captures before they become trusted records.",
    label: "Inbox",
  },
  table: {
    description: "Compare the same opportunities in a dense view.",
    label: "Table",
  },
});

const assertNonnegativeInteger = (value: number, label: string): void => {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a nonnegative integer.`);
  }
};

const assertUniqueIds = (items: readonly { readonly id: string }[], label: string): void => {
  const ids = new Set(items.map(({ id }) => id));
  if (ids.size !== items.length) throw new RangeError(`${label} IDs must be unique.`);
};

const validateModel = (model: PipelineShellModel): void => {
  assertNonnegativeInteger(model.inboxCount, "Pipeline inbox count");
  assertNonnegativeInteger(model.matchingCount, "Pipeline matching count");
  assertNonnegativeInteger(model.selectedCount, "Pipeline selected count");
  assertNonnegativeInteger(model.totalCount, "Pipeline total count");
  if (model.matchingCount > model.totalCount) {
    throw new RangeError("Pipeline matching count cannot exceed the total count.");
  }
  if (model.selectedCount > model.matchingCount) {
    throw new RangeError("Pipeline selected count cannot exceed the matching count.");
  }
  assertUniqueIds(model.filters, "Pipeline filter");
  assertUniqueIds(model.savedViews, "Pipeline saved view");
  if (!model.savedViews.some(({ id }) => id === model.activeSavedViewId)) {
    throw new RangeError("Pipeline active saved view must exist in the supplied saved views.");
  }
};

export const PipelineShell = ({
  children,
  model,
  onAction,
  onBulkAction,
  onClearFilters,
  onClearSelection,
  onRemoveFilter,
  onSavedViewChange,
  onSearchQueryChange,
  onViewChange,
}: PipelineShellProps) => {
  validateModel(model);
  const headingId = useId();
  const savedViewLabelId = useId();
  const activeView = PIPELINE_VIEW_COPY[model.activeView];

  return (
    <section aria-labelledby={headingId} className="cd-pipeline" data-testid="pipeline-shell">
      <h2 className="cd-visually-hidden" id={headingId}>
        Pipeline workspace controls
      </h2>

      <div className="cd-pipeline-toolbar">
        <div aria-label="Pipeline view" className="cd-pipeline-view-switch">
          {PIPELINE_VIEW_IDS.map((view) => {
            const copy = PIPELINE_VIEW_COPY[view];
            const label =
              view === "inbox" ? `${copy.label} ${String(model.inboxCount)}` : copy.label;
            return (
              <button
                aria-pressed={model.activeView === view}
                className="cd-pipeline-view-button"
                data-pipeline-view-option={view}
                key={view}
                onClick={() => {
                  onViewChange?.(view);
                }}
                type="button"
              >
                <span>{label}</span>
                {view === "inbox" && model.inboxCount > 0 ? (
                  <span aria-hidden="true" className="cd-pipeline-inbox-dot" />
                ) : null}
              </button>
            );
          })}
        </div>

        <div className="cd-pipeline-control-row">
          <label className="cd-pipeline-saved-view">
            <span id={savedViewLabelId}>Saved view</span>
            <span className="cd-select-shell">
              <select
                aria-labelledby={savedViewLabelId}
                onChange={(event) => {
                  const savedView = model.savedViews.find(({ id }) => id === event.target.value);
                  if (savedView !== undefined) onSavedViewChange?.(savedView);
                }}
                value={model.activeSavedViewId}
              >
                {model.savedViews.map((savedView) => (
                  <option key={savedView.id} value={savedView.id}>
                    {savedView.label}
                  </option>
                ))}
              </select>
              <Icon decorative name="chevron-down" size={16} />
            </span>
          </label>
          <button
            className="cd-button cd-button-secondary"
            onClick={() => {
              onAction?.("open-filters");
            }}
            type="button"
          >
            Filter
          </button>
          <button
            className="cd-button cd-button-secondary"
            onClick={() => {
              onAction?.("open-sort");
            }}
            type="button"
          >
            Sort · {model.sortLabel}
          </button>
          <button
            aria-label="More Pipeline actions"
            className="cd-icon-button"
            onClick={() => {
              onAction?.("open-more");
            }}
            type="button"
          >
            <Icon decorative name="menu" size={19} />
          </button>
        </div>
      </div>

      <div className="cd-pipeline-query-row">
        <label className="cd-pipeline-search">
          <Icon decorative name="search" size={18} />
          <span className="cd-visually-hidden">Search jobs</span>
          <input
            onChange={(event) => {
              onSearchQueryChange?.(event.target.value);
            }}
            placeholder="Search jobs…"
            type="search"
            value={model.searchQuery}
          />
        </label>
        <div aria-label="Active Pipeline filters" className="cd-pipeline-filter-list">
          {model.filters.length === 0 ? (
            <span className="cd-pipeline-no-filters">No active filters</span>
          ) : (
            <>
              {model.filters.map((filter) => (
                <button
                  aria-label={`Remove filter ${filter.label}`}
                  className="cd-pipeline-filter-chip"
                  key={filter.id}
                  onClick={() => {
                    onRemoveFilter?.(filter);
                  }}
                  type="button"
                >
                  <span>{filter.label}</span>
                  <Icon decorative name="x" size={14} />
                </button>
              ))}
              {model.filters.length > 1 ? (
                <button className="cd-text-button" onClick={onClearFilters} type="button">
                  Clear filters
                </button>
              ) : null}
            </>
          )}
        </div>
      </div>

      {model.selectedCount === 0 ? null : (
        <div aria-label="Bulk actions" className="cd-pipeline-selection" role="region">
          <strong>
            {String(model.selectedCount)} {model.selectedCount === 1 ? "job" : "jobs"} selected
          </strong>
          <div className="cd-pipeline-selection-actions">
            <button
              className="cd-button cd-button-secondary"
              onClick={() => {
                onBulkAction?.("change-status");
              }}
              type="button"
            >
              Change status
            </button>
            <button
              className="cd-button cd-button-secondary"
              onClick={() => {
                onBulkAction?.("add-tags");
              }}
              type="button"
            >
              Add tags
            </button>
            <button
              className="cd-button cd-button-secondary"
              onClick={() => {
                onBulkAction?.("archive");
              }}
              type="button"
            >
              Archive
            </button>
            <button className="cd-text-button" onClick={onClearSelection} type="button">
              Clear selection
            </button>
          </div>
        </div>
      )}

      <div
        aria-label={`${activeView.label} presentation`}
        className="cd-pipeline-presentation"
        data-pipeline-view={model.activeView}
      >
        <div className="cd-pipeline-presentation-heading">
          <div>
            <p className="cd-eyebrow">{activeView.label} view</p>
            <h3>{activeView.description}</h3>
          </div>
          <p>
            <strong>{String(model.matchingCount)}</strong> matching of {String(model.totalCount)}
          </p>
        </div>
        {children ?? (
          <div className="cd-pipeline-presentation-placeholder">
            The same local opportunity records remain in scope when presentation changes.
          </div>
        )}
      </div>
    </section>
  );
};
