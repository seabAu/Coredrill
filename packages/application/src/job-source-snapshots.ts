import {
  entityId,
  instant,
  webUrl,
  type EntityId,
  type Instant,
  type WebUrl,
} from "@coredrill/domain";
import { defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export interface JobSourceSnapshotCursor {
  readonly jobId: EntityId<"job">;
  readonly includeArchived: boolean;
  readonly asOf: Instant;
  readonly capturedAt: Instant;
  readonly id: EntityId<"source-snapshot">;
}
export interface JobSourceSnapshotMetadataDto {
  readonly id: EntityId<"source-snapshot">;
  readonly jobId: EntityId<"job">;
  readonly capturedAt: Instant;
  readonly createdAt: Instant;
  readonly extractorId: string;
  readonly extractorVersion: string;
  readonly contentHash: string;
  readonly retentionClass: string;
  readonly hasRawText: boolean;
  readonly hasRetainedHtml: boolean;
  readonly hasStructuredData: boolean;
  /** Mutable source metadata at read time, never a historical URL/primary-state snapshot. */
  readonly currentSource: {
    readonly id: EntityId<"job-source">;
    readonly jobId: EntityId<"job">;
    readonly connectorId: string | null;
    readonly externalId: string | null;
    readonly canonicalUrl: WebUrl | null;
    readonly applyUrl: WebUrl | null;
    readonly firstSeenAt: Instant;
    readonly lastSeenAt: Instant;
    readonly primary: boolean;
  };
}
export interface JobSourceSnapshotPageDto {
  readonly jobId: EntityId<"job">;
  readonly includeArchived: boolean;
  /** Creation ceiling for immutable snapshot membership, not historical source metadata. */
  readonly asOf: Instant;
  readonly items: readonly JobSourceSnapshotMetadataDto[];
  readonly hasMore: boolean;
  readonly nextCursor: JobSourceSnapshotCursor | null;
}
export interface ListJobSourceSnapshotsInput {
  readonly jobId: string;
  readonly includeArchived?: boolean;
  readonly limit?: number;
  readonly after?: JobSourceSnapshotCursor | null;
}
export interface ListJobSourceSnapshotsPortInput {
  readonly jobId: EntityId<"job">;
  readonly includeArchived: boolean;
  readonly asOf: Instant;
  readonly limit: number;
  readonly after: JobSourceSnapshotCursor | null;
}
export interface JobSourceSnapshotPort {
  listPage(input: ListJobSourceSnapshotsPortInput): Promise<JobSourceSnapshotPageDto | undefined>;
}
export class JobSourceSnapshotError extends Error {
  public constructor(public readonly code: "cursor_invalidated" | "invalid_state" | "unavailable") {
    super("Local source snapshot history could not be read.");
    this.name = "JobSourceSnapshotError";
  }
}
const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError();
  return value as Record<string, unknown>;
};
const text = (value: unknown, maximum: number): string => {
  if (typeof value !== "string" || value.length === 0 || value.length > maximum)
    throw new TypeError();
  return value;
};
const bool = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new TypeError();
  return value;
};
const nullableText = (value: unknown, maximum: number): string | null =>
  value === null ? null : text(value, maximum);
const url = (value: unknown): WebUrl | null => (value === null ? null : webUrl(text(value, 8192)));
const copyCursor = (value: unknown): JobSourceSnapshotCursor => {
  const input = record(value);
  if (
    Object.keys(input).some(
      (key) => !["jobId", "includeArchived", "asOf", "capturedAt", "id"].includes(key),
    )
  )
    throw new TypeError();
  return Object.freeze({
    jobId: entityId("job", text(input["jobId"], 36)),
    includeArchived: bool(input["includeArchived"]),
    asOf: instant(text(input["asOf"], 32)),
    capturedAt: instant(text(input["capturedAt"], 32)),
    id: entityId("source-snapshot", text(input["id"], 36)),
  });
};
/** Newest captured instant first, then explicit ascending UUID ties. */
export const compareJobSourceSnapshots = (
  left: { readonly capturedAt: Instant; readonly id: EntityId<"source-snapshot"> },
  right: { readonly capturedAt: Instant; readonly id: EntityId<"source-snapshot"> },
): number =>
  left.capturedAt === right.capturedAt
    ? left.id < right.id
      ? -1
      : left.id > right.id
        ? 1
        : 0
    : left.capturedAt > right.capturedAt
      ? -1
      : 1;
