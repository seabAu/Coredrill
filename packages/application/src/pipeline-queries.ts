import {
  dateOnly,
  entityId,
  instant,
  isStatusCategory,
  timeZone,
  webUrl,
  type DateOnly,
  type EntityId,
  type Instant,
  type StatusCategory,
  type StatusDefinitionId,
  type TimeZone,
  type WebUrl,
} from "@coredrill/domain";

import { defineQuery, type ApplicationQuery } from "./operation.js";
import {
  applicationFailure,
  applicationSuccess,
  type ApplicationError,
  type ApplicationResult,
} from "./result.js";

export interface PipelineCountsDto {
  readonly asOf: Instant;
  readonly includeArchived: boolean;
  readonly all: number;
  readonly needsAction: number;
  readonly overdue: number;
  readonly upcomingInterviews: number;
  readonly waiting: number;
  readonly closed: number;
}

export interface PipelineBoardGroupDto {
  readonly statusId: StatusDefinitionId | null;
  readonly name: string;
  readonly category: StatusCategory | null;
  readonly color: string | null;
  readonly sortOrder: number;
  readonly terminal: boolean;
  readonly jobCount: number;
}

export interface PipelineCompanySummaryDto {
  readonly id: EntityId<"company">;
  readonly name: string;
}

export interface PipelineStatusSummaryDto {
  readonly id: StatusDefinitionId;
  readonly name: string;
  readonly category: StatusCategory;
  readonly color: string | null;
  readonly terminal: boolean;
}

export interface PipelineTagSummaryDto {
  readonly id: EntityId<"tag">;
  readonly name: string;
  readonly color: string | null;
}

export interface PipelineNextActionSummaryDto {
  readonly id: EntityId<"next-action">;
  readonly title: string;
  readonly dueAt: Instant | null;
}

