import {
  createStatusStage,
  entityId,
  instant,
  type EntityId,
  type Instant,
} from "@coredrill/domain";

import { defineCommand } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export interface StartApplicationAttemptInput {
  readonly jobId: string;
  readonly expectedJobRowVersion: number;
  readonly preparationStageName: string;
}

export interface StartApplicationAttemptPortInput {
  readonly jobId: EntityId<"job">;
  readonly applicationId: EntityId<"application">;
  readonly newStageId: EntityId<"status_definition">;
  readonly eventId: EntityId<"status-event">;
  readonly expectedJobRowVersion: number;
  readonly preparationStageName: string;
  readonly createdAt: Instant;
}

export interface StartedApplicationAttemptDto {
  readonly applicationId: EntityId<"application">;
  readonly jobId: EntityId<"job">;
  readonly statusId: EntityId<"status_definition">;
  readonly statusName: string;
  readonly jobRowVersion: number;
  readonly createdAt: Instant;
}

export class ApplicationAttemptError extends Error {
  public override readonly name = "ApplicationAttemptError";
  public constructor(public readonly code: "conflict" | "not_found" | "unavailable") {
    super("The local application attempt could not be started.");
  }
}

export interface ApplicationAttemptPort {
  start(input: StartApplicationAttemptPortInput): Promise<unknown>;
}

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  value !== null && typeof value === "object" && !Array.isArray(value);

export const createStartApplicationAttemptCommand = (dependencies: {
  readonly attempts: ApplicationAttemptPort;
  readonly createId: (kind: "application" | "status_definition" | "status-event") => string;
}) =>
  defineCommand<StartApplicationAttemptInput, StartedApplicationAttemptDto>(
    "StartApplicationAttemptCommand",
    async (input, context) => {
      let request: StartApplicationAttemptPortInput;
      try {
        if (
          !isRecord(input) ||
          Object.keys(input).some(
            (key) => !["jobId", "expectedJobRowVersion", "preparationStageName"].includes(key),
          ) ||
          !Number.isSafeInteger(input.expectedJobRowVersion) ||
          input.expectedJobRowVersion < 1 ||
          input.expectedJobRowVersion >= Number.MAX_SAFE_INTEGER
        ) {
          throw new TypeError("Invalid application attempt input.");
        }
        const stage = createStatusStage({
          id: entityId("status_definition", dependencies.createId("status_definition")),
          name: input.preparationStageName,
          category: "preparing",
          terminal: false,
          sortOrder: 0,
          isSystem: false,
        });
        request = Object.freeze({
          jobId: entityId("job", input.jobId),
          applicationId: entityId("application", dependencies.createId("application")),
          newStageId: stage.id,
          eventId: entityId("status-event", dependencies.createId("status-event")),
          expectedJobRowVersion: input.expectedJobRowVersion,
          preparationStageName: stage.name,
          createdAt: instant(context.initiatedAt),
        });
      } catch {
        return applicationFailure({
          code: "validation",
          message:
            "Choose a current stored job and enter a preparation stage name of 1–80 characters.",
          retryable: false,
        });
      }
      try {
        const result = await dependencies.attempts.start(request);
        if (
          !isRecord(result) ||
          result["applicationId"] !== request.applicationId ||
          result["jobId"] !== request.jobId ||
          result["createdAt"] !== request.createdAt ||
          result["statusName"] !== request.preparationStageName ||
          result["jobRowVersion"] !== request.expectedJobRowVersion + 1
        )
          throw new ApplicationAttemptError("unavailable");
        return applicationSuccess(
          Object.freeze({
            applicationId: request.applicationId,
            jobId: request.jobId,
            statusId: entityId("status_definition", result["statusId"] as string),
            statusName: request.preparationStageName,
            jobRowVersion: request.expectedJobRowVersion + 1,
            createdAt: request.createdAt,
          }),
        );
      } catch (error) {
        const code = error instanceof ApplicationAttemptError ? error.code : "unavailable";
        return applicationFailure({
          code,
          message:
            code === "conflict"
              ? "The job changed, is closed, or already has an application attempt. Reload before preparing documents."
              : "The local preparation record could not be created. Nothing was submitted.",
          retryable: true,
        });
      }
    },
  );
