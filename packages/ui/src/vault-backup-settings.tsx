import {
  BROWSER_EXPORT_REMINDER_INTERVAL_DAYS,
  type BrowserExportReminder,
} from "@coredrill/application";

import { Icon } from "./icon.js";

export {
  BROWSER_EXPORT_REMINDER_INTERVAL_DAYS,
  BROWSER_EXPORT_REMINDER_SNOOZE_DAYS,
  deriveBrowserExportReminder,
  snoozeBrowserExportReminder,
  type BrowserExportReminder,
  type BrowserExportReminderInput,
} from "@coredrill/application";

export type BrowserVaultPersistenceState = "denied" | "error" | "granted" | "unsupported";
export type BrowserVaultQuotaState = "available" | "low" | "unknown";
export type BrowserVaultExpectedDatabaseState = "found" | "missing" | "not-required";

export interface BrowserVaultBackupModel {
  readonly expectedDatabase: BrowserVaultExpectedDatabaseState;
  readonly origin: string;
  readonly persistence: BrowserVaultPersistenceState;
  readonly quota: BrowserVaultQuotaState;
  readonly remainingBytes?: number;
  readonly reminder: BrowserExportReminder;
}

export type BrowserExportReminderAction = "disable" | "enable" | "snooze";

export interface BrowserVaultBackupSettingsProps {
  readonly model: BrowserVaultBackupModel;
  readonly onExportPortableArchive?: () => void;
  readonly onReminderAction?: (action: BrowserExportReminderAction) => void;
  readonly onRequestPersistentStorage?: () => void;
  readonly onReviewRestore?: () => void;
}

const formatBytes = (bytes: number): string => {
  if (!Number.isFinite(bytes) || bytes < 0) return "Unknown";
  const units = ["bytes", "KB", "MB", "GB", "TB"] as const;
  let value = bytes;
  let unitIndex = 0;
  while (value >= 1_024 && unitIndex < units.length - 1) {
    value /= 1_024;
    unitIndex += 1;
  }
  const digits = unitIndex === 0 || value >= 10 ? 0 : 1;
  return `${value.toFixed(digits)} ${units[unitIndex] ?? "bytes"}`;
};

const PERSISTENCE_COPY: Readonly<
  Record<BrowserVaultPersistenceState, { readonly label: string; readonly detail: string }>
> = Object.freeze({
  granted: {
    detail: "This browser reports that storage for this origin is protected from routine eviction.",
    label: "Persistent storage granted",
  },
  denied: {
    detail:
      "This browser did not grant persistence. The vault remains local, but the browser may clear it under storage pressure.",
    label: "Best-effort browser storage",
  },
  error: {
    detail:
      "The browser could not report a persistence decision. Treat this vault as best-effort and keep a portable export.",
    label: "Persistence status unavailable",
  },
  unsupported: {
    detail:
      "This browser does not expose the persistent-storage request used by Coredrill. Keep a portable export or use a supported desktop browser or app.",
    label: "Persistent storage unsupported",
  },
});

const quotaCopy = (
  model: BrowserVaultBackupModel,
): { readonly label: string; readonly detail: string } => {
  if (model.quota === "low") {
    return {
      detail:
        "Available browser storage is low. Large attachments may fail, so a portable recovery copy is useful before adding more.",
      label: "Storage space is low",
    };
  }
  if (model.quota === "unknown") {
    return {
      detail:
        "The browser did not provide a usable storage estimate. Coredrill will not guess how much space remains.",
      label: "Storage estimate unavailable",
    };
  }
  return {
    detail:
      model.remainingBytes === undefined
        ? "The browser currently reports available storage space."
        : `${formatBytes(model.remainingBytes)} remains in the browser's current estimate.`,
    label: "Storage space available",
  };
};

const reminderCopy = (reminder: BrowserExportReminder): string => {
  if (reminder.state === "off") {
    return "Export reminders are off. You can still create a portable archive at any time.";
  }
  if (reminder.state === "scheduled") {
    return "The next optional export reminder is scheduled. Coredrill does not use streaks, countdowns, or repeated urgency.";
  }
  return reminder.reason === "never-exported"
    ? "No successful portable export is recorded for this browser vault. An export gives you a recovery copy outside this browser profile; Coredrill will keep working if you choose to do this later."
    : `Your optional ${String(BROWSER_EXPORT_REMINDER_INTERVAL_DAYS)}-day export reminder is due. Coredrill will keep working if you choose to do this later.`;
};

