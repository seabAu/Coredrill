import {
  compareInstant,
  entityId,
  instant,
  timeZone,
  type EntityId,
  type Instant,
  type TimeZone,
} from "@coredrill/domain";

import { defineCommand, type ApplicationCommand } from "./operation.js";
import {
  applicationFailure,
  applicationSuccess,
  type ApplicationError,
  type ApplicationResult,
} from "./result.js";

export type InteractionDirection = "inbound" | "mutual" | "outbound" | "unknown";
export type NextActionState = "completed" | "dismissed" | "pending";
export type ReminderState = "dismissed" | "fired" | "pending";

export interface NextActionDto {
  readonly id: EntityId<"next-action">;
  readonly jobId: EntityId<"job">;
  readonly applicationId: EntityId<"application"> | null;
  readonly interactionId: EntityId<"interaction"> | null;
  readonly title: string;
  readonly dueAt: Instant | null;
  readonly timeZone: TimeZone | null;
  readonly state: NextActionState;
  readonly completedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface InteractionDto {
  readonly id: EntityId<"interaction">;
  readonly jobId: EntityId<"job">;
  readonly contactId: EntityId<"contact"> | null;
  readonly type: string;
  readonly occurredAt: Instant;
  readonly direction: InteractionDirection;
  readonly summary: string;
  readonly nextActionAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface InterviewDto {
  readonly id: EntityId<"interview">;
  readonly applicationId: EntityId<"application">;
  readonly stageName: string;
  readonly startsAt: Instant;
  readonly timeZone: TimeZone;
  readonly durationMinutes: number;
  readonly locationOrUrl: string | null;
  readonly contactIds: readonly EntityId<"contact">[];
  readonly preparationNotes: string;
  readonly outcome: string | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface ReminderDto {
  readonly id: EntityId<"reminder">;
  readonly jobId: EntityId<"job">;
  readonly nextActionId: EntityId<"next-action"> | null;
  readonly interviewId: EntityId<"interview"> | null;
  readonly remindAt: Instant;
  readonly timeZone: TimeZone;
  readonly state: ReminderState;
  readonly note: string | null;
  readonly firedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface SetNextActionPortInput {
  readonly id: EntityId<"next-action">;
  readonly jobId: EntityId<"job">;
  readonly applicationId: EntityId<"application"> | null;
  readonly interactionId: EntityId<"interaction"> | null;
  readonly title: string;
  readonly dueAt: Instant | null;
  readonly timeZone: TimeZone | null;
  readonly state: "pending";
  readonly completedAt: null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}

export interface RecordInteractionPortInput {
  readonly id: EntityId<"interaction">;
  readonly jobId: EntityId<"job">;
  readonly contactId: EntityId<"contact"> | null;
  readonly type: string;
  readonly occurredAt: Instant;
  readonly direction: InteractionDirection;
  readonly summary: string;
  readonly nextActionAt: null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}

export interface ScheduleInterviewPortInput {
  readonly id: EntityId<"interview">;
  readonly applicationId: EntityId<"application">;
  readonly stageName: string;
  readonly startsAt: Instant;
  readonly timeZone: TimeZone;
  readonly durationMinutes: number;
  readonly locationOrUrl: string | null;
  readonly contactIds: readonly EntityId<"contact">[];
  readonly preparationNotes: string;
  readonly outcome: null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}

export interface ScheduleReminderPortInput {
  readonly id: EntityId<"reminder">;
  readonly jobId: EntityId<"job">;
  readonly nextActionId: EntityId<"next-action"> | null;
  readonly interviewId: EntityId<"interview"> | null;
  readonly remindAt: Instant;
  readonly timeZone: TimeZone;
  readonly state: "pending";
  readonly note: string | null;
  readonly firedAt: null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
}

/** Runtime-owned local persistence boundary. It stores schedules; it does not contact a server. */
export interface JobActivityPort {
  setNextAction(input: SetNextActionPortInput): Promise<NextActionDto>;
  recordInteraction(input: RecordInteractionPortInput): Promise<InteractionDto>;
  scheduleInterview(input: ScheduleInterviewPortInput): Promise<InterviewDto>;
  scheduleReminder(input: ScheduleReminderPortInput): Promise<ReminderDto>;
}

export const JOB_ACTIVITY_ERROR_CODES = [
  "already_exists",
  "not_found",
  "linkage_conflict",
  "scheduling_conflict",
  "busy",
  "unavailable",
  "permission_denied",
  "read_only",
  "invalid_state",
] as const;
export type JobActivityErrorCode = (typeof JOB_ACTIVITY_ERROR_CODES)[number];

/** Content-free typed failure for implementations of JobActivityPort. */
export class JobActivityError extends Error {
  public readonly code: JobActivityErrorCode;

  public constructor(code: JobActivityErrorCode) {
    if (!JOB_ACTIVITY_ERROR_CODES.includes(code)) {
      throw new TypeError("Job activity failures require a reviewed stable code.");
    }
    super("The job activity port reported a failure.");
    this.name = "JobActivityError";
    this.code = code;
  }
}

export interface SetNextActionInput {
  readonly jobId: string;
  readonly applicationId?: string | null;
  readonly interactionId?: string | null;
  readonly title: string;
  readonly dueAt?: string | null;
  readonly timeZone?: string | null;
}

export interface RecordInteractionInput {
  readonly jobId: string;
  readonly contactId?: string | null;
  readonly type: string;
  readonly occurredAt?: string;
  readonly direction?: InteractionDirection;
  readonly summary?: string;
}

export interface ScheduleInterviewInput {
  readonly applicationId: string;
  readonly stageName: string;
  readonly startsAt: string;
  readonly timeZone: string;
  readonly durationMinutes: number;
  readonly locationOrUrl?: string | null;
  readonly contactIds?: readonly string[];
  readonly preparationNotes?: string;
}

export interface ScheduleReminderInput {
  readonly jobId: string;
  readonly nextActionId?: string | null;
  readonly interviewId?: string | null;
  readonly remindAt: string;
  readonly timeZone: string;
  readonly note?: string | null;
}

export interface JobActivityOperationDependencies {
  readonly activity: JobActivityPort;
  readonly createNextActionId: () => EntityId<"next-action">;
  readonly createInteractionId: () => EntityId<"interaction">;
  readonly createInterviewId: () => EntityId<"interview">;
  readonly createReminderId: () => EntityId<"reminder">;
}

export interface JobActivityOperations {
  readonly setNextActionCommand: ApplicationCommand<SetNextActionInput, NextActionDto>;
  readonly recordInteractionCommand: ApplicationCommand<RecordInteractionInput, InteractionDto>;
  readonly scheduleInterviewCommand: ApplicationCommand<ScheduleInterviewInput, InterviewDto>;
  readonly scheduleReminderCommand: ApplicationCommand<ScheduleReminderInput, ReminderDto>;
}

const VALID_NEXT_ACTION_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Review the next action and its optional schedule.",
  retryable: false,
});
const VALID_INTERACTION_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Review the interaction details and occurrence time.",
  retryable: false,
});
const VALID_INTERVIEW_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Review the interview details, time, and time zone.",
  retryable: false,
});
const VALID_REMINDER_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Review the reminder time, time zone, and linked records.",
  retryable: false,
});
const UNKNOWN_ACTIVITY_ERROR: ApplicationError = Object.freeze({
  code: "internal",
  message: "The local activity operation failed safely.",
  retryable: false,
});

