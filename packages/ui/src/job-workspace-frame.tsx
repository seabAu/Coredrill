import { useEffect, useId, useRef, type CSSProperties, type ReactNode } from "react";

import { Icon } from "./icon.js";

export const JOB_WORKSPACE_TABS = Object.freeze([
  "overview",
  "requirements",
  "documents",
  "timeline",
  "company",
  "source",
] as const);
export type JobWorkspaceTabId = (typeof JOB_WORKSPACE_TABS)[number];

export const JOB_WORKSPACE_ACTIONS = Object.freeze([
  "change-status",
  "set-next-action",
  "prepare-application",
  "open-source",
  "open-more",
] as const);
export type JobWorkspaceActionId = (typeof JOB_WORKSPACE_ACTIONS)[number];
export type JobWorkspaceMode = "contextual" | "full-page";

export interface JobWorkspaceFrameModel {
  readonly company: string;
  readonly id: string;
  readonly nextAction: string | null;
  readonly priority: "high" | "normal" | "low";
  readonly sourceFreshness: string;
  readonly sourceLabel: string;
  readonly status: string;
  readonly title: string;
}

export interface JobWorkspaceFrameProps {
  readonly activeTab: JobWorkspaceTabId;
  readonly children?: ReactNode;
  readonly contextualWidth?: number;
  readonly mode: JobWorkspaceMode;
  readonly model: JobWorkspaceFrameModel;
  readonly onAction?: (action: JobWorkspaceActionId) => void;
  readonly onContextualWidthChange?: (width: number) => void;
  readonly onRequestClose: () => void;
  readonly onTabChange?: (tab: JobWorkspaceTabId) => void;
}

const TAB_LABELS: Readonly<Record<JobWorkspaceTabId, string>> = Object.freeze({
  company: "Company",
  documents: "Documents",
  overview: "Overview",
  requirements: "Requirements",
  source: "Source",
  timeline: "Timeline",
});

const validateModel = (
  model: JobWorkspaceFrameModel,
  activeTab: JobWorkspaceTabId,
  contextualWidth: number,
): void => {
  if (
    model.id.length === 0 ||
    model.title.trim().length === 0 ||
    model.company.trim().length === 0 ||
    model.status.trim().length === 0 ||
    model.sourceLabel.trim().length === 0 ||
    model.sourceFreshness.trim().length === 0
  ) {
    throw new RangeError("Job workspace frame requires bounded identifying context.");
  }
  if (!JOB_WORKSPACE_TABS.includes(activeTab)) {
    throw new RangeError("Job workspace tab is unsupported.");
  }
  if (!Number.isSafeInteger(contextualWidth) || contextualWidth < 560 || contextualWidth > 760) {
    throw new RangeError("Contextual Job workspace width must be between 560 and 760 pixels.");
  }
};

export const JobWorkspaceFrame = ({
  activeTab,
  children,
  contextualWidth = 640,
  mode,
  model,
  onAction,
  onContextualWidthChange,
  onRequestClose,
  onTabChange,
}: JobWorkspaceFrameProps) => {
  validateModel(model, activeTab, contextualWidth);
  const headingId = useId();
  const headingReference = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    headingReference.current?.focus();
  }, [mode, model.id]);

  const style = {
    "--cd-job-workspace-width": `${String(contextualWidth)}px`,
  } as CSSProperties;

  return (
    <section
      aria-labelledby={headingId}
      className="cd-job-workspace"
      data-job-workspace={model.id}
      data-workspace-mode={mode}
      style={style}
    >
      <header className="cd-job-workspace-header">
        <div className="cd-job-workspace-heading-row">
          <div>
            <p className="cd-eyebrow">Job workspace</p>
            <h2 id={headingId} ref={headingReference} tabIndex={-1}>
              {model.title}
            </h2>
            <p className="cd-job-workspace-company">{model.company}</p>
          </div>
          <button
            aria-label={mode === "contextual" ? "Close Job workspace" : "Back to Pipeline"}
            className="cd-icon-button"
            onClick={onRequestClose}
            type="button"
          >
            <Icon
              className={mode === "full-page" ? "cd-job-workspace-back-icon" : undefined}
              decorative
              name={mode === "contextual" ? "x" : "chevron-right"}
              size={20}
            />
          </button>
        </div>

        <dl className="cd-job-workspace-context">
          <div>
            <dt>Status</dt>
            <dd>{model.status}</dd>
          </div>
          <div>
            <dt>Priority</dt>
            <dd>{model.priority}</dd>
          </div>
          <div>
            <dt>Next action</dt>
            <dd>{model.nextAction ?? "Not set"}</dd>
          </div>
          <div>
            <dt>Source</dt>
            <dd>
              <button
                className="cd-text-button"
                onClick={() => {
                  onAction?.("open-source");
                }}
                type="button"
              >
                {model.sourceLabel}
              </button>
              <small>{model.sourceFreshness}</small>
            </dd>
          </div>
        </dl>

        <div aria-label="Important Job actions" className="cd-job-workspace-actions">
          <button
            className="cd-button cd-button-secondary"
            onClick={() => {
              onAction?.("change-status");
            }}
            type="button"
          >
            Change status
          </button>
          <button
            className="cd-button cd-button-secondary"
            onClick={() => {
              onAction?.("set-next-action");
            }}
            type="button"
          >
            Set next action
          </button>
          <button
            className="cd-button cd-button-primary"
            onClick={() => {
              onAction?.("prepare-application");
            }}
            type="button"
          >
            Prepare application
          </button>
          <button
            aria-label="More Job actions"
            className="cd-icon-button"
            onClick={() => {
              onAction?.("open-more");
            }}
            type="button"
          >
            <Icon decorative name="menu" size={19} />
          </button>
        </div>

        {mode === "contextual" ? (
          <label className="cd-job-workspace-width">
            Workspace width
            <input
              aria-label="Job workspace width"
              max="760"
              min="560"
              onChange={(event) => {
                onContextualWidthChange?.(Number(event.target.value));
              }}
              step="20"
              type="range"
              value={contextualWidth}
            />
            <output>{String(contextualWidth)} px</output>
          </label>
        ) : null}
      </header>

      <nav aria-label="Job workspace tabs" className="cd-job-workspace-tabs">
        {JOB_WORKSPACE_TABS.map((tab) => (
          <button
            aria-current={activeTab === tab ? "page" : undefined}
            data-job-workspace-tab={tab}
            key={tab}
            onClick={() => {
              onTabChange?.(tab);
            }}
            type="button"
          >
            {TAB_LABELS[tab]}
          </button>
        ))}
      </nav>

      <div className="cd-job-workspace-body" data-job-workspace-panel={activeTab}>
        {children ?? (
          <section aria-labelledby={`${headingId}-panel`} className="cd-job-workspace-placeholder">
            <p className="cd-eyebrow">{TAB_LABELS[activeTab]}</p>
            <h3 id={`${headingId}-panel`}>{TAB_LABELS[activeTab]} workspace frame</h3>
            <p>
              This shared route and navigation frame is ready for the local record content in the
              next checklist slice.
            </p>
          </section>
        )}
      </div>
    </section>
  );
};
