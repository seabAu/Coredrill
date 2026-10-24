import {
  copyRecordedInteractionDto,
  copyViewedInteractionPortInputV1,
  JobActivityError,
  type InteractionDto,
} from "./job-activity.js";
import { defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export type ViewedInteractionIntentV1 = ReturnType<typeof copyViewedInteractionPortInputV1>;
export interface RecordedInteractionCheckInputV1 {
  readonly specVersion: 1;
  readonly intent: ViewedInteractionIntentV1;
}
export interface RecordedInteractionCheckPortV1 {
  check(intent: ViewedInteractionIntentV1): Promise<unknown>;
}
export type RecordedInteractionCheckV1 =
  | { readonly specVersion: 1; readonly state: "recorded"; readonly interaction: InteractionDto }
  | { readonly specVersion: 1; readonly state: "not_recorded"; readonly interaction: null };

/** No write, generation, new identity or implicit retry capability. */
export const createRecordedInteractionQuery = (port: RecordedInteractionCheckPortV1) =>
  defineQuery<RecordedInteractionCheckInputV1, RecordedInteractionCheckV1>(
    "CheckRecordedInteractionQuery",
    async (input) => {
      let intent: ViewedInteractionIntentV1;
      try {
        const untrusted: unknown = input;
        if (
          typeof untrusted !== "object" ||
          untrusted === null ||
          Array.isArray(untrusted) ||
          Reflect.ownKeys(untrusted).length !== 2 ||
          !Object.hasOwn(untrusted, "intent") ||
          !Object.hasOwn(untrusted, "specVersion") ||
          (untrusted as Record<string, unknown>)["specVersion"] !== 1
        )
          throw new TypeError();
        intent = copyViewedInteractionPortInputV1((untrusted as Record<string, unknown>)["intent"]);
      } catch {
        return applicationFailure({
          code: "validation",
          retryable: false,
          message: "Review the original interaction acknowledgement context.",
        });
      }
      try {
        const stored = await port.check(intent);
        if (stored === undefined)
          return applicationSuccess(
            Object.freeze({ specVersion: 1, state: "not_recorded", interaction: null }),
          );
        return applicationSuccess(
          Object.freeze({
            specVersion: 1,
            state: "recorded",
            interaction: copyRecordedInteractionDto(stored, intent),
          }),
        );
      } catch (error) {
        return applicationFailure({
          code:
            error instanceof JobActivityError && error.code === "linkage_conflict"
              ? "conflict"
              : "unavailable",
          retryable: true,
          message:
            "The original interaction acknowledgement could not be checked. No interaction was recorded by this check.",
        });
      }
    },
  );
