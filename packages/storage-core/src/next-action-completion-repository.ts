import {
  NextActionCompletionError,
  type NextActionCompletionPort,
  type CompleteNextActionPortInput,
} from "@coredrill/application";
import type { DatabasePort } from "./database-port.js";
import { completeNextAction, PipelineRepositoryConflictError } from "./pipeline-repositories.js";

/** The interactive port always supplies captured ownership/version preconditions. */
export const createDatabaseNextActionCompletionPort = (
  database: DatabasePort,
): NextActionCompletionPort =>
  Object.freeze({
    complete: async (input: CompleteNextActionPortInput) => {
      // Copy intent before awaiting storage, even for trusted direct port callers.
      const request = Object.freeze({ ...input, expected: Object.freeze({ ...input.expected }) });
      try {
        await completeNextAction(database, request.nextActionId, request.completedAt, {
          jobId: request.jobId,
          ...request.expected,
        });
        return Object.freeze({
          jobId: request.jobId,
          nextActionId: request.nextActionId,
          state: "completed" as const,
          completedAt: request.completedAt,
          jobRowVersion: request.expected.jobRowVersion + 1,
          nextActionRowVersion: request.expected.nextActionRowVersion + 1,
        });
      } catch (error) {
        if (error instanceof PipelineRepositoryConflictError)
          throw new NextActionCompletionError(
            error.code === "pipeline_record_not_found" ? "not_found" : "conflict",
          );
        throw new NextActionCompletionError("unavailable");
      }
    },
  });
