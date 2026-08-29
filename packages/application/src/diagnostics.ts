import {
  SUPPORT_BUNDLE_LIMITS,
  type DiagnosticEventV1,
  type SupportBundleV1,
} from "@coredrill/contracts";
import {
  createLocalDiagnosticEvent,
  createUserCopyableSupportBundle,
} from "@coredrill/observability";

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

export interface RecordDiagnosticEventInput {
  readonly category: DiagnosticEventV1["category"];
  readonly name: DiagnosticEventV1["name"];
  readonly severity: DiagnosticEventV1["severity"];
  readonly outcome: DiagnosticEventV1["outcome"];
  readonly operationId?: string;
  readonly code?: DiagnosticEventV1["code"];
  readonly durationMs?: number;
  readonly attributes: Readonly<Record<string, unknown>>;
}

export interface CopySupportBundleInput {
  readonly maximumEventCount?: number;
}

export interface SupportBundleCopyDto {
  readonly bundle: SupportBundleV1;
  readonly copyText: string;
}

/** Runtime-owned durable local diagnostic persistence boundary. */
export interface DiagnosticLogPort {
  append(event: DiagnosticEventV1): Promise<void>;
  listRecent(limit: number): Promise<readonly DiagnosticEventV1[]>;
}

export const DIAGNOSTIC_LOG_ERROR_CODES = [
  "busy",
  "unavailable",
  "permission_denied",
  "read_only",
  "invalid_state",
] as const;
export type DiagnosticLogErrorCode = (typeof DIAGNOSTIC_LOG_ERROR_CODES)[number];

export class DiagnosticLogError extends Error {
  public override readonly name = "DiagnosticLogError";

  public constructor(public readonly code: DiagnosticLogErrorCode) {
    if (!DIAGNOSTIC_LOG_ERROR_CODES.includes(code)) {
      throw new TypeError("Diagnostic log failures require a reviewed stable code.");
    }
    super("The local diagnostic log reported a failure.");
  }
}

export interface DiagnosticOperationDependencies {
  readonly diagnosticLog: DiagnosticLogPort;
  readonly appVersion: string;
  readonly createDiagnosticEventId: () => string;
}

export interface DiagnosticOperations {
  readonly recordDiagnosticEventCommand: ApplicationCommand<
    RecordDiagnosticEventInput,
    DiagnosticEventV1
  >;
  readonly copySupportBundleQuery: ApplicationQuery<
    CopySupportBundleInput | undefined,
    SupportBundleCopyDto
  >;
}