export interface PipelineJobSummaryDto {
  readonly id: EntityId<"job">;
  readonly title: string;
  readonly company: PipelineCompanySummaryDto | null;
  readonly status: PipelineStatusSummaryDto | null;
  readonly workplaceType: string | null;
  readonly locationLabel: string | null;
  readonly datePosted: DateOnly | null;
  readonly validThrough: DateOnly | null;
  readonly nextAction: PipelineNextActionSummaryDto | null;
  readonly lastInteractionAt: Instant | null;
  readonly tags: readonly PipelineTagSummaryDto[];
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface PipelinePageCursorDto {
  readonly updatedAt: Instant;
  readonly jobId: EntityId<"job">;
}

export interface PipelineJobPageDto {
  readonly items: readonly PipelineJobSummaryDto[];
  readonly hasMore: boolean;
  readonly nextCursor: PipelinePageCursorDto | null;
}

export interface WorkspaceApplicationDto {
  readonly id: EntityId<"application">;
  readonly jobId: EntityId<"job">;
  readonly appliedAt: Instant | null;
  readonly channel: string | null;
  readonly currentStatus: PipelineStatusSummaryDto;
  readonly selectedResumeVersionId: EntityId<"document-version"> | null;
  readonly selectedCoverLetterVersionId: EntityId<"document-version"> | null;
  readonly notes: string;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}

export interface WorkspaceCompanyDto {
  readonly id: EntityId<"company">;
  readonly canonicalName: string;
  readonly websiteUrl: WebUrl | null;
  readonly domain: string | null;
  readonly notes: string;
  readonly contactCount: number;
  readonly otherActiveJobCount: number;
}

export interface WorkspacePrimarySourceDto {
  readonly id: EntityId<"job-source">;
  readonly jobId: EntityId<"job">;
  readonly canonicalUrl: WebUrl | null;
  readonly applyUrl: WebUrl | null;
  readonly firstSeenAt: Instant;
  readonly lastSeenAt: Instant;
}

export interface WorkspaceNextActionDto {
  readonly id: EntityId<"next-action">;
  readonly jobId: EntityId<"job">;
  readonly title: string;
  readonly dueAt: Instant | null;
  readonly timeZone: TimeZone | null;
}

export interface WorkspaceAttentionDto {
  readonly nextAction: WorkspaceNextActionDto | null;
  readonly lastInteractionAt: Instant | null;
  readonly upcomingInterviewCount: number;
  readonly pendingReminderCount: number;
}

export interface JobWorkspaceDto {
  readonly job: PipelineJobSummaryDto;
  readonly descriptionText: string;
  readonly employmentType: string | null;
  readonly seniority: string | null;
  readonly application: WorkspaceApplicationDto | null;
  readonly company: WorkspaceCompanyDto | null;
  readonly primarySource: WorkspacePrimarySourceDto | null;
  readonly attention: WorkspaceAttentionDto;
  readonly timelineItemCount: number;
}

export interface PipelineScopeInput {
  readonly includeArchived?: boolean;
}

export interface PipelinePageCursorInput {
  readonly updatedAt: string;
  readonly jobId: string;
}

export interface ListPipelineJobsInput extends PipelineScopeInput {
  readonly after?: PipelinePageCursorInput | null;
  readonly limit?: number;
  /** Omitted lists all jobs; null selects the explicit unassigned board group. */
  readonly statusId?: string | null;
}

export interface GetJobWorkspaceInput {
  readonly jobId: string;
}

export interface GetPipelineCountsPortInput {
  readonly asOf: Instant;
  readonly includeArchived: boolean;
}

export interface ListPipelineBoardGroupsPortInput {
  readonly includeArchived: boolean;
}

export type PipelineStatusFilter =
  | { readonly kind: "all" }
  | { readonly kind: "unassigned" }
  | { readonly kind: "status"; readonly statusId: StatusDefinitionId };

export interface ListPipelineJobsPortInput {
  readonly after: PipelinePageCursorDto | null;
  readonly includeArchived: boolean;
  readonly limit: number;
  readonly statusFilter: PipelineStatusFilter;
}

export interface GetJobWorkspacePortInput {
  readonly jobId: EntityId<"job">;
  readonly asOf: Instant;
}

/** Read-only local projection boundary. It has no network or mutation capability. */
export interface PipelineQueryPort {
  getCounts(input: GetPipelineCountsPortInput): Promise<PipelineCountsDto>;
  listBoardGroups(
    input: ListPipelineBoardGroupsPortInput,
  ): Promise<readonly PipelineBoardGroupDto[]>;
  listJobsPage(input: ListPipelineJobsPortInput): Promise<PipelineJobPageDto>;
  getJobWorkspace(input: GetJobWorkspacePortInput): Promise<JobWorkspaceDto | undefined>;
}

export const PIPELINE_QUERY_ERROR_CODES = [
  "not_found",
  "cursor_invalidated",
  "busy",
  "unavailable",
  "permission_denied",
  "invalid_state",
] as const;
export type PipelineQueryErrorCode = (typeof PIPELINE_QUERY_ERROR_CODES)[number];

/** Content-free typed failure for implementations of PipelineQueryPort. */
export class PipelineQueryError extends Error {
  public readonly code: PipelineQueryErrorCode;

  public constructor(code: PipelineQueryErrorCode) {
    if (!PIPELINE_QUERY_ERROR_CODES.includes(code)) {
      throw new TypeError("Pipeline query failures require a reviewed stable code.");
    }
    super("The pipeline query port reported a failure.");
    this.name = "PipelineQueryError";
    this.code = code;
  }
}

export interface PipelineQueryOperationDependencies {
  readonly pipelineQueries: PipelineQueryPort;
}

export interface PipelineQueryOperations {
  readonly getPipelineCountsQuery: ApplicationQuery<PipelineScopeInput, PipelineCountsDto>;
  readonly getPipelineBoardGroupsQuery: ApplicationQuery<
    PipelineScopeInput,
    readonly PipelineBoardGroupDto[]
  >;
  readonly listPipelineJobsQuery: ApplicationQuery<ListPipelineJobsInput, PipelineJobPageDto>;
  readonly getJobWorkspaceQuery: ApplicationQuery<GetJobWorkspaceInput, JobWorkspaceDto>;
}

const VALID_SCOPE_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Choose a valid local pipeline scope.",
  retryable: false,
});
const VALID_PAGE_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Choose valid local pipeline pagination details.",
  retryable: false,
});
const VALID_WORKSPACE_ERROR: ApplicationError = Object.freeze({
  code: "validation",
  message: "Choose a valid local job workspace.",
  retryable: false,
});
const WORKSPACE_NOT_FOUND_ERROR: ApplicationError = Object.freeze({
  code: "not_found",
  message: "The requested local job workspace was not found.",
  retryable: false,
});
const UNKNOWN_PIPELINE_QUERY_ERROR: ApplicationError = Object.freeze({
  code: "internal",
  message: "The local pipeline query failed safely.",
  retryable: false,
});

