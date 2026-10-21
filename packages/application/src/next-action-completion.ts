import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";
import { defineCommand } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export interface CompleteNextActionInput {
  readonly jobId: string;
  readonly nextActionId: string;
  readonly expected: Readonly<{ jobRowVersion: number; nextActionRowVersion: number }>;
}
export interface CompleteNextActionPortInput {
  readonly jobId: EntityId<"job">;
  readonly nextActionId: EntityId<"next-action">;
  readonly expected: Readonly<{ jobRowVersion: number; nextActionRowVersion: number }>;
  readonly completedAt: Instant;
}
export interface CompletedNextActionDto {
  readonly jobId: EntityId<"job">;
  readonly nextActionId: EntityId<"next-action">;
  readonly state: "completed";
  readonly completedAt: Instant;
  readonly jobRowVersion: number;
  readonly nextActionRowVersion: number;
}
export interface NextActionCompletionPort {
  complete(input: CompleteNextActionPortInput): Promise<unknown>;
}
export class NextActionCompletionError extends Error {
  public override readonly name = "NextActionCompletionError";
  public constructor(public readonly code: "conflict" | "not_found" | "unavailable") {
    super("The local task completion could not be confirmed.");
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

/** Explicit local completion only: no scheduling, sending, deletion or implicit rebasing. */
export const createCompleteNextActionCommand = (tasks: NextActionCompletionPort) =>
  defineCommand<CompleteNextActionInput, CompletedNextActionDto>(
    "CompleteNextActionCommand",
    async (input, context) => {
      let request: CompleteNextActionPortInput;
      try {
        if (
          !isRecord(input) ||
          Object.keys(input).some((key) => !["jobId", "nextActionId", "expected"].includes(key)) ||
          !isRecord(input.expected) ||
          Object.keys(input.expected).some(
            (key) => !["jobRowVersion", "nextActionRowVersion"].includes(key),
          )
        )
          throw new TypeError("Invalid completion input.");
        entityId("application-operation", context.operationId);
        request = Object.freeze({
          jobId: entityId("job", input.jobId),
          nextActionId: entityId("next-action", input.nextActionId),
          expected: Object.freeze({
            jobRowVersion: version(input.expected.jobRowVersion),
            nextActionRowVersion: version(input.expected.nextActionRowVersion),
          }),
          completedAt: instant(context.initiatedAt),
        });
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Review the current job and pending task before completing it.",
          retryable: false,
        });
      }
      try {
        const result = await tasks.complete(request);
        if (
          !isRecord(result) ||
          result["jobId"] !== request.jobId ||
          result["nextActionId"] !== request.nextActionId ||
          result["state"] !== "completed" ||
          result["completedAt"] !== request.completedAt ||
          result["jobRowVersion"] !== request.expected.jobRowVersion + 1 ||
          result["nextActionRowVersion"] !== request.expected.nextActionRowVersion + 1
        )
          throw new NextActionCompletionError("unavailable");
        return applicationSuccess(
          Object.freeze({
            jobId: request.jobId,
            nextActionId: request.nextActionId,
            state: "completed" as const,
            completedAt: request.completedAt,
            jobRowVersion: request.expected.jobRowVersion + 1,
            nextActionRowVersion: request.expected.nextActionRowVersion + 1,
          }),
        );
      } catch (error) {
        const code = error instanceof NextActionCompletionError ? error.code : "unavailable";
        return applicationFailure({
          code,
          retryable: code === "unavailable",
          message:
            code === "conflict"
              ? "The job or task changed. Refresh and review before completing it."
              : code === "not_found"
                ? "This pending task is no longer available for the viewed job."
                : "Task completion could not be confirmed. Refresh its saved state before retrying.",
        });
      }
    },
  );
