import { describe, expect, expectTypeOf, it, vi } from "vitest";

import { entityId, instant } from "@coredrill/domain";

import {
  VaultDeletionError,
  createVaultDeletionOperations,
  type ApplicationOperationContext,
  type ApplicationResult,
  type VaultDeletionPort,
  type VaultDeletionPreviewDto,
  type VaultDeletionResultDto,
} from "../src/index.js";

const VAULT_ID = entityId("vault", "0198f100-0000-7000-8000-000000000001");
const PREVIEW_ID = entityId("application-operation", "0198f100-0000-7000-8000-000000000002");
const DELETE_ID = entityId("application-operation", "0198f100-0000-7000-8000-000000000003");
const PREVIEWED_AT = instant("2026-08-29T18:00:00.000Z");
const DELETED_AT = instant("2026-08-29T18:01:00.000Z");
const EXPORTED_AT = instant("2026-08-29T17:00:00.000Z");
const previewContext: ApplicationOperationContext = {
  operationId: PREVIEW_ID,
  initiatedAt: PREVIEWED_AT,
};
const deleteContext: ApplicationOperationContext = {
  operationId: DELETE_ID,
  initiatedAt: DELETED_AT,
};

const previewValue = () => ({
  vaultId: VAULT_ID,
  vaultName: "Career search",
  storageMode: "desktop" as const,
  inventory: {
    attachmentFiles: 4,
    managedBackups: 3,
    providerSecrets: 2,
    sharedAttachmentFiles: 1,
  },
  lastSuccessfulPortableExportAt: EXPORTED_AT,
});

const deletionValue = (): VaultDeletionResultDto => ({
  deletionId: DELETE_ID,
  vaultId: VAULT_ID,
  status: "deleted",
  deleted: {
    attachmentFiles: 3,
    managedBackups: 3,
    providerSecrets: 2,
    sharedAttachmentFiles: 1,
  },
  externalPortableArchivesAffected: false,
});

const deletionPort = (): VaultDeletionPort => ({
  preview: vi.fn(async () => previewValue()),
  delete: vi.fn(async () => deletionValue()),
});