const PIPELINE_QUERY_ERRORS: Readonly<Record<PipelineQueryErrorCode, ApplicationError>> =
  Object.freeze({
    not_found: Object.freeze({
      code: "not_found",
      message: "The requested local pipeline data was not found.",
      retryable: false,
    }),
    cursor_invalidated: Object.freeze({
      code: "conflict",
      message: "The pipeline changed. Refresh this page.",
      retryable: true,
    }),
    busy: Object.freeze({
      code: "conflict",
      message: "The local pipeline store is busy. Retry shortly.",
      retryable: true,
    }),
    unavailable: Object.freeze({
      code: "unavailable",
      message: "Local pipeline storage is unavailable.",
      retryable: true,
    }),
    permission_denied: Object.freeze({
      code: "permission_denied",
      message: "Coredrill cannot read local pipeline storage.",
      retryable: true,
    }),
    invalid_state: Object.freeze({
      code: "internal",
      message: "The local pipeline query state is not usable.",
      retryable: false,
    }),
  });

const MAXIMUM_PAGE_SIZE = 100;
const DEFAULT_PAGE_SIZE = 50;
const DOMAIN_LABEL_PATTERN = /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u;

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const hasControlCharacter = (value: string): boolean => {
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (codePoint <= 0x1f || codePoint === 0x7f) return true;
  }
  return false;
};

const requiredText = (value: unknown, maximum: number): string => {
  if (
    typeof value !== "string" ||
    value.trim().length === 0 ||
    value.length > maximum ||
    hasControlCharacter(value)
  ) {
    throw new TypeError("Invalid pipeline query text.");
  }
  return value;
};

const nullableText = (value: unknown, maximum: number): string | null => {
  if (value === undefined) throw new TypeError("Missing nullable pipeline query text.");
  return value === null ? null : requiredText(value, maximum);
};

const notesText = (value: unknown, maximum = 200_000): string => {
  if (typeof value !== "string" || value.length > maximum || value.includes("\u0000")) {
    throw new TypeError("Invalid pipeline query notes.");
  }
  return value;
};

const nonnegativeInteger = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) {
    throw new TypeError("Pipeline query count must be a nonnegative safe integer.");
  }
  return value;
};

const positiveInteger = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) {
    throw new TypeError("Pipeline query row version must be a positive safe integer.");
  }
  return value;
};

const booleanValue = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new TypeError("Invalid pipeline query boolean.");
  return value;
};

const nullableEntityId = <Entity extends string>(
  entityType: Entity,
  value: unknown,
): EntityId<Entity> | null => (value === null ? null : entityId(entityType, value as string));

const nullableInstant = (value: unknown): Instant | null =>
  value === null ? null : instant(value as string);

const nullableDate = (value: unknown): DateOnly | null =>
  value === null ? null : dateOnly(value as string);

const nullableWebUrl = (value: unknown): WebUrl | null =>
  value === null ? null : webUrl(value as string);

const nullableTimeZone = (value: unknown): TimeZone | null =>
  value === null ? null : timeZone(value as string);

const includeArchivedScope = (value: unknown): boolean => {
  if (value === undefined) return false;
  return booleanValue(value);
};

const pageSize = (value: unknown): number => {
  if (value === undefined) return DEFAULT_PAGE_SIZE;
  const parsed = positiveInteger(value);
  if (parsed > MAXIMUM_PAGE_SIZE) throw new TypeError("Pipeline page is too large.");
  return parsed;
};

const compareInstant = (left: Instant, right: Instant): number => left.localeCompare(right);

const assertAuditOrder = (
  createdAt: Instant,
  updatedAt: Instant,
  archivedAt: Instant | null = null,
): void => {
  if (
    compareInstant(updatedAt, createdAt) < 0 ||
    (archivedAt !== null && compareInstant(archivedAt, createdAt) < 0)
  ) {
    throw new TypeError("Pipeline audit timestamps are inverted.");
  }
};

