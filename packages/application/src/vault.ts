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

export const VAULT_STORAGE_HEALTH_VALUES = ["ready", "degraded", "unavailable"] as const;
export type VaultStorageHealth = (typeof VAULT_STORAGE_HEALTH_VALUES)[number];

export const VAULT_STORAGE_PERSISTENCE_VALUES = ["durable", "best-effort", "memory"] as const;
export type VaultStoragePersistence = (typeof VAULT_STORAGE_PERSISTENCE_VALUES)[number];

export const VAULT_DIAGNOSTIC_ISSUE_CODES = [
  "expected-vault-missing",
  "foreign-keys-disabled",
  "integrity-check-failed",
  "persistence-denied",
  "persistence-error",
  "persistence-memory-only",
  "persistence-unsupported",
  "quota-low",
  "quota-unknown",
  "read-only",
  "recovery-unavailable",
  "schema-mismatch",
  "storage-unavailable",
] as const;
export type VaultDiagnosticIssueCode = (typeof VAULT_DIAGNOSTIC_ISSUE_CODES)[number];

export interface VaultDiagnosticsDto {
  readonly health: VaultStorageHealth;
  readonly persistence: VaultStoragePersistence;
  readonly readOnly: boolean;
  readonly schemaVersion: number;
  readonly issueCodes: readonly VaultDiagnosticIssueCode[];
}

export interface VaultDto {
  readonly id: EntityId<"vault">;
  readonly name: string;
  readonly schemaVersion: number;
  readonly createdAt: Instant;
  readonly lastOpenedAt: Instant;
}

export interface VaultSessionDto {
  readonly vault: VaultDto;
  readonly diagnostics: VaultDiagnosticsDto;
}

export interface CreateVaultPortInput {
  readonly vaultId: EntityId<"vault">;
  readonly name: string;
  readonly createdAt: Instant;
}

export interface OpenVaultPortInput {
  readonly vaultId: EntityId<"vault">;
  readonly openedAt: Instant;
}

/** Runtime-owned lifecycle boundary. It may use browser or native SQLite, never a hosted service. */
export interface VaultLifecyclePort {
  create(input: CreateVaultPortInput): Promise<VaultSessionDto>;
  open(input: OpenVaultPortInput): Promise<VaultSessionDto>;
  diagnostics(): Promise<VaultDiagnosticsDto>;
}

export const VAULT_LIFECYCLE_ERROR_CODES = [
  "already_exists",
  "not_found",
  "busy",
  "unavailable",
  "permission_denied",
  "read_only",
  "invalid_state",
] as const;
export type VaultLifecycleErrorCode = (typeof VAULT_LIFECYCLE_ERROR_CODES)[number];

/** Content-free typed failure for implementations of VaultLifecyclePort. */
export class VaultLifecycleError extends Error {
  public readonly code: VaultLifecycleErrorCode;

  public constructor(code: VaultLifecycleErrorCode) {
    if (!VAULT_LIFECYCLE_ERROR_CODES.includes(code)) {
      throw new TypeError("Vault lifecycle failures require a reviewed stable code.");
    }
    super("The vault lifecycle port reported a failure.");
    this.name = "VaultLifecycleError";
    this.code = code;
  }
}

export interface CreateVaultInput {
  readonly name: string;
}

export interface OpenVaultInput {
  readonly vaultId: string;
}

export interface VaultOperationDependencies {
  readonly lifecycle: VaultLifecyclePort;
  readonly createVaultId: () => EntityId<"vault">;
}

export interface VaultOperations {
  readonly createVaultCommand: ApplicationCommand<CreateVaultInput, VaultSessionDto>;
  readonly openVaultCommand: ApplicationCommand<OpenVaultInput, VaultSessionDto>;
  readonly getVaultDiagnosticsQuery: ApplicationQuery<undefined, VaultDiagnosticsDto>;
}

const STORAGE_HEALTH = new Set<string>(VAULT_STORAGE_HEALTH_VALUES);
const STORAGE_PERSISTENCE = new Set<string>(VAULT_STORAGE_PERSISTENCE_VALUES);
const DIAGNOSTIC_ISSUES = new Set<string>(VAULT_DIAGNOSTIC_ISSUE_CODES);

const VALID_VAULT_NAME_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Enter a vault name between 1 and 512 characters without control characters.",
  retryable: false,
});
const VALID_VAULT_ID_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Choose a valid local vault.",
  retryable: false,
});
const UNKNOWN_LIFECYCLE_ERROR: ApplicationError = Object.freeze({
  code: "internal",
  message: "The local vault operation failed safely.",
  retryable: false,
});

const LIFECYCLE_ERRORS: Readonly<Record<VaultLifecycleErrorCode, ApplicationError>> = Object.freeze(
  {
    already_exists: Object.freeze({
      code: "conflict",
      message: "A local vault with this identity already exists.",
      retryable: false,
    }),
    not_found: Object.freeze({
      code: "not_found",
      message: "The local vault could not be found.",
      retryable: false,
    }),
    busy: Object.freeze({
      code: "conflict",
      message: "The vault is open elsewhere. Close it there, then retry.",
      retryable: true,
    }),
    unavailable: Object.freeze({
      code: "unavailable",
      message: "Local vault storage is unavailable.",
      retryable: true,
    }),
    permission_denied: Object.freeze({
      code: "permission_denied",
      message: "Coredrill cannot access local vault storage.",
      retryable: true,
    }),
    read_only: Object.freeze({
      code: "permission_denied",
      message: "The local vault is read-only.",
      retryable: false,
    }),
    invalid_state: Object.freeze({
      code: "internal",
      message: "The local vault is not in a usable state.",
      retryable: false,
    }),
  },
);

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

