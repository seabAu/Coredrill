import {
  applicationFailure,
  applicationSuccess,
  createVaultRestoreOperations,
  parseVaultRestorePreviewDto,
  VaultRestoreError,
  VAULT_RESTORE_MAX_ARCHIVE_BYTES,
  type ApplicationOperationContext,
  type CommitVaultRestoreInput,
  type DiscardVaultRestoreInput,
  type PreviewVaultRestoreInput,
  type VaultRestorePreviewDto,
} from "@coredrill/application";
import {
  commitPortableArchiveRestoreV1,
  createPortableArchiveRestorePreviewV1,
  discardPortableArchiveRestorePreviewV1,
  inspectPortableArchiveV1,
  PortableArchiveRestoreError,
  type PortableArchiveRestorePortV1,
  type PortableArchiveRestorePreviewV1,
} from "@coredrill/storage-core";

/** One private coordinator capability; no bytes, adapter or deterministic core identity in UI state. */
export const createStoredVaultRestoreApi = (options: {
  readonly expectedSchemaVersion: () => Promise<number>;
  readonly compatibleSourceSchemaVersions?: readonly number[];
  readonly port: (candidateVaultId: string) => Promise<PortableArchiveRestorePortV1>;
  readonly context: () => ApplicationOperationContext;
  readonly selectNative?: () => Promise<
    | { readonly status: "cancelled" }
    | {
        readonly status: "selected";
        readonly bytes: Uint8Array;
        readonly byteLength: number;
        readonly sha256: string;
      }
  >;
}) => {
  const compatibleSourceSchemaVersions =
    options.compatibleSourceSchemaVersions === undefined
      ? undefined
      : Object.freeze([...options.compatibleSourceSchemaVersions]);
  let active: {
    readonly core: PortableArchiveRestorePreviewV1;
    readonly dto: VaultRestorePreviewDto;
  } | null = null;
  let busy = false;
  const failure = (error: unknown): VaultRestoreError => {
    if (error instanceof VaultRestoreError) return error;
    if (error instanceof PortableArchiveRestoreError) {
      if (error.code === "stale_target" || error.code === "invalid_input")
        return new VaultRestoreError("conflict");
      if (error.code === "version_unsupported" || error.code === "schema_mismatch")
        return new VaultRestoreError("unsupported");
      if (error.code !== "commit_failed") return new VaultRestoreError("invalid_archive");
    }
    return new VaultRestoreError("unavailable");
  };
  const operations = createVaultRestoreOperations({
    preview: async (input) => {
      if (busy || active !== null) throw new VaultRestoreError("conflict");
      busy = true;
      let core: PortableArchiveRestorePreviewV1 | undefined;
      try {
        const expectedSchemaVersion = await options.expectedSchemaVersion();
        const inspected = await inspectPortableArchiveV1({
          bytes: input.bytes,
          expectedSchemaVersion,
          ...(compatibleSourceSchemaVersions === undefined
            ? {}
            : { compatibleSourceSchemaVersions }),
        });
        const base = await options.port(inspected.manifest.vault.id);
        const guarded: PortableArchiveRestorePortV1 = {
          inspectDatabase: (database) => base.inspectDatabase(database),
          commit: (payload) => base.commit(payload),
          inspectTarget: async () => {
            const target = await base.inspectTarget();
            if (
              input.viewedVaultId === null
                ? target.state !== "empty"
                : target.state !== "present" || target.vaultId !== input.viewedVaultId
            )
              throw new VaultRestoreError("conflict");
            return target;
          },
        };
        core = await createPortableArchiveRestorePreviewV1({
          archiveBytes: input.bytes,
          // Keep the verified source identity through preview/commit; reopen applies migrations.
          expectedSchemaVersion: inspected.manifest.vault.schemaVersion,
          expectedArchiveSha256: inspected.archiveSha256,
          port: guarded,
        });
        const dto = parseVaultRestorePreviewDto({
          version: 1,
          previewId: input.previewId,
          viewedVaultId: input.viewedVaultId,
          archive: { ...core.archive, databaseSha256: inspected.database.sha256 },
          target: {
            ...core.target,
            vaultId: core.target.vaultId ?? null,
            schemaVersion: core.target.schemaVersion ?? null,
          },
          conflict: core.conflict,
          requiredConfirmation: core.requiredConfirmation,
          changes: core.changes,
        });
        active = { core, dto };
        return dto;
      } catch (error) {
        if (core !== undefined) discardPortableArchiveRestorePreviewV1(core);
        throw failure(error);
      } finally {
        busy = false;
      }
    },
    commit: async (input) => {
      const retained = active;
      if (
        busy ||
        retained === null ||
        JSON.stringify(retained.dto) !== JSON.stringify(input.preview)
      )
        throw new VaultRestoreError("conflict");
      busy = true;
      try {
        const result = await commitPortableArchiveRestoreV1({
          preview: retained.core,
          confirmation: input.confirmation,
        });
        return Object.freeze({ version: 1, previewId: retained.dto.previewId, ...result });
      } catch (error) {
        throw failure(error);
      } finally {
        // An ambiguous acknowledgement never authorizes repeating a potentially successful write.
        discardPortableArchiveRestorePreviewV1(retained.core);
        active = null;
        busy = false;
      }
    },
    discard: (input) => {
      if (busy) return Promise.reject(new VaultRestoreError("conflict"));
      if (active === null) return Promise.resolve();
      if (
        active.dto.previewId !== input.previewId ||
        active.dto.viewedVaultId !== input.viewedVaultId
      )
        return Promise.reject(new VaultRestoreError("conflict"));
      if (!discardPortableArchiveRestorePreviewV1(active.core))
        return Promise.reject(new VaultRestoreError("conflict"));
      active = null;
      return Promise.resolve();
    },
  });
  return Object.freeze({
    preview: (input: PreviewVaultRestoreInput) =>
      operations.preview.execute(input, options.context()),
    commit: (input: CommitVaultRestoreInput) => operations.commit.execute(input, options.context()),
    discard: (input: DiscardVaultRestoreInput) =>
      operations.discard.execute(input, options.context()),
    selectNative: async () => {
      if (busy || active !== null || options.selectNative === undefined)
        return applicationFailure({
          code: "conflict",
          retryable: false,
          message: "Archive selection is unavailable or another vault operation is pending.",
        });
      busy = true;
      try {
        const selected = await options.selectNative();
        if (selected.status === "cancelled")
          return applicationSuccess(Object.freeze({ status: "cancelled" as const }));
        if (
          !(selected.bytes instanceof Uint8Array) ||
          selected.bytes.byteLength !== selected.byteLength ||
          selected.byteLength < 22 ||
          selected.byteLength > VAULT_RESTORE_MAX_ARCHIVE_BYTES
        )
          throw new VaultRestoreError("unavailable");
        return applicationSuccess(
          Object.freeze({ status: "selected" as const, bytes: selected.bytes.slice() }),
        );
      } catch {
        return applicationFailure({
          code: "unavailable",
          retryable: false,
          message: "The selected archive could not be read. No restore was submitted.",
        });
      } finally {
        busy = false;
      }
    },
  });
};
export type StoredVaultRestoreApi = ReturnType<typeof createStoredVaultRestoreApi>;
