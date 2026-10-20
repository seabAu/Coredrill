import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";
import type { JobSourceEvidenceKind } from "./job-source-evidence.js";
import { decodeLiteralUtf8Chunk } from "./literal-utf8-chunk.js";
import { defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export type SourceEvidenceValuePart = "normalized" | "raw";
interface ValueScope {
  readonly jobId: EntityId<"job">;
  readonly snapshotId: EntityId<"source-snapshot">;
  readonly evidenceKind: JobSourceEvidenceKind;
  readonly evidenceId: string;
  readonly part: SourceEvidenceValuePart;
  readonly includeArchived: boolean;
  readonly asOf: Instant;
}
export interface JobSourceEvidenceValueCursor extends ValueScope {
  readonly provenanceId: EntityId<"provenance">;
  /** Current record version, not a hash or historical review-state claim. */
  readonly rowVersion: number;
  readonly byteLength: number;
  readonly byteOffset: number;
}
export interface GetJobSourceEvidenceValueInput {
  readonly jobId: string;
  readonly snapshotId: string;
  readonly evidenceKind: JobSourceEvidenceKind;
  readonly evidenceId: string;
  readonly part: SourceEvidenceValuePart;
  readonly includeArchived?: boolean;
  readonly limitBytes?: number;
  readonly after?: JobSourceEvidenceValueCursor | null;
}
export interface GetJobSourceEvidenceValuePortInput extends ValueScope {
  readonly limitBytes: number;
  readonly after: JobSourceEvidenceValueCursor | null;
}
export interface JobSourceEvidenceValuePortChunk extends ValueScope {
  readonly provenanceId: EntityId<"provenance">;
  readonly rowVersion: number;
  readonly format: "json" | "text";
  readonly byteOffset: number;
  readonly byteLength: number | null;
  readonly bytes: Uint8Array | null;
}
export interface JobSourceEvidenceValuePort {
  readChunk(
    input: GetJobSourceEvidenceValuePortInput,
  ): Promise<JobSourceEvidenceValuePortChunk | undefined>;
}
export interface JobSourceEvidenceValueChunkDto extends ValueScope {
  readonly provenanceId: EntityId<"provenance">;
  readonly rowVersion: number;
  readonly format: "json" | "text";
  readonly byteOffset: number;
  readonly byteLength: number | null;
  /** Exact serialized JSON or text; never parsed objects or rendering instructions. */
  readonly text: string | null;
  readonly bytesRead: number;
  readonly hasMore: boolean;
  readonly nextCursor: JobSourceEvidenceValueCursor | null;
}
export class JobSourceEvidenceValueError extends Error {
  public constructor(public readonly code: "cursor_invalidated" | "invalid_state" | "unavailable") {
    super("Local source evidence value could not be read.");
    this.name = "JobSourceEvidenceValueError";
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
const positive = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new TypeError();
  return value;
};
const evidenceKind = (value: unknown): JobSourceEvidenceKind => {
  if (value !== "field-value" && value !== "requirement") throw new TypeError();
  return value;
};
const part = (value: unknown): SourceEvidenceValuePart => {
  if (value !== "normalized" && value !== "raw") throw new TypeError();
  return value;
};
const copyScope = (input: Record<string, unknown>): ValueScope => {
  const kind = evidenceKind(input["evidenceKind"]);
  return Object.freeze({
    jobId: entityId("job", text(input["jobId"], 36)),
    snapshotId: entityId("source-snapshot", text(input["snapshotId"], 36)),
    evidenceKind: kind,
    evidenceId: entityId(
      kind === "field-value" ? "field-value" : "job-requirement",
      text(input["evidenceId"], 36),
    ),
    part: part(input["part"]),
    includeArchived: bool(input["includeArchived"]),
    asOf: instant(text(input["asOf"], 32)),
  });
};
const sameScope = (left: ValueScope, right: Record<string, unknown>): boolean =>
  left.jobId === right["jobId"] &&
  left.snapshotId === right["snapshotId"] &&
  left.evidenceKind === right["evidenceKind"] &&
  left.evidenceId === right["evidenceId"] &&
  left.part === right["part"] &&
  left.includeArchived === right["includeArchived"] &&
  left.asOf === right["asOf"];
const copyCursor = (value: unknown): JobSourceEvidenceValueCursor => {
  const input = record(value);
  if (
    Object.keys(input).some(
      (key) =>
        ![
          "jobId",
          "snapshotId",
          "evidenceKind",
          "evidenceId",
          "part",
          "includeArchived",
          "asOf",
          "provenanceId",
          "rowVersion",
          "byteLength",
          "byteOffset",
        ].includes(key),
    )
  )
    throw new TypeError();
  const byteLength = positive(input["byteLength"]);
  const byteOffset = positive(input["byteOffset"]);
  if (byteOffset >= byteLength) throw new TypeError();
  return Object.freeze({
    ...copyScope(input),
    provenanceId: entityId("provenance", text(input["provenanceId"], 36)),
    rowVersion: positive(input["rowVersion"]),
    byteLength,
    byteOffset,
  });
};
const copyChunk = (
  value: unknown,
  input: GetJobSourceEvidenceValuePortInput,
): JobSourceEvidenceValueChunkDto => {
  const chunk = record(value);
  const offset = input.after?.byteOffset ?? 0;
  const format = input.evidenceKind === "field-value" ? "json" : "text";
  if (!sameScope(input, chunk) || chunk["byteOffset"] !== offset || chunk["format"] !== format)
    throw new TypeError();
  const provenanceId = entityId("provenance", text(chunk["provenanceId"], 36));
  const rowVersion = positive(chunk["rowVersion"]);
  const byteLength = chunk["byteLength"] === null ? null : positive(chunk["byteLength"]);
  const after = input.after;
  if (
    after !== null &&
    (after.provenanceId !== provenanceId ||
      after.rowVersion !== rowVersion ||
      after.byteLength !== byteLength)
  )
    throw new TypeError();
  const base = Object.freeze({
    jobId: input.jobId,
    snapshotId: input.snapshotId,
    evidenceKind: input.evidenceKind,
    evidenceId: input.evidenceId,
    part: input.part,
    includeArchived: input.includeArchived,
    asOf: input.asOf,
    provenanceId,
    rowVersion,
    format,
    byteLength,
    byteOffset: offset,
  });
  if (byteLength === null) {
    if (
      input.evidenceKind !== "field-value" ||
      input.part !== "raw" ||
      chunk["bytes"] !== null ||
      after !== null
    )
      throw new TypeError();
    return Object.freeze({ ...base, text: null, bytesRead: 0, hasMore: false, nextCursor: null });
  }
  const decoded = decodeLiteralUtf8Chunk(chunk["bytes"], byteLength, offset, input.limitBytes);
  const nextCursor = decoded.hasMore
    ? Object.freeze({
        jobId: input.jobId,
        snapshotId: input.snapshotId,
        evidenceKind: input.evidenceKind,
        evidenceId: input.evidenceId,
        part: input.part,
        includeArchived: input.includeArchived,
        asOf: input.asOf,
        provenanceId,
        rowVersion,
        byteLength,
        byteOffset: offset + decoded.bytesRead,
      })
    : null;
  return Object.freeze({ ...base, ...decoded, nextCursor });
};
export const createJobSourceEvidenceValueQuery = (port: JobSourceEvidenceValuePort) =>
  defineQuery<GetJobSourceEvidenceValueInput, JobSourceEvidenceValueChunkDto>(
    "GetJobSourceEvidenceValueQuery",
    async (untrusted, context) => {
      let input: GetJobSourceEvidenceValuePortInput;
      try {
        entityId("application-operation", context.operationId);
        const now = instant(context.initiatedAt);
        const request = record(untrusted);
        if (
          Object.keys(request).some(
            (key) =>
              ![
                "jobId",
                "snapshotId",
                "evidenceKind",
                "evidenceId",
                "part",
                "includeArchived",
                "limitBytes",
                "after",
              ].includes(key),
          )
        )
          throw new TypeError();
        const includeArchived =
          request["includeArchived"] === undefined ? false : bool(request["includeArchived"]);
        const after =
          request["after"] === undefined || request["after"] === null
            ? null
            : copyCursor(request["after"]);
        const scope = copyScope({ ...request, includeArchived, asOf: after?.asOf ?? now });
        const limitBytes =
          request["limitBytes"] === undefined ? 32_768 : positive(request["limitBytes"]);
        if (
          limitBytes < 4 ||
          limitBytes > 65_536 ||
          (after !== null && (!sameScope(scope, record(after)) || after.asOf > now))
        )
          throw new TypeError();
        input = Object.freeze({ ...scope, limitBytes, after });
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose a valid retained source evidence value part.",
          retryable: false,
        });
      }
      let result: JobSourceEvidenceValuePortChunk | undefined;
      try {
        result = await port.readChunk(input);
      } catch (error) {
        const code =
          error instanceof JobSourceEvidenceValueError && error.code === "cursor_invalidated"
            ? "conflict"
            : error instanceof JobSourceEvidenceValueError && error.code === "invalid_state"
              ? "internal"
              : "unavailable";
        return applicationFailure({
          code,
          message:
            "Local source evidence value could not be read. Reload the evidence record and try again.",
          retryable: code !== "internal",
        });
      }
      if (result === undefined)
        return applicationFailure({
          code: "not_found",
          message: "This evidence record is not available in the requested retained snapshot.",
          retryable: false,
        });
      try {
        return applicationSuccess(copyChunk(result, input));
      } catch {
        return applicationFailure({
          code: "internal",
          message: "Stored source evidence value did not pass validation.",
          retryable: false,
        });
      }
    },
  );
