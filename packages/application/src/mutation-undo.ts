import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";

import { defineCommand, type ApplicationCommand } from "./operation.js";
import {
  applicationFailure,
  applicationSuccess,
  type ApplicationError,
  type ApplicationResult,
} from "./result.js";

export type MutationUndoKind = "next_action_set" | "status_change";

export interface MutationUndoTokenDto {
  readonly id: EntityId<"mutation-undo-token">;
  readonly kind: MutationUndoKind;
  readonly jobId: EntityId<"job">;
  readonly createdAt: Instant;
  readonly consumedAt: Instant | null;
  readonly rowVersion: number;
}

export interface ConsumeMutationUndoTokenPortInput {
  readonly id: EntityId<"mutation-undo-token">;
  readonly consumedAt: Instant;
}

export interface MutationUndoPort {
  consume(input: ConsumeMutationUndoTokenPortInput): Promise<MutationUndoTokenDto>;
}

export const MUTATION_UNDO_ERROR_CODES = [
  "not_found",
  "already_consumed",
  "target_changed",
  "busy",
  "unavailable",
  "permission_denied",
  "read_only",
  "invalid_state",
] as const;
export type MutationUndoErrorCode = (typeof MUTATION_UNDO_ERROR_CODES)[number];

export class MutationUndoError extends Error {
  public readonly code: MutationUndoErrorCode;

  public constructor(code: MutationUndoErrorCode) {
    if (!MUTATION_UNDO_ERROR_CODES.includes(code)) {
      throw new TypeError("Mutation undo failures require a reviewed stable code.");
    }
    super("The mutation undo port reported a failure.");
    this.name = "MutationUndoError";
    this.code = code;
  }
}

export interface ConsumeMutationUndoTokenInput {
  readonly tokenId: string;
}

export interface MutationUndoOperationDependencies {
  readonly undo: MutationUndoPort;
}

export interface MutationUndoOperations {
  readonly consumeUndoTokenCommand: ApplicationCommand<
    ConsumeMutationUndoTokenInput,
    MutationUndoTokenDto
  >;
}

export interface FreshMutationUndoTokenExpectation {
  readonly id: EntityId<"mutation-undo-token">;
  readonly kind: MutationUndoKind;
  readonly jobId: EntityId<"job">;
  readonly createdAt: Instant;
}

const VALID_UNDO_TOKEN_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Choose a valid local undo token.",
  retryable: false,
});
const UNKNOWN_UNDO_ERROR: ApplicationError = Object.freeze({
  code: "internal",
  message: "The local undo operation failed safely.",
  retryable: false,
});
const UNDO_ERRORS: Readonly<Record<MutationUndoErrorCode, ApplicationError>> = Object.freeze({
  not_found: Object.freeze({
    code: "not_found",
    message: "The local undo token was not found.",
    retryable: false,
  }),
  already_consumed: Object.freeze({
    code: "conflict",
    message: "That edit was already undone.",
    retryable: false,
  }),
  target_changed: Object.freeze({
    code: "conflict",
    message: "The edited item changed again, so this undo is no longer safe.",
    retryable: false,
  }),
  busy: Object.freeze({
    code: "conflict",
    message: "The local job store is busy. Retry shortly.",
    retryable: true,
  }),
  unavailable: Object.freeze({
    code: "unavailable",
    message: "Local job storage is unavailable.",
    retryable: true,
  }),
  permission_denied: Object.freeze({
    code: "permission_denied",
    message: "Coredrill cannot access local job storage.",
    retryable: true,
  }),
  read_only: Object.freeze({
    code: "permission_denied",
    message: "The local job store is read-only.",
    retryable: false,
  }),
  invalid_state: Object.freeze({
    code: "internal",
    message: "The local undo store is not in a usable state.",
    retryable: false,
  }),
});

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const requireRowVersion = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("Invalid undo-token row version.");
  }
  return value;
};

