import {
  confidence,
  entityId,
  instant,
  jobRequirementCategory,
  type Confidence,
  type EntityId,
  type Instant,
  type JobRequirementCategory,
} from "@coredrill/domain";
import { defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export type JobSourceEvidenceKind = "field-value" | "requirement";
export interface SourceValuePreviewDto {
  readonly text: string;
  readonly format: "json" | "text";
  readonly byteLength: number;
  /** False means an explicitly incomplete preview, never the whole canonical value. */
  readonly complete: boolean;
}
interface SourceEvidenceBase {
  readonly jobId: EntityId<"job">;
  readonly snapshotId: EntityId<"source-snapshot">;
  readonly createdAt: Instant;
  readonly normalized: SourceValuePreviewDto;
  readonly raw: SourceValuePreviewDto | null;
  readonly provenance: {
    readonly id: EntityId<"provenance">;
    readonly snapshotId: EntityId<"source-snapshot">;
    readonly method: "api" | "heuristic" | "jsonld" | "llm" | "readability" | "selector" | "user";
    readonly pointer: string;
    readonly excerpt: string | null;
    readonly confidence: Confidence;
    readonly capturedAt: Instant;
    readonly licenseNote: string | null;
  };
}
interface CurrentReviewStamp {
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}
export type JobSourceEvidenceDto = SourceEvidenceBase &
  (
    | {
        readonly kind: "field-value";
        readonly id: EntityId<"field-value">;
        readonly fieldName: string;
        /** Current stored annotations, not their state at the membership ceiling. */
        readonly currentReview: CurrentReviewStamp & {
          readonly confirmation: {
            readonly id: EntityId<"field-confirmation">;
            readonly confirmedAt: Instant;
            readonly confirmedValueHash: string;
          } | null;
          readonly supersededBy: {
            readonly id: EntityId<"field-value">;
            readonly jobId: EntityId<"job">;
            readonly snapshotId: EntityId<"source-snapshot">;
            readonly fieldName: string;
          } | null;
        };
      }
    | {
        readonly kind: "requirement";
        readonly id: EntityId<"job-requirement">;
        readonly raw: SourceValuePreviewDto;
        readonly sourceCategory: JobRequirementCategory;
        readonly currentReview: CurrentReviewStamp & {
          readonly category: JobRequirementCategory;
          readonly userConfirmed: boolean;
        };
      }
  );
export interface JobSourceEvidenceCursor {
  readonly jobId: EntityId<"job">;
  readonly snapshotId: EntityId<"source-snapshot">;
  readonly includeArchived: boolean;
  readonly asOf: Instant;
  readonly createdAt: Instant;
  readonly kind: JobSourceEvidenceKind;
  readonly id: string;
}
export interface ListJobSourceEvidenceInput {
  readonly jobId: string;
  readonly snapshotId: string;
  readonly includeArchived?: boolean;
  readonly limit?: number;
  readonly after?: JobSourceEvidenceCursor | null;
}
export interface ListJobSourceEvidencePortInput {
  readonly jobId: EntityId<"job">;
  readonly snapshotId: EntityId<"source-snapshot">;
  readonly includeArchived: boolean;
  readonly asOf: Instant;
  readonly limit: number;
  readonly after: JobSourceEvidenceCursor | null;
}
export interface JobSourceEvidencePageDto {
  readonly jobId: EntityId<"job">;
  readonly snapshotId: EntityId<"source-snapshot">;
  readonly includeArchived: boolean;
  readonly asOf: Instant;
  readonly items: readonly JobSourceEvidenceDto[];
  readonly hasMore: boolean;
  readonly nextCursor: JobSourceEvidenceCursor | null;
}
export interface JobSourceEvidencePort {
  listPage(input: ListJobSourceEvidencePortInput): Promise<JobSourceEvidencePageDto | undefined>;
}
export class JobSourceEvidenceError extends Error {
  public constructor(public readonly code: "cursor_invalidated" | "invalid_state" | "unavailable") {
    super("Local source evidence could not be read.");
    this.name = "JobSourceEvidenceError";
  }
}
const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError();
  return value as Record<string, unknown>;
};
const text = (value: unknown, maximum: number, empty = false): string => {
  if (typeof value !== "string" || value.length > maximum || (!empty && value.trim().length === 0))
    throw new TypeError();
  return value;
};
const bool = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new TypeError();
  return value;
};
const integer = (value: unknown, minimum = 0): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum)
    throw new TypeError();
  return value;
};
const kind = (value: unknown): JobSourceEvidenceKind => {
  if (value !== "field-value" && value !== "requirement") throw new TypeError();
  return value;
};
const hash = (value: unknown): string => {
  const result = text(value, 64);
  if (!/^[a-f0-9]{64}$/u.test(result)) throw new TypeError();
  return result;
};
const nullableText = (value: unknown, maximum: number): string | null =>
  value === null ? null : text(value, maximum, true);