const ACTIVITY_ERRORS: Readonly<Record<JobActivityErrorCode, ApplicationError>> = Object.freeze({
  already_exists: Object.freeze({
    code: "conflict",
    message: "This local activity already exists.",
    retryable: false,
  }),
  not_found: Object.freeze({
    code: "not_found",
    message: "The requested local activity record was not found.",
    retryable: false,
  }),
  linkage_conflict: Object.freeze({
    code: "conflict",
    message: "The selected activity records do not belong together.",
    retryable: false,
  }),
  scheduling_conflict: Object.freeze({
    code: "conflict",
    message: "The local schedule changed. Review it, then retry.",
    retryable: true,
  }),
  busy: Object.freeze({
    code: "conflict",
    message: "The local activity store is busy. Retry shortly.",
    retryable: true,
  }),
  unavailable: Object.freeze({
    code: "unavailable",
    message: "Local activity storage is unavailable.",
    retryable: true,
  }),
  permission_denied: Object.freeze({
    code: "permission_denied",
    message: "Coredrill cannot access local activity storage.",
    retryable: true,
  }),
  read_only: Object.freeze({
    code: "permission_denied",
    message: "The local activity store is read-only.",
    retryable: false,
  }),
  invalid_state: Object.freeze({
    code: "internal",
    message: "The local activity store is not in a usable state.",
    retryable: false,
  }),
});

