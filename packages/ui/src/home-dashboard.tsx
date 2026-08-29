import { useId } from "react";

import { Icon, type UiIconName } from "./icon.js";

export const HOME_ATTENTION_KINDS = Object.freeze([
  "backup-risk",
  "capture-review",
  "failed-transfer",
  "stale-follow-up",
  "unsupported-claim",
] as const);
export type HomeAttentionKind = (typeof HOME_ATTENTION_KINDS)[number];

export const HOME_URGENCY_LEVELS = Object.freeze(["overdue", "today", "upcoming"] as const);
export type HomeUrgency = (typeof HOME_URGENCY_LEVELS)[number];

export type HomeDashboardActionId =
  | "add-job"
  | "capture-url"
  | "explore-demo"
  | "import-tracker"
  | "open-follow-up"
  | "open-interview-plan"
  | "paste-listing"
  | "retry-transfer"
  | "review-backup"
  | "review-captures"
  | "review-unsupported-claims"
  | "view-submitted-files";

export interface HomeActionControl {
  readonly id: HomeDashboardActionId;
  readonly label: string;
}

export interface HomeNowItem {
  readonly context: string;
  readonly description: string;
  readonly id: string;
  readonly primaryAction: HomeActionControl;
  readonly secondaryAction?: HomeActionControl;
  readonly title: string;
  readonly urgency: HomeUrgency;
  readonly when: string;
}

export interface HomeAttentionItem {
  readonly action: HomeActionControl;
  readonly detail: string;
  readonly id: string;
  readonly kind: HomeAttentionKind;
  readonly title: string;
}

export interface HomeAgendaItem {
  readonly context: string;
  readonly day: string;
  readonly id: string;
  readonly time: string | null;
  readonly title: string;
}

export interface HomeRecentItem {
  readonly context: string;
  readonly href: string;
  readonly id: string;
  readonly kind: "document" | "job";
  readonly title: string;
}

export interface HomePipelineCount {
  readonly count: number;
  readonly label: string;
}

export interface HomeWeeklyTarget {
  readonly completed: number;
  readonly target: number;
}

export interface HomeSnapshot {
  readonly pipeline: readonly HomePipelineCount[];
  readonly responseTiming: string;
  readonly weeklyTarget: HomeWeeklyTarget | null;
}

export interface ReadyHomeDashboardModel {
  readonly agendaSummary: string;
  readonly attention: readonly HomeAttentionItem[];
  readonly now: readonly HomeNowItem[];
  readonly recent: readonly HomeRecentItem[];
  readonly snapshot: HomeSnapshot | null;
  readonly state: "ready";
  readonly week: readonly HomeAgendaItem[];
}

export interface EmptyHomeDashboardModel {
  readonly state: "empty";
}

export type HomeDashboardModel = EmptyHomeDashboardModel | ReadyHomeDashboardModel;

export interface HomeDashboardProps {
  readonly model: HomeDashboardModel;
  readonly onAction?: (action: HomeDashboardActionId) => void;
  readonly onDismissSnapshot?: () => void;
  readonly onNavigateRecent?: (item: HomeRecentItem) => void;
}

const ATTENTION_DETAILS: Readonly<
  Record<HomeAttentionKind, { readonly icon: UiIconName; readonly label: string }>
> = Object.freeze({
  "backup-risk": { icon: "hard-drive-download", label: "Backup risk" },
  "capture-review": { icon: "briefcase", label: "Capture review" },
  "failed-transfer": { icon: "cloud-off", label: "Transfer failed" },
  "stale-follow-up": { icon: "handshake", label: "Follow-up stale" },
  "unsupported-claim": { icon: "alert-triangle", label: "Claim needs evidence" },
});

const runAction = (action: HomeActionControl, onAction: HomeDashboardProps["onAction"]): void => {
  onAction?.(action.id);
};

