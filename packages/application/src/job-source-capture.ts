import {
  CAPTURE_ENVELOPE_LIMITS,
  safeParseCaptureEnvelope,
  type CaptureEnvelopeV1,
} from "@coredrill/contracts";
import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";
import { defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export const JOB_SOURCE_CAPTURE_READ_LIMITS = Object.freeze({
  maxBytes: CAPTURE_ENVELOPE_LIMITS.maxBytes,
  maxJsonValues: 20_000,
  maxJsonDepth: 40,
});
export interface GetJobSourceCaptureInput {
  readonly jobId: string;
  readonly snapshotId: string;
  readonly includeArchived?: boolean;
}
export interface JobSourceCaptureScope {
  readonly jobId: EntityId<"job">;
  readonly snapshotId: EntityId<"source-snapshot">;
  readonly includeArchived: boolean;
  readonly asOf: Instant;
}
export interface JobSourceCaptureRecord extends JobSourceCaptureScope {
  readonly capturedAt: Instant;
  readonly contentHash: string;
  /** Null is an explicitly unlinked/unsupported historical snapshot, not empty facts. */
  readonly receipt: {
    readonly envelopeId: string;
    readonly checksum: string;
    readonly envelopeJson: string;
  } | null;
}
export interface JobSourceCapturePort {
  readCapture(input: JobSourceCaptureScope): Promise<JobSourceCaptureRecord | undefined>;
}
export interface JobSourceCaptureDto extends JobSourceCaptureScope {
  readonly capturedAt: Instant;
  readonly contentHash: string;
  readonly availability: "retained" | "not_retained";
  /** Original untrusted capture evidence, not current review or verified employer facts. */
  readonly capture: CaptureEnvelopeV1 | null;
}
export class JobSourceCaptureError extends Error {
  public constructor(public readonly code: "invalid_state" | "unavailable") {
    super("Local capture-time evidence could not be read.");
    this.name = "JobSourceCaptureError";
  }
}
const record = (value: unknown): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError();
  return value as Record<string, unknown>;
};
const hash = (value: unknown): string => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new TypeError();
  return value;
};
/** Bound recursive schema/hash traversal before either receives parsed retained JSON. */
const parseJson = (value: unknown): unknown => {
  if (
    typeof value !== "string" ||
    value.length > JOB_SOURCE_CAPTURE_READ_LIMITS.maxBytes ||
    new TextEncoder().encode(value).byteLength > JOB_SOURCE_CAPTURE_READ_LIMITS.maxBytes
  )
    throw new TypeError();
  const parsed: unknown = JSON.parse(value);
  const pending = [{ value: parsed, depth: 0 }];
  let count = 0;
  while (pending.length > 0) {
    const current = pending.pop();
    if (current === undefined) break;
    count += 1;
    if (
      count > JOB_SOURCE_CAPTURE_READ_LIMITS.maxJsonValues ||
      current.depth > JOB_SOURCE_CAPTURE_READ_LIMITS.maxJsonDepth
    )
      throw new TypeError();
    if (typeof current.value === "object" && current.value !== null) {
      const children = Object.values(current.value);
      if (children.length + pending.length + count > JOB_SOURCE_CAPTURE_READ_LIMITS.maxJsonValues)
        throw new TypeError();
      for (const child of children) pending.push({ value: child, depth: current.depth + 1 });
    }
  }
  return parsed;
};
export const createJobSourceCaptureQuery = (
  port: JobSourceCapturePort,
  /** Runtime supplies semantic-content AND canonical full-envelope checksum verification. */
  verify: (capture: CaptureEnvelopeV1, expectedChecksum: string) => Promise<boolean>,
) =>
  defineQuery<GetJobSourceCaptureInput, JobSourceCaptureDto>(
    "GetJobSourceCaptureQuery",
    async (request, context) => {
      let input: JobSourceCaptureScope;
      try {
        const raw = record(request);
        if (
          Object.keys(raw).some((key) => !["jobId", "snapshotId", "includeArchived"].includes(key))
        )
          throw new TypeError();
        if (raw["includeArchived"] !== undefined && typeof raw["includeArchived"] !== "boolean")
          throw new TypeError();
        input = Object.freeze({
          jobId: entityId("job", raw["jobId"] as string),
          snapshotId: entityId("source-snapshot", raw["snapshotId"] as string),
          includeArchived: raw["includeArchived"] === true,
          asOf: instant(context.initiatedAt),
        });
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose a valid saved snapshot.",
          retryable: false,
        });
      }
      let result: JobSourceCaptureRecord | undefined;
      try {
        result = await port.readCapture(input);
      } catch (error) {
        const invalid = error instanceof JobSourceCaptureError && error.code === "invalid_state";
        return applicationFailure({
          code: invalid ? "internal" : "unavailable",
          message: "Local capture-time evidence could not be read.",
          retryable: !invalid,
        });
      }
      if (result === undefined)
        return applicationFailure({
          code: "not_found",
          message: "This snapshot is not available in the requested job scope.",
          retryable: false,
        });
      try {
        if (
          result.jobId !== input.jobId ||
          result.snapshotId !== input.snapshotId ||
          result.includeArchived !== input.includeArchived ||
          result.asOf !== input.asOf
        )
          throw new TypeError();
        const capturedAt = instant(result.capturedAt);
        const contentHash = hash(result.contentHash);
        let capture: CaptureEnvelopeV1 | null = null;
        if (result.receipt !== null) {
          const parsed = safeParseCaptureEnvelope(parseJson(result.receipt.envelopeJson));
          if (
            !parsed.success ||
            parsed.data.id !== result.receipt.envelopeId ||
            parsed.data.capturedAt !== capturedAt ||
            parsed.data.contentHash !== contentHash
          )
            throw new TypeError();
          if (!(await verify(parsed.data, hash(result.receipt.checksum)))) throw new TypeError();
          capture = parsed.data;
        }
        return applicationSuccess(
          Object.freeze({
            ...input,
            capturedAt,
            contentHash,
            availability: capture === null ? ("not_retained" as const) : ("retained" as const),
            capture,
          }),
        );
      } catch {
        return applicationFailure({
          code: "internal",
          message: "Stored capture-time evidence did not pass validation.",
          retryable: false,
        });
      }
    },
  );
