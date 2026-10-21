import {
  NextActionDismissalError,
  type NextActionDismissalPort,
  type DismissNextActionPortInput,
} from "@coredrill/application";
import type { DatabasePort } from "./database-port.js";
import { dismissNextAction, PipelineRepositoryConflictError } from "./pipeline-repositories.js";

/** The interactive port always supplies captured ownership/version preconditions. */
export const createDatabaseNextActionDismissalPort = (
  database: DatabasePort,
): NextActionDismissalPort =>
  Object.freeze({
    dismiss: async (input: DismissNextActionPortInput) => {
      // Copy intent before awaiting storage, even for trusted direct port callers.
      const request = Object.freeze({ ...input, expected: Object.freeze({ ...input.expected }) });
      try {
        await dismissNextAction(database, request.nextActionId, request.dismissedAt, {
          jobId: request.jobId,
          ...request.expected,
        });
        return Object.freeze({
          jobId: request.jobId,
          nextActionId: request.nextActionId,
          state: "dismissed" as const,
          completedAt: null,
          dismissedAt: request.dismissedAt,
          jobRowVersion: request.expected.jobRowVersion + 1,
          nextActionRowVersion: request.expected.nextActionRowVersion + 1,
        });
      } catch (error) {
        if (error instanceof PipelineRepositoryConflictError)
          throw new NextActionDismissalError(
            error.code === "pipeline_record_not_found" ? "not_found" : "conflict",
          );
        throw new NextActionDismissalError("unavailable");
      }
    },
  });
