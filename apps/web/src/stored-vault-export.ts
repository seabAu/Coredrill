import {
  createPrepareVaultExportQuery,
  createSaveVaultExportCommand,
  type SaveVaultExportInput,
  type VaultExportSavePort,
  VaultExportPreparationError,
  type ApplicationOperationContext,
  type PrepareVaultExportInput,
} from "@coredrill/application";
import {
  preparePortableVaultArchiveV1,
  inspectPortableArchiveV1,
  PortableVaultArchiveError,
  type DatabasePort,
} from "@coredrill/storage-core";

/** Explicit preparation/save composition only; invalid intent never opens runtime storage. */
export const createStoredVaultExportApi = (
  database: () => Promise<DatabasePort>,
  attachments: () => Promise<{ read(contentId: string): Promise<Uint8Array | undefined> }>,
  context: () => ApplicationOperationContext,
  createdByVersion: string,
  savePort?: VaultExportSavePort,
) => {
  const verifySaveCandidate = async (
    input: Omit<SaveVaultExportInput, "acknowledgeUnencrypted">,
  ): Promise<void> => {
    const archive = await inspectPortableArchiveV1({
      bytes: input.bytes,
      expectedSchemaVersion: input.schemaVersion,
      expectedArchiveSha256: input.sha256,
    });
    if (
      archive.manifest.vault.id !== input.vaultId ||
      archive.manifest.archiveId !== input.archiveId
    )
      throw new Error("Invalid complete archive save candidate.");
  };
  const save = createSaveVaultExportCommand({
    save: async (input) => {
      if (savePort === undefined) throw new Error("Native save unavailable.");
      await verifySaveCandidate(input);
      return savePort.save(input);
    },
  });
  const query = createPrepareVaultExportQuery({
    prepare: async (input) => {
      try {
        const selected = await database();
        const store = await attachments();
        return await preparePortableVaultArchiveV1({
          ...input,
          database: selected,
          createdByVersion,
          readAttachment: (contentId) => store.read(contentId),
        });
      } catch (error) {
        throw new VaultExportPreparationError(
          error instanceof PortableVaultArchiveError && error.code === "source_changed"
            ? "conflict"
            : "unavailable",
        );
      }
    },
  });
  return Object.freeze({
    prepare: (input: PrepareVaultExportInput) => query.execute(input, context()),
    save: (input: SaveVaultExportInput) => save.execute(input, context()),
  });
};
export type StoredVaultExportApi = ReturnType<typeof createStoredVaultExportApi>;