const VALID_EVENT_ERROR: ApplicationError = {
  code: "validation",
  message: "Record a valid content-free local diagnostic event.",
  retryable: false,
};
const VALID_COPY_LIMIT_ERROR: ApplicationError = {
  code: "validation",
  message: `Choose between 1 and ${String(SUPPORT_BUNDLE_LIMITS.maxEvents)} recent diagnostic events.`,
  retryable: false,
};
const DIAGNOSTIC_ERRORS: Readonly<Record<DiagnosticLogErrorCode, ApplicationError>> = Object.freeze(
  {
    busy: {
      code: "conflict",
      message: "The local diagnostic log is busy. Retry the operation.",
      retryable: true,
    },
    unavailable: {
      code: "unavailable",
      message: "The local diagnostic log is unavailable.",
      retryable: true,
    },
    permission_denied: {
      code: "permission_denied",
      message: "Coredrill cannot access the local diagnostic log.",
      retryable: true,
    },
    read_only: {
      code: "permission_denied",
      message: "The local diagnostic log is read-only.",
      retryable: false,
    },
    invalid_state: {
      code: "internal",
      message: "The local diagnostic log is not in a usable state.",
      retryable: false,
    },
  },
);
const UNKNOWN_DIAGNOSTIC_ERROR: ApplicationError = {
  code: "internal",
  message: "The local diagnostic operation failed safely.",
  retryable: false,
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const failureFrom = <Value>(error: unknown): ApplicationResult<Value> =>
  applicationFailure(
    error instanceof DiagnosticLogError ? DIAGNOSTIC_ERRORS[error.code] : UNKNOWN_DIAGNOSTIC_ERROR,
  );

const copyLimit = (input: unknown): number => {
  if (input === undefined) return SUPPORT_BUNDLE_LIMITS.maxEvents;
  if (!isRecord(input)) throw new TypeError("Invalid support-bundle input.");
  const limit = input["maximumEventCount"] ?? SUPPORT_BUNDLE_LIMITS.maxEvents;
  if (
    !Number.isSafeInteger(limit) ||
    (limit as number) < 1 ||
    (limit as number) > SUPPORT_BUNDLE_LIMITS.maxEvents
  ) {
    throw new TypeError("Invalid support-bundle event limit.");
  }
  return limit as number;
};

export const createDiagnosticOperations = (
  dependencies: DiagnosticOperationDependencies,
): DiagnosticOperations => {
  const untrustedDependencies = dependencies as unknown;
  if (
    !isRecord(untrustedDependencies) ||
    !isRecord(untrustedDependencies["diagnosticLog"]) ||
    typeof untrustedDependencies["diagnosticLog"]["append"] !== "function" ||
    typeof untrustedDependencies["diagnosticLog"]["listRecent"] !== "function" ||
    typeof untrustedDependencies["appVersion"] !== "string" ||
    typeof untrustedDependencies["createDiagnosticEventId"] !== "function"
  ) {
    throw new TypeError("Diagnostic operations require a complete local persistence port.");
  }

  const recordDiagnosticEventCommand = defineCommand<RecordDiagnosticEventInput, DiagnosticEventV1>(
    "RecordDiagnosticEventCommand",
    async (input, operationContext) => {
      let event: DiagnosticEventV1;
      try {
        const untrustedInput = input as unknown;
        if (!isRecord(untrustedInput) || !isRecord(untrustedInput["attributes"])) {
          throw new TypeError("Invalid diagnostic event input.");
        }
        event = createLocalDiagnosticEvent(
          {
            specVersion: 1,
            eventId: dependencies.createDiagnosticEventId(),
            occurredAt: operationContext.initiatedAt,
            appVersion: dependencies.appVersion,
            delivery: "local",
            category: untrustedInput["category"] as DiagnosticEventV1["category"],
            name: untrustedInput["name"] as DiagnosticEventV1["name"],
            severity: untrustedInput["severity"] as DiagnosticEventV1["severity"],
            outcome: untrustedInput["outcome"] as DiagnosticEventV1["outcome"],
            operationId: (untrustedInput["operationId"] ?? operationContext.operationId) as string,
            code: untrustedInput["code"] as DiagnosticEventV1["code"],
            durationMs: untrustedInput["durationMs"] as number | undefined,
          },
          untrustedInput["attributes"],
        );
      } catch {
        return applicationFailure(VALID_EVENT_ERROR);
      }

      try {
        await dependencies.diagnosticLog.append(event);
        return applicationSuccess(event);
      } catch (error) {
        return failureFrom<DiagnosticEventV1>(error);
      }
    },
  );

  const copySupportBundleQuery = defineQuery<
    CopySupportBundleInput | undefined,
    SupportBundleCopyDto
  >("CopySupportBundleQuery", async (input, operationContext) => {
    let limit: number;
    try {
      limit = copyLimit(input);
    } catch {
      return applicationFailure(VALID_COPY_LIMIT_ERROR);
    }

    let storedEvents: readonly DiagnosticEventV1[];
    try {
      storedEvents = await dependencies.diagnosticLog.listRecent(limit);
    } catch (error) {
      return failureFrom<SupportBundleCopyDto>(error);
    }

    try {
      if (!Array.isArray(storedEvents) || storedEvents.length > limit) {
        throw new TypeError("Invalid diagnostic log result.");
      }
      return applicationSuccess(
        createUserCopyableSupportBundle({
          generatedAt: operationContext.initiatedAt,
          appVersion: dependencies.appVersion,
          events: storedEvents,
        }),
      );
    } catch {
      return applicationFailure(DIAGNOSTIC_ERRORS.invalid_state);
    }
  });

  return Object.freeze({ recordDiagnosticEventCommand, copySupportBundleQuery });
};