const INTERACTION_DIRECTIONS = new Set<InteractionDirection>([
  "inbound",
  "mutual",
  "outbound",
  "unknown",
]);
const INTERACTION_TYPE_PATTERN = /^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
};

const requiredLabel = (value: unknown, maximum: number): string => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximum ||
    hasControlCharacter(value)
  ) {
    throw new TypeError("Invalid activity label.");
  }
  return value;
};

const text = (value: unknown, maximum: number, defaultValue?: string): string => {
  if (value === undefined && defaultValue !== undefined) return defaultValue;
  if (typeof value !== "string" || value.length > maximum || value.includes("\u0000")) {
    throw new TypeError("Invalid activity text.");
  }
  return value;
};

const optionalText = (value: unknown, maximum: number): string | null => {
  if (value === undefined || value === null) return null;
  const parsed = text(value, maximum);
  if (parsed.trim().length === 0) throw new TypeError("Invalid optional activity text.");
  return parsed;
};

const nullableResultText = (value: unknown, maximum: number): string | null => {
  if (value === null) return null;
  if (value === undefined) throw new TypeError("Missing activity text field.");
  return optionalText(value, maximum);
};

const optionalInputEntityId = <Entity extends string>(
  type: Entity,
  value: unknown,
): EntityId<Entity> | null =>
  value === undefined || value === null ? null : entityId(type, value as string);

const nullableResultEntityId = <Entity extends string>(
  type: Entity,
  value: unknown,
): EntityId<Entity> | null => (value === null ? null : entityId(type, value as string));

const requireRowVersion = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("Invalid activity row version.");
  }
  return value;
};

const requireDirection = (
  value: unknown,
  fallback?: InteractionDirection,
): InteractionDirection => {
  const parsed = (value ?? fallback) as InteractionDirection;
  if (!INTERACTION_DIRECTIONS.has(parsed)) throw new TypeError("Invalid interaction direction.");
  return parsed;
};

const requireInteractionType = (value: unknown): string => {
  if (typeof value !== "string" || value.length > 128 || !INTERACTION_TYPE_PATTERN.test(value)) {
    throw new TypeError("Invalid interaction type.");
  }
  return value;
};

const requireDuration = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > 1440) {
    throw new TypeError("Invalid interview duration.");
  }
  return value;
};

const inputContactIds = (value: unknown): readonly EntityId<"contact">[] => {
  if (value === undefined) return Object.freeze([]);
  if (!Array.isArray(value) || value.length > 256) {
    throw new TypeError("Invalid interview contacts.");
  }
  const ids = value.map((id) => entityId("contact", id as string));
  if (new Set(ids).size !== ids.length) throw new TypeError("Duplicate interview contacts.");
  return Object.freeze(ids);
};

const resultContactIds = (value: unknown): readonly EntityId<"contact">[] => {
  if (!Array.isArray(value) || value.length > 256) {
    throw new TypeError("Invalid returned interview contacts.");
  }
  const ids = value.map((id) => entityId("contact", id as string));
  if (new Set(ids).size !== ids.length) throw new TypeError("Duplicate returned contacts.");
  return Object.freeze(ids);
};

const sameIds = (left: readonly string[], right: readonly string[]): boolean =>
  left.length === right.length && left.every((value, index) => value === right[index]);

interface ExpectedNextAction {
  readonly id: EntityId<"next-action">;
  readonly jobId: EntityId<"job">;
  readonly applicationId: EntityId<"application"> | null;
  readonly interactionId: EntityId<"interaction"> | null;
  readonly title: string;
  readonly dueAt: Instant | null;
  readonly timeZone: TimeZone | null;
  readonly createdAt: Instant;
}

