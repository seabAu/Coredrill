export const NATIVE_VAULT_PROTOCOL_VERSION = 1 as const;

export interface NativeVaultTransport {
  invokeVault(request: NativeVaultRequest): Promise<unknown>;
}

export interface NativeVaultRequest {
  readonly protocolVersion: typeof NATIVE_VAULT_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly operation: NativeVaultOperation;
}

export type NativeVaultOperation =
  | {
      readonly type: "preview_deletion";
      readonly sessionId: string;
      readonly vaultId: string;
      readonly previewId: string;
    }
  | {
      readonly type: "delete";
      readonly sessionId: string;
      readonly vaultId: string;
      readonly previewId: string;
      readonly deletionId: string;
      readonly confirmation: string;
    };

export interface NativeVaultDeletionInventory {
  readonly attachmentFiles: number;
  readonly managedBackups: number;
  readonly providerSecrets: number;
  readonly sharedAttachmentFiles: number;
}

export interface NativeVaultDeletionPreview {
  readonly type: "deletion_preview";
  readonly previewId: string;
  readonly vaultId: string;
  readonly vaultName: string;
  readonly storageMode: "desktop";
  readonly inventory: NativeVaultDeletionInventory;
  readonly lastSuccessfulPortableExportAt: string | null;
  readonly requiredConfirmation: string;
}

export interface NativeVaultDeleted {
  readonly type: "deleted";
  readonly deletionId: string;
  readonly vaultId: string;
  readonly status: "deleted" | "cleanup_pending";
  readonly deleted: NativeVaultDeletionInventory;
  readonly externalPortableArchivesAffected: false;
}

export type NativeVaultResponseData = NativeVaultDeletionPreview | NativeVaultDeleted;

export interface NativeVaultResponse {
  readonly protocolVersion: typeof NATIVE_VAULT_PROTOCOL_VERSION;
  readonly requestId: string;
  readonly data: NativeVaultResponseData;
}

export class NativeVaultProtocolError extends Error {
  public readonly code: string;
  public readonly retryable: boolean;

  public constructor(code: string, message: string, retryable: boolean, options?: ErrorOptions) {
    super(message, options);
    this.name = "NativeVaultProtocolError";
    this.code = code;
    this.retryable = retryable;
  }
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const invalidResponse = (cause?: unknown): NativeVaultProtocolError =>
  new NativeVaultProtocolError(
    "invalid_response",
    "The native vault boundary returned an invalid response.",
    false,
    cause === undefined ? undefined : { cause },
  );

const requireString = (record: Readonly<Record<string, unknown>>, key: string): string => {
  const value = record[key];
  if (typeof value !== "string" || value.length === 0) throw invalidResponse();
  return value;
};

const requireCount = (record: Readonly<Record<string, unknown>>, key: string): number => {
  const value = record[key];
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw invalidResponse();
  }
  return value;
};

const parseInventory = (value: unknown): NativeVaultDeletionInventory => {
  if (!isRecord(value)) throw invalidResponse();
  return Object.freeze({
    attachmentFiles: requireCount(value, "attachmentFiles"),
    managedBackups: requireCount(value, "managedBackups"),
    providerSecrets: requireCount(value, "providerSecrets"),
    sharedAttachmentFiles: requireCount(value, "sharedAttachmentFiles"),
  });
};

const parseData = (value: unknown): NativeVaultResponseData => {
  if (!isRecord(value)) throw invalidResponse();
  switch (value["type"]) {
    case "deletion_preview": {
      const storageMode = value["storageMode"];
      const lastExport = value["lastSuccessfulPortableExportAt"];
      if (storageMode !== "desktop" || (lastExport !== null && typeof lastExport !== "string")) {
        throw invalidResponse();
      }
      return Object.freeze({
        type: "deletion_preview",
        previewId: requireString(value, "previewId"),
        vaultId: requireString(value, "vaultId"),
        vaultName: requireString(value, "vaultName"),
        storageMode,
        inventory: parseInventory(value["inventory"]),
        lastSuccessfulPortableExportAt: lastExport,
        requiredConfirmation: requireString(value, "requiredConfirmation"),
      });
    }
    case "deleted": {
      const status = value["status"];
      if (
        (status !== "deleted" && status !== "cleanup_pending") ||
        value["externalPortableArchivesAffected"] !== false
      ) {
        throw invalidResponse();
      }
      return Object.freeze({
        type: "deleted",
        deletionId: requireString(value, "deletionId"),
        vaultId: requireString(value, "vaultId"),
        status,
        deleted: parseInventory(value["deleted"]),
        externalPortableArchivesAffected: false,
      });
    }
    default:
      throw invalidResponse();
  }
};

export const parseNativeVaultResponse = (
  value: unknown,
  requestId: string,
): NativeVaultResponse => {
  if (
    !isRecord(value) ||
    value["protocolVersion"] !== NATIVE_VAULT_PROTOCOL_VERSION ||
    value["requestId"] !== requestId
  ) {
    throw invalidResponse();
  }
  return Object.freeze({
    protocolVersion: NATIVE_VAULT_PROTOCOL_VERSION,
    requestId,
    data: parseData(value["data"]),
  });
};

export const deserializeNativeVaultError = (value: unknown): NativeVaultProtocolError => {
  if (!isRecord(value)) return invalidResponse(value);
  const code = value["code"];
  const message = value["message"];
  const retryable = value["retryable"];
  if (typeof code !== "string" || typeof message !== "string" || typeof retryable !== "boolean") {
    return invalidResponse(value);
  }
  return new NativeVaultProtocolError(code, message, retryable);
};