const copyStatus = (value: unknown): PipelineStatusSummaryDto => {
  if (!isRecord(value) || !isStatusCategory(value["category"])) {
    throw new TypeError("Invalid pipeline status summary.");
  }
  return Object.freeze({
    id: entityId("status_definition", value["id"] as string),
    name: requiredText(value["name"], 80),
    category: value["category"],
    color: nullableText(value["color"], 64),
    terminal: booleanValue(value["terminal"]),
  });
};

const copyCompanySummary = (value: unknown): PipelineCompanySummaryDto => {
  if (!isRecord(value)) throw new TypeError("Invalid pipeline company summary.");
  return Object.freeze({
    id: entityId("company", value["id"] as string),
    name: requiredText(value["name"], 512),
  });
};

const copyTag = (value: unknown): PipelineTagSummaryDto => {
  if (!isRecord(value)) throw new TypeError("Invalid pipeline tag summary.");
  return Object.freeze({
    id: entityId("tag", value["id"] as string),
    name: requiredText(value["name"], 80),
    color: nullableText(value["color"], 64),
  });
};

const copyNextActionSummary = (value: unknown): PipelineNextActionSummaryDto => {
  if (!isRecord(value)) throw new TypeError("Invalid next-action summary.");
  return Object.freeze({
    id: entityId("next-action", value["id"] as string),
    title: requiredText(value["title"], 512),
    dueAt: nullableInstant(value["dueAt"]),
  });
};

const copyJobSummary = (value: unknown): PipelineJobSummaryDto => {
  if (!isRecord(value) || !Array.isArray(value["tags"])) {
    throw new TypeError("Invalid pipeline job summary.");
  }
  if (value["tags"].length > 256) throw new TypeError("Pipeline job has too many tags.");
  const tags = value["tags"].map(copyTag);
  const tagIds = new Set(tags.map((tag) => tag.id));
  if (tagIds.size !== tags.length) throw new TypeError("Pipeline job tags must be unique.");
  const createdAt = instant(value["createdAt"] as string);
  const updatedAt = instant(value["updatedAt"] as string);
  const archivedAt = nullableInstant(value["archivedAt"]);
  assertAuditOrder(createdAt, updatedAt, archivedAt);
  const datePosted = nullableDate(value["datePosted"]);
  const validThrough = nullableDate(value["validThrough"]);
  if (datePosted !== null && validThrough !== null && datePosted > validThrough) {
    throw new TypeError("Pipeline job dates are inverted.");
  }
  return Object.freeze({
    id: entityId("job", value["id"] as string),
    title: requiredText(value["title"], 1024),
    company: value["company"] === null ? null : copyCompanySummary(value["company"]),
    status: value["status"] === null ? null : copyStatus(value["status"]),
    workplaceType: nullableText(value["workplaceType"], 128),
    locationLabel: nullableText(value["locationLabel"], 512),
    datePosted,
    validThrough,
    nextAction: value["nextAction"] === null ? null : copyNextActionSummary(value["nextAction"]),
    lastInteractionAt: nullableInstant(value["lastInteractionAt"]),
    tags: Object.freeze(tags),
    archivedAt,
    createdAt,
    updatedAt,
    rowVersion: positiveInteger(value["rowVersion"]),
  });
};

const copyCounts = (value: unknown, expected: GetPipelineCountsPortInput): PipelineCountsDto => {
  if (!isRecord(value)) throw new TypeError("Invalid pipeline counts.");
  const copied: PipelineCountsDto = Object.freeze({
    asOf: instant(value["asOf"] as string),
    includeArchived: booleanValue(value["includeArchived"]),
    all: nonnegativeInteger(value["all"]),
    needsAction: nonnegativeInteger(value["needsAction"]),
    overdue: nonnegativeInteger(value["overdue"]),
    upcomingInterviews: nonnegativeInteger(value["upcomingInterviews"]),
    waiting: nonnegativeInteger(value["waiting"]),
    closed: nonnegativeInteger(value["closed"]),
  });
  if (
    copied.asOf !== expected.asOf ||
    copied.includeArchived !== expected.includeArchived ||
    copied.needsAction > copied.all ||
    copied.overdue > copied.needsAction ||
    copied.upcomingInterviews > copied.all ||
    copied.waiting > copied.all ||
    copied.closed > copied.all
  ) {
    throw new TypeError("Pipeline counts do not match the requested scope.");
  }
  return copied;
};

