import {
  createStatusStage,
  entityId,
  instant,
  type EntityId,
  type Instant,
} from "@coredrill/domain";
import { defineCommand } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export interface CreateAppliedStageInput {
  readonly name: string;
}
export interface AppliedStagePortInput {
  readonly id: EntityId<"status_definition">;
  readonly name: string;
  readonly createdAt: Instant;
}
export interface CreatedAppliedStageDto {
  readonly id: EntityId<"status_definition">;
  readonly name: string;
  readonly created: boolean;
}
export interface AppliedStagePort {
  create(input: AppliedStagePortInput): Promise<unknown>;
}
export class AppliedStageError extends Error {
  public override readonly name = "AppliedStageError";
  public constructor(public readonly code: "conflict" | "unavailable") {
    super("The local Applied stage could not be created.");
  }
}
const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

export const createAppliedStageCommand = (dependencies: {
  readonly stages: AppliedStagePort;
  readonly createId: () => string;
}) =>
  defineCommand<CreateAppliedStageInput, CreatedAppliedStageDto>(
    "CreateAppliedStageCommand",
    async (input, context) => {
      let request: AppliedStagePortInput;
      try {
        if (!isRecord(input) || Object.keys(input).some((key) => key !== "name"))
          throw new TypeError("Invalid stage input.");
        const stage = createStatusStage({
          id: dependencies.createId(),
          name: input.name,
          category: "applied",
          terminal: false,
          isSystem: false,
          sortOrder: 0,
        });
        request = Object.freeze({
          id: stage.id,
          name: stage.name,
          createdAt: instant(context.initiatedAt),
        });
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Enter an Applied stage name of 1–80 characters without control characters.",
          retryable: false,
        });
      }
      try {
        const result = await dependencies.stages.create(request);
        if (
          !isRecord(result) ||
          result["name"] !== request.name ||
          typeof result["created"] !== "boolean" ||
          (result["created"] && result["id"] !== request.id)
        )
          throw new AppliedStageError("unavailable");
        return applicationSuccess(
          Object.freeze({
            id: entityId("status_definition", result["id"] as string),
            name: request.name,
            created: result["created"],
          }),
        );
      } catch (error) {
        const code = error instanceof AppliedStageError ? error.code : "unavailable";
        return applicationFailure({
          code,
          message:
            code === "conflict"
              ? "That stage name is already used, archived, or ambiguous. Choose a different name or select an existing Applied stage."
              : "The local stage could not be created. No application was marked Applied.",
          retryable: code === "unavailable",
        });
      }
    },
  );