describe("vault deletion application operations", () => {
  it("previews one path-free target and deletes only after the exact target-bound phrase", async () => {
    const port = deletionPort();
    const operations = createVaultDeletionOperations(port);

    expect(operations.previewVaultDeletionQuery).toMatchObject({
      kind: "query",
      name: "PreviewVaultDeletionQuery",
      readOnly: true,
    });
    const preview = await operations.previewVaultDeletionQuery.execute(
      { vaultId: VAULT_ID },
      previewContext,
    );
    expect(preview).toEqual({
      ok: true,
      value: {
        ...previewValue(),
        previewId: PREVIEW_ID,
        requiredConfirmation: "DELETE Career search",
      },
    });
    expect(port.preview).toHaveBeenCalledWith({
      vaultId: VAULT_ID,
      previewId: PREVIEW_ID,
      previewedAt: PREVIEWED_AT,
    });

    expect(operations.deleteVaultCommand).toMatchObject({
      kind: "command",
      name: "DeleteVaultCommand",
      transactional: true,
    });
    const deleted = await operations.deleteVaultCommand.execute(
      {
        vaultId: VAULT_ID,
        previewId: PREVIEW_ID,
        confirmation: "DELETE Career search",
      },
      deleteContext,
    );
    expect(deleted).toEqual({ ok: true, value: deletionValue() });
    expect(port.delete).toHaveBeenCalledWith({
      vaultId: VAULT_ID,
      previewId: PREVIEW_ID,
      deletionId: DELETE_ID,
      confirmation: "DELETE Career search",
      deletedAt: DELETED_AT,
    });
    if (preview.ok && deleted.ok) {
      expect(Object.isFrozen(preview.value)).toBe(true);
      expect(Object.isFrozen(preview.value.inventory)).toBe(true);
      expect(Object.isFrozen(deleted.value)).toBe(true);
      expect(Object.isFrozen(deleted.value.deleted)).toBe(true);
      expect(preview.value).not.toHaveProperty("databasePath");
      expect(preview.value).not.toHaveProperty("providerIds");
      expect(deleted.value.externalPortableArchivesAffected).toBe(false);
    }
    expectTypeOf(operations.previewVaultDeletionQuery.execute).returns.toEqualTypeOf<
      Promise<ApplicationResult<VaultDeletionPreviewDto>>
    >();
  });

  it.each([
    ["wrong case", "delete Career search"],
    ["name only", "Career search"],
    ["trailing whitespace", "DELETE Career search "],
    ["leading whitespace", " DELETE Career search"],
    ["different vault", "DELETE Other vault"],
  ])("rejects %s confirmation before the destructive port", async (_label, confirmation) => {
    const port = deletionPort();
    const operations = createVaultDeletionOperations(port);
    await operations.previewVaultDeletionQuery.execute({ vaultId: VAULT_ID }, previewContext);

    await expect(
      operations.deleteVaultCommand.execute(
        { vaultId: VAULT_ID, previewId: PREVIEW_ID, confirmation },
        deleteContext,
      ),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "validation",
        message: "Type the exact confirmation phrase shown for this vault.",
        retryable: false,
      },
    });
    expect(port.delete).not.toHaveBeenCalled();
  });

  it("rejects missing, mismatched, malformed, and replayed previews", async () => {
    const port = deletionPort();
    const operations = createVaultDeletionOperations(port);

    await expect(
      operations.deleteVaultCommand.execute(
        {
          vaultId: VAULT_ID,
          previewId: PREVIEW_ID,
          confirmation: "DELETE Career search",
        },
        deleteContext,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: "validation" } });

    await operations.previewVaultDeletionQuery.execute({ vaultId: VAULT_ID }, previewContext);
    await expect(
      operations.deleteVaultCommand.execute(
        {
          vaultId: "not-a-vault",
          previewId: PREVIEW_ID,
          confirmation: "DELETE Career search",
        },
        deleteContext,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: "validation" } });

    await expect(
      operations.deleteVaultCommand.execute(
        {
          vaultId: VAULT_ID,
          previewId: "not-a-preview",
          confirmation: "DELETE Career search",
        },
        deleteContext,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: "validation" } });

    await expect(
      operations.deleteVaultCommand.execute(
        {
          vaultId: VAULT_ID,
          previewId: PREVIEW_ID,
          confirmation: "DELETE Career search",
        },
        deleteContext,
      ),
    ).resolves.toMatchObject({ ok: true });
    await expect(
      operations.deleteVaultCommand.execute(
        {
          vaultId: VAULT_ID,
          previewId: PREVIEW_ID,
          confirmation: "DELETE Career search",
        },
        deleteContext,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: "validation" } });
  });

  it.each([
    ["stale_preview", "conflict", true],
    ["confirmation_mismatch", "validation", false],
    ["busy", "conflict", true],
    ["permission_denied", "permission_denied", true],
    ["cleanup_failed", "unavailable", true],
    ["recovery_failed", "internal", false],
    ["invalid_state", "internal", false],
  ] as const)(
    "maps %s to stable content-free application failure",
    async (code, mapped, retryable) => {
      const port = deletionPort();
      vi.mocked(port.delete).mockRejectedValueOnce(new VaultDeletionError(code));
      const operations = createVaultDeletionOperations(port);
      await operations.previewVaultDeletionQuery.execute({ vaultId: VAULT_ID }, previewContext);

      const result = await operations.deleteVaultCommand.execute(
        {
          vaultId: VAULT_ID,
          previewId: PREVIEW_ID,
          confirmation: "DELETE Career search",
        },
        deleteContext,
      );
      expect(result).toMatchObject({ ok: false, error: { code: mapped, retryable } });
      expect(JSON.stringify(result)).not.toContain("provider-secret-id");
      expect(JSON.stringify(result)).not.toContain("openai");
      expect(JSON.stringify(result)).not.toContain("\\");
    },
  );

  it("fails closed on malformed adapter previews, results, and unknown exceptions", async () => {
    const port = deletionPort();
    vi.mocked(port.preview).mockResolvedValueOnce({
      ...previewValue(),
      inventory: { ...previewValue().inventory, attachmentFiles: -1 },
    });
    const operations = createVaultDeletionOperations(port);
    await expect(
      operations.previewVaultDeletionQuery.execute({ vaultId: VAULT_ID }, previewContext),
    ).resolves.toEqual({
      ok: false,
      error: {
        code: "internal",
        message: "The local vault deletion failed safely.",
        retryable: false,
      },
    });

    const malformedResultPort = deletionPort();
    vi.mocked(malformedResultPort.delete).mockResolvedValueOnce({
      ...deletionValue(),
      externalPortableArchivesAffected: true,
    } as unknown as VaultDeletionResultDto);
    const malformedOperations = createVaultDeletionOperations(malformedResultPort);
    await malformedOperations.previewVaultDeletionQuery.execute(
      { vaultId: VAULT_ID },
      previewContext,
    );
    await expect(
      malformedOperations.deleteVaultCommand.execute(
        {
          vaultId: VAULT_ID,
          previewId: PREVIEW_ID,
          confirmation: "DELETE Career search",
        },
        deleteContext,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: "internal" } });

    const throwingPort = deletionPort();
    vi.mocked(throwingPort.preview).mockRejectedValueOnce(
      new Error("C:\\private\\vault.sqlite3 provider-secret"),
    );
    const throwingOperations = createVaultDeletionOperations(throwingPort);
    const result = await throwingOperations.previewVaultDeletionQuery.execute(
      { vaultId: VAULT_ID },
      previewContext,
    );
    expect(JSON.stringify(result)).not.toContain("private");
    expect(JSON.stringify(result)).not.toContain("secret");
  });

  it("rejects incomplete dependencies immediately", () => {
    expect(() => createVaultDeletionOperations({} as VaultDeletionPort)).toThrow(TypeError);
    expect(() => new VaultDeletionError("unknown" as "not_found")).toThrow(TypeError);
  });
});
