import {
  JobPipelineError,
  MutationUndoError,
  createJobPipelineOperations,
  createMutationUndoOperations,
  type ApplicationOperationContext,
  type ChangeStatusInput,
  type StatusChangeExpectation,
  type ConsumeMutationUndoTokenInput,
} from "@coredrill/application";
import { entityId } from "@coredrill/domain";
import {
  createDatabaseJobPipelinePort,
  createDatabaseMutationUndoPort,
  type DatabasePort,
} from "@coredrill/storage-core";

export type InteractiveStatusInput = Omit<
  ChangeStatusInput,
  "expected" | "requireSubmissionSnapshot"
> & { readonly expected: StatusChangeExpectation };

/** Only validated commands cross this runtime boundary; SQL/adapter errors stay private. */
export const createStoredPipelineMutationApi = (
  database: () => Promise<DatabasePort>,
  context: () => ApplicationOperationContext,
  createId: (kind: "job" | "status-event" | "mutation-undo-token") => string,
) => {
  const change = createJobPipelineOperations({
    createJobId: () => entityId("job", createId("job")),
    createStatusEventId: () => entityId("status-event", createId("status-event")),
    createUndoTokenId: () => entityId("mutation-undo-token", createId("mutation-undo-token")),
    pipeline: {
      createManualJob: () => Promise.reject(new JobPipelineError("invalid_state")),
      changeStatus: async (input) => {
        try {
          return await createDatabaseJobPipelinePort(await database()).changeStatus(input);
        } catch (error) {
          if (error instanceof JobPipelineError) throw error;
          throw new JobPipelineError("unavailable");
        }
      },
    },
  });
  const undo = createMutationUndoOperations({
    undo: {
      consume: async (input) => {
        try {
          return await createDatabaseMutationUndoPort(await database()).consume(input);
        } catch (error) {
          if (error instanceof MutationUndoError) throw error;
          throw new MutationUndoError("unavailable");
        }
      },
    },
  });
  return Object.freeze({
    changeStatus: (input: InteractiveStatusInput) =>
      change.changeStatusCommand.execute({ ...input, requireSubmissionSnapshot: true }, context()),
    undo: (input: ConsumeMutationUndoTokenInput) =>
      undo.consumeUndoTokenCommand.execute(input, context()),
  });
};
export type StoredPipelineMutationApi = ReturnType<typeof createStoredPipelineMutationApi>;