const copyBoardGroups = (value: unknown): readonly PipelineBoardGroupDto[] => {
  if (!Array.isArray(value)) throw new TypeError("Invalid pipeline board groups.");
  const groups = value.map((candidate): PipelineBoardGroupDto => {
    if (!isRecord(candidate)) throw new TypeError("Invalid pipeline board group.");
    const statusId = nullableEntityId("status_definition", candidate["statusId"]);
    const category = candidate["category"];
    if (category !== null && !isStatusCategory(category)) {
      throw new TypeError("Invalid board-group category.");
    }
    const terminal = booleanValue(candidate["terminal"]);
    if (statusId === null && (category !== null || terminal)) {
      throw new TypeError("Unassigned board group cannot claim status semantics.");
    }
    return Object.freeze({
      statusId,
      name: requiredText(candidate["name"], 80),
      category,
      color: nullableText(candidate["color"], 64),
      sortOrder: nonnegativeInteger(candidate["sortOrder"]),
      terminal,
      jobCount: nonnegativeInteger(candidate["jobCount"]),
    });
  });
  const keys = new Set(groups.map((group) => group.statusId ?? "unassigned"));
  if (keys.size !== groups.length) throw new TypeError("Pipeline board groups must be unique.");
  for (let index = 1; index < groups.length; index += 1) {
    const previous = groups[index - 1];
    const current = groups[index];
    if (
      previous === undefined ||
      current === undefined ||
      previous.sortOrder > current.sortOrder ||
      (previous.sortOrder === current.sortOrder &&
        (previous.statusId ?? "") >= (current.statusId ?? ""))
    ) {
      throw new TypeError("Pipeline board groups are not in stable configured order.");
    }
  }
  return Object.freeze(groups);
};

const copyCursor = (value: unknown): PipelinePageCursorDto => {
  if (!isRecord(value)) throw new TypeError("Invalid pipeline page cursor.");
  return Object.freeze({
    updatedAt: instant(value["updatedAt"] as string),
    jobId: entityId("job", value["jobId"] as string),
  });
};

const parseCursorInput = (value: unknown): PipelinePageCursorDto | null => {
  if (value === undefined || value === null) return null;
  return copyCursor(value);
};

const statusFilterFrom = (input: Readonly<Record<string, unknown>>): PipelineStatusFilter => {
  if (!Object.hasOwn(input, "statusId")) return Object.freeze({ kind: "all" });
  if (input["statusId"] === null) return Object.freeze({ kind: "unassigned" });
  return Object.freeze({
    kind: "status",
    statusId: entityId("status_definition", input["statusId"] as string),
  });
};

const isAfterCursor = (item: PipelineJobSummaryDto, cursor: PipelinePageCursorDto): boolean =>
  item.updatedAt < cursor.updatedAt ||
  (item.updatedAt === cursor.updatedAt && item.id > cursor.jobId);

const assertPageOrder = (items: readonly PipelineJobSummaryDto[]): void => {
  for (let index = 1; index < items.length; index += 1) {
    const previous = items[index - 1];
    const current = items[index];
    if (
      previous === undefined ||
      current === undefined ||
      previous.updatedAt < current.updatedAt ||
      (previous.updatedAt === current.updatedAt && previous.id >= current.id)
    ) {
      throw new TypeError("Pipeline jobs are not in stable keyset order.");
    }
  }
};