const copyNextAction = (value: unknown, expected: ExpectedNextAction): NextActionDto => {
  if (!isRecord(value)) throw new TypeError("Invalid next-action result.");
  const copied: NextActionDto = Object.freeze({
    id: entityId("next-action", value["id"] as string),
    jobId: entityId("job", value["jobId"] as string),
    applicationId: nullableResultEntityId("application", value["applicationId"]),
    interactionId: nullableResultEntityId("interaction", value["interactionId"]),
    title: requiredLabel(value["title"], 512),
    dueAt: value["dueAt"] === null ? null : instant(value["dueAt"] as string),
    timeZone: value["timeZone"] === null ? null : timeZone(value["timeZone"] as string),
    state: value["state"] as NextActionState,
    completedAt: value["completedAt"] === null ? null : instant(value["completedAt"] as string),
    createdAt: instant(value["createdAt"] as string),
    updatedAt: instant(value["updatedAt"] as string),
    rowVersion: requireRowVersion(value["rowVersion"]),
  });
  if (
    copied.id !== expected.id ||
    copied.jobId !== expected.jobId ||
    copied.applicationId !== expected.applicationId ||
    copied.interactionId !== expected.interactionId ||
    copied.title !== expected.title ||
    copied.dueAt !== expected.dueAt ||
    copied.timeZone !== expected.timeZone ||
    copied.state !== "pending" ||
    copied.completedAt !== null ||
    copied.createdAt !== expected.createdAt ||
    copied.updatedAt !== expected.createdAt ||
    copied.rowVersion !== 1
  ) {
    throw new TypeError("Next-action result does not match the requested operation.");
  }
  return copied;
};

interface ExpectedInteraction {
  readonly id: EntityId<"interaction">;
  readonly jobId: EntityId<"job">;
  readonly contactId: EntityId<"contact"> | null;
  readonly type: string;
  readonly occurredAt: Instant;
  readonly direction: InteractionDirection;
  readonly summary: string;
  readonly createdAt: Instant;
}

const copyInteraction = (value: unknown, expected: ExpectedInteraction): InteractionDto => {
  if (!isRecord(value)) throw new TypeError("Invalid interaction result.");
  const copied: InteractionDto = Object.freeze({
    id: entityId("interaction", value["id"] as string),
    jobId: entityId("job", value["jobId"] as string),
    contactId: nullableResultEntityId("contact", value["contactId"]),
    type: requireInteractionType(value["type"]),
    occurredAt: instant(value["occurredAt"] as string),
    direction: requireDirection(value["direction"]),
    summary: text(value["summary"], 200_000),
    nextActionAt: value["nextActionAt"] === null ? null : instant(value["nextActionAt"] as string),
    createdAt: instant(value["createdAt"] as string),
    updatedAt: instant(value["updatedAt"] as string),
    rowVersion: requireRowVersion(value["rowVersion"]),
  });
  if (
    copied.id !== expected.id ||
    copied.jobId !== expected.jobId ||
    copied.contactId !== expected.contactId ||
    copied.type !== expected.type ||
    copied.occurredAt !== expected.occurredAt ||
    copied.direction !== expected.direction ||
    copied.summary !== expected.summary ||
    copied.nextActionAt !== null ||
    copied.createdAt !== expected.createdAt ||
    copied.updatedAt !== expected.createdAt ||
    copied.rowVersion !== 1
  ) {
    throw new TypeError("Interaction result does not match the requested operation.");
  }
  return copied;
};

interface ExpectedInterview {
  readonly id: EntityId<"interview">;
  readonly applicationId: EntityId<"application">;
  readonly stageName: string;
  readonly startsAt: Instant;
  readonly timeZone: TimeZone;
  readonly durationMinutes: number;
  readonly locationOrUrl: string | null;
  readonly contactIds: readonly EntityId<"contact">[];
  readonly preparationNotes: string;
  readonly createdAt: Instant;
}

