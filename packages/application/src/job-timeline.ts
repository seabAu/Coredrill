import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";
import { defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export type JobTimelineKind = "interaction" | "status";
export interface JobTimelineCursor {
  readonly jobId: EntityId<"job">;
  readonly includeArchived: boolean;
  readonly asOf: Instant;
  readonly occurredAt: Instant;
  readonly kind: JobTimelineKind;
  readonly id: string;
}
interface TimelineItemBase {
  readonly id: string;
  readonly jobId: EntityId<"job">;
  readonly occurredAt: Instant;
  readonly createdAt: Instant;
}
export interface TimelineStatusLabel {
  readonly id: EntityId<"status_definition">;
  /** Current stored label; not an invented historical label snapshot. */
  readonly name: string;
}
export type JobTimelineItemDto =
  | (TimelineItemBase & {
      readonly kind: "status";
      readonly applicationId: EntityId<"application"> | null;
      readonly fromStatus: TimelineStatusLabel | null;
      readonly toStatus: TimelineStatusLabel;
      readonly note: string | null;
      /** A recorded reversal, not deletion of the original event. */
      readonly undoneAt: Instant | null;
    })
  | (TimelineItemBase & {
      readonly kind: "interaction";
      readonly contactId: EntityId<"contact"> | null;
      readonly type: string;
      readonly direction: "inbound" | "outbound" | "mutual" | "unknown";
      readonly summary: string;
    });
export interface JobTimelinePageDto {
  readonly jobId: EntityId<"job">;
  readonly asOf: Instant;
  readonly includeArchived: boolean;
  readonly items: readonly JobTimelineItemDto[];
  readonly hasMore: boolean;
  readonly nextCursor: JobTimelineCursor | null;
}
export interface ListJobTimelineInput {
  readonly jobId: string;
  readonly includeArchived?: boolean;
  readonly limit?: number;
  readonly after?: JobTimelineCursor | null;
}
export interface ListJobTimelinePortInput {
  readonly jobId: EntityId<"job">;
  readonly includeArchived: boolean;
  readonly asOf: Instant;
  readonly limit: number;
  readonly after: JobTimelineCursor | null;
}
export interface JobTimelinePort {
  listPage(input: ListJobTimelinePortInput): Promise<JobTimelinePageDto | undefined>;
}
export class JobTimelineError extends Error {
  public constructor(public readonly code: "cursor_invalidated" | "invalid_state" | "unavailable") {
    super("Local job history could not be read.");
    this.name = "JobTimelineError";
  }
}
const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError();
  return value as Record<string, unknown>;
};
const text = (value: unknown, maximum = 200_000): string => {
  if (typeof value !== "string" || value.length > maximum) throw new TypeError();
  return value;
};
const bool = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new TypeError();
  return value;
};
const kind = (value: unknown): JobTimelineKind => {
  if (value !== "interaction" && value !== "status") throw new TypeError();
  return value;
};
const nullableId = <Kind extends string>(type: Kind, value: unknown): EntityId<Kind> | null =>
  value === null ? null : entityId(type, text(value, 36));
const tuple = (value: { occurredAt: Instant; kind: JobTimelineKind; id: string }): string =>
  `${value.kind}:${value.id}`;
/** Newest instant first, then explicit kind and UUID lexical order. */
export const compareJobTimelineItems = (
  left: { occurredAt: Instant; kind: JobTimelineKind; id: string },
  right: { occurredAt: Instant; kind: JobTimelineKind; id: string },
): number =>
  left.occurredAt === right.occurredAt
    ? tuple(left) < tuple(right)
      ? -1
      : tuple(left) > tuple(right)
        ? 1
        : 0
    : left.occurredAt > right.occurredAt
      ? -1
      : 1;
