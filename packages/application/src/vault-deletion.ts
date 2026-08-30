import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";

import {
  defineCommand,
  defineQuery,
  type ApplicationCommand,
  type ApplicationQuery,
} from "./operation.js";
import {
  applicationFailure,
  applicationSuccess,
  type ApplicationError,
  type ApplicationResult,
} from "./result.js";

export const VAULT_DELETION_STORAGE_MODES = ["browser", "desktop"] as const;
export type VaultDeletionStorageMode = (typeof VAULT_DELETION_STORAGE_MODES)[number];

export const VAULT_DELETION_STATUSES = ["deleted", "cleanup_pending"] as const;
export type VaultDeletionStatus = (typeof VAULT_DELETION_STATUSES)[number];

export const VAULT_DELETION_ERROR_CODES = [
  "not_found",
  "busy",
  "permission_denied",
  "stale_preview",
  "confirmation_mismatch",
  "cleanup_failed",
  "recovery_failed",
  "invalid_state",
] as const;
export type VaultDeletionErrorCode = (typeof VAULT_DELETION_ERROR_CODES)[number];

export interface VaultDeletionInventoryDto {
  readonly attachmentFiles: number;
  readonly managedBackups: number;
  readonly providerSecrets: number;
  readonly sharedAttachmentFiles: number;
}

export interface VaultDeletionPreviewDto {
  readonly previewId: EntityId<"application-operation">;
  readonly vaultId: EntityId<"vault">;
  readonly vaultName: string;
  readonly storageMode: VaultDeletionStorageMode;
  readonly inventory: VaultDeletionInventoryDto;
  readonly lastSuccessfulPortableExportAt: Instant | null;
  readonly requiredConfirmation: string;
}

export interface VaultDeletionResultDto {
  readonly deletionId: EntityId<"application-operation">;
  readonly vaultId: EntityId<"vault">;
  readonly status: VaultDeletionStatus;
  readonly deleted: VaultDeletionInventoryDto;
  readonly externalPortableArchivesAffected: false;
}

export interface PreviewVaultDeletionInput {
  readonly vaultId: string;
}

export interface DeleteVaultInput {
  readonly vaultId: string;
  readonly previewId: string;
  readonly confirmation: string;
}

export interface PreviewVaultDeletionPortInput {
  readonly vaultId: EntityId<"vault">;
  readonly previewId: EntityId<"application-operation">;
  readonly previewedAt: Instant;
}

export interface DeleteVaultPortInput {
  readonly vaultId: EntityId<"vault">;
  readonly previewId: EntityId<"application-operation">;
  readonly deletionId: EntityId<"application-operation">;
  readonly confirmation: string;
  readonly deletedAt: Instant;
}

export interface VaultDeletionPortPreview {
  readonly vaultId: EntityId<"vault">;
  readonly vaultName: string;
  readonly storageMode: VaultDeletionStorageMode;
  readonly inventory: VaultDeletionInventoryDto;
  readonly lastSuccessfulPortableExportAt: Instant | null;
}

/**
 * Runtime-owned destructive boundary. Implementations must recheck the current
 * vault identity/name, preview binding, and exact typed phrase before mutation.
 */
export interface VaultDeletionPort {
  preview(input: PreviewVaultDeletionPortInput): Promise<VaultDeletionPortPreview>;
  delete(input: DeleteVaultPortInput): Promise<VaultDeletionResultDto>;
}

/** Content-free typed failure for implementations of VaultDeletionPort. */
export class VaultDeletionError extends Error {
  public readonly code: VaultDeletionErrorCode;

  public constructor(code: VaultDeletionErrorCode) {
    if (!VAULT_DELETION_ERROR_CODES.includes(code)) {
      throw new TypeError("Vault deletion failures require a reviewed stable code.");
    }
    super("The vault deletion port reported a failure.");
    this.name = "VaultDeletionError";
    this.code = code;
  }
}

export interface VaultDeletionOperations {
  readonly previewVaultDeletionQuery: ApplicationQuery<
    PreviewVaultDeletionInput,
    VaultDeletionPreviewDto
  >;
  readonly deleteVaultCommand: ApplicationCommand<DeleteVaultInput, VaultDeletionResultDto>;
}

const MAX_ACTIVE_PREVIEWS = 16;
const STORAGE_MODES = new Set<string>(VAULT_DELETION_STORAGE_MODES);
const DELETION_STATUSES = new Set<string>(VAULT_DELETION_STATUSES);

