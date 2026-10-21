import { VaultDeletionSettings } from "@coredrill/ui";
import type {
  VaultDeletionPreviewDto,
  VaultDeletionResultDto,
  VaultSessionDto,
} from "@coredrill/application";
import { useEffect, useState } from "react";
import type { CoredrillStorageSpikeApi } from "./main.js";
import type { useStoredVaultExportSession } from "./stored-vault-export-session.js";
import { StoredVaultExportHistory } from "./stored-vault-export-history.js";

/** Actual runtime facts and typed deletion, never the catalog's invented preview. */
export const StoredVaultSettings = ({
  api,
  onDeleted,
  session,
  onSessionObserved,
  exportSession,
}: {
  readonly api: CoredrillStorageSpikeApi;
  readonly onDeleted: (result: VaultDeletionResultDto) => void;
  readonly session?: VaultSessionDto | undefined;
  readonly onSessionObserved?: ((session: VaultSessionDto) => void) | undefined;
  readonly exportSession: ReturnType<typeof useStoredVaultExportSession>;
}) => {
  const [observed, setObserved] = useState(session ?? null);
  useEffect(() => {
    setObserved(session ?? null);
  }, [session]);
  const [preview, setPreview] = useState<VaultDeletionPreviewDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <section aria-label="Local vault settings">
      <h2>{api.runtimeKind === "native" ? "Desktop vault" : "Browser vault"}</h2>
      {observed === null ? null : (
        <dl>
          <dt>Vault name</dt>
          <dd>{observed.vault.name}</dd>
          <dt>Observed storage health</dt>
          <dd>{observed.diagnostics.health}</dd>
          <dt>Persistence</dt>
          <dd>{observed.diagnostics.persistence}</dd>
          <dt>Read-only</dt>
          <dd>{observed.diagnostics.readOnly ? "Yes" : "No"}</dd>
          <dt>SQLite schema</dt>
          <dd>{observed.diagnostics.schemaVersion}</dd>
        </dl>
      )}
      {api.runtimeKind === "browser" ? (
        <p>
          Browser origin: {window.location.origin}. This is separate from other browsers, profiles,
          devices and desktop vaults.
        </p>
      ) : null}
      <button
        type="button"
        className="cd-button"
        disabled={busy || exportSession.busy}
        onClick={() => {
          setBusy(true);
          setMessage("");
          void api.vault
            .inspect()
            .then((result) => {
              if (!result.ok) {
                setMessage(result.error.message);
                return;
              }
              if (result.value.vault === null) {
                setMessage("The local vault identity is unavailable. No replacement was created.");
                return;
              }
              const next = { vault: result.value.vault, diagnostics: result.value.diagnostics };
              setObserved(next);
              onSessionObserved?.(next);
              setMessage(
                "Local storage health refreshed. No persistence permission was requested.",
              );
            })
            .catch(() => {
              setMessage(
                "Storage health could not be refreshed. Existing records were not changed.",
              );
            })
            .finally(() => {
              setBusy(false);
            });
        }}
      >
        Refresh storage health
      </button>
      <p>
        {api.runtimeKind === "native"
          ? "SQLite and retained document bytes use native managed storage. Browser OPFS and browser persistence permissions are not used."
          : "SQLite and retained document bytes use this browser origin's local storage."}
      </p>
      {exportSession.panel(busy)}
      <StoredVaultExportHistory
        api={api.vaultExport}
        vaultId={observed?.vault.id ?? null}
        blocked={busy || exportSession.busy}
        revision={exportSession.recordRevision}
        onReminder={(action) => {
          const vaultId = observed?.vault.id;
          if (vaultId === undefined)
            return Promise.resolve({
              ok: false,
              error: {
                code: "conflict",
                retryable: false,
                message: "Review the current vault before continuing.",
              },
            });
          return exportSession.mutate(vaultId, () =>
            api.vaultExport.updateReminder({ vaultId, action }),
          );
        }}
      />
      <p>
        Restore controls remain unfinished. Verification history is not a successful restore claim.
      </p>
      <button
        type="button"
        className="cd-button"
        disabled={busy || exportSession.busy}
        onClick={() => {
          setBusy(true);
          setMessage("");
          void api
            .prepareVaultDeletion()
            .then((result) => {
              if (result.ok) setPreview(result.value);
              else setMessage(result.error.message);
            })
            .catch(() => {
              setMessage("The local vault could not be reviewed. Your data was not changed.");
            })
            .finally(() => {
              setBusy(false);
            });
        }}
      >
        {busy ? "Reviewing local vault…" : "Review vault deletion"}
      </button>
      <p role="status">{message}</p>
      {preview === null ? null : (
        <VaultDeletionSettings
          preview={preview}
          onDelete={(input) =>
            exportSession.mutate(input.vaultId, () => api.deleteCurrentVault(input))
          }
          onDeleted={(result) => {
            setPreview(null);
            onDeleted(result);
          }}
          onExportPortableArchive={() => {
            setMessage(
              "Close this warning and use Portable vault export above. This does not submit deletion; do not delete until you have verified a recoverable copy.",
            );
          }}
        />
      )}
    </section>
  );
};