const copyCursor = (value: unknown): JobSourceEvidenceCursor => {
  const input = record(value);
  if (
    Object.keys(input).some(
      (key) =>
        !["jobId", "snapshotId", "includeArchived", "asOf", "createdAt", "kind", "id"].includes(
          key,
        ),
    )
  )
    throw new TypeError();
  const evidenceKind = kind(input["kind"]);
  return Object.freeze({
    jobId: entityId("job", text(input["jobId"], 36)),
    snapshotId: entityId("source-snapshot", text(input["snapshotId"], 36)),
    includeArchived: bool(input["includeArchived"]),
    asOf: instant(text(input["asOf"], 32)),
    createdAt: instant(text(input["createdAt"], 32)),
    kind: evidenceKind,
    id: entityId(
      evidenceKind === "field-value" ? "field-value" : "job-requirement",
      text(input["id"], 36),
    ),
  });
};
export const compareJobSourceEvidence = (
  left: Pick<JobSourceEvidenceCursor, "createdAt" | "kind" | "id">,
  right: Pick<JobSourceEvidenceCursor, "createdAt" | "kind" | "id">,
): number =>
  left.createdAt === right.createdAt
    ? `${left.kind}:${left.id}` < `${right.kind}:${right.id}`
      ? -1
      : `${left.kind}:${left.id}` > `${right.kind}:${right.id}`
        ? 1
        : 0
    : left.createdAt > right.createdAt
      ? -1
      : 1;
