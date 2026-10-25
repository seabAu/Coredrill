import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";
import {
  CONTACT_HISTORY_MAX_SUMMARY_BYTES,
  CONTACT_HISTORY_PREVIEW_BYTES,
  compareContactInteractions,
} from "./contact-interaction-history.js";
import { decodeLiteralUtf8Chunk } from "./literal-utf8-chunk.js";
import { defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export interface NetworkInteractionScopeV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: EntityId<"vault">;
  readonly includeArchivedJobs: boolean;
}
/** Current metadata only, never occurrence-time employer/contact evidence. */
export interface NetworkInteractionV1 {
  readonly id: EntityId<"interaction">;
  readonly contactId: EntityId<"contact"> | null;
  readonly occurredAt: Instant;
  readonly createdAt: Instant;
  readonly rowVersion: number;
  readonly type: string;
  readonly direction: "inbound" | "outbound" | "mutual" | "unknown";
  readonly currentJob: {
    readonly id: EntityId<"job">;
    readonly title: string;
    readonly archivedAt: Instant | null;
    readonly rowVersion: number;
    readonly company: {
      readonly id: EntityId<"company">;
      readonly name: string;
      readonly archivedAt: Instant | null;
      readonly rowVersion: number;
    } | null;
  };
  readonly summaryPreview: string;
  readonly summaryByteLength: number;
  readonly summaryTruncated: boolean;
}
export interface NetworkInteractionReferenceV1 extends NetworkInteractionScopeV1 {
  readonly id: EntityId<"interaction">;
  readonly occurredAt: Instant;
  readonly rowVersion: number;
  readonly jobId: EntityId<"job">;
  readonly jobRowVersion: number;
  readonly companyId: EntityId<"company"> | null;
  readonly companyRowVersion: number | null;
  readonly contactId: EntityId<"contact"> | null;
}
export interface ListNetworkInteractionsInputV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: string;
  readonly includeArchivedJobs?: boolean;
  readonly limit?: number;
  readonly after?: NetworkInteractionReferenceV1 | null;
}
export interface ListNetworkInteractionsRequestV1 extends NetworkInteractionScopeV1 {
  readonly limit: number;
  readonly after: NetworkInteractionReferenceV1 | null;
}
export interface NetworkInteractionsPageV1 extends NetworkInteractionScopeV1 {
  readonly items: readonly NetworkInteractionV1[];
  readonly hasMore: boolean;
  readonly nextCursor: NetworkInteractionReferenceV1 | null;
}
export interface ReadNetworkInteractionSummaryInputV1 {
  readonly specVersion: 1;
  readonly reference: NetworkInteractionReferenceV1;
  readonly summaryByteLength: number;
  readonly byteOffset?: number;
  readonly limitBytes?: number;
}
export interface ReadNetworkInteractionSummaryRequestV1 {
  readonly specVersion: 1;
  readonly reference: NetworkInteractionReferenceV1;
  readonly summaryByteLength: number;
  readonly byteOffset: number;
  readonly limitBytes: number;
}
export interface NetworkInteractionSummaryPartV1 {
  readonly specVersion: 1;
  readonly reference: NetworkInteractionReferenceV1;
  readonly summaryByteLength: number;
  readonly byteOffset: number;
  readonly text: string;
  readonly bytesRead: number;
  readonly hasMore: boolean;
  readonly nextByteOffset: number | null;
}
export interface NetworkInteractionHistoryPortV1 {
  listPage(input: ListNetworkInteractionsRequestV1): Promise<unknown>;
  readSummaryPart(input: ReadNetworkInteractionSummaryRequestV1): Promise<unknown>;
}
export class NetworkInteractionHistoryError extends Error {
  public override readonly name = "NetworkInteractionHistoryError";
  public constructor(public readonly code: "stale" | "invalid_state" | "unavailable") {
    super("Local Network interaction history could not be read.");
    if (!["stale", "invalid_state", "unavailable"].includes(code)) throw new TypeError();
  }
}
const scopeKeys = ["specVersion", "expectedVaultId", "includeArchivedJobs"] as const;
const referenceKeys = [
  "id",
  "occurredAt",
  "rowVersion",
  "jobId",
  "jobRowVersion",
  "companyId",
  "companyRowVersion",
  "contactId",
] as const;
const record = (value: unknown, allowed: readonly string[], required = allowed) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).some((key) => typeof key !== "string" || !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(descriptors, key))
  )
    throw new TypeError();
  const copied: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError();
    copied[key] = descriptor.value;
  }
  return copied;
};
const integer = (value: unknown, min = 1, max = Number.MAX_SAFE_INTEGER): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < min || value > max)
    throw new TypeError();
  return value;
};
const text = (value: unknown, max: number): string => {
  if (typeof value !== "string" || value.length > max || /[\uD800-\uDFFF]/u.test(value))
    throw new TypeError();
  return value;
};
const bool = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new TypeError();
  return value;
};
const time = (value: unknown) => instant(text(value, 24));
const nullableTime = (value: unknown) => (value === null ? null : time(value));
const scope = (raw: Record<string, unknown>, defaults = false): NetworkInteractionScopeV1 => {
  if (raw["specVersion"] !== 1) throw new TypeError();
  return Object.freeze({
    specVersion: 1,
    expectedVaultId: entityId("vault", text(raw["expectedVaultId"], 36)),
    includeArchivedJobs:
      defaults && raw["includeArchivedJobs"] === undefined
        ? false
        : bool(raw["includeArchivedJobs"]),
  });
};
const sameScope = (a: NetworkInteractionScopeV1, b: NetworkInteractionScopeV1) =>
  scopeKeys.every((key) => a[key] === b[key]);