const VALID_VAULT_ID_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Choose a valid local vault.",
  retryable: false,
});
const VALID_PREVIEW_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Review the current deletion warning before deleting this vault.",
  retryable: false,
});
const VALID_CONFIRMATION_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Type the exact confirmation phrase shown for this vault.",
  retryable: false,
});
const UNKNOWN_DELETION_ERROR: ApplicationError = Object.freeze({
  code: "internal",
  message: "The local vault deletion failed safely.",
  retryable: false,
});

const DELETION_ERRORS: Readonly<Record<VaultDeletionErrorCode, ApplicationError>> = Object.freeze({
  not_found: Object.freeze({
    code: "not_found",
    message: "The local vault could not be found.",
    retryable: false,
  }),
  busy: Object.freeze({
    code: "conflict",
    message: "The vault is busy. Close other work with this vault, then retry.",
    retryable: true,
  }),
  permission_denied: Object.freeze({
    code: "permission_denied",
    message: "Coredrill cannot remove all local vault data.",
    retryable: true,
  }),
  stale_preview: Object.freeze({
    code: "conflict",
    message: "The vault changed after the deletion warning was prepared. Review it again.",
    retryable: true,
  }),
  confirmation_mismatch: VALID_CONFIRMATION_ERROR,
  cleanup_failed: Object.freeze({
    code: "unavailable",
    message:
      "The vault was restored after local cleanup failed. Some provider credentials may need to be entered again.",
    retryable: true,
  }),
  recovery_failed: Object.freeze({
    code: "internal",
    message: "Coredrill could not finish deletion or fully restore the staged vault.",
    retryable: false,
  }),
  invalid_state: Object.freeze({
    code: "internal",
    message: "The local vault is not in a deletable state.",
    retryable: false,
  }),
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
};

const requireVaultName = (value: unknown): string => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > 512 ||
    hasControlCharacter(value)
  ) {
    throw new TypeError("Invalid vault name.");
  }
  return value;
};

const requireCount = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Invalid vault deletion count.");
  }
  return value;
};

const copyInventory = (value: unknown): VaultDeletionInventoryDto => {
  if (!isRecord(value)) throw new TypeError("Invalid vault deletion inventory.");
  return Object.freeze({
    attachmentFiles: requireCount(value["attachmentFiles"]),
    managedBackups: requireCount(value["managedBackups"]),
    providerSecrets: requireCount(value["providerSecrets"]),
    sharedAttachmentFiles: requireCount(value["sharedAttachmentFiles"]),
  });
};

const copyPortPreview = (
  value: unknown,
  expected: PreviewVaultDeletionPortInput,
): VaultDeletionPreviewDto => {
  if (!isRecord(value)) throw new TypeError("Invalid vault deletion preview.");
  const vaultId = entityId("vault", value["vaultId"] as string);
  if (vaultId !== expected.vaultId) {
    throw new TypeError("Vault deletion preview does not match the requested vault.");
  }
  const vaultName = requireVaultName(value["vaultName"]);
  const storageMode = value["storageMode"];
  if (typeof storageMode !== "string" || !STORAGE_MODES.has(storageMode)) {
    throw new TypeError("Invalid vault deletion storage mode.");
  }
  const lastSuccessfulPortableExportAt =
    value["lastSuccessfulPortableExportAt"] === null
      ? null
      : instant(value["lastSuccessfulPortableExportAt"] as string);
  return Object.freeze({
    previewId: expected.previewId,
    vaultId,
    vaultName,
    storageMode: storageMode as VaultDeletionStorageMode,
    inventory: copyInventory(value["inventory"]),
    lastSuccessfulPortableExportAt,
    requiredConfirmation: `DELETE ${vaultName}`,
  });
};

const copyDeletionResult = (
  value: unknown,
  expected: DeleteVaultPortInput,
): VaultDeletionResultDto => {
  if (!isRecord(value)) throw new TypeError("Invalid vault deletion result.");
  const deletionId = entityId("application-operation", value["deletionId"] as string);
  const vaultId = entityId("vault", value["vaultId"] as string);
  const status = value["status"];
  if (
    deletionId !== expected.deletionId ||
    vaultId !== expected.vaultId ||
    typeof status !== "string" ||
    !DELETION_STATUSES.has(status) ||
    value["externalPortableArchivesAffected"] !== false
  ) {
    throw new TypeError("Vault deletion result does not match the requested operation.");
  }
  return Object.freeze({
    deletionId,
    vaultId,
    status: status as VaultDeletionStatus,
    deleted: copyInventory(value["deleted"]),
    externalPortableArchivesAffected: false,
  });
};

