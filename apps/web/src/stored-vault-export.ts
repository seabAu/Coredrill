import {
  createPrepareVaultExportQuery,
  VaultExportPreparationError,
  type ApplicationOperationContext,
  type PrepareVaultExportInput,
} from "@coredrill/application";
import {
  preparePortableVaultArchiveV1,
  PortableVaultArchiveError,
  type DatabasePort,
} from "@coredrill/storage-core";

/** No save/picker or restore capability. Invalid intent never opens runtime storage. */
export const createStoredVaultExportApi = (
  database: () => Promise<DatabasePort>,
  attachments: () => Promise<{ read(contentId: string): Promise<Uint8Array | undefined> }>,
  context: () => ApplicationOperationContext,
  createdByVersion: string,
) => {
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
  });
};
export type StoredVaultExportApi = ReturnType<typeof createStoredVaultExportApi>;
