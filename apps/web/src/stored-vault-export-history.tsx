import { useEffect, useRef, useState } from "react";
import {
  deriveBrowserExportReminderFromPreference,
  type ApplicationResult,
  type UpdateVaultExportReminderInput,
  type VaultExportVerificationView,
} from "@coredrill/application";
import type { StoredVaultExportApi } from "./stored-vault-export.js";

interface HistoryState {
  readonly vaultId: string | null;
  readonly phase: "loading" | "ready" | "failed";
  readonly view: VaultExportVerificationView | null;
}
const reminderText = (view: VaultExportVerificationView): string => {
  try {
    const reminder = deriveBrowserExportReminderFromPreference(view.reminder, Date.now());
    if (reminder.state === "off") return "Export reminders are off until you turn them on.";
    if (reminder.state === "due")
      return "Optional export reminder: consider making a verified copy. Coredrill keeps working if you choose to export later.";
    return `Optional export reminder scheduled for ${new Date(reminder.nextReminderAtUnixMs).toISOString()}.`;
  } catch {
    return "Reminder timing is unavailable. Check the device clock; no verification history was changed.";
  }
};

/** Only typed runtime operations; no catalog history, filesystem capability or direct SQL. */
export const StoredVaultExportHistory = ({
  api,
  vaultId,
  blocked,
  revision,
  onReminder,
}: {
  readonly api: StoredVaultExportApi;
  readonly vaultId: string | null;
  readonly blocked: boolean;
  readonly revision: number;
  readonly onReminder: (
    action: UpdateVaultExportReminderInput["action"],
  ) => Promise<ApplicationResult<VaultExportVerificationView>>;
}) => {
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<HistoryState>({ vaultId, phase: "loading", view: null });
  const [pendingOwner, setPendingOwner] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const owner = useRef(vaultId);
  owner.current = vaultId;
  const generation = useRef(0);
  useEffect(() => {
    const current = ++generation.current;
    setState({ vaultId, phase: "loading", view: null });
    setMessage("");
    setPendingOwner(null);
    if (vaultId !== null) {
      void api
        .readVerifications({ vaultId })
        .then((result) => {
          if (generation.current !== current || owner.current !== vaultId) return;
          setState({
            vaultId,
            phase: result.ok ? "ready" : "failed",
            view: result.ok ? result.value : null,
          });
        })
        .catch(() => {
          if (generation.current === current && owner.current === vaultId)
            setState({ vaultId, phase: "failed", view: null });
        });
    }
    return () => {
      generation.current += 1;
    };
  }, [api, vaultId, revision, retry]);
  const visible = state.vaultId === vaultId ? state : null;
  const view = visible?.phase === "ready" ? visible.view : null;
  const busy = pendingOwner !== null && pendingOwner === vaultId;
  const disabled = blocked || busy || view === null;
  const update = (action: UpdateVaultExportReminderInput["action"]) => {
    if (disabled || vaultId === null) return;
    const current = generation.current;
    setPendingOwner(vaultId);
    setMessage("");
    void onReminder(action)
      .then((result) => {
        if (generation.current !== current || owner.current !== vaultId) return;
        if (result.ok) {
          setState({ vaultId, phase: "ready", view: result.value });
          setMessage("Export reminder preference saved locally.");
        } else
          setMessage(
            "The reminder preference could not be confirmed. Review stored settings before trying again.",
          );
      })
      .catch(() => {
        if (generation.current === current && owner.current === vaultId)
          setMessage(
            "The reminder preference could not be confirmed. Review stored settings before trying again.",
          );
      })
      .finally(() => {
        if (generation.current === current && owner.current === vaultId) setPendingOwner(null);
      });
  };
  return (
    <section
      aria-label="Verified export history"
      className="cd-job-content-section cd-vault-export-history"
    >
      <h3>Historical export verifications</h3>
      <p>
        These are past observations of exact archive bytes, not a list of files Coredrill can
        locate. They do not prove current possession, current-vault freshness, encryption or a
        successful restore. Restored history may originate on another device or profile.
      </p>
      {vaultId === null ? (
        <p>Current vault identity is unavailable. No history is shown.</p>
      ) : visible?.phase === "failed" ? (
        <p role="alert">
          Export verification history could not be read. No empty history or replacement preference
          was substituted.
        </p>
      ) : view === null ? (
        <p role="status">Reading local export verification history…</p>
      ) : (
        <>
          {view.history.observations.length === 0 ? (
            <p>No export verification observations are recorded for this vault.</p>
          ) : (
            <ol>
              {view.history.observations.map((item) => (
                <li key={`${item.archiveId}|${item.verifiedAt}|${item.method}`}>
                  <dl>
                    <dt>Verified at</dt>
                    <dd>
                      <time dateTime={item.verifiedAt}>{item.verifiedAt}</time>
                    </dd>
                    <dt>Archive created</dt>
                    <dd>
                      <time dateTime={item.archiveCreatedAt}>{item.archiveCreatedAt}</time>
                    </dd>
                    <dt>Method</dt>
                    <dd>
                      {item.method === "native_readback"
                        ? "Native saved-byte readback"
                        : "Selected local copy hash match"}
                    </dd>
                    <dt>Schema / bytes</dt>
                    <dd>
                      {item.schemaVersion} / {item.byteLength}
                    </dd>
                  </dl>
                  <p className="cd-stored-job-text">
                    Archive ID: <code>{item.archiveId}</code>
                    <br />
                    SHA-256: <code>{item.sha256}</code>
                  </p>
                </li>
              ))}
            </ol>
          )}
          <h4>Optional export reminders</h4>
          <p>{reminderText(view)}</p>
          {view.reminder.enabled ? (
            <>
              <button
                type="button"
                className="cd-button"
                disabled={disabled}
                onClick={() => {
                  update("snooze");
                }}
              >
                Remind me in seven days
              </button>
              <button
                type="button"
                className="cd-button"
                disabled={disabled}
                onClick={() => {
                  update("disable");
                }}
              >
                Turn off export reminders
              </button>
            </>
          ) : (
            <button
              type="button"
              className="cd-button"
              disabled={disabled}
              onClick={() => {
                update("enable");
              }}
            >
              Turn on export reminders
            </button>
          )}
        </>
      )}
      <button
        type="button"
        className="cd-button cd-button-secondary"
        disabled={blocked || busy || vaultId === null || visible?.phase === "loading"}
        onClick={() => {
          setRetry((value) => value + 1);
        }}
      >
        Refresh verification history
      </button>
      {message === "" ? null : <p role="status">{message}</p>}
    </section>
  );
};
