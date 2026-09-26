export interface ConnectorRegistrySettingsModel {
  readonly connectorId: string;
  readonly label: string;
  readonly effectiveState: "off" | "ready" | "blocked";
  readonly reviewState: "not_yet_valid" | "current" | "due_soon" | "expired";
  readonly reviewedAt: string;
  readonly reviewDueAt: string;
  readonly reviewAgeDays: number;
  readonly reviewDueInDays: number;
  readonly lastUsedAt: string | null;
  readonly destinationDomains: readonly string[];
  readonly attributionLabel: string;
  readonly termsUrl: string;
  readonly privacyUrl: string;
  readonly credentials: "none" | "user_configured";
  readonly ratePolicy: string;
  readonly retention: string;
  readonly userVisibleDataFlow: string;
}

export interface ConnectorRegistrySettingsProps {
  readonly connectors: readonly ConnectorRegistrySettingsModel[];
}

const dateOnly = (instant: string): string => instant.slice(0, 10);

const reviewCopy = (connector: ConnectorRegistrySettingsModel): string => {
  if (connector.reviewState === "expired") {
    return `Review expired ${String(Math.abs(connector.reviewDueInDays))} day${Math.abs(connector.reviewDueInDays) === 1 ? "" : "s"} ago`;
  }
  if (connector.reviewState === "not_yet_valid") return "Review is not yet valid";
  const age =
    connector.reviewAgeDays === 0
      ? "Reviewed today"
      : `Reviewed ${String(connector.reviewAgeDays)} day${connector.reviewAgeDays === 1 ? "" : "s"} ago`;
  const due = `${String(connector.reviewDueInDays)} day${connector.reviewDueInDays === 1 ? "" : "s"} until review`;
  return `${age} · ${due}`;
};

const stateCopy = (state: ConnectorRegistrySettingsModel["effectiveState"]): string => {
  if (state === "ready") return "On";
  if (state === "blocked") return "Blocked";
  return "Off";
};

export const ConnectorRegistrySettings = ({ connectors }: ConnectorRegistrySettingsProps) => (
  <section
    aria-labelledby="connector-registry-settings-heading"
    className="cd-connector-registry-settings"
    data-testid="connector-registry-settings"
  >
    <div className="cd-connector-registry-heading">
      <div>
        <p className="cd-vault-backup-eyebrow">Network connectors</p>
        <h2 id="connector-registry-settings-heading">Approved source registry</h2>
      </div>
      <span>{connectors.length} reviewed sources</span>
    </div>
    <p className="cd-connector-registry-intro">
      Network sources are off by default. A connector can run only after you enable it for an
      explicit action; policy review, destination, rate, cache, retention, and kill-switch checks
      still apply before any request.
    </p>

    <ul className="cd-connector-registry-list">
      {connectors.map((connector) => (
        <li key={connector.connectorId}>
          <article
            data-connector-id={connector.connectorId}
            data-effective-state={connector.effectiveState}
            data-review-state={connector.reviewState}
          >
            <header>
              <div>
                <h3>{connector.label}</h3>
                <p>{connector.userVisibleDataFlow}</p>
              </div>
              <span className="cd-connector-state">{stateCopy(connector.effectiveState)}</span>
            </header>

            <dl>
              <div>
                <dt>Policy review</dt>
                <dd>
                  {reviewCopy(connector)}
                  <small>
                    Reviewed {dateOnly(connector.reviewedAt)} · due{" "}
                    {dateOnly(connector.reviewDueAt)}
                  </small>
                </dd>
              </div>
              <div>
                <dt>Last use</dt>
                <dd>
                  {connector.lastUsedAt === null
                    ? "Never on this device"
                    : dateOnly(connector.lastUsedAt)}
                </dd>
              </div>
              <div>
                <dt>Exact destination</dt>
                <dd>{connector.destinationDomains.join(", ")}</dd>
              </div>
              <div>
                <dt>Credentials</dt>
                <dd>
                  {connector.credentials === "none"
                    ? "None"
                    : "User configured; bound only at the privileged connector"}
                </dd>
              </div>
              <div>
                <dt>Attribution</dt>
                <dd>{connector.attributionLabel}</dd>
              </div>
            </dl>

            <details>
              <summary>Rate, cache, and retention policy</summary>
              <p>{connector.ratePolicy}</p>
              <p>{connector.retention}</p>
            </details>

            <nav aria-label={`${connector.label} policy links`}>
              <a href={connector.termsUrl} rel="noreferrer" target="_blank">
                Terms and source policy
              </a>
              <a href={connector.privacyUrl} rel="noreferrer" target="_blank">
                Privacy
              </a>
            </nav>
          </article>
        </li>
      ))}
    </ul>
  </section>
);
