import {
  applicationFailure,
  copyViewedInteractionExpectationV1,
  copyViewedInteractionPortInputV1,
  createJobActivityOperations,
  createRecordedInteractionQuery,
  JobActivityError,
  type ApplicationOperationContext,
  type RecordInteractionInput,
  type ViewedInteractionIntentV1,
} from "@coredrill/application";
import { entityId, instant } from "@coredrill/domain";
import { createDatabaseViewedInteractionPort, type DatabasePort } from "@coredrill/storage-core";

export const STORED_INTERACTION_TYPES = Object.freeze([
  "note",
  "call",
  "email_logged",
  "meeting",
  "referral",
  "follow_up",
] as const);
export interface InteractionRecordingScopeV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: string;
  readonly jobId: string;
  readonly jobRowVersion: number;
  readonly contactId: string | null;
  readonly contactRowVersion: number | null;
}
export interface InteractionRecordingFields {
  readonly type: (typeof STORED_INTERACTION_TYPES)[number];
  readonly direction: "inbound" | "outbound" | "mutual" | "unknown";
  readonly summary: string;
  readonly occurredAt?: string;
}
const unavailable = (): never => {
  throw new JobActivityError("unavailable");
};
const failure = (code: "validation" | "conflict" | "cancelled", message: string) =>
  applicationFailure({ code, retryable: false, message });
const exactKeys = (
  value: unknown,
  keys: readonly string[],
  required = keys,
): value is Record<string, unknown> =>
  typeof value === "object" &&
  value !== null &&
  !Array.isArray(value) &&
  Reflect.ownKeys(value).every((key) => typeof key === "string" && keys.includes(key)) &&
  required.every((key) => Object.hasOwn(value, key));