const copyJobPage = (value: unknown, expected: ListPipelineJobsPortInput): PipelineJobPageDto => {
  if (!isRecord(value) || !Array.isArray(value["items"])) {
    throw new TypeError("Invalid pipeline page.");
  }
  if (value["items"].length > expected.limit) throw new TypeError("Pipeline page exceeds limit.");
  const items = value["items"].map(copyJobSummary);
  const ids = new Set(items.map((item) => item.id));
  if (ids.size !== items.length) throw new TypeError("Pipeline page contains duplicate jobs.");
  assertPageOrder(items);
  const after = expected.after;
  if (after !== null && items.some((item) => !isAfterCursor(item, after))) {
    throw new TypeError("Pipeline page does not follow its cursor.");
  }
  for (const item of items) {
    if (!expected.includeArchived && item.archivedAt !== null) {
      throw new TypeError("Pipeline page returned an archived job outside its scope.");
    }
    if (expected.statusFilter.kind === "unassigned" && item.status !== null) {
      throw new TypeError("Pipeline page returned a job outside the unassigned group.");
    }
    if (
      expected.statusFilter.kind === "status" &&
      item.status?.id !== expected.statusFilter.statusId
    ) {
      throw new TypeError("Pipeline page returned a job outside the requested status group.");
    }
  }
  const hasMore = booleanValue(value["hasMore"]);
  const nextCursor = value["nextCursor"] === null ? null : copyCursor(value["nextCursor"]);
  if (!hasMore) {
    if (nextCursor !== null) throw new TypeError("Final pipeline page cannot carry a cursor.");
  } else {
    const last = items.at(-1);
    if (
      last === undefined ||
      nextCursor?.updatedAt !== last.updatedAt ||
      nextCursor.jobId !== last.id
    ) {
      throw new TypeError("Pipeline next cursor must identify the final returned job.");
    }
  }
  return Object.freeze({
    items: Object.freeze(items),
    hasMore,
    nextCursor,
  });
};

const canonicalDomain = (value: unknown): string | null => {
  if (value === null) return null;
  if (
    typeof value !== "string" ||
    value !== value.trim() ||
    value.length === 0 ||
    value.length > 253
  ) {
    throw new TypeError("Invalid workspace company domain.");
  }
  const normalized = value.toLowerCase();
  if (normalized.split(".").some((label) => !DOMAIN_LABEL_PATTERN.test(label))) {
    throw new TypeError("Invalid workspace company domain.");
  }
  return normalized;
};

const copyWorkspaceApplication = (value: unknown): WorkspaceApplicationDto => {
  if (!isRecord(value)) throw new TypeError("Invalid workspace application.");
  const createdAt = instant(value["createdAt"] as string);
  const updatedAt = instant(value["updatedAt"] as string);
  assertAuditOrder(createdAt, updatedAt);
  return Object.freeze({
    id: entityId("application", value["id"] as string),
    jobId: entityId("job", value["jobId"] as string),
    appliedAt: nullableInstant(value["appliedAt"]),
    channel: nullableText(value["channel"], 128),
    currentStatus: copyStatus(value["currentStatus"]),
    selectedResumeVersionId: nullableEntityId("document-version", value["selectedResumeVersionId"]),
    selectedCoverLetterVersionId: nullableEntityId(
      "document-version",
      value["selectedCoverLetterVersionId"],
    ),
    notes: notesText(value["notes"]),
    createdAt,
    updatedAt,
    rowVersion: positiveInteger(value["rowVersion"]),
  });
};

const copyWorkspaceCompany = (value: unknown): WorkspaceCompanyDto => {
  if (!isRecord(value)) throw new TypeError("Invalid workspace company.");
  return Object.freeze({
    id: entityId("company", value["id"] as string),
    canonicalName: requiredText(value["canonicalName"], 512),
    websiteUrl: nullableWebUrl(value["websiteUrl"]),
    domain: canonicalDomain(value["domain"]),
    notes: notesText(value["notes"]),
    contactCount: nonnegativeInteger(value["contactCount"]),
    otherActiveJobCount: nonnegativeInteger(value["otherActiveJobCount"]),
  });
};

const copyWorkspaceSource = (value: unknown): WorkspacePrimarySourceDto => {
  if (!isRecord(value)) throw new TypeError("Invalid workspace source.");
  const firstSeenAt = instant(value["firstSeenAt"] as string);
  const lastSeenAt = instant(value["lastSeenAt"] as string);
  if (compareInstant(lastSeenAt, firstSeenAt) < 0) {
    throw new TypeError("Workspace source timestamps are inverted.");
  }
  return Object.freeze({
    id: entityId("job-source", value["id"] as string),
    jobId: entityId("job", value["jobId"] as string),
    canonicalUrl: nullableWebUrl(value["canonicalUrl"]),
    applyUrl: nullableWebUrl(value["applyUrl"]),
    firstSeenAt,
    lastSeenAt,
  });
};

