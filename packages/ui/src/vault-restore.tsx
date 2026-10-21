import type { VaultRestorePreviewDto } from "@coredrill/application";

export interface VaultRestorePanelState {
  readonly ownerId: string | null;
  readonly phase: "idle" | "selecting" | "inspecting" | "review" | "committing" | "reopen";
  readonly busy: boolean;
  readonly preview: VaultRestorePreviewDto | null;
  readonly confirmed: boolean;
  readonly message: string;
  readonly error: string | null;
}
export const VaultRestorePanel = (props: {
  readonly state: VaultRestorePanelState;
  readonly runtime: "browser" | "native";
  readonly blocked: boolean;
  readonly headingLevel?: 2 | 3;
  readonly onFile: (file: File) => void;
  readonly onNativeSelect: () => void;
  readonly onConfirm: (checked: boolean) => void;
  readonly onCommit: () => void;
  readonly onDiscard: () => void;
  readonly onReopen: () => void;
}) => {
  const { state, runtime, blocked } = props;
  const disabled = state.busy || blocked;
  const preview = state.preview;
  const Heading = props.headingLevel === 2 ? "h2" : "h3";
  const ReviewHeading = props.headingLevel === 2 ? "h3" : "h4";
  return (
    <section aria-label="Portable vault restore" className="cd-job-content-section cd-vault-export">
      <Heading tabIndex={-1} data-vault-restore-heading="true">
        Restore portable archive
      </Heading>
      <p>
        Select a complete Coredrill ZIP from this device. It is unencrypted and may contain private
        information. Nothing is uploaded. Selection and inspection do not restore data.
      </p>
      <p>
        Restore replaces the local database, not a merge. Review archive and target identities
        below. After commit you must reload the workspace; unsaved drafts and prepared export bytes
        will close.
      </p>
      {state.phase === "reopen" ? (
        <button type="button" className="cd-button" disabled={state.busy} onClick={props.onReopen}>
          Reload local vault
        </button>
      ) : preview === null ? (
        runtime === "native" ? (
          <button
            type="button"
            className="cd-button"
            disabled={disabled}
            onClick={props.onNativeSelect}
          >
            Choose archive to review
          </button>
        ) : (
          <label>
            Choose archive to review
            <input
              type="file"
              accept=".zip,.coredrill.zip,application/zip"
              disabled={disabled}
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file !== undefined) props.onFile(file);
              }}
            />
          </label>
        )
      ) : (
        <>
          <ReviewHeading tabIndex={-1} data-vault-restore-review="true">
            Review exact restore changes
          </ReviewHeading>
          <dl>
            <div>
              <dt>Archive vault ID</dt>
              <dd className="cd-stored-job-text">{preview.archive.vaultId}</dd>
            </div>
            <div>
              <dt>Current target vault ID</dt>
              <dd className="cd-stored-job-text">
                {preview.target.vaultId ?? "Empty target (no vault identity)"}
              </dd>
            </div>
            <div>
              <dt>Archive created</dt>
              <dd>
                <time dateTime={preview.archive.createdAt}>{preview.archive.createdAt}</time>
              </dd>
            </div>
            <div>
              <dt>Created by Coredrill version</dt>
              <dd>{preview.archive.createdByVersion}</dd>
            </div>
            <div>
              <dt>Archive / target SQLite schema</dt>
              <dd>
                {preview.archive.schemaVersion} / {preview.target.schemaVersion ?? "none"}
              </dd>
            </div>
            <div>
              <dt>Archive bytes</dt>
              <dd>{preview.archive.byteLength}</dd>
            </div>
            <div>
              <dt>Human-readable data files</dt>
              <dd>{preview.archive.dataFileCount}</dd>
            </div>
            <div>
              <dt>Archive / target attachments</dt>
              <dd>
                {preview.archive.attachmentCount} / {preview.target.attachmentCount}
              </dd>
            </div>
            <div>
              <dt>Database action</dt>
              <dd>{preview.changes.database}</dd>
            </div>
            <div>
              <dt>Attachment references added / reused / removed</dt>
              <dd>
                {preview.changes.attachmentsAdded} / {preview.changes.attachmentsReused} /{" "}
                {preview.changes.attachmentsRemoved}
              </dd>
            </div>
          </dl>
          <p className="cd-stored-job-text">
            Archive SHA-256: <code>{preview.archive.sha256}</code>
          </p>
          <p className="cd-stored-job-text">
            Archived database SHA-256: <code>{preview.archive.databaseSha256}</code>
          </p>
          <p className="cd-stored-job-text">
            Reviewed target fingerprint: <code>{preview.target.fingerprint}</code>
          </p>
          <p>
            {preview.conflict === "different_vault_replace"
              ? "Warning: this archive belongs to a DIFFERENT vault. Confirming replaces the current vault and its referenced attachments."
              : preview.conflict === "same_vault_replace"
                ? "Warning: this archive replaces existing data for the same vault. Later edits not in the archive will be lost."
                : preview.conflict === "identical"
                  ? "The reviewed target content is identical. Confirmation is still required; this is not a completed restore."
                  : "This archive will create a vault in the reviewed empty target."}
          </p>
          <label className="cd-checkbox-label">
            <input
              type="checkbox"
              checked={state.confirmed}
              disabled={disabled}
              onChange={(event) => {
                props.onConfirm(event.currentTarget.checked);
              }}
            />{" "}
            I reviewed these exact changes and confirm{" "}
            {preview.requiredConfirmation === "replace_different_vault"
              ? "replacement of this different vault"
              : preview.requiredConfirmation === "replace_same_vault"
                ? "replacement of this vault"
                : "this restore"}
            . I understand that reopening closes unsaved drafts.
          </label>
          <button
            type="button"
            className="cd-button"
            disabled={disabled || !state.confirmed}
            onClick={props.onCommit}
          >
            {state.phase === "committing"
              ? "Restoring archive…"
              : "Confirm and restore reviewed archive"}
          </button>
          <button type="button" className="cd-button" disabled={disabled} onClick={props.onDiscard}>
            Discard restore preview
          </button>
        </>
      )}
      <p role="status">{state.message}</p>
      {state.error === null ? null : <p role="alert">{state.error}</p>}
    </section>
  );
};
