import type { PreparedVaultExportDto } from "@coredrill/application";

export interface VaultExportPanelState {
  readonly ownerId: string | null;
  readonly phase:
    | "idle"
    | "preparing"
    | "prepared"
    | "saving"
    | "download_handoff"
    | "verifying"
    | "saved_copy_verified";
  readonly consent: boolean;
  readonly busy: boolean;
  readonly metadata: Omit<PreparedVaultExportDto, "bytes" | "state"> | null;
  readonly error: string | null;
  readonly message: string;
}
export interface VaultExportPanelProps {
  readonly state: VaultExportPanelState;
  readonly runtime: "browser" | "native";
  readonly blocked: boolean;
  readonly onConsent: (checked: boolean) => void;
  readonly onPrepare: () => void;
  readonly onSave: () => void;
  readonly onVerify: (file: File) => void;
  readonly onDiscard: () => void;
}
/** Preparation, browser handoff and matched-copy evidence never share a success label. */
export const VaultExportPanel = ({
  state,
  runtime,
  blocked,
  onConsent,
  onPrepare,
  onSave,
  onVerify,
  onDiscard,
}: VaultExportPanelProps) => {
  const disabled = blocked || state.busy || state.ownerId === null;
  const metadata = state.metadata;
  return (
    <section aria-label="Portable vault export" className="cd-job-content-section cd-vault-export">
      <h3>Portable vault export</h3>
      <p>
        This complete archive includes the database, human-readable JSON/CSV and retained
        attachments. It is unencrypted and may contain private career, application and contact
        information. Nothing is uploaded.
      </p>
      <p>
        Prepared bytes are held only in this session. Reload discards them without changing the
        vault. A prepared snapshot excludes later edits.
      </p>
      {state.ownerId === null ? (
        <p>
          Current vault identity is unavailable. Refresh storage health before preparing an archive.
        </p>
      ) : null}
      {metadata === null ? (
        <>
          <label className="cd-checkbox-label">
            <input
              type="checkbox"
              checked={state.consent}
              disabled={disabled}
              onChange={(event) => {
                onConsent(event.currentTarget.checked);
              }}
            />{" "}
            I understand this archive is unencrypted and contains my private vault data.
          </label>
          <button
            type="button"
            className="cd-button"
            disabled={disabled || !state.consent}
            onClick={onPrepare}
          >
            {state.phase === "preparing" ? "Preparing archive…" : "Prepare portable archive"}
          </button>
        </>
      ) : (
        <>
          <h4 tabIndex={-1} data-vault-export-review="true">
            Prepared archive snapshot
          </h4>
          <dl>
            <div>
              <dt>Archive created</dt>
              <dd>
                <time dateTime={metadata.createdAt}>{metadata.createdAt}</time>
              </dd>
            </div>
            <div>
              <dt>Schema</dt>
              <dd>{metadata.schemaVersion}</dd>
            </div>
            <div>
              <dt>Human-readable files</dt>
              <dd>{metadata.dataFileCount}</dd>
            </div>
            <div>
              <dt>Retained attachments</dt>
              <dd>{metadata.attachmentCount}</dd>
            </div>
            <div>
              <dt>Archive byte length</dt>
              <dd>{metadata.byteLength}</dd>
            </div>
          </dl>
          <p className="cd-stored-job-text">
            Suggested filename: <code>{metadata.fileName}</code>
          </p>
          <p className="cd-stored-job-text">
            SHA-256: <code>{metadata.sha256}</code>
          </p>
          {runtime === "browser" ? (
            <>
              <button type="button" className="cd-button" disabled={disabled} onClick={onSave}>
                {state.phase === "saving" ? "Starting download…" : "Download prepared archive"}
              </button>
              <p>
                The browser controls the destination. Starting a download is not confirmation that a
                file was saved.
              </p>
              <label>
                Verify a saved local copy
                <input
                  type="file"
                  accept=".zip,.coredrill.zip,application/zip"
                  disabled={disabled}
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    event.currentTarget.value = "";
                    if (file !== undefined) onVerify(file);
                  }}
                />
              </label>
            </>
          ) : (
            <p>
              Native portable-archive saving and selected-copy reading are not connected yet. This
              does not use a browser-download fallback or browser file picker.
            </p>
          )}
          <button
            type="button"
            className="cd-button cd-button-secondary"
            disabled={disabled}
            onClick={onDiscard}
          >
            Discard prepared archive
          </button>
        </>
      )}
      {state.error === null ? (
        <p role="status">{state.message}</p>
      ) : (
        <p role="alert">{state.error}</p>
      )}
      <p>
        Matching a selected copy is not a restore test or proof that the file will remain available.
        No successful-backup timestamp is recorded by these staged controls. Restore controls remain
        unfinished.
      </p>
    </section>
  );
};
