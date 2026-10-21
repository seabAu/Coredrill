import { entityId, instant, timeZone, type EntityId, type Instant } from "@coredrill/domain";
import type { NextActionDto } from "./job-activity.js";
import { defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export interface JobNextActionsCursor {
  readonly jobId: EntityId<"job">;
  readonly includeArchived: boolean;
  readonly jobRowVersion: number;
  readonly createdAt: Instant;
  readonly id: EntityId<"next-action">;
  readonly rowVersion: number;
}
export interface JobNextActionsPageDto {
  readonly jobId: EntityId<"job">;
  readonly jobRowVersion: number;
  readonly includeArchived: boolean;
  readonly items: readonly NextActionDto[];
  readonly hasMore: boolean;
  readonly nextCursor: JobNextActionsCursor | null;
}
export interface ListJobNextActionsInput {
  readonly jobId: string;
  readonly includeArchived?: boolean;
  readonly limit?: number;
  readonly after?: JobNextActionsCursor | null;
}
export interface ListJobNextActionsPortInput {
  readonly jobId: EntityId<"job">;
  readonly includeArchived: boolean;
  readonly limit: number;
  readonly after: JobNextActionsCursor | null;
}
export interface JobNextActionsPort {
  listPage(input: ListJobNextActionsPortInput): Promise<unknown>;
}
export class JobNextActionsError extends Error {
  public override readonly name = "JobNextActionsError";
  public constructor(public readonly code: "cursor_invalidated" | "invalid_state" | "unavailable") {
    super("Local tasks could not be read.");
  }
}
const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError();
  return value as Record<string, unknown>;
};
const text = (value: unknown, max = 128): string => {
  if (typeof value !== "string" || value.length > max) throw new TypeError();
  return value;
};
const bool = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new TypeError();
  return value;
};
const version = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new TypeError();
  return value;
};
const nullableId = <Kind extends string>(kind: Kind, value: unknown): EntityId<Kind> | null =>
  value === null ? null : entityId(kind, text(value, 36));
/** Mutable task records use a job revision, not an invented immutable history snapshot. */
export const compareJobNextActions = (
  left: { readonly createdAt: Instant; readonly id: string },
  right: { readonly createdAt: Instant; readonly id: string },
): number =>
  left.createdAt === right.createdAt
    ? left.id < right.id
      ? -1
      : left.id > right.id
        ? 1
        : 0
    : left.createdAt > right.createdAt
      ? -1
      : 1;