export const parseNetworkInteractionReferenceV1 = (
  value: unknown,
): NetworkInteractionReferenceV1 => {
  const raw = record(value, [...scopeKeys, ...referenceKeys]);
  const companyId =
    raw["companyId"] === null ? null : entityId("company", text(raw["companyId"], 36));
  const companyRowVersion =
    raw["companyRowVersion"] === null ? null : integer(raw["companyRowVersion"]);
  if ((companyId === null) !== (companyRowVersion === null)) throw new TypeError();
  return Object.freeze({
    ...scope(raw),
    id: entityId("interaction", text(raw["id"], 36)),
    occurredAt: time(raw["occurredAt"]),
    rowVersion: integer(raw["rowVersion"]),
    jobId: entityId("job", text(raw["jobId"], 36)),
    jobRowVersion: integer(raw["jobRowVersion"]),
    companyId,
    companyRowVersion,
    contactId: raw["contactId"] === null ? null : entityId("contact", text(raw["contactId"], 36)),
  });
};
export const parseNetworkInteractionsRequestV1 = (
  value: unknown,
): ListNetworkInteractionsRequestV1 => {
  const raw = record(value, [...scopeKeys, "limit", "after"], ["specVersion", "expectedVaultId"]),
    owner = scope(raw, true);
  const after =
    raw["after"] === undefined || raw["after"] === null
      ? null
      : parseNetworkInteractionReferenceV1(raw["after"]);
  if (after !== null && !sameScope(owner, after)) throw new TypeError();
  return Object.freeze({
    ...owner,
    limit: raw["limit"] === undefined ? 10 : integer(raw["limit"], 1, 25),
    after,
  });
};
export const parseNetworkInteractionV1 = (
  value: unknown,
  owner: NetworkInteractionScopeV1,
): NetworkInteractionV1 => {
  const raw = record(value, [
    "id",
    "contactId",
    "occurredAt",
    "createdAt",
    "rowVersion",
    "type",
    "direction",
    "currentJob",
    "summaryPreview",
    "summaryByteLength",
    "summaryTruncated",
  ]);
  const job = record(raw["currentJob"], ["id", "title", "archivedAt", "rowVersion", "company"]),
    company =
      job["company"] === null
        ? null
        : record(job["company"], ["id", "name", "archivedAt", "rowVersion"]);
  const archivedAt = nullableTime(job["archivedAt"]);
  if (!owner.includeArchivedJobs && archivedAt !== null) throw new TypeError();
  const summaryByteLength = integer(raw["summaryByteLength"], 0, CONTACT_HISTORY_MAX_SUMMARY_BYTES),
    summaryPreview = text(raw["summaryPreview"], CONTACT_HISTORY_PREVIEW_BYTES),
    bytes = new TextEncoder().encode(summaryPreview).byteLength,
    maximum = Math.min(summaryByteLength, CONTACT_HISTORY_PREVIEW_BYTES);
  const summaryTruncated = bool(raw["summaryTruncated"]),
    direction = raw["direction"],
    type = text(raw["type"], 64);
  if (
    type.length === 0 ||
    (direction !== "inbound" &&
      direction !== "outbound" &&
      direction !== "mutual" &&
      direction !== "unknown") ||
    bytes > maximum ||
    bytes < Math.max(0, maximum - 3) ||
    (summaryByteLength <= CONTACT_HISTORY_PREVIEW_BYTES && bytes !== summaryByteLength) ||
    summaryTruncated !== bytes < summaryByteLength
  )
    throw new TypeError();
  return Object.freeze({
    id: entityId("interaction", text(raw["id"], 36)),
    contactId: raw["contactId"] === null ? null : entityId("contact", text(raw["contactId"], 36)),
    occurredAt: time(raw["occurredAt"]),
    createdAt: time(raw["createdAt"]),
    rowVersion: integer(raw["rowVersion"]),
    type,
    direction,
    currentJob: Object.freeze({
      id: entityId("job", text(job["id"], 36)),
      title: text(job["title"], 1024),
      archivedAt,
      rowVersion: integer(job["rowVersion"]),
      company:
        company === null
          ? null
          : Object.freeze({
              id: entityId("company", text(company["id"], 36)),
              name: text(company["name"], 512),
              archivedAt: nullableTime(company["archivedAt"]),
              rowVersion: integer(company["rowVersion"]),
            }),
    }),
    summaryPreview,
    summaryByteLength,
    summaryTruncated,
  });
};
export const networkInteractionReferenceV1 = (
  owner: NetworkInteractionScopeV1,
  item: NetworkInteractionV1,
): NetworkInteractionReferenceV1 =>
  parseNetworkInteractionReferenceV1({
    ...scope(
      record(owner, [...scopeKeys, "limit", "after", "items", "hasMore", "nextCursor"], scopeKeys),
    ),
    id: item.id,
    occurredAt: item.occurredAt,
    rowVersion: item.rowVersion,
    jobId: item.currentJob.id,
    jobRowVersion: item.currentJob.rowVersion,
    companyId: item.currentJob.company?.id ?? null,
    companyRowVersion: item.currentJob.company?.rowVersion ?? null,
    contactId: item.contactId,
  });