const failureFrom = <Value>(error: unknown): ApplicationResult<Value> =>
  applicationFailure(
    error instanceof VaultDeletionError ? DELETION_ERRORS[error.code] : UNKNOWN_DELETION_ERROR,
  );

export const createVaultDeletionOperations = (port: VaultDeletionPort): VaultDeletionOperations => {
  const untrustedPort = port as unknown;
  if (
    !isRecord(untrustedPort) ||
    typeof untrustedPort["preview"] !== "function" ||
    typeof untrustedPort["delete"] !== "function"
  ) {
    throw new TypeError("Vault deletion operations require a complete local deletion port.");
  }

  const activePreviews = new Map<
    EntityId<"application-operation">,
    Readonly<{ vaultId: EntityId<"vault">; requiredConfirmation: string }>
  >();

  const previewVaultDeletionQuery = defineQuery<PreviewVaultDeletionInput, VaultDeletionPreviewDto>(
    "PreviewVaultDeletionQuery",
    async (input, context) => {
      let vaultId: EntityId<"vault">;
      try {
        const untrustedInput = input as unknown;
        vaultId = entityId(
          "vault",
          isRecord(untrustedInput) ? (untrustedInput["vaultId"] as string) : "",
        );
      } catch {
        return applicationFailure(VALID_VAULT_ID_ERROR);
      }

      try {
        const previewId = entityId("application-operation", context.operationId);
        const portInput = Object.freeze({
          vaultId,
          previewId,
          previewedAt: instant(context.initiatedAt),
        });
        const preview = copyPortPreview(await port.preview(portInput), portInput);
        activePreviews.set(
          previewId,
          Object.freeze({ vaultId, requiredConfirmation: preview.requiredConfirmation }),
        );
        while (activePreviews.size > MAX_ACTIVE_PREVIEWS) {
          const oldest = activePreviews.keys().next().value;
          if (oldest === undefined) break;
          activePreviews.delete(oldest);
        }
        return applicationSuccess(preview);
      } catch (error) {
        return failureFrom<VaultDeletionPreviewDto>(error);
      }
    },
  );

  const deleteVaultCommand = defineCommand<DeleteVaultInput, VaultDeletionResultDto>(
    "DeleteVaultCommand",
    async (input, context) => {
      let vaultId: EntityId<"vault">;
      let previewId: EntityId<"application-operation">;
      let confirmation: string;
      try {
        const untrustedInput = input as unknown;
        if (!isRecord(untrustedInput)) throw new TypeError("Invalid deletion input.");
        vaultId = entityId("vault", untrustedInput["vaultId"] as string);
        previewId = entityId("application-operation", untrustedInput["previewId"] as string);
        confirmation = untrustedInput["confirmation"] as string;
        if (
          typeof confirmation !== "string" ||
          confirmation.length > 520 ||
          hasControlCharacter(confirmation)
        ) {
          throw new TypeError("Invalid confirmation.");
        }
      } catch {
        return applicationFailure(VALID_PREVIEW_ERROR);
      }

      const preview = activePreviews.get(previewId);
      if (preview?.vaultId !== vaultId) {
        return applicationFailure(VALID_PREVIEW_ERROR);
      }
      if (confirmation !== preview.requiredConfirmation) {
        return applicationFailure(VALID_CONFIRMATION_ERROR);
      }

      const portInput = Object.freeze({
        vaultId,
        previewId,
        deletionId: entityId("application-operation", context.operationId),
        confirmation,
        deletedAt: instant(context.initiatedAt),
      });
      try {
        const result = copyDeletionResult(await port.delete(portInput), portInput);
        activePreviews.delete(previewId);
        return applicationSuccess(result);
      } catch (error) {
        if (
          error instanceof VaultDeletionError &&
          (error.code === "stale_preview" || error.code === "confirmation_mismatch")
        ) {
          activePreviews.delete(previewId);
        }
        return failureFrom<VaultDeletionResultDto>(error);
      }
    },
  );

  return Object.freeze({ previewVaultDeletionQuery, deleteVaultCommand });
};