const requireSchemaVersion = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("Invalid vault schema version.");
  }
  return value;
};

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isUnknownArray = (value: unknown): value is readonly unknown[] => Array.isArray(value);

const copyDiagnostics = (value: unknown): VaultDiagnosticsDto => {
  if (!isRecord(value)) throw new TypeError("Invalid vault diagnostics.");
  if (typeof value["health"] !== "string" || !STORAGE_HEALTH.has(value["health"])) {
    throw new TypeError("Invalid vault storage health.");
  }
  if (typeof value["persistence"] !== "string" || !STORAGE_PERSISTENCE.has(value["persistence"])) {
    throw new TypeError("Invalid vault storage persistence.");
  }
  if (typeof value["readOnly"] !== "boolean") {
    throw new TypeError("Invalid vault read-only state.");
  }
  const issueCodes = value["issueCodes"];
  if (
    !isUnknownArray(issueCodes) ||
    issueCodes.length > VAULT_DIAGNOSTIC_ISSUE_CODES.length ||
    issueCodes.some((issue) => typeof issue !== "string" || !DIAGNOSTIC_ISSUES.has(issue)) ||
    new Set(issueCodes).size !== issueCodes.length
  ) {
    throw new TypeError("Invalid vault diagnostic issues.");
  }
  return Object.freeze({
    health: value["health"] as VaultStorageHealth,
    persistence: value["persistence"] as VaultStoragePersistence,
    readOnly: value["readOnly"],
    schemaVersion: requireSchemaVersion(value["schemaVersion"]),
    issueCodes: Object.freeze(issueCodes.map((issue) => issue as VaultDiagnosticIssueCode)),
  });
};

const copyVault = (value: unknown): VaultDto => {
  if (!isRecord(value)) throw new TypeError("Invalid vault result.");
  return Object.freeze({
    id: entityId("vault", value["id"] as string),
    name: requireVaultName(value["name"]),
    schemaVersion: requireSchemaVersion(value["schemaVersion"]),
    createdAt: instant(value["createdAt"] as string),
    lastOpenedAt: instant(value["lastOpenedAt"] as string),
  });
};

interface ExpectedVaultResult {
  readonly id: EntityId<"vault">;
  readonly name?: string;
  readonly createdAt?: Instant;
  readonly lastOpenedAt: Instant;
}

const copySession = (value: unknown, expected: ExpectedVaultResult): VaultSessionDto => {
  if (!isRecord(value)) throw new TypeError("Invalid vault session.");
  const vault = copyVault(value["vault"]);
  const diagnostics = copyDiagnostics(value["diagnostics"]);
  if (
    vault.id !== expected.id ||
    (expected.name !== undefined && vault.name !== expected.name) ||
    (expected.createdAt !== undefined && vault.createdAt !== expected.createdAt) ||
    vault.lastOpenedAt !== expected.lastOpenedAt ||
    vault.schemaVersion !== diagnostics.schemaVersion
  ) {
    throw new TypeError("Vault lifecycle result does not match the requested operation.");
  }
  return Object.freeze({ vault, diagnostics });
};

const failureFrom = <Value>(error: unknown): ApplicationResult<Value> =>
  applicationFailure(
    error instanceof VaultLifecycleError ? LIFECYCLE_ERRORS[error.code] : UNKNOWN_LIFECYCLE_ERROR,
  );

export const createVaultOperations = (
  dependencies: VaultOperationDependencies,
): VaultOperations => {
  const untrustedDependencies = dependencies as unknown;
  if (
    !isRecord(untrustedDependencies) ||
    !isRecord(untrustedDependencies["lifecycle"]) ||
    typeof untrustedDependencies["lifecycle"]["create"] !== "function" ||
    typeof untrustedDependencies["lifecycle"]["open"] !== "function" ||
    typeof untrustedDependencies["lifecycle"]["diagnostics"] !== "function" ||
    typeof untrustedDependencies["createVaultId"] !== "function"
  ) {
    throw new TypeError("Vault operations require a complete local lifecycle port.");
  }

  const createVaultCommand = defineCommand<CreateVaultInput, VaultSessionDto>(
    "CreateVaultCommand",
    async (input, context) => {
      let name: string;
      try {
        const untrustedInput = input as unknown;
        name = requireVaultName(isRecord(untrustedInput) ? untrustedInput["name"] : undefined);
      } catch {
        return applicationFailure(VALID_VAULT_NAME_ERROR);
      }

      try {
        const vaultId = entityId("vault", dependencies.createVaultId());
        const createdAt = instant(context.initiatedAt);
        return applicationSuccess(
          copySession(await dependencies.lifecycle.create({ vaultId, name, createdAt }), {
            id: vaultId,
            name,
            createdAt,
            lastOpenedAt: createdAt,
          }),
        );
      } catch (error) {
        return failureFrom<VaultSessionDto>(error);
      }
    },
  );

  const openVaultCommand = defineCommand<OpenVaultInput, VaultSessionDto>(
    "OpenVaultCommand",
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
        const openedAt = instant(context.initiatedAt);
        return applicationSuccess(
          copySession(await dependencies.lifecycle.open({ vaultId, openedAt }), {
            id: vaultId,
            lastOpenedAt: openedAt,
          }),
        );
      } catch (error) {
        return failureFrom<VaultSessionDto>(error);
      }
    },
  );

  const getVaultDiagnosticsQuery = defineQuery<undefined, VaultDiagnosticsDto>(
    "GetVaultDiagnosticsQuery",
    async () => {
      try {
        return applicationSuccess(copyDiagnostics(await dependencies.lifecycle.diagnostics()));
      } catch (error) {
        return failureFrom<VaultDiagnosticsDto>(error);
      }
    },
  );

  return Object.freeze({ createVaultCommand, openVaultCommand, getVaultDiagnosticsQuery });
};