const copyItem = (
  value: unknown,
  input: ListJobSourceSnapshotsPortInput,
): JobSourceSnapshotMetadataDto => {
  const item = record(value);
  const source = record(item["currentSource"]);
  const jobId = entityId("job", text(item["jobId"], 36));
  const createdAt = instant(text(item["createdAt"], 32));
  const hash = text(item["contentHash"], 64);
  const firstSeenAt = instant(text(source["firstSeenAt"], 32));
  const lastSeenAt = instant(text(source["lastSeenAt"], 32));
  if (
    jobId !== input.jobId ||
    source["jobId"] !== jobId ||
    createdAt > input.asOf ||
    firstSeenAt > lastSeenAt ||
    !/^[a-f0-9]{64}$/u.test(hash)
  )
    throw new TypeError();
  return Object.freeze({
    id: entityId("source-snapshot", text(item["id"], 36)),
    jobId,
    capturedAt: instant(text(item["capturedAt"], 32)),
    createdAt,
    extractorId: text(item["extractorId"], 128),
    extractorVersion: text(item["extractorVersion"], 64),
    contentHash: hash,
    retentionClass: text(item["retentionClass"], 64),
    hasRawText: bool(item["hasRawText"]),
    hasRetainedHtml: bool(item["hasRetainedHtml"]),
    hasStructuredData: bool(item["hasStructuredData"]),
    currentSource: Object.freeze({
      id: entityId("job-source", text(source["id"], 36)),
      jobId,
      connectorId: nullableText(source["connectorId"], 128),
      externalId: nullableText(source["externalId"], 1024),
      canonicalUrl: url(source["canonicalUrl"]),
      applyUrl: url(source["applyUrl"]),
      firstSeenAt,
      lastSeenAt,
      primary: bool(source["primary"]),
    }),
  });
};
const copyPage = (
  value: unknown,
  input: ListJobSourceSnapshotsPortInput,
): JobSourceSnapshotPageDto => {
  const page = record(value);
  if (
    page["jobId"] !== input.jobId ||
    page["includeArchived"] !== input.includeArchived ||
    page["asOf"] !== input.asOf ||
    !Array.isArray(page["items"]) ||
    page["items"].length > input.limit
  )
    throw new TypeError();
  const items = page["items"].map((item: unknown) => copyItem(item, input));
  let previous: Pick<JobSourceSnapshotCursor, "id" | "capturedAt"> | null = input.after;
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id) || (previous !== null && compareJobSourceSnapshots(previous, item) >= 0))
      throw new TypeError();
    seen.add(item.id);
    previous = item;
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
      compareJobSourceSnapshots(last, nextCursor) !== 0
    )
      throw new TypeError();
  } else if (nextCursor !== null) throw new TypeError();
  return Object.freeze({
    jobId: input.jobId,
    includeArchived: input.includeArchived,
    asOf: input.asOf,
    items: Object.freeze(items),
    hasMore,
    nextCursor,
  });
};
export const createJobSourceSnapshotQuery = (port: JobSourceSnapshotPort) =>
  defineQuery<ListJobSourceSnapshotsInput, JobSourceSnapshotPageDto>(
    "ListJobSourceSnapshotsQuery",
    async (untrusted, context) => {
      let input: ListJobSourceSnapshotsPortInput;
      try {
        entityId("application-operation", context.operationId);
        const now = instant(context.initiatedAt);
        const request = record(untrusted);
        if (
          Object.keys(request).some(
            (key) => !["jobId", "includeArchived", "limit", "after"].includes(key),
          )
        )
          throw new TypeError();
        const jobId = entityId("job", text(request["jobId"], 36));
        const includeArchived =
          request["includeArchived"] === undefined ? false : bool(request["includeArchived"]);
        const limit = request["limit"] === undefined ? 25 : request["limit"];
        if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > 50)
          throw new TypeError();
        const after =
          request["after"] === undefined || request["after"] === null
            ? null
            : copyCursor(request["after"]);
        if (
          after !== null &&
          (after.jobId !== jobId || after.includeArchived !== includeArchived || after.asOf > now)
        )
          throw new TypeError();
        input = Object.freeze({ jobId, includeArchived, limit, after, asOf: after?.asOf ?? now });
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose a valid local source snapshot page.",
          retryable: false,
        });
      }
      let result: JobSourceSnapshotPageDto | undefined;
      try {
        result = await port.listPage(input);
      } catch (error) {
        const code =
          error instanceof JobSourceSnapshotError && error.code === "cursor_invalidated"
            ? "conflict"
            : error instanceof JobSourceSnapshotError && error.code === "invalid_state"
              ? "internal"
              : "unavailable";
        return applicationFailure({
          code,
          message: "Local source snapshot history could not be read. Refresh and try again.",
          retryable: code !== "internal",
        });
      }
      if (result === undefined)
        return applicationFailure({
          code: "not_found",
          message: "This job is not available in the requested source scope.",
          retryable: false,
        });
      try {
        return applicationSuccess(copyPage(result, input));
      } catch {
        return applicationFailure({
          code: "internal",
          message: "Stored source snapshot history did not pass validation.",
          retryable: false,
        });
      }
    },
  );