const copyWorkspaceNextAction = (value: unknown): WorkspaceNextActionDto => {
  if (!isRecord(value)) throw new TypeError("Invalid workspace next action.");
  const dueAt = nullableInstant(value["dueAt"]);
  const zone = nullableTimeZone(value["timeZone"]);
  if ((dueAt === null) !== (zone === null)) {
    throw new TypeError("Workspace next-action schedule is incomplete.");
  }
  return Object.freeze({
    id: entityId("next-action", value["id"] as string),
    jobId: entityId("job", value["jobId"] as string),
    title: requiredText(value["title"], 512),
    dueAt,
    timeZone: zone,
  });
};

const copyWorkspaceAttention = (value: unknown): WorkspaceAttentionDto => {
  if (!isRecord(value)) throw new TypeError("Invalid workspace attention summary.");
  return Object.freeze({
    nextAction: value["nextAction"] === null ? null : copyWorkspaceNextAction(value["nextAction"]),
    lastInteractionAt: nullableInstant(value["lastInteractionAt"]),
    upcomingInterviewCount: nonnegativeInteger(value["upcomingInterviewCount"]),
    pendingReminderCount: nonnegativeInteger(value["pendingReminderCount"]),
  });
};

const copyJobWorkspace = (value: unknown, expected: GetJobWorkspacePortInput): JobWorkspaceDto => {
  if (!isRecord(value)) throw new TypeError("Invalid job workspace.");
  const job = copyJobSummary(value["job"]);
  const application =
    value["application"] === null ? null : copyWorkspaceApplication(value["application"]);
  const company = value["company"] === null ? null : copyWorkspaceCompany(value["company"]);
  const primarySource =
    value["primarySource"] === null ? null : copyWorkspaceSource(value["primarySource"]);
  const attention = copyWorkspaceAttention(value["attention"]);
  if (
    job.id !== expected.jobId ||
    compareInstant(job.updatedAt, expected.asOf) > 0 ||
    (application?.jobId !== undefined && application.jobId !== job.id) ||
    (application !== null && application.currentStatus.id !== job.status?.id) ||
    (application?.appliedAt !== null &&
      application?.appliedAt !== undefined &&
      compareInstant(application.appliedAt, expected.asOf) > 0) ||
    (application !== null && compareInstant(application.updatedAt, expected.asOf) > 0) ||
    (job.company === null ? company !== null : company?.id !== job.company.id) ||
    (job.company !== null && company?.canonicalName !== job.company.name) ||
    (primarySource !== null && primarySource.jobId !== job.id) ||
    (primarySource !== null && compareInstant(primarySource.lastSeenAt, expected.asOf) > 0) ||
    (attention.nextAction !== null && attention.nextAction.jobId !== job.id) ||
    attention.lastInteractionAt !== job.lastInteractionAt ||
    (attention.lastInteractionAt !== null &&
      compareInstant(attention.lastInteractionAt, expected.asOf) > 0) ||
    (job.nextAction === null
      ? attention.nextAction !== null
      : attention.nextAction?.id !== job.nextAction.id ||
        attention.nextAction.title !== job.nextAction.title ||
        attention.nextAction.dueAt !== job.nextAction.dueAt)
  ) {
    throw new TypeError("Job workspace records are not linked consistently.");
  }
  return Object.freeze({
    job,
    descriptionText: notesText(value["descriptionText"], 2_000_000),
    employmentType: nullableText(value["employmentType"], 128),
    seniority: nullableText(value["seniority"], 128),
    application,
    company,
    primarySource,
    attention,
    timelineItemCount: nonnegativeInteger(value["timelineItemCount"]),
  });
};

const failureFrom = <Value>(error: unknown): ApplicationResult<Value> =>
  applicationFailure(
    error instanceof PipelineQueryError
      ? PIPELINE_QUERY_ERRORS[error.code]
      : UNKNOWN_PIPELINE_QUERY_ERROR,
  );