const preview = (value: unknown, format: "json" | "text"): SourceValuePreviewDto => {
  const input = record(value);
  const literal = text(input["text"], 512, true);
  const byteLength = integer(input["byteLength"]);
  const previewBytes = new TextEncoder().encode(literal).byteLength;
  const complete = bool(input["complete"]);
  if (
    input["format"] !== format ||
    previewBytes > byteLength ||
    complete !== (previewBytes === byteLength)
  )
    throw new TypeError();
  if (format === "json" && complete) JSON.parse(literal);
  return Object.freeze({ text: literal, format, byteLength, complete });
};
const copyItem = (value: unknown, input: ListJobSourceEvidencePortInput): JobSourceEvidenceDto => {
  const item = record(value);
  const evidenceKind = kind(item["kind"]);
  const createdAt = instant(text(item["createdAt"], 32));
  const source = record(item["provenance"]);
  if (
    item["jobId"] !== input.jobId ||
    item["snapshotId"] !== input.snapshotId ||
    source["snapshotId"] !== input.snapshotId ||
    createdAt > input.asOf
  )
    throw new TypeError();
  const method = source["method"];
  if (
    method !== "api" &&
    method !== "heuristic" &&
    method !== "jsonld" &&
    method !== "llm" &&
    method !== "readability" &&
    method !== "selector" &&
    method !== "user"
  )
    throw new TypeError();
  const format = evidenceKind === "field-value" ? "json" : "text";
  const base = {
    jobId: input.jobId,
    snapshotId: input.snapshotId,
    createdAt,
    normalized: preview(item["normalized"], format),
    raw: item["raw"] === null ? null : preview(item["raw"], format),
    provenance: Object.freeze({
      id: entityId("provenance", text(source["id"], 36)),
      snapshotId: input.snapshotId,
      method,
      pointer: text(source["pointer"], 2048),
      excerpt: nullableText(source["excerpt"], 4096),
      confidence: confidence(source["confidence"] as number),
      capturedAt: instant(text(source["capturedAt"], 32)),
      licenseNote: nullableText(source["licenseNote"], 1024),
    }),
  };
  const current = record(item["currentReview"]);
  const updatedAt = instant(text(current["updatedAt"], 32));
  const rowVersion = integer(current["rowVersion"], 1);
  if (updatedAt < createdAt) throw new TypeError();
  if (evidenceKind === "requirement") {
    if (base.raw === null || base.raw.byteLength === 0 || base.normalized.byteLength === 0)
      throw new TypeError();
    return Object.freeze({
      ...base,
      raw: base.raw,
      kind: evidenceKind,
      id: entityId("job-requirement", text(item["id"], 36)),
      sourceCategory: jobRequirementCategory(item["sourceCategory"] as string),
      currentReview: Object.freeze({
        updatedAt,
        rowVersion,
        category: jobRequirementCategory(current["category"] as string),
        userConfirmed: bool(current["userConfirmed"]),
      }),
    });
  }
  const id = entityId("field-value", text(item["id"], 36));
  const fieldName = text(item["fieldName"], 128);
  const confirmed = current["confirmation"] === null ? null : record(current["confirmation"]);
  const confirmation =
    confirmed === null
      ? null
      : Object.freeze({
          id: entityId("field-confirmation", text(confirmed["id"], 36)),
          confirmedAt: instant(text(confirmed["confirmedAt"], 32)),
          confirmedValueHash: hash(confirmed["confirmedValueHash"]),
        });
  if (
    confirmation !== null &&
    (confirmation.confirmedAt < createdAt || confirmation.confirmedAt > updatedAt)
  )
    throw new TypeError();
  const next = current["supersededBy"] === null ? null : record(current["supersededBy"]);
  const supersededBy =
    next === null
      ? null
      : Object.freeze({
          id: entityId("field-value", text(next["id"], 36)),
          jobId: entityId("job", text(next["jobId"], 36)),
          snapshotId: entityId("source-snapshot", text(next["snapshotId"], 36)),
          fieldName: text(next["fieldName"], 128),
        });
  if (
    supersededBy !== null &&
    (supersededBy.id === id ||
      supersededBy.jobId !== input.jobId ||
      supersededBy.fieldName !== fieldName)
  )
    throw new TypeError();
  return Object.freeze({
    ...base,
    kind: evidenceKind,
    id,
    fieldName,
    currentReview: Object.freeze({ updatedAt, rowVersion, confirmation, supersededBy }),
  });
};
const copyPage = (
  value: unknown,
  input: ListJobSourceEvidencePortInput,
): JobSourceEvidencePageDto => {
  const page = record(value);
  if (
    page["jobId"] !== input.jobId ||
    page["snapshotId"] !== input.snapshotId ||
    page["includeArchived"] !== input.includeArchived ||
    page["asOf"] !== input.asOf ||
    !Array.isArray(page["items"]) ||
    page["items"].length > input.limit
  )
    throw new TypeError();
  const items = page["items"].map((item: unknown) => copyItem(item, input));
  const seen = new Set<string>();
  let previous: Pick<JobSourceEvidenceCursor, "createdAt" | "kind" | "id"> | null = input.after;
  for (const item of items) {
    const key = `${item.kind}:${item.id}`;
    if (seen.has(key) || (previous !== null && compareJobSourceEvidence(previous, item) >= 0))
      throw new TypeError();
    seen.add(key);
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
      nextCursor.snapshotId !== input.snapshotId ||
      nextCursor.includeArchived !== input.includeArchived ||
      nextCursor.asOf !== input.asOf ||
      compareJobSourceEvidence(last, nextCursor) !== 0
    )
      throw new TypeError();
  } else if (nextCursor !== null) throw new TypeError();
  return Object.freeze({
    jobId: input.jobId,
    snapshotId: input.snapshotId,
    includeArchived: input.includeArchived,
    asOf: input.asOf,
    items: Object.freeze(items),
    hasMore,
    nextCursor,
  });
};
export const createJobSourceEvidenceQuery = (port: JobSourceEvidencePort) =>
  defineQuery<ListJobSourceEvidenceInput, JobSourceEvidencePageDto>(
    "ListJobSourceEvidenceQuery",
    async (untrusted, context) => {
      let input: ListJobSourceEvidencePortInput;
      try {
        entityId("application-operation", context.operationId);
        const now = instant(context.initiatedAt);
        const request = record(untrusted);
        if (
          Object.keys(request).some(
            (key) => !["jobId", "snapshotId", "includeArchived", "limit", "after"].includes(key),
          )
        )
          throw new TypeError();
        const jobId = entityId("job", text(request["jobId"], 36));
        const snapshotId = entityId("source-snapshot", text(request["snapshotId"], 36));
        const includeArchived =
          request["includeArchived"] === undefined ? false : bool(request["includeArchived"]);
        const limit = request["limit"] === undefined ? 25 : integer(request["limit"], 1);
        if (limit > 50) throw new TypeError();
        const after =
          request["after"] === undefined || request["after"] === null
            ? null
            : copyCursor(request["after"]);
        if (
          after !== null &&
          (after.jobId !== jobId ||
            after.snapshotId !== snapshotId ||
            after.includeArchived !== includeArchived ||
            after.asOf > now ||
            after.createdAt > after.asOf)
        )
          throw new TypeError();
        input = Object.freeze({
          jobId,
          snapshotId,
          includeArchived,
          limit,
          after,
          asOf: after?.asOf ?? now,
        });
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose a valid retained source evidence page.",
          retryable: false,
        });
      }
      let result: JobSourceEvidencePageDto | undefined;
      try {
        result = await port.listPage(input);
      } catch (error) {
        const code =
          error instanceof JobSourceEvidenceError && error.code === "cursor_invalidated"
            ? "conflict"
            : error instanceof JobSourceEvidenceError && error.code === "invalid_state"
              ? "internal"
              : "unavailable";
        return applicationFailure({
          code,
          message:
            "Local source evidence could not be read. Reload the retained snapshot and try again.",
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
        return applicationSuccess(copyPage(result, input));
      } catch {
        return applicationFailure({
          code: "internal",
          message: "Stored source evidence did not pass validation.",
          retryable: false,
        });
      }
    },
  );
