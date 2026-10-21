import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";
import { defineCommand } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export interface DismissNextActionInput {
  readonly jobId: string;
  readonly nextActionId: string;
  readonly expected: Readonly<{ jobRowVersion: number; nextActionRowVersion: number }>;
}
export interface DismissNextActionPortInput {
  readonly jobId: EntityId<"job">;
  readonly nextActionId: EntityId<"next-action">;
  readonly expected: Readonly<{ jobRowVersion: number; nextActionRowVersion: number }>;
  readonly dismissedAt: Instant;
}
export interface DismissedNextActionDto {
  readonly jobId: EntityId<"job">;
  readonly nextActionId: EntityId<"next-action">;
  readonly state: "dismissed";
  readonly completedAt: null;
  readonly dismissedAt: Instant;
  readonly jobRowVersion: number;
  readonly nextActionRowVersion: number;
}
export interface NextActionDismissalPort {
  dismiss(input: DismissNextActionPortInput): Promise<unknown>;
}
export class NextActionDismissalError extends Error {
  public override readonly name = "NextActionDismissalError";
  public constructor(public readonly code: "conflict" | "not_found" | "unavailable") {
    super("The local task dismissal could not be confirmed.");
  }
}
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
const version = (value: unknown): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 1 ||
    value >= Number.MAX_SAFE_INTEGER
  )
    throw new TypeError("Invalid viewed row version.");
  return value;
};

/** Explicit local dismissal only: no scheduling, sending, deletion or implicit rebasing. */
export const createDismissNextActionCommand = (tasks: NextActionDismissalPort) =>
  defineCommand<DismissNextActionInput, DismissedNextActionDto>(
    "DismissNextActionCommand",
    async (input, context) => {
      let request: DismissNextActionPortInput;
      try {
        if (
          !isRecord(input) ||
          Object.keys(input).some((key) => !["jobId", "nextActionId", "expected"].includes(key)) ||
          !isRecord(input.expected) ||
          Object.keys(input.expected).some(
            (key) => !["jobRowVersion", "nextActionRowVersion"].includes(key),
          )
        )
          throw new TypeError("Invalid dismissal input.");
        entityId("application-operation", context.operationId);
        request = Object.freeze({
          jobId: entityId("job", input.jobId),
          nextActionId: entityId("next-action", input.nextActionId),
          expected: Object.freeze({
            jobRowVersion: version(input.expected.jobRowVersion),
            nextActionRowVersion: version(input.expected.nextActionRowVersion),
          }),
          dismissedAt: instant(context.initiatedAt),
        });
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Review the current job and pending task before dismissing it.",
          retryable: false,
        });
      }
      try {
        const result = await tasks.dismiss(request);
        if (
          !isRecord(result) ||
          result["jobId"] !== request.jobId ||
          result["nextActionId"] !== request.nextActionId ||
          result["state"] !== "dismissed" ||
          result["completedAt"] !== null ||
          result["dismissedAt"] !== request.dismissedAt ||
          result["jobRowVersion"] !== request.expected.jobRowVersion + 1 ||
          result["nextActionRowVersion"] !== request.expected.nextActionRowVersion + 1
        )
          throw new NextActionDismissalError("unavailable");
        return applicationSuccess(
          Object.freeze({
            jobId: request.jobId,
            nextActionId: request.nextActionId,
            state: "dismissed" as const,
            completedAt: null,
            dismissedAt: request.dismissedAt,
            jobRowVersion: request.expected.jobRowVersion + 1,
            nextActionRowVersion: request.expected.nextActionRowVersion + 1,
          }),
        );
      } catch (error) {
        const code = error instanceof NextActionDismissalError ? error.code : "unavailable";
        return applicationFailure({
          code,
          retryable: code === "unavailable",
          message:
            code === "conflict"
              ? "The job or task changed. Refresh and review before dismissing it."
              : code === "not_found"
                ? "This pending task is no longer available for the viewed job."
                : "Task dismissal could not be confirmed. Refresh its saved state before retrying.",
        });
      }
    },
  );