const copyInterview = (value: unknown, expected: ExpectedInterview): InterviewDto => {
  if (!isRecord(value)) throw new TypeError("Invalid interview result.");
  const contacts = resultContactIds(value["contactIds"]);
  const copied: InterviewDto = Object.freeze({
    id: entityId("interview", value["id"] as string),
    applicationId: entityId("application", value["applicationId"] as string),
    stageName: requiredLabel(value["stageName"], 256),
    startsAt: instant(value["startsAt"] as string),
    timeZone: timeZone(value["timeZone"] as string),
    durationMinutes: requireDuration(value["durationMinutes"]),
    locationOrUrl: nullableResultText(value["locationOrUrl"], 8192),
    contactIds: contacts,
    preparationNotes: text(value["preparationNotes"], 200_000),
    outcome: nullableResultText(value["outcome"], 200_000),
    createdAt: instant(value["createdAt"] as string),
    updatedAt: instant(value["updatedAt"] as string),
    rowVersion: requireRowVersion(value["rowVersion"]),
  });
  if (
    copied.id !== expected.id ||
    copied.applicationId !== expected.applicationId ||
    copied.stageName !== expected.stageName ||
    copied.startsAt !== expected.startsAt ||
    copied.timeZone !== expected.timeZone ||
    copied.durationMinutes !== expected.durationMinutes ||
    copied.locationOrUrl !== expected.locationOrUrl ||
    !sameIds(copied.contactIds, expected.contactIds) ||
    copied.preparationNotes !== expected.preparationNotes ||
    copied.outcome !== null ||
    copied.createdAt !== expected.createdAt ||
    copied.updatedAt !== expected.createdAt ||
    copied.rowVersion !== 1
  ) {
    throw new TypeError("Interview result does not match the requested operation.");
  }
  return copied;
};

interface ExpectedReminder {
  readonly id: EntityId<"reminder">;
  readonly jobId: EntityId<"job">;
  readonly nextActionId: EntityId<"next-action"> | null;
  readonly interviewId: EntityId<"interview"> | null;
  readonly remindAt: Instant;
  readonly timeZone: TimeZone;
  readonly note: string | null;
  readonly createdAt: Instant;
}

const copyReminder = (value: unknown, expected: ExpectedReminder): ReminderDto => {
  if (!isRecord(value)) throw new TypeError("Invalid reminder result.");
  const copied: ReminderDto = Object.freeze({
    id: entityId("reminder", value["id"] as string),
    jobId: entityId("job", value["jobId"] as string),
    nextActionId: nullableResultEntityId("next-action", value["nextActionId"]),
    interviewId: nullableResultEntityId("interview", value["interviewId"]),
    remindAt: instant(value["remindAt"] as string),
    timeZone: timeZone(value["timeZone"] as string),
    state: value["state"] as ReminderState,
    note: nullableResultText(value["note"], 200_000),
    firedAt: value["firedAt"] === null ? null : instant(value["firedAt"] as string),
    createdAt: instant(value["createdAt"] as string),
    updatedAt: instant(value["updatedAt"] as string),
    rowVersion: requireRowVersion(value["rowVersion"]),
  });
  if (
    copied.id !== expected.id ||
    copied.jobId !== expected.jobId ||
    copied.nextActionId !== expected.nextActionId ||
    copied.interviewId !== expected.interviewId ||
    copied.remindAt !== expected.remindAt ||
    copied.timeZone !== expected.timeZone ||
    copied.state !== "pending" ||
    copied.note !== expected.note ||
    copied.firedAt !== null ||
    copied.createdAt !== expected.createdAt ||
    copied.updatedAt !== expected.createdAt ||
    copied.rowVersion !== 1
  ) {
    throw new TypeError("Reminder result does not match the requested operation.");
  }
  return copied;
};

const failureFrom = <Value>(error: unknown): ApplicationResult<Value> =>
  applicationFailure(
    error instanceof JobActivityError ? ACTIVITY_ERRORS[error.code] : UNKNOWN_ACTIVITY_ERROR,
  );