export const createPipelineQueryOperations = (
  dependencies: PipelineQueryOperationDependencies,
): PipelineQueryOperations => {
  const untrustedDependencies = dependencies as unknown;
  if (
    !isRecord(untrustedDependencies) ||
    !isRecord(untrustedDependencies["pipelineQueries"]) ||
    typeof untrustedDependencies["pipelineQueries"]["getCounts"] !== "function" ||
    typeof untrustedDependencies["pipelineQueries"]["listBoardGroups"] !== "function" ||
    typeof untrustedDependencies["pipelineQueries"]["listJobsPage"] !== "function" ||
    typeof untrustedDependencies["pipelineQueries"]["getJobWorkspace"] !== "function"
  ) {
    throw new TypeError("Pipeline query operations require a complete local read port.");
  }

  const getPipelineCountsQuery = defineQuery<PipelineScopeInput, PipelineCountsDto>(
    "GetPipelineCountsQuery",
    async (input, operationContext) => {
      const untrustedInput = input as unknown;
      if (!isRecord(untrustedInput)) return applicationFailure(VALID_SCOPE_ERROR);
      let portInput: GetPipelineCountsPortInput;
      try {
        portInput = {
          asOf: instant(operationContext.initiatedAt),
          includeArchived: includeArchivedScope(untrustedInput["includeArchived"]),
        };
      } catch {
        return applicationFailure(VALID_SCOPE_ERROR);
      }
      try {
        return applicationSuccess(
          copyCounts(await dependencies.pipelineQueries.getCounts(portInput), portInput),
        );
      } catch (error) {
        return failureFrom<PipelineCountsDto>(error);
      }
    },
  );

  const getPipelineBoardGroupsQuery = defineQuery<
    PipelineScopeInput,
    readonly PipelineBoardGroupDto[]
  >("GetPipelineBoardGroupsQuery", async (input) => {
    const untrustedInput = input as unknown;
    if (!isRecord(untrustedInput)) return applicationFailure(VALID_SCOPE_ERROR);
    let portInput: ListPipelineBoardGroupsPortInput;
    try {
      portInput = {
        includeArchived: includeArchivedScope(untrustedInput["includeArchived"]),
      };
    } catch {
      return applicationFailure(VALID_SCOPE_ERROR);
    }
    try {
      return applicationSuccess(
        copyBoardGroups(await dependencies.pipelineQueries.listBoardGroups(portInput)),
      );
    } catch (error) {
      return failureFrom<readonly PipelineBoardGroupDto[]>(error);
    }
  });

  const listPipelineJobsQuery = defineQuery<ListPipelineJobsInput, PipelineJobPageDto>(
    "ListPipelineJobsQuery",
    async (input) => {
      const untrustedInput = input as unknown;
      if (!isRecord(untrustedInput)) return applicationFailure(VALID_PAGE_ERROR);
      let portInput: ListPipelineJobsPortInput;
      try {
        portInput = {
          after: parseCursorInput(untrustedInput["after"]),
          includeArchived: includeArchivedScope(untrustedInput["includeArchived"]),
          limit: pageSize(untrustedInput["limit"]),
          statusFilter: statusFilterFrom(untrustedInput),
        };
      } catch {
        return applicationFailure(VALID_PAGE_ERROR);
      }
      try {
        return applicationSuccess(
          copyJobPage(await dependencies.pipelineQueries.listJobsPage(portInput), portInput),
        );
      } catch (error) {
        return failureFrom<PipelineJobPageDto>(error);
      }
    },
  );

  const getJobWorkspaceQuery = defineQuery<GetJobWorkspaceInput, JobWorkspaceDto>(
    "GetJobWorkspaceQuery",
    async (input, operationContext) => {
      const untrustedInput = input as unknown;
      if (!isRecord(untrustedInput)) return applicationFailure(VALID_WORKSPACE_ERROR);
      let portInput: GetJobWorkspacePortInput;
      try {
        portInput = {
          jobId: entityId("job", untrustedInput["jobId"] as string),
          asOf: instant(operationContext.initiatedAt),
        };
      } catch {
        return applicationFailure(VALID_WORKSPACE_ERROR);
      }
      try {
        const value = await dependencies.pipelineQueries.getJobWorkspace(portInput);
        if (value === undefined) return applicationFailure(WORKSPACE_NOT_FOUND_ERROR);
        return applicationSuccess(copyJobWorkspace(value, portInput));
      } catch (error) {
        return failureFrom<JobWorkspaceDto>(error);
      }
    },
  );

  return Object.freeze({
    getPipelineCountsQuery,
    getPipelineBoardGroupsQuery,
    listPipelineJobsQuery,
    getJobWorkspaceQuery,
  });
};