/** One explicit local intent; no storage opening on API/draft construction. */
export const createStoredInteractionRecordingApi = (
  database: () => Promise<DatabasePort>,
  context: () => ApplicationOperationContext,
  createId: () => string,
) =>
  Object.freeze({
    beginRecording: (input: InteractionRecordingScopeV1) => {
      const raw: unknown = input;
      if (
        !exactKeys(raw, [
          "specVersion",
          "expectedVaultId",
          "jobId",
          "jobRowVersion",
          "contactId",
          "contactRowVersion",
        ]) ||
        raw["specVersion"] !== 1
      )
        throw new TypeError("Review the original interaction owner.");
      const jobId = entityId("job", raw["jobId"] as string);
      const contactId =
        raw["contactId"] === null ? null : entityId("contact", raw["contactId"] as string);
      const expected = copyViewedInteractionExpectationV1(
        {
          specVersion: 1,
          expectedVaultId: raw["expectedVaultId"],
          jobRowVersion: raw["jobRowVersion"],
          contactRowVersion: raw["contactRowVersion"],
        },
        contactId,
      );
      const interactionId = entityId("interaction", createId());
      let original: ViewedInteractionIntentV1 | null = null;
      let firstContext: ApplicationOperationContext | null = null;
      let pending = false;
      let retired = false;
      const isRetired = () => retired;
      let phase:
        "editing" | "saving" | "uncertain" | "checking" | "not_recorded" | "recorded" | "retired" =
        "editing";
      const port = async () => {
        if (isRetired()) return unavailable();
        let selected: DatabasePort;
        try {
          selected = await database();
        } catch {
          return unavailable();
        }
        if (isRetired()) return unavailable();
        return createDatabaseViewedInteractionPort(selected);
      };
      const operations = createJobActivityOperations({
        createInteractionId: () => interactionId,
        createNextActionId: unavailable,
        createUndoTokenId: unavailable,
        createInterviewId: unavailable,
        createReminderId: unavailable,
        activity: {
          setNextAction: unavailable,
          scheduleInterview: unavailable,
          scheduleReminder: unavailable,
          recordInteraction: async (intent) => (await port()).recordInteraction(intent),
        },
      });
      const check = createRecordedInteractionQuery({
        check: async (intent) => (await port()).check(intent),
      });
      return Object.freeze({
        interactionId,
        jobId,
        contactId,
        expected,
        phase: () => phase,
        dispose: () => {
          retired = true;
          phase = "retired";
        },
        save: async (fields: InteractionRecordingFields) => {
          if (isRetired()) return failure("cancelled", "This interaction draft is retired.");
          if (pending)
            return failure("conflict", "The original interaction operation is still pending.");
          if (phase === "recorded")
            return failure(
              "conflict",
              "This interaction is already recorded. Refresh its history instead of recording it again.",
            );
          if (phase === "uncertain")
            return failure(
              "conflict",
              "Check the original acknowledgement before retrying this interaction.",
            );
          let candidate: ViewedInteractionIntentV1;
          let candidateContext: ApplicationOperationContext;
          try {
            const rawFields: unknown = fields;
            if (
              !exactKeys(
                rawFields,
                ["type", "direction", "summary", "occurredAt"],
                ["type", "direction", "summary"],
              ) ||
              !STORED_INTERACTION_TYPES.some((type) => type === rawFields["type"])
            )
              throw new TypeError();
            const selectedContext = firstContext ?? context();
            if (!exactKeys(selectedContext, ["operationId", "initiatedAt"])) throw new TypeError();
            candidateContext = Object.freeze({
              operationId: entityId("application-operation", selectedContext.operationId),
              initiatedAt: instant(selectedContext.initiatedAt),
            });
            candidate = copyViewedInteractionPortInputV1({
              id: interactionId,
              jobId,
              contactId,
              expected,
              type: rawFields["type"],
              direction: rawFields["direction"],
              summary: rawFields["summary"],
              occurredAt:
                rawFields["occurredAt"] === undefined
                  ? candidateContext.initiatedAt
                  : rawFields["occurredAt"],
              nextActionAt: null,
              createdAt: candidateContext.initiatedAt,
              updatedAt: candidateContext.initiatedAt,
            });
            if (
              original !== null &&
              (candidate.type !== original.type ||
                candidate.direction !== original.direction ||
                candidate.summary !== original.summary ||
                candidate.occurredAt !== original.occurredAt)
            )
              throw new TypeError();
          } catch {
            return failure(
              "validation",
              "Review the interaction fields. A dispatched intent keeps its original values and context.",
            );
          }
          original ??= candidate;
          firstContext ??= candidateContext;
          pending = true;
          phase = "saving";
          const command: RecordInteractionInput = {
            jobId,
            contactId,
            expected,
            type: original.type,
            direction: original.direction,
            summary: original.summary,
            occurredAt: original.occurredAt,
          };
          try {
            const result = await operations.recordInteractionCommand.execute(command, firstContext);
            if (!isRetired()) phase = result.ok ? "recorded" : "uncertain";
            return result;
          } finally {
            pending = false;
          }
        },
        check: async () => {
          if (isRetired()) return failure("cancelled", "This interaction draft is retired.");
          if (pending)
            return failure("conflict", "The original interaction operation is still pending.");
          if (original === null || firstContext === null)
            return failure("validation", "There is no dispatched interaction to check.");
          if (phase === "recorded")
            return failure(
              "conflict",
              "This interaction is already acknowledged. Refresh its history instead.",
            );
          pending = true;
          phase = "checking";
          try {
            const result = await check.execute({ specVersion: 1, intent: original }, firstContext);
            if (!isRetired()) phase = result.ok ? result.value.state : "uncertain";
            return result;
          } finally {
            pending = false;
          }
        },
      });
    },
  });
export type StoredInteractionRecordingApi = ReturnType<typeof createStoredInteractionRecordingApi>;
export type StoredInteractionRecording = ReturnType<
  StoredInteractionRecordingApi["beginRecording"]
>;
