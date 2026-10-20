import {
  JobActivityError,
  applicationFailure,
  createJobActivityOperations,
  type ApplicationOperationContext,
} from "@coredrill/application";
import { entityId } from "@coredrill/domain";
import { createDatabaseJobNotePort, type DatabasePort } from "@coredrill/storage-core";

export const STORED_JOB_NOTE_MAX_CHARACTERS = 2_000;
export interface RecordStoredJobNoteInput {
  readonly jobId: string;
  readonly summary: string;
}
const unavailable = () => {
  throw new JobActivityError("invalid_state");
};
const validNote = (value: unknown): value is RecordStoredJobNoteInput => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return false;
  const note = value as Record<string, unknown>;
  return (
    typeof note["jobId"] === "string" &&
    typeof note["summary"] === "string" &&
    note["summary"].trim().length > 0 &&
    note["summary"].length <= STORED_JOB_NOTE_MAX_CHARACTERS
  );
};

/** Explicit local note only: no contact, backdating, scheduling, or sending surface. */
export const createStoredJobNoteApi = (
  database: () => Promise<DatabasePort>,
  context: () => ApplicationOperationContext,
  createId: (kind: "interaction") => string,
) => {
  const operations = createJobActivityOperations({
    createInteractionId: () => entityId("interaction", createId("interaction")),
    createNextActionId: unavailable,
    createUndoTokenId: unavailable,
    createInterviewId: unavailable,
    createReminderId: unavailable,
    activity: {
      setNextAction: unavailable,
      scheduleInterview: unavailable,
      scheduleReminder: unavailable,
      recordInteraction: async (input) => {
        try {
          return await createDatabaseJobNotePort(await database()).recordInteraction(input);
        } catch (error) {
          if (error instanceof JobActivityError) throw error;
          throw new JobActivityError("unavailable");
        }
      },
    },
  });
  return Object.freeze({
    recordNote: (input: RecordStoredJobNoteInput) => {
      if (!validNote(input))
        return Promise.resolve(
          applicationFailure({
            code: "validation",
            message: "Enter a local note of 1–2,000 characters.",
            retryable: false,
          }),
        );
      return operations.recordInteractionCommand.execute(
        {
          jobId: input.jobId,
          summary: input.summary,
          type: "note",
          direction: "unknown",
          contactId: null,
        },
        context(),
      );
    },
  });
};
export type StoredJobNoteApi = ReturnType<typeof createStoredJobNoteApi>;