const copyCursor = (value: unknown): JobTimelineCursor => {
  const input = record(value);
  const itemKind = kind(input["kind"]);
  return Object.freeze({
    jobId: entityId("job", text(input["jobId"], 36)),
    includeArchived: bool(input["includeArchived"]),
    asOf: instant(text(input["asOf"])),
    occurredAt: instant(text(input["occurredAt"])),
    kind: itemKind,
    id: entityId(itemKind === "status" ? "status-event" : "interaction", text(input["id"], 36)),
  });
};
const label = (value: unknown): TimelineStatusLabel => {
  const input = record(value);
  const name = text(input["name"], 128);
  if (name.trim().length === 0) throw new TypeError();
  return Object.freeze({ id: entityId("status_definition", text(input["id"], 36)), name });
};
const copyItem = (value: unknown, input: ListJobTimelinePortInput): JobTimelineItemDto => {
  const item = record(value);
  const itemKind = kind(item["kind"]);
  const base = {
    id: entityId(itemKind === "status" ? "status-event" : "interaction", text(item["id"], 36)),
    jobId: entityId("job", text(item["jobId"], 36)),
    occurredAt: instant(text(item["occurredAt"])),
    createdAt: instant(text(item["createdAt"])),
  };
  if (
    base.jobId !== input.jobId ||
    base.occurredAt > input.asOf ||
    base.createdAt > input.asOf ||
    base.occurredAt > base.createdAt
  )
    throw new TypeError();
  if (itemKind === "interaction") {
    const direction = item["direction"];
    if (
      direction !== "inbound" &&
      direction !== "outbound" &&
      direction !== "mutual" &&
      direction !== "unknown"
    )
      throw new TypeError();
    const type = text(item["type"], 128);
    if (!/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u.test(type)) throw new TypeError();
    return Object.freeze({
      ...base,
      kind: itemKind,
      contactId: nullableId("contact", item["contactId"]),
      type,
      direction,
      summary: text(item["summary"]),
    });
  }
  const fromStatus = item["fromStatus"] === null ? null : label(item["fromStatus"]);
  const toStatus = label(item["toStatus"]);
  const undoneAt = item["undoneAt"] === null ? null : instant(text(item["undoneAt"]));
  if (
    fromStatus?.id === toStatus.id ||
    (undoneAt !== null && (undoneAt < base.createdAt || undoneAt > input.asOf))
  )
    throw new TypeError();
  return Object.freeze({
    ...base,
    kind: itemKind,
    applicationId: nullableId("application", item["applicationId"]),
    fromStatus,
    toStatus,
    note: item["note"] === null ? null : text(item["note"]),
    undoneAt,
  });
};
const copyPage = (value: unknown, input: ListJobTimelinePortInput): JobTimelinePageDto => {
  const page = record(value);
  if (
    page["jobId"] !== input.jobId ||
    page["asOf"] !== input.asOf ||
    page["includeArchived"] !== input.includeArchived ||
    !Array.isArray(page["items"]) ||
    page["items"].length > input.limit
  )
    throw new TypeError();
  const items = page["items"].map((item: unknown) => copyItem(item, input));
  const seen = new Set<string>();
  let previous = input.after;
  for (const item of items) {
    if (
      seen.has(tuple(item)) ||
      (previous !== null && compareJobTimelineItems(previous, item) >= 0)
    )
      throw new TypeError();
    seen.add(tuple(item));
    previous = { ...input, ...item };
  }
  const hasMore = bool(page["hasMore"]);
  const nextCursor = page["nextCursor"] === null ? null : copyCursor(page["nextCursor"]);
  const last = items.at(-1);
  if (hasMore) {
    if (
      items.length !== input.limit ||
      last === undefined ||
      nextCursor?.jobId !== input.jobId ||
      nextCursor.asOf !== input.asOf ||
      nextCursor.includeArchived !== input.includeArchived ||
      compareJobTimelineItems(last, nextCursor) !== 0
    )
      throw new TypeError();
  } else if (nextCursor !== null) throw new TypeError();
  return Object.freeze({
    jobId: input.jobId,
    asOf: input.asOf,
    includeArchived: input.includeArchived,
    items: Object.freeze(items),
    hasMore,
    nextCursor,
  });
};

export const createJobTimelineQuery = (port: JobTimelinePort) =>
  defineQuery<ListJobTimelineInput, JobTimelinePageDto>(
    "ListJobTimelineQuery",
    async (untrusted, context) => {
      let input: ListJobTimelinePortInput;
      try {
        entityId("application-operation", context.operationId);
        const now = instant(context.initiatedAt);
        const request = record(untrusted);
        const jobId = entityId("job", text(request["jobId"], 36));
        const includeArchived =
          request["includeArchived"] === undefined ? false : bool(request["includeArchived"]);
        const limit = request["limit"] === undefined ? 50 : request["limit"];
        if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
          throw new TypeError();
        const after =
          request["after"] === undefined || request["after"] === null
            ? null
            : copyCursor(request["after"]);
        if (
          after !== null &&
          (after.jobId !== jobId ||
            after.includeArchived !== includeArchived ||
            after.asOf > now ||
            after.occurredAt > after.asOf)
        )
          throw new TypeError();
        input = Object.freeze({ jobId, includeArchived, limit, after, asOf: after?.asOf ?? now });
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose a valid job history page.",
          retryable: false,
        });
      }
      let result: JobTimelinePageDto | undefined;
      try {
        result = await port.listPage(input);
      } catch (error) {
        const code =
          error instanceof JobTimelineError && error.code === "cursor_invalidated"
            ? "conflict"
            : error instanceof JobTimelineError && error.code === "invalid_state"
              ? "internal"
              : "unavailable";
        return applicationFailure({
          code,
          message: "Local job history could not be read. Refresh and try again.",
          retryable: code !== "internal",
        });
      }
      if (result === undefined)
        return applicationFailure({
          code: "not_found",
          message: "This job is not available in the requested history scope.",
          retryable: false,
        });
      try {
        return applicationSuccess(copyPage(result, input));
      } catch {
        return applicationFailure({
          code: "internal",
          message: "Stored job history did not pass validation.",
          retryable: false,
        });
      }
    },
  );