/** Shared order and joined-identity coherence for selected rows and repository lookahead. */
export const validateNetworkInteractionSequenceV1 = (
  items: readonly NetworkInteractionV1[],
  after: { readonly occurredAt: Instant; readonly id: string } | null,
) => {
  const seen = new Set<string>(),
    jobs = new Map<string, string>(),
    companies = new Map<string, string>();
  let previous = after;
  for (const item of items) {
    const encoded = JSON.stringify(item.currentJob),
      prior = jobs.get(item.currentJob.id);
    if (
      seen.has(item.id) ||
      (previous !== null && compareContactInteractions(previous, item) >= 0) ||
      (prior !== undefined && prior !== encoded)
    )
      throw new TypeError();
    seen.add(item.id);
    jobs.set(item.currentJob.id, encoded);
    previous = item;
    if (item.currentJob.company !== null) {
      const company = item.currentJob.company,
        value = JSON.stringify(company),
        old = companies.get(company.id);
      if (old !== undefined && old !== value) throw new TypeError();
      companies.set(company.id, value);
    }
  }
};
export const parseNetworkInteractionsPageV1 = (
  value: unknown,
  input: ListNetworkInteractionsRequestV1,
): NetworkInteractionsPageV1 => {
  const raw = record(value, [...scopeKeys, "items", "hasMore", "nextCursor"]),
    owner = scope(raw);
  if (!sameScope(owner, input) || !Array.isArray(raw["items"]) || raw["items"].length > input.limit)
    throw new TypeError();
  const items = raw["items"].map((item: unknown) => parseNetworkInteractionV1(item, owner));
  validateNetworkInteractionSequenceV1(items, input.after);
  const hasMore = bool(raw["hasMore"]),
    nextCursor =
      raw["nextCursor"] === null ? null : parseNetworkInteractionReferenceV1(raw["nextCursor"]),
    last = items.at(-1);
  if (
    hasMore
      ? items.length !== input.limit ||
        last === undefined ||
        JSON.stringify(nextCursor) !== JSON.stringify(networkInteractionReferenceV1(owner, last))
      : nextCursor !== null
  )
    throw new TypeError();
  return Object.freeze({ ...owner, items: Object.freeze(items), hasMore, nextCursor });
};
export const parseNetworkInteractionSummaryRequestV1 = (
  value: unknown,
): ReadNetworkInteractionSummaryRequestV1 => {
  const raw = record(
    value,
    ["specVersion", "reference", "summaryByteLength", "byteOffset", "limitBytes"],
    ["specVersion", "reference", "summaryByteLength"],
  );
  if (raw["specVersion"] !== 1) throw new TypeError();
  const summaryByteLength = integer(raw["summaryByteLength"], 0, CONTACT_HISTORY_MAX_SUMMARY_BYTES);
  return Object.freeze({
    specVersion: 1,
    reference: parseNetworkInteractionReferenceV1(raw["reference"]),
    summaryByteLength,
    byteOffset:
      raw["byteOffset"] === undefined ? 0 : integer(raw["byteOffset"], 0, summaryByteLength),
    limitBytes: raw["limitBytes"] === undefined ? 16_384 : integer(raw["limitBytes"], 4, 65_536),
  });
};
export const parseNetworkInteractionSummaryTextPartV1 = (
  value: unknown,
  input: ReadNetworkInteractionSummaryRequestV1,
): NetworkInteractionSummaryPartV1 => {
  const raw = record(value, [
      "specVersion",
      "reference",
      "summaryByteLength",
      "byteOffset",
      "text",
      "bytesRead",
      "hasMore",
      "nextByteOffset",
    ]),
    reference = parseNetworkInteractionReferenceV1(raw["reference"]);
  const remaining = input.summaryByteLength - input.byteOffset,
    maximum = Math.min(remaining, input.limitBytes),
    bytesRead = integer(raw["bytesRead"], Math.max(0, maximum - 3), maximum),
    literal = text(raw["text"], input.limitBytes),
    next = input.byteOffset + bytesRead,
    hasMore = next < input.summaryByteLength;
  if (
    raw["specVersion"] !== 1 ||
    JSON.stringify(reference) !== JSON.stringify(input.reference) ||
    raw["summaryByteLength"] !== input.summaryByteLength ||
    raw["byteOffset"] !== input.byteOffset ||
    new TextEncoder().encode(literal).byteLength !== bytesRead ||
    (remaining > 0 && bytesRead === 0) ||
    (!hasMore && bytesRead !== remaining) ||
    (hasMore && remaining <= input.limitBytes) ||
    raw["hasMore"] !== hasMore ||
    raw["nextByteOffset"] !== (hasMore ? next : null)
  )
    throw new TypeError();
  return Object.freeze({
    specVersion: 1,
    reference,
    summaryByteLength: input.summaryByteLength,
    byteOffset: input.byteOffset,
    text: literal,
    bytesRead,
    hasMore,
    nextByteOffset: hasMore ? next : null,
  });
};
export const parseNetworkInteractionSummaryPartV1 = (
  value: unknown,
  input: ReadNetworkInteractionSummaryRequestV1,
): NetworkInteractionSummaryPartV1 => {
  const raw = record(value, [
      "specVersion",
      "reference",
      "summaryByteLength",
      "byteOffset",
      "bytes",
    ]),
    reference = parseNetworkInteractionReferenceV1(raw["reference"]);
  if (
    raw["specVersion"] !== 1 ||
    JSON.stringify(reference) !== JSON.stringify(input.reference) ||
    raw["summaryByteLength"] !== input.summaryByteLength ||
    raw["byteOffset"] !== input.byteOffset
  )
    throw new TypeError();
  const part = decodeLiteralUtf8Chunk(
    raw["bytes"],
    input.summaryByteLength,
    input.byteOffset,
    input.limitBytes,
  );
  return parseNetworkInteractionSummaryTextPartV1(
    {
      specVersion: 1,
      reference,
      summaryByteLength: input.summaryByteLength,
      byteOffset: input.byteOffset,
      text: part.text,
      bytesRead: part.bytesRead,
      hasMore: part.hasMore,
      nextByteOffset: part.hasMore ? input.byteOffset + part.bytesRead : null,
    },
    input,
  );
};
const contextValid = (context: { readonly operationId: string; readonly initiatedAt: string }) => {
  entityId("application-operation", context.operationId);
  instant(context.initiatedAt);
};
const portFailure = (error: unknown) => {
  const code = error instanceof NetworkInteractionHistoryError ? error.code : "unavailable";
  return applicationFailure({
    code: code === "stale" ? "conflict" : code === "invalid_state" ? "internal" : "unavailable",
    message: "Network history could not be confirmed. Refresh its original viewed scope.",
    retryable: code === "unavailable",
  });
};
export const createNetworkInteractionsQuery = (
  port: Pick<NetworkInteractionHistoryPortV1, "listPage">,
) =>
  defineQuery<ListNetworkInteractionsInputV1, NetworkInteractionsPageV1>(
    "ListNetworkInteractionsQuery",
    async (value, context) => {
      let input: ListNetworkInteractionsRequestV1;
      try {
        contextValid(context);
        input = parseNetworkInteractionsRequestV1(value);
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose a valid viewed vault and interaction-history page.",
          retryable: false,
        });
      }
      let result: unknown;
      try {
        result = await port.listPage(input);
      } catch (error) {
        return portFailure(error);
      }
      if (result === undefined)
        return applicationFailure({
          code: "not_found",
          message: "The viewed local vault is unavailable.",
          retryable: false,
        });
      try {
        return applicationSuccess(parseNetworkInteractionsPageV1(result, input));
      } catch {
        return applicationFailure({
          code: "internal",
          message: "Stored Network interaction history did not pass validation.",
          retryable: false,
        });
      }
    },
  );
export const createNetworkInteractionSummaryQuery = (
  port: Pick<NetworkInteractionHistoryPortV1, "readSummaryPart">,
) =>
  defineQuery<ReadNetworkInteractionSummaryInputV1, NetworkInteractionSummaryPartV1>(
    "ReadNetworkInteractionSummaryQuery",
    async (value, context) => {
      let input: ReadNetworkInteractionSummaryRequestV1;
      try {
        contextValid(context);
        input = parseNetworkInteractionSummaryRequestV1(value);
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose a valid original Network summary and bounded part.",
          retryable: false,
        });
      }
      let result: unknown;
      try {
        result = await port.readSummaryPart(input);
      } catch (error) {
        return portFailure(error);
      }
      if (result === undefined)
        return applicationFailure({
          code: "not_found",
          message: "The original local interaction summary is unavailable.",
          retryable: false,
        });
      try {
        return applicationSuccess(parseNetworkInteractionSummaryPartV1(result, input));
      } catch {
        return applicationFailure({
          code: "internal",
          message: "Stored Network summary content did not pass validation.",
          retryable: false,
        });
      }
    },
  );