export const createJobActivityOperations = (
  dependencies: JobActivityOperationDependencies,
): JobActivityOperations => {
  const untrustedDependencies = dependencies as unknown;
  if (
    !isRecord(untrustedDependencies) ||
    !isRecord(untrustedDependencies["activity"]) ||
    typeof untrustedDependencies["activity"]["setNextAction"] !== "function" ||
    typeof untrustedDependencies["activity"]["recordInteraction"] !== "function" ||
    typeof untrustedDependencies["activity"]["scheduleInterview"] !== "function" ||
    typeof untrustedDependencies["activity"]["scheduleReminder"] !== "function" ||
    typeof untrustedDependencies["createNextActionId"] !== "function" ||
    typeof untrustedDependencies["createInteractionId"] !== "function" ||
    typeof untrustedDependencies["createInterviewId"] !== "function" ||
    typeof untrustedDependencies["createReminderId"] !== "function"
  ) {
    throw new TypeError("Job activity operations require a complete local persistence port.");
  }

  const setNextActionCommand = defineCommand<SetNextActionInput, NextActionDto>(
    "SetNextActionCommand",
    async (input, operationContext) => {
      const untrustedInput = input as unknown;
      if (!isRecord(untrustedInput)) return applicationFailure(VALID_NEXT_ACTION_ERROR);

      let parsed: Omit<SetNextActionPortInput, "id" | "createdAt" | "updatedAt">;
      try {
        const hasDueAt = untrustedInput["dueAt"] !== undefined && untrustedInput["dueAt"] !== null;
        const hasTimeZone =
          untrustedInput["timeZone"] !== undefined && untrustedInput["timeZone"] !== null;
        if (hasDueAt !== hasTimeZone) throw new TypeError("Scheduled actions require a time zone.");
        parsed = {
          jobId: entityId("job", untrustedInput["jobId"] as string),
          applicationId: optionalInputEntityId("application", untrustedInput["applicationId"]),
          interactionId: optionalInputEntityId("interaction", untrustedInput["interactionId"]),
          title: requiredLabel(untrustedInput["title"], 512),
          dueAt: hasDueAt ? instant(untrustedInput["dueAt"] as string) : null,
          timeZone: hasTimeZone ? timeZone(untrustedInput["timeZone"] as string) : null,
          state: "pending",
          completedAt: null,
        };
      } catch {
        return applicationFailure(VALID_NEXT_ACTION_ERROR);
      }

      try {
        const id = entityId("next-action", dependencies.createNextActionId());
        const createdAt = instant(operationContext.initiatedAt);
        return applicationSuccess(
          copyNextAction(
            await dependencies.activity.setNextAction({
              id,
              ...parsed,
              createdAt,
              updatedAt: createdAt,
            }),
            { id, ...parsed, createdAt },
          ),
        );
      } catch (error) {
        return failureFrom<NextActionDto>(error);
      }
    },
  );

  const recordInteractionCommand = defineCommand<RecordInteractionInput, InteractionDto>(
    "RecordInteractionCommand",
    async (input, operationContext) => {
      const untrustedInput = input as unknown;
      if (!isRecord(untrustedInput)) return applicationFailure(VALID_INTERACTION_ERROR);

      let parsed: Omit<RecordInteractionPortInput, "id" | "createdAt" | "updatedAt">;
      try {
        const createdAt = instant(operationContext.initiatedAt);
        const occurredAt =
          untrustedInput["occurredAt"] === undefined
            ? createdAt
            : instant(untrustedInput["occurredAt"] as string);
        if (compareInstant(occurredAt, createdAt) > 0) {
          throw new TypeError("Recorded interactions cannot occur in the future.");
        }
        parsed = {
          jobId: entityId("job", untrustedInput["jobId"] as string),
          contactId: optionalInputEntityId("contact", untrustedInput["contactId"]),
          type: requireInteractionType(untrustedInput["type"]),
          occurredAt,
          direction: requireDirection(untrustedInput["direction"], "unknown"),
          summary: text(untrustedInput["summary"], 200_000, ""),
          nextActionAt: null,
        };
      } catch {
        return applicationFailure(VALID_INTERACTION_ERROR);
      }

      try {
        const id = entityId("interaction", dependencies.createInteractionId());
        const createdAt = instant(operationContext.initiatedAt);
        return applicationSuccess(
          copyInteraction(
            await dependencies.activity.recordInteraction({
              id,
              ...parsed,
              createdAt,
              updatedAt: createdAt,
            }),
            { id, ...parsed, createdAt },
          ),
        );
      } catch (error) {
        return failureFrom<InteractionDto>(error);
      }
    },
  );

  const scheduleInterviewCommand = defineCommand<ScheduleInterviewInput, InterviewDto>(
    "ScheduleInterviewCommand",
    async (input, operationContext) => {
      const untrustedInput = input as unknown;
      if (!isRecord(untrustedInput)) return applicationFailure(VALID_INTERVIEW_ERROR);

      let parsed: Omit<ScheduleInterviewPortInput, "id" | "createdAt" | "updatedAt">;
      try {
        const createdAt = instant(operationContext.initiatedAt);
        const startsAt = instant(untrustedInput["startsAt"] as string);
        if (compareInstant(startsAt, createdAt) <= 0) {
          throw new TypeError("Scheduled interviews must start in the future.");
        }
        parsed = {
          applicationId: entityId("application", untrustedInput["applicationId"] as string),
          stageName: requiredLabel(untrustedInput["stageName"], 256),
          startsAt,
          timeZone: timeZone(untrustedInput["timeZone"] as string),
          durationMinutes: requireDuration(untrustedInput["durationMinutes"]),
          locationOrUrl: optionalText(untrustedInput["locationOrUrl"], 8192),
          contactIds: inputContactIds(untrustedInput["contactIds"]),
          preparationNotes: text(untrustedInput["preparationNotes"], 200_000, ""),
          outcome: null,
        };
      } catch {
        return applicationFailure(VALID_INTERVIEW_ERROR);
      }

      try {
        const id = entityId("interview", dependencies.createInterviewId());
        const createdAt = instant(operationContext.initiatedAt);
        return applicationSuccess(
          copyInterview(
            await dependencies.activity.scheduleInterview({
              id,
              ...parsed,
              createdAt,
              updatedAt: createdAt,
            }),
            { id, ...parsed, createdAt },
          ),
        );
      } catch (error) {
        return failureFrom<InterviewDto>(error);
      }
    },
  );

  const scheduleReminderCommand = defineCommand<ScheduleReminderInput, ReminderDto>(
    "ScheduleReminderCommand",
    async (input, operationContext) => {
      const untrustedInput = input as unknown;
      if (!isRecord(untrustedInput)) return applicationFailure(VALID_REMINDER_ERROR);

      let parsed: Omit<ScheduleReminderPortInput, "id" | "createdAt" | "updatedAt">;
      try {
        const createdAt = instant(operationContext.initiatedAt);
        const remindAt = instant(untrustedInput["remindAt"] as string);
        if (compareInstant(remindAt, createdAt) <= 0) {
          throw new TypeError("Scheduled reminders must be in the future.");
        }
        parsed = {
          jobId: entityId("job", untrustedInput["jobId"] as string),
          nextActionId: optionalInputEntityId("next-action", untrustedInput["nextActionId"]),
          interviewId: optionalInputEntityId("interview", untrustedInput["interviewId"]),
          remindAt,
          timeZone: timeZone(untrustedInput["timeZone"] as string),
          state: "pending",
          note: optionalText(untrustedInput["note"], 200_000),
          firedAt: null,
        };
      } catch {
        return applicationFailure(VALID_REMINDER_ERROR);
      }

      try {
        const id = entityId("reminder", dependencies.createReminderId());
        const createdAt = instant(operationContext.initiatedAt);
        return applicationSuccess(
          copyReminder(
            await dependencies.activity.scheduleReminder({
              id,
              ...parsed,
              createdAt,
              updatedAt: createdAt,
            }),
            { id, ...parsed, createdAt },
          ),
        );
      } catch (error) {
        return failureFrom<ReminderDto>(error);
      }
    },
  );

  return Object.freeze({
    setNextActionCommand,
    recordInteractionCommand,
    scheduleInterviewCommand,
    scheduleReminderCommand,
  });
};
