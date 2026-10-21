import {
  JobActivityError,
  applicationFailure,
  createJobActivityOperations,
  createJobNextActionsQuery,
  createCompleteNextActionCommand,
  createDismissNextActionCommand,
  type ApplicationOperationContext,
  type ListJobNextActionsInput,
  type CompleteNextActionInput,
  type DismissNextActionInput,
  type NextActionExpectation,
  type SetNextActionInput,
} from "@coredrill/application";
import { entityId } from "@coredrill/domain";
import {
  createDatabaseJobActivityPort,
  createJobNextActionsRepository,
  createDatabaseNextActionCompletionPort,
  createDatabaseNextActionDismissalPort,
  type DatabasePort,
} from "@coredrill/storage-core";

export type InteractiveNextActionInput = Pick<
  SetNextActionInput,
  "jobId" | "title" | "dueAt" | "timeZone"
> & { readonly expected: NextActionExpectation };

const unavailable = () => {
  throw new JobActivityError("invalid_state");
};
const hasViewedInput = (value: unknown): value is InteractiveNextActionInput => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  return (value as Record<string, unknown>)["expected"] !== undefined;
};

/** Job-scoped local task lifecycle; no sending, interviews or implicit attempt binding. */
export const createStoredNextActionApi = (
  database: () => Promise<DatabasePort>,
  context: () => ApplicationOperationContext,
  createId: (kind: "next-action" | "mutation-undo-token") => string,
) => {
  // Application boundaries validate and capture intent before these lazy ports open storage.
  const taskQuery = createJobNextActionsQuery({
    listPage: async (input) => createJobNextActionsRepository(await database()).listPage(input),
  });
  const completeTask = createCompleteNextActionCommand({
    complete: async (input) =>
      createDatabaseNextActionCompletionPort(await database()).complete(input),
  });
  const dismissTask = createDismissNextActionCommand({
    dismiss: async (input) =>
      createDatabaseNextActionDismissalPort(await database()).dismiss(input),
  });
  const operations = createJobActivityOperations({
    createNextActionId: () => entityId("next-action", createId("next-action")),
    createUndoTokenId: () => entityId("mutation-undo-token", createId("mutation-undo-token")),
    createInteractionId: unavailable,
    createInterviewId: unavailable,
    createReminderId: unavailable,
    activity: {
      recordInteraction: unavailable,
      scheduleInterview: unavailable,
      scheduleReminder: unavailable,
      setNextAction: async (input) => {
        try {
          return await createDatabaseJobActivityPort(await database()).setNextAction(input);
        } catch (error) {
          if (error instanceof JobActivityError) throw error;
          throw new JobActivityError("unavailable");
        }
      },
    },
  });
  return Object.freeze({
    listPage: (input: ListJobNextActionsInput) => taskQuery.execute(input, context()),
    complete: (input: CompleteNextActionInput) => completeTask.execute(input, context()),
    dismiss: (input: DismissNextActionInput) => dismissTask.execute(input, context()),
    setNextAction: (input: InteractiveNextActionInput) => {
      if (!hasViewedInput(input)) {
        return Promise.resolve(
          applicationFailure({
            code: "validation",
            message: "Review the job before adding a next action.",
            retryable: false,
          }),
        );
      }
      return operations.setNextActionCommand.execute(
        {
          jobId: input.jobId,
          title: input.title,
          expected: input.expected,
          ...(input.dueAt === undefined ? {} : { dueAt: input.dueAt }),
          ...(input.timeZone === undefined ? {} : { timeZone: input.timeZone }),
          applicationId: null,
          interactionId: null,
        },
        context(),
      );
    },
  });
};
export type StoredNextActionApi = ReturnType<typeof createStoredNextActionApi>;