export const BrowserVaultBackupSettings = ({
  model,
  onExportPortableArchive,
  onReminderAction,
  onRequestPersistentStorage,
  onReviewRestore,
}: BrowserVaultBackupSettingsProps) => {
  const persistence = PERSISTENCE_COPY[model.persistence];
  const quota = quotaCopy(model);
  const hasStorageRisk =
    model.persistence !== "granted" ||
    model.quota !== "available" ||
    model.expectedDatabase === "missing";

  return (
    <section
      aria-labelledby="browser-vault-backup-heading"
      className="cd-vault-backup-settings"
      data-storage-health={hasStorageRisk ? "risk" : "ready"}
      data-testid="browser-vault-backup-settings"
    >
      <div className="cd-vault-backup-heading">
        <div>
          <p className="cd-vault-backup-eyebrow">Vault &amp; Backup</p>
          <h2 id="browser-vault-backup-heading">Browser vault on this device</h2>
        </div>
        <span className="cd-vault-backup-health-label">
          <Icon decorative name={hasStorageRisk ? "alert-triangle" : "check"} size={18} />
          {hasStorageRisk ? "Review storage health" : "Storage health ready"}
        </span>
      </div>

      <p className="cd-vault-backup-origin">
        Stored for this exact origin: <code>{model.origin}</code>. Another browser profile or origin
        has a separate vault until you explicitly export and restore it.
      </p>

      {model.expectedDatabase === "missing" ? (
        <div className="cd-vault-backup-alert" role="alert">
          <strong>Expected vault database not found</strong>
          <p>
            Do not create a replacement yet. Check that you opened the same browser profile and
            origin, then review restore options for an existing portable archive.
          </p>
        </div>
      ) : null}

      <div className="cd-vault-backup-health-grid" aria-live="polite">
        <article>
          <Icon
            decorative
            name={model.persistence === "granted" ? "check" : "database"}
            size={20}
          />
          <div>
            <h3>{persistence.label}</h3>
            <p>{persistence.detail}</p>
          </div>
        </article>
        <article>
          <Icon decorative name={model.quota === "low" ? "alert-triangle" : "info"} size={20} />
          <div>
            <h3>{quota.label}</h3>
            <p>{quota.detail}</p>
          </div>
        </article>
      </div>

      {model.persistence === "denied" || model.persistence === "error" ? (
        <div className="cd-vault-backup-action-row">
          <button
            className="cd-button"
            data-action="request-persistent-storage"
            onClick={onRequestPersistentStorage}
            type="button"
          >
            Request persistent storage
          </button>
          <span>The browser decides whether to grant this request.</span>
        </div>
      ) : null}

      <article className="cd-vault-backup-reminder" data-reminder-state={model.reminder.state}>
        <div>
          <p className="cd-vault-backup-eyebrow">Optional recovery reminder</p>
          <h3>Export portable archive</h3>
          <p>{reminderCopy(model.reminder)}</p>
        </div>
        <div className="cd-vault-backup-buttons">
          <button
            className="cd-button cd-button-primary"
            onClick={onExportPortableArchive}
            type="button"
          >
            Export portable archive
          </button>
          <button className="cd-button" onClick={onReviewRestore} type="button">
            Review restore options
          </button>
          {model.reminder.state === "off" ? (
            <button
              className="cd-button cd-button-quiet"
              onClick={() => onReminderAction?.("enable")}
              type="button"
            >
              Turn on reminders
            </button>
          ) : (
            <>
              <button
                className="cd-button cd-button-quiet"
                onClick={() => onReminderAction?.("snooze")}
                type="button"
              >
                Remind me later
              </button>
              <button
                className="cd-button cd-button-quiet"
                onClick={() => onReminderAction?.("disable")}
                type="button"
              >
                Turn off reminders
              </button>
            </>
          )}
        </div>
      </article>
    </section>
  );
};