const HomeEmptyState = ({ onAction }: { readonly onAction: HomeDashboardProps["onAction"] }) => (
  <section aria-labelledby="home-empty-heading" className="cd-home-empty">
    <span aria-hidden="true" className="cd-home-empty-icon">
      <Icon decorative name="briefcase" size={28} />
    </span>
    <div>
      <p className="cd-eyebrow">A calm place to begin</p>
      <h2 id="home-empty-heading">Add the first opportunity when you are ready</h2>
      <p>
        Coredrill will bring due actions, interviews, review work, and recent items here. No
        account, AI connection, or application target is required.
      </p>
    </div>
    <div className="cd-home-empty-actions">
      <button
        className="cd-button cd-button-primary"
        onClick={() => {
          onAction?.("add-job");
        }}
        type="button"
      >
        Add a job
      </button>
      <button
        className="cd-button cd-button-secondary"
        onClick={() => {
          onAction?.("import-tracker");
        }}
        type="button"
      >
        Import existing tracker
      </button>
      <button
        className="cd-text-button"
        onClick={() => {
          onAction?.("explore-demo");
        }}
        type="button"
      >
        Explore sample data
      </button>
    </div>
  </section>
);

export const HomeDashboard = ({
  model,
  onAction,
  onDismissSnapshot,
  onNavigateRecent,
}: HomeDashboardProps) => {
  const headingPrefix = useId();
  if (model.state === "empty") return <HomeEmptyState onAction={onAction} />;
  if (model.now.length > 3) {
    throw new RangeError("Home supports at most three high-priority Now actions.");
  }

  return (
    <div className="cd-home-dashboard" data-testid="home-dashboard">
      <section
        aria-labelledby={`${headingPrefix}-now`}
        className="cd-home-section cd-home-now"
        data-home-section="now"
      >
        <div className="cd-home-section-heading">
          <div>
            <p className="cd-eyebrow">Now</p>
            <h2 id={`${headingPrefix}-now`}>The next moves worth your attention</h2>
          </div>
          <div aria-label="Quick job actions" className="cd-home-quick-actions">
            {[
              ["add-job", "Add job"],
              ["paste-listing", "Paste listing"],
              ["capture-url", "Capture URL"],
            ].map(([id, label]) => (
              <button
                className="cd-button cd-button-secondary"
                key={id}
                onClick={() => {
                  onAction?.(id as HomeDashboardActionId);
                }}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {model.now.length === 0 ? (
          <p className="cd-home-inline-empty">
            Nothing urgent. Your local records remain available.
          </p>
        ) : (
          <div className="cd-home-now-grid">
            {model.now.map((item) => {
              const secondaryAction = item.secondaryAction;
              return (
                <article
                  className="cd-home-now-card"
                  data-testid="home-now-item"
                  data-urgency={item.urgency}
                  key={item.id}
                >
                  <div className="cd-home-card-meta">
                    <span>{item.context}</span>
                    <strong>{item.when}</strong>
                  </div>
                  <h3>{item.title}</h3>
                  <p>{item.description}</p>
                  <div className="cd-home-card-actions">
                    <button
                      className="cd-button cd-button-primary"
                      onClick={() => {
                        runAction(item.primaryAction, onAction);
                      }}
                      type="button"
                    >
                      {item.primaryAction.label}
                    </button>
                    {secondaryAction === undefined ? null : (
                      <button
                        className="cd-button cd-button-secondary"
                        onClick={() => {
                          runAction(secondaryAction, onAction);
                        }}
                        type="button"
                      >
                        {secondaryAction.label}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <section
        aria-labelledby={`${headingPrefix}-attention`}
        className="cd-home-section cd-home-attention"
        data-home-section="attention"
      >
        <div className="cd-home-section-heading">
          <div>
            <p className="cd-eyebrow">Needs attention</p>
            <h2 id={`${headingPrefix}-attention`}>Review work and recoverable risks</h2>
          </div>
          <span className="cd-home-section-count">
            {String(model.attention.length)} {model.attention.length === 1 ? "item" : "items"}
          </span>
        </div>
        {model.attention.length === 0 ? (
          <p className="cd-home-inline-empty">No review work or known vault risks.</p>
        ) : (
          <ul className="cd-home-attention-list">
            {model.attention.map((item) => {
              const details = ATTENTION_DETAILS[item.kind];
              return (
                <li key={item.id}>
                  <span className="cd-home-attention-icon">
                    <Icon decorative name={details.icon} size={20} />
                  </span>
                  <span className="cd-home-attention-copy">
                    <small>{details.label}</small>
                    <strong>{item.title}</strong>
                    <span>{item.detail}</span>
                  </span>
                  <button
                    className="cd-text-button"
                    onClick={() => {
                      runAction(item.action, onAction);
                    }}
                    type="button"
                  >
                    {item.action.label}
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section
        aria-labelledby={`${headingPrefix}-week`}
        className="cd-home-section cd-home-week"
        data-home-section="week"
      >
        <div className="cd-home-section-heading">
          <div>
            <p className="cd-eyebrow">This week</p>
            <h2 id={`${headingPrefix}-week`}>A compact local agenda</h2>
          </div>
          <span className="cd-home-section-count">{model.agendaSummary}</span>
        </div>
        {model.week.length === 0 ? (
          <p className="cd-home-inline-empty">No scheduled interviews, deadlines, or follow-ups.</p>
        ) : (
          <ol className="cd-home-agenda">
            {model.week.map((item) => (
              <li key={item.id}>
                <span className="cd-home-agenda-date">
                  <strong>{item.day}</strong>
                  <small>{item.time ?? "Any time"}</small>
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.context}</small>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>

      {model.snapshot === null ? null : (
        <section
          aria-labelledby={`${headingPrefix}-snapshot`}
          className="cd-home-section cd-home-snapshot"
          data-home-section="snapshot"
        >
          <div className="cd-home-section-heading">
            <div>
              <p className="cd-eyebrow">Optional snapshot</p>
              <h2 id={`${headingPrefix}-snapshot`}>A factual view of current activity</h2>
            </div>
            <button className="cd-text-button" onClick={onDismissSnapshot} type="button">
              Hide snapshot
            </button>
          </div>
          <div className="cd-home-snapshot-grid">
            {model.snapshot.pipeline.map((count) => (
              <div key={count.label}>
                <strong>{String(count.count)}</strong>
                <span>{count.label}</span>
              </div>
            ))}
          </div>
          <p className="cd-home-response-timing">
            <Icon decorative name="chart" size={18} />
            {model.snapshot.responseTiming}
          </p>
          {model.snapshot.weeklyTarget === null ? null : (
            <p className="cd-home-goal">
              Optional weekly plan: {String(model.snapshot.weeklyTarget.completed)} of{" "}
              {String(model.snapshot.weeklyTarget.target)} applications recorded. This is a private
              planning aid, not a streak.
            </p>
          )}
        </section>
      )}

      <section
        aria-labelledby={`${headingPrefix}-continue`}
        className="cd-home-section cd-home-continue"
        data-home-section="continue"
      >
        <div className="cd-home-section-heading">
          <div>
            <p className="cd-eyebrow">Continue</p>
            <h2 id={`${headingPrefix}-continue`}>Recent local work</h2>
          </div>
        </div>
        {model.recent.length === 0 ? (
          <p className="cd-home-inline-empty">
            Recently opened jobs and documents will appear here.
          </p>
        ) : (
          <ul className="cd-home-recent-list">
            {model.recent.map((item) => (
              <li key={item.id}>
                <a
                  href={item.href}
                  onClick={(event) => {
                    if (onNavigateRecent !== undefined) {
                      event.preventDefault();
                      onNavigateRecent(item);
                    }
                  }}
                >
                  <span className="cd-home-recent-icon">
                    <Icon decorative name={item.kind === "job" ? "briefcase" : "files"} size={20} />
                  </span>
                  <span>
                    <strong>{item.title}</strong>
                    <small>{item.context}</small>
                  </span>
                  <Icon decorative name="chevron-right" size={18} />
                </a>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