const requireKind = (value: unknown): MutationUndoKind => {
  if (value !== "next_action_set" && value !== "status_change") {
    throw new TypeError("Invalid undo-token kind.");
  }
  return value;
};

export const copyFreshMutationUndoToken = (
  value: unknown,
  expected: FreshMutationUndoTokenExpectation,
): MutationUndoTokenDto => {
  if (!isRecord(value)) throw new TypeError("Invalid undo-token result.");
  const copied: MutationUndoTokenDto = Object.freeze({
    id: entityId("mutation-undo-token", value["id"] as string),
    kind: requireKind(value["kind"]),
    jobId: entityId("job", value["jobId"] as string),
    createdAt: instant(value["createdAt"] as string),
    consumedAt: value["consumedAt"] === null ? null : instant(value["consumedAt"] as string),
    rowVersion: requireRowVersion(value["rowVersion"]),
  });
  if (
    copied.id !== expected.id ||
    copied.kind !== expected.kind ||
    copied.jobId !== expected.jobId ||
    copied.createdAt !== expected.createdAt ||
    copied.consumedAt !== null ||
    copied.rowVersion !== 1
  ) {
    throw new TypeError("Fresh undo token does not match the requested operation.");
  }
  return copied;
};

const copyConsumedMutationUndoToken = (
  value: unknown,
  expectedId: EntityId<"mutation-undo-token">,
  consumedAt: Instant,
): MutationUndoTokenDto => {
  if (!isRecord(value)) throw new TypeError("Invalid consumed undo-token result.");
  const copied: MutationUndoTokenDto = Object.freeze({
    id: entityId("mutation-undo-token", value["id"] as string),
    kind: requireKind(value["kind"]),
    jobId: entityId("job", value["jobId"] as string),
    createdAt: instant(value["createdAt"] as string),
    consumedAt: value["consumedAt"] === null ? null : instant(value["consumedAt"] as string),
    rowVersion: requireRowVersion(value["rowVersion"]),
  });
  if (copied.id !== expectedId || copied.consumedAt !== consumedAt || copied.rowVersion !== 2) {
    throw new TypeError("Consumed undo token does not match the requested operation.");
  }
  return copied;
};

const failureFrom = <Value>(error: unknown): ApplicationResult<Value> =>
  applicationFailure(
    error instanceof MutationUndoError ? UNDO_ERRORS[error.code] : UNKNOWN_UNDO_ERROR,
  );

export const createMutationUndoOperations = (
  dependencies: MutationUndoOperationDependencies,
): MutationUndoOperations => {
  const untrustedDependencies = dependencies as unknown;
  if (
    !isRecord(untrustedDependencies) ||
    !isRecord(untrustedDependencies["undo"]) ||
    typeof untrustedDependencies["undo"]["consume"] !== "function"
  ) {
    throw new TypeError("Mutation undo operations require a complete local persistence port.");
  }

  const consumeUndoTokenCommand = defineCommand<
    ConsumeMutationUndoTokenInput,
    MutationUndoTokenDto
  >("ConsumeUndoTokenCommand", async (input, operationContext) => {
    const untrustedInput = input as unknown;
    if (!isRecord(untrustedInput)) return applicationFailure(VALID_UNDO_TOKEN_ERROR);
    let id: EntityId<"mutation-undo-token">;
    try {
      id = entityId("mutation-undo-token", untrustedInput["tokenId"] as string);
    } catch {
      return applicationFailure(VALID_UNDO_TOKEN_ERROR);
    }
    const consumedAt = instant(operationContext.initiatedAt);
    try {
      return applicationSuccess(
        copyConsumedMutationUndoToken(
          await dependencies.undo.consume({ id, consumedAt }),
          id,
          consumedAt,
        ),
      );
    } catch (error) {
      return failureFrom<MutationUndoTokenDto>(error);
    }
  });

  return Object.freeze({ consumeUndoTokenCommand });
};
