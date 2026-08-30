import * as Dialog from "@radix-ui/react-dialog";
import { useRef, useState } from "react";

import type {
  ApplicationResult,
  DeleteVaultInput,
  VaultDeletionPreviewDto,
  VaultDeletionResultDto,
} from "@coredrill/application";

import { Icon } from "./icon.js";

export interface VaultDeletionSettingsProps {
  readonly preview: VaultDeletionPreviewDto;
  readonly onDelete: (
    input: DeleteVaultInput,
  ) => Promise<ApplicationResult<VaultDeletionResultDto>>;
  readonly onDeleted?: (result: VaultDeletionResultDto) => void;
  readonly onExportPortableArchive?: () => void;
}

const itemCount = (count: number, singular: string, plural = `${singular}s`): string =>
  `${String(count)} ${count === 1 ? singular : plural}`;

const formatExportInstant = (value: string | null): string => {
  if (value === null) return "No successful portable export is recorded.";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "The recorded export time is unavailable.";
  return `Coredrill recorded a successful portable export on ${new Intl.DateTimeFormat(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date)}.`;
};

export const VaultDeletionSettings = ({
  preview,
  onDelete,
  onDeleted,
  onExportPortableArchive,
}: VaultDeletionSettingsProps) => {
  const [confirmation, setConfirmation] = useState("");
  const [failure, setFailure] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [pendingCleanup, setPendingCleanup] = useState(false);
  const warningRef = useRef<HTMLDivElement>(null);
  const exactConfirmation = confirmation === preview.requiredConfirmation;

  const reset = (): void => {
    setConfirmation("");
    setFailure(null);
    setPendingCleanup(false);
    setSubmitting(false);
  };

  const submit = async (): Promise<void> => {
    if (!exactConfirmation || submitting) return;
    setSubmitting(true);
    setFailure(null);
    try {
      const result = await onDelete({
        vaultId: preview.vaultId,
        previewId: preview.previewId,
        confirmation,
      });
      if (!result.ok) {
        setFailure(result.error.message);
        return;
      }
      if (result.value.status === "cleanup_pending") {
        setPendingCleanup(true);
        onDeleted?.(result.value);
        if (onDeleted !== undefined) {
          setOpen(false);
          reset();
        }
        return;
      }
      onDeleted?.(result.value);
      setOpen(false);
      reset();
    } catch {
      setFailure("The local vault deletion failed safely. Review the vault and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <section
      aria-labelledby="vault-deletion-settings-heading"
      className="cd-vault-deletion-settings"
      data-testid="vault-deletion-settings"
    >
      <div>
        <p className="cd-vault-backup-eyebrow">Local data deletion</p>
        <h2 id="vault-deletion-settings-heading">Delete local vault</h2>
        <p>
          Permanently remove <strong>{preview.vaultName}</strong> from this
          {preview.storageMode === "browser" ? " browser origin" : " desktop app"}. External
          portable archives are not changed.
        </p>
      </div>

      <Dialog.Root
        onOpenChange={(nextOpen) => {
          if (!nextOpen && !submitting) reset();
          setOpen(nextOpen);
        }}
        open={open}
      >
        <Dialog.Trigger asChild>
          <button className="cd-button cd-button-danger" type="button">
            <Icon decorative name="trash" size={18} />
            Delete local vault
          </button>
        </Dialog.Trigger>
        <Dialog.Portal>
          <Dialog.Overlay className="cd-dialog-overlay" />
          <Dialog.Content
            className="cd-vault-deletion-dialog"
            onEscapeKeyDown={(event) => {
              if (submitting) event.preventDefault();
            }}
            onInteractOutside={(event) => {
              if (submitting) event.preventDefault();
            }}
            onOpenAutoFocus={(event) => {
              event.preventDefault();
              warningRef.current?.focus();
            }}
          >
            <div className="cd-dialog-heading">
              <div>
                <Dialog.Title>Delete {preview.vaultName}?</Dialog.Title>
                <Dialog.Description>
                  This permanently removes app-managed local data for this vault. There is no in-app
                  undo.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  aria-label="Close deletion warning"
                  className="cd-icon-button"
                  disabled={submitting}
                  type="button"
                >
                  <Icon decorative name="x" size={20} />
                </button>
              </Dialog.Close>
            </div>

            <div className="cd-vault-deletion-warning" ref={warningRef} tabIndex={-1}>
              <Icon decorative name="alert-triangle" size={22} />
              <div>
                <strong>Only an external portable archive can restore this vault.</strong>
                <p>{formatExportInstant(preview.lastSuccessfulPortableExportAt)}</p>
                <p>Coredrill cannot verify that an exported file still exists.</p>
              </div>
            </div>

            <div className="cd-vault-deletion-scope">
              <h3>App-managed data included</h3>
              <ul>
                <li>The active SQLite database and its local history</li>
                <li>{itemCount(preview.inventory.attachmentFiles, "attachment file")}</li>
                <li>{itemCount(preview.inventory.managedBackups, "managed automatic backup")}</li>
                <li>{itemCount(preview.inventory.providerSecrets, "vault-scoped provider key")}</li>
              </ul>
              <p>
                {itemCount(preview.inventory.sharedAttachmentFiles, "shared attachment file")} and
                other vaults are preserved. External portable archives are unaffected.
              </p>
            </div>

            <label className="cd-vault-deletion-confirmation" htmlFor="vault-delete-confirmation">
              Type <code>{preview.requiredConfirmation}</code> to continue
              <input
                autoCapitalize="none"
                autoComplete="off"
                disabled={submitting || pendingCleanup}
                id="vault-delete-confirmation"
                onChange={(event) => {
                  setConfirmation(event.target.value);
                  setFailure(null);
                }}
                spellCheck={false}
                type="text"
                value={confirmation}
              />
            </label>

            {failure === null ? null : (
              <p className="cd-vault-deletion-error" role="alert">
                {failure}
              </p>
            )}
            {pendingCleanup ? (
              <div className="cd-vault-deletion-error" role="alert">
                <strong>Vault removed; local cleanup still needs attention.</strong>
                <p>
                  Coredrill retained a managed cleanup record and did not report a clean deletion.
                  Desktop storage will retry that bounded cleanup when Coredrill starts again.
                </p>
              </div>
            ) : null}

            <div className="cd-vault-deletion-actions">
              <button
                className="cd-button"
                disabled={submitting}
                onClick={onExportPortableArchive}
                type="button"
              >
                Export portable archive
              </button>
              <Dialog.Close asChild>
                <button className="cd-button" disabled={submitting} type="button">
                  Cancel
                </button>
              </Dialog.Close>
              <button
                className="cd-button cd-button-danger"
                disabled={!exactConfirmation || submitting || pendingCleanup}
                onClick={() => void submit()}
                type="button"
              >
                {submitting ? "Deleting local vault…" : "Delete local vault"}
              </button>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  );
};