const cursor = (value: unknown): JobNextActionsCursor => {
  const item = record(value);
  if (
    Object.keys(item).some(
      (key) =>
        !["jobId", "includeArchived", "jobRowVersion", "createdAt", "id", "rowVersion"].includes(
          key,
        ),
    )
  )
    throw new TypeError();
  return Object.freeze({
    jobId: entityId("job", text(item["jobId"], 36)),
    includeArchived: bool(item["includeArchived"]),
    jobRowVersion: version(item["jobRowVersion"]),
    createdAt: instant(text(item["createdAt"])),
    id: entityId("next-action", text(item["id"], 36)),
    rowVersion: version(item["rowVersion"]),
  });
};
const task = (value: unknown, jobId: EntityId<"job">): NextActionDto => {
  const item = record(value);
  const title = text(item["title"], 512);
  if (
    title.trim().length === 0 ||
    Array.from(title).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 31 || code === 127;
    })
  )
    throw new TypeError();
  const state = item["state"];
  if (state !== "pending" && state !== "completed" && state !== "dismissed") throw new TypeError();
  const result = Object.freeze({
    id: entityId("next-action", text(item["id"], 36)),
    jobId: entityId("job", text(item["jobId"], 36)),
    applicationId: nullableId("application", item["applicationId"]),
    interactionId: nullableId("interaction", item["interactionId"]),
    title,
    dueAt: item["dueAt"] === null ? null : instant(text(item["dueAt"])),
    timeZone: item["timeZone"] === null ? null : timeZone(text(item["timeZone"])),
    state,
    completedAt: item["completedAt"] === null ? null : instant(text(item["completedAt"])),
    createdAt: instant(text(item["createdAt"])),
    updatedAt: instant(text(item["updatedAt"])),
    rowVersion: version(item["rowVersion"]),
  });
  if (
    result.jobId !== jobId ||
    (result.dueAt === null) !== (result.timeZone === null) ||
    (result.state === "completed") !== (result.completedAt !== null) ||
    result.createdAt > result.updatedAt ||
    (result.completedAt !== null &&
      (result.completedAt < result.createdAt || result.completedAt > result.updatedAt))
  )
    throw new TypeError();
  return result;
};
const page = (value: unknown, input: ListJobNextActionsPortInput): JobNextActionsPageDto => {
  const raw = record(value);
  const jobRowVersion = version(raw["jobRowVersion"]);
  if (
    raw["jobId"] !== input.jobId ||
    raw["includeArchived"] !== input.includeArchived ||
    (input.after !== null && jobRowVersion !== input.after.jobRowVersion) ||
    !Array.isArray(raw["items"]) ||
    raw["items"].length > input.limit
  )
    throw new TypeError();
  const items = raw["items"].map((item: unknown) => task(item, input.jobId));
  let previous: { readonly createdAt: Instant; readonly id: string } | null = input.after;
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id) || (previous !== null && compareJobNextActions(previous, item) >= 0))
      throw new TypeError();
    seen.add(item.id);
    previous = item;
  }
  const hasMore = bool(raw["hasMore"]);
  const nextCursor = raw["nextCursor"] === null ? null : cursor(raw["nextCursor"]);
  const last = items.at(-1);
  if (hasMore) {
    if (
      items.length !== input.limit ||
      last === undefined ||
      nextCursor?.jobId !== input.jobId ||
      nextCursor.includeArchived !== input.includeArchived ||
      nextCursor.jobRowVersion !== jobRowVersion ||
      nextCursor.rowVersion !== last.rowVersion ||
      compareJobNextActions(last, nextCursor) !== 0
    )
      throw new TypeError();
  } else if (nextCursor !== null) throw new TypeError();
  return Object.freeze({
    jobId: input.jobId,
    includeArchived: input.includeArchived,
    jobRowVersion,
    items: Object.freeze(items),
    hasMore,
    nextCursor,
  });
};

export const createJobNextActionsQuery = (port: JobNextActionsPort) =>
  defineQuery<ListJobNextActionsInput, JobNextActionsPageDto>(
    "ListJobNextActionsQuery",
    async (untrusted, context) => {
      let input: ListJobNextActionsPortInput;
      try {
        entityId("application-operation", context.operationId);
        instant(context.initiatedAt);
        const raw = record(untrusted);
        if (
          Object.keys(raw).some(
            (key) => !["jobId", "includeArchived", "limit", "after"].includes(key),
          )
        )
          throw new TypeError();
        const jobId = entityId("job", text(raw["jobId"], 36));
        const includeArchived =
          raw["includeArchived"] === undefined ? false : bool(raw["includeArchived"]);
        const limit = raw["limit"] === undefined ? 50 : raw["limit"];
        if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
          throw new TypeError();
        const after =
          raw["after"] === undefined || raw["after"] === null ? null : cursor(raw["after"]);
        if (after !== null && (after.jobId !== jobId || after.includeArchived !== includeArchived))
          throw new TypeError();
        input = Object.freeze({ jobId, includeArchived, limit, after });
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose a valid job task page.",
          retryable: false,
        });
      }
      let result: unknown;
      try {
        result = await port.listPage(input);
      } catch (error) {
        const code =
          error instanceof JobNextActionsError && error.code === "cursor_invalidated"
            ? "conflict"
            : error instanceof JobNextActionsError && error.code === "invalid_state"
              ? "internal"
              : "unavailable";
        return applicationFailure({
          code,
          message: "Local tasks could not be read. Refresh and review their current state.",
          retryable: code !== "internal",
        });
      }
      if (result === undefined)
        return applicationFailure({
          code: "not_found",
          message: "This job is not available in the requested task scope.",
          retryable: false,
        });
      try {
        return applicationSuccess(page(result, input));
      } catch {
        return applicationFailure({
          code: "internal",
          message: "Stored tasks did not pass validation.",
          retryable: false,
        });
      }
    },
  );
