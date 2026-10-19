import { VaultDeletionSettings } from "@coredrill/ui";
import type { VaultDeletionPreviewDto, VaultDeletionResultDto } from "@coredrill/application";
import { useState } from "react";
import type { CoredrillStorageSpikeApi } from "./main.js";

/** Actual runtime facts and typed deletion, never the catalog's invented preview. */
export const StoredVaultSettings = ({
  api,
  onDeleted,
}: {
  readonly api: CoredrillStorageSpikeApi;
  readonly onDeleted: (result: VaultDeletionResultDto) => void;
}) => {
  const [preview, setPreview] = useState<VaultDeletionPreviewDto | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  return (
    <section aria-label="Local vault settings">
      <h2>{api.runtimeKind === "native" ? "Desktop vault" : "Browser vault"}</h2>
      <p>
        {api.runtimeKind === "native"
          ? "SQLite and retained document bytes use native managed storage. Browser OPFS and browser persistence permissions are not used."
          : "SQLite and retained document bytes use this browser origin's local storage."}
      </p>
      <p>
        Backup and restore controls are not connected to this settings view yet. No sample backup
        history or successful export is claimed.
      </p>
      <button
        type="button"
        className="cd-button"
        disabled={busy}
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
          onDelete={(input) => api.deleteCurrentVault(input)}
          onDeleted={(result) => {
            setPreview(null);
            onDeleted(result);
          }}
          onExportPortableArchive={() => {
            setMessage(
              "Portable archive export is not connected to this settings view. Do not delete until you have verified a recoverable copy.",
            );
          }}
        />
      )}
    </section>
  );
};
