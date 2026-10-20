import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";
import { defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";
import { decodeLiteralUtf8Chunk } from "./literal-utf8-chunk.js";

export const JOB_SOURCE_CONTENT_KINDS = ["text", "markup", "structured"] as const;
export type JobSourceContentKind = (typeof JOB_SOURCE_CONTENT_KINDS)[number];
export interface JobSourceContentCursor {
  readonly jobId: EntityId<"job">;
  readonly snapshotId: EntityId<"source-snapshot">;
  readonly kind: JobSourceContentKind;
  readonly includeArchived: boolean;
  readonly asOf: Instant;
  /** Recorded capture fingerprint, not a newly calculated body checksum. */
  readonly contentHash: string;
  readonly byteLength: number;
  readonly byteOffset: number;
}
export interface GetJobSourceContentInput {
  readonly jobId: string;
  readonly snapshotId: string;
  readonly kind: JobSourceContentKind;
  readonly includeArchived?: boolean;
  readonly limitBytes?: number;
  readonly after?: JobSourceContentCursor | null;
}
export interface GetJobSourceContentPortInput {
  readonly jobId: EntityId<"job">;
  readonly snapshotId: EntityId<"source-snapshot">;
  readonly kind: JobSourceContentKind;
  readonly includeArchived: boolean;
  readonly asOf: Instant;
  readonly limitBytes: number;
  readonly after: JobSourceContentCursor | null;
}
export interface JobSourceContentPortChunk {
  readonly jobId: EntityId<"job">;
  readonly snapshotId: EntityId<"source-snapshot">;
  readonly jobSourceId: EntityId<"job-source">;
  readonly kind: JobSourceContentKind;
  readonly includeArchived: boolean;
  readonly asOf: Instant;
  readonly contentHash: string;
  readonly byteOffset: number;
  readonly byteLength: number | null;
  readonly bytes: Uint8Array | null;
}
export interface JobSourceContentPort {
  readChunk(input: GetJobSourceContentPortInput): Promise<JobSourceContentPortChunk | undefined>;
}
export interface JobSourceContentChunkDto {
  readonly jobId: EntityId<"job">;
  readonly snapshotId: EntityId<"source-snapshot">;
  readonly jobSourceId: EntityId<"job-source">;
  readonly kind: JobSourceContentKind;
  readonly includeArchived: boolean;
  readonly asOf: Instant;
  readonly contentHash: string;
  readonly byteOffset: number;
  readonly byteLength: number | null;
  /** Exact literal retained text, never HTML/JSON rendering instructions. Null means absent. */
  readonly text: string | null;
  readonly bytesRead: number;
  readonly hasMore: boolean;
  readonly nextCursor: JobSourceContentCursor | null;
}
export class JobSourceContentError extends Error {
  public constructor(public readonly code: "cursor_invalidated" | "invalid_state" | "unavailable") {
    super("Local source content could not be read.");
    this.name = "JobSourceContentError";
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
const integer = (value: unknown, minimum = 0): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum)
    throw new TypeError();
  return value;
};
const bool = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new TypeError();
  return value;
};
const kind = (value: unknown): JobSourceContentKind => {
  if (value !== "text" && value !== "markup" && value !== "structured") throw new TypeError();
  return value;
};
const hash = (value: unknown): string => {
  const result = text(value, 64);
  if (!/^[a-f0-9]{64}$/u.test(result)) throw new TypeError();
  return result;
};
const copyCursor = (value: unknown): JobSourceContentCursor => {
  const input = record(value);
  if (
    Object.keys(input).some(
      (key) =>
        ![
          "jobId",
          "snapshotId",
          "kind",
          "includeArchived",
          "asOf",
          "contentHash",
          "byteLength",
          "byteOffset",
        ].includes(key),
    )
  )
    throw new TypeError();
  const byteOffset = integer(input["byteOffset"], 1);
  const byteLength = integer(input["byteLength"], 1);
  if (byteOffset >= byteLength) throw new TypeError();
  return Object.freeze({
    jobId: entityId("job", text(input["jobId"], 36)),
    snapshotId: entityId("source-snapshot", text(input["snapshotId"], 36)),
    kind: kind(input["kind"]),
    includeArchived: bool(input["includeArchived"]),
    asOf: instant(text(input["asOf"], 32)),
    contentHash: hash(input["contentHash"]),
    byteLength,
    byteOffset,
  });
};
const copyChunk = (
  value: unknown,
  input: GetJobSourceContentPortInput,
): JobSourceContentChunkDto => {
  const chunk = record(value);
  const offset = input.after?.byteOffset ?? 0;
  if (
    chunk["jobId"] !== input.jobId ||
    chunk["snapshotId"] !== input.snapshotId ||
    chunk["kind"] !== input.kind ||
    chunk["includeArchived"] !== input.includeArchived ||
    chunk["asOf"] !== input.asOf ||
    chunk["byteOffset"] !== offset
  )
    throw new TypeError();
  const jobSourceId = entityId("job-source", text(chunk["jobSourceId"], 36));
  const contentHash = hash(chunk["contentHash"]);
  const byteLength = chunk["byteLength"] === null ? null : integer(chunk["byteLength"]);
  if (
    input.after !== null &&
    (contentHash !== input.after.contentHash || byteLength !== input.after.byteLength)
  )
    throw new TypeError();
  const base = {
    jobId: input.jobId,
    snapshotId: input.snapshotId,
    jobSourceId,
    kind: input.kind,
    includeArchived: input.includeArchived,
    asOf: input.asOf,
    contentHash,
    byteOffset: offset,
    byteLength,
  };
  if (byteLength === null) {
    if (chunk["bytes"] !== null || input.after !== null) throw new TypeError();
    return Object.freeze({ ...base, text: null, bytesRead: 0, hasMore: false, nextCursor: null });
  }
  const {
    text: literal,
    bytesRead,
    hasMore,
  } = decodeLiteralUtf8Chunk(chunk["bytes"], byteLength, offset, input.limitBytes);
  const nextOffset = offset + bytesRead;
  const nextCursor = hasMore
    ? Object.freeze({
        jobId: input.jobId,
        snapshotId: input.snapshotId,
        kind: input.kind,
        includeArchived: input.includeArchived,
        asOf: input.asOf,
        contentHash,
        byteLength,
        byteOffset: nextOffset,
      })
    : null;
  return Object.freeze({ ...base, text: literal, bytesRead, hasMore, nextCursor });
};
export const createJobSourceContentQuery = (port: JobSourceContentPort) =>
  defineQuery<GetJobSourceContentInput, JobSourceContentChunkDto>(
    "GetJobSourceContentQuery",
    async (untrusted, context) => {
      let input: GetJobSourceContentPortInput;
      try {
        entityId("application-operation", context.operationId);
        const now = instant(context.initiatedAt);
        const request = record(untrusted);
        if (
          Object.keys(request).some(
            (key) =>
              !["jobId", "snapshotId", "kind", "includeArchived", "limitBytes", "after"].includes(
                key,
              ),
          )
        )
          throw new TypeError();
        const jobId = entityId("job", text(request["jobId"], 36));
        const snapshotId = entityId("source-snapshot", text(request["snapshotId"], 36));
        const contentKind = kind(request["kind"]);
        const includeArchived =
          request["includeArchived"] === undefined ? false : bool(request["includeArchived"]);
        const limitBytes =
          request["limitBytes"] === undefined ? 32_768 : integer(request["limitBytes"], 4);
        if (limitBytes > 65_536) throw new TypeError();
        const after =
          request["after"] === undefined || request["after"] === null
            ? null
            : copyCursor(request["after"]);
        if (
          after !== null &&
          (after.jobId !== jobId ||
            after.snapshotId !== snapshotId ||
            after.kind !== contentKind ||
            after.includeArchived !== includeArchived ||
            after.asOf > now)
        )
          throw new TypeError();
        input = Object.freeze({
          jobId,
          snapshotId,
          kind: contentKind,
          includeArchived,
          limitBytes,
          after,
          asOf: after?.asOf ?? now,
        });
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose a valid retained source content part.",
          retryable: false,
        });
      }
      let result: JobSourceContentPortChunk | undefined;
      try {
        result = await port.readChunk(input);
      } catch (error) {
        const code =
          error instanceof JobSourceContentError && error.code === "cursor_invalidated"
            ? "conflict"
            : error instanceof JobSourceContentError && error.code === "invalid_state"
              ? "internal"
              : "unavailable";
        return applicationFailure({
          code,
          message:
            "Local source content could not be read. Reload the retained snapshot and try again.",
          retryable: code !== "internal",
        });
      }
      if (result === undefined)
        return applicationFailure({
          code: "not_found",
          message: "This retained snapshot is not available in the requested job scope.",
          retryable: false,
        });
      try {
        return applicationSuccess(copyChunk(result, input));
      } catch {
        return applicationFailure({
          code: "internal",
          message: "Stored source content did not pass validation.",
          retryable: false,
        });
      }
    },
  );
