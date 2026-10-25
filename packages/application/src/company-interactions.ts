import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";
import { parseCompanyJobsRequestV1, type CompanyJobsScopeV1 } from "./company-jobs.js";
import {
  CONTACT_HISTORY_MAX_SUMMARY_BYTES,
  CONTACT_HISTORY_PREVIEW_BYTES,
  compareContactInteractions,
} from "./contact-interaction-history.js";
import { decodeLiteralUtf8Chunk } from "./literal-utf8-chunk.js";
import { defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export type CompanyInteractionsScopeV1 = CompanyJobsScopeV1;
/** Current job/company membership is not occurrence-time employer evidence. */
export interface CompanyInteractionV1 {
  readonly id: EntityId<"interaction">;
  readonly contactId: EntityId<"contact"> | null;
  readonly currentJob: {
    readonly id: EntityId<"job">;
    readonly companyId: EntityId<"company">;
    readonly title: string;
    readonly archivedAt: Instant | null;
    readonly rowVersion: number;
  };
  readonly type: string;
  readonly direction: "inbound" | "outbound" | "mutual" | "unknown";
  readonly occurredAt: Instant;
  readonly createdAt: Instant;
  readonly rowVersion: number;
  readonly summaryPreview: string;
  readonly summaryByteLength: number;
  readonly summaryTruncated: boolean;
}
export interface CompanyInteractionReferenceV1 extends CompanyInteractionsScopeV1 {
  readonly id: EntityId<"interaction">;
  readonly occurredAt: Instant;
  readonly rowVersion: number;
  readonly jobId: EntityId<"job">;
  readonly jobRowVersion: number;
  readonly contactId: EntityId<"contact"> | null;
}
export interface ListCompanyInteractionsInputV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: string;
  readonly companyId: string;
  readonly expectedCompanyRowVersion: number;
  readonly includeArchivedCompany?: boolean;
  readonly includeArchivedJobs?: boolean;
  readonly limit?: number;
  readonly after?: CompanyInteractionReferenceV1 | null;
}
export interface ListCompanyInteractionsRequestV1 extends CompanyInteractionsScopeV1 {
  readonly limit: number;
  readonly after: CompanyInteractionReferenceV1 | null;
}
export interface CompanyInteractionsPageV1 extends CompanyInteractionsScopeV1 {
  readonly items: readonly CompanyInteractionV1[];
  readonly hasMore: boolean;
  readonly nextCursor: CompanyInteractionReferenceV1 | null;
}
export interface ReadCompanyInteractionSummaryInputV1 {
  readonly specVersion: 1;
  readonly reference: CompanyInteractionReferenceV1;
  readonly summaryByteLength: number;
  readonly byteOffset?: number;
  readonly limitBytes?: number;
}
export interface ReadCompanyInteractionSummaryRequestV1 {
  readonly specVersion: 1;
  readonly reference: CompanyInteractionReferenceV1;
  readonly summaryByteLength: number;
  readonly byteOffset: number;
  readonly limitBytes: number;
}
export interface CompanyInteractionSummaryPartV1 {
  readonly specVersion: 1;
  readonly reference: CompanyInteractionReferenceV1;
  readonly summaryByteLength: number;
  readonly byteOffset: number;
  readonly text: string;
  readonly bytesRead: number;
  readonly hasMore: boolean;
  readonly nextByteOffset: number | null;
}
export interface CompanyInteractionsPortV1 {
  listPage(input: ListCompanyInteractionsRequestV1): Promise<unknown>;
  readSummaryPart(input: ReadCompanyInteractionSummaryRequestV1): Promise<unknown>;
}
export class CompanyInteractionsError extends Error {
  public override readonly name = "CompanyInteractionsError";
  public constructor(public readonly code: "stale" | "invalid_state" | "unavailable") {
    super("Local company-linked interaction history could not be read.");
    if (!["stale", "invalid_state", "unavailable"].includes(code)) throw new TypeError();
  }
}
const scopeKeys = [
  "specVersion",
  "expectedVaultId",
  "companyId",
  "expectedCompanyRowVersion",
  "includeArchivedCompany",
  "includeArchivedJobs",
] as const;
const referenceKeys = [
  "id",
  "occurredAt",
  "rowVersion",
  "jobId",
  "jobRowVersion",
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
const integer = (value: unknown, minimum = 1, maximum = Number.MAX_SAFE_INTEGER) => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    throw new TypeError();
  return value;
};
const text = (value: unknown, maximum: number): string => {
  if (typeof value !== "string" || value.length > maximum || /[\uD800-\uDFFF]/u.test(value))
    throw new TypeError();
  return value;
};
const bool = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new TypeError();
  return value;
};
const scope = (raw: Record<string, unknown>, defaults = false): CompanyInteractionsScopeV1 => {
  if (!defaults) {
    bool(raw["includeArchivedCompany"]);
    bool(raw["includeArchivedJobs"]);
  }
  const parsed = parseCompanyJobsRequestV1(
    Object.fromEntries(
      scopeKeys.filter((key) => Object.hasOwn(raw, key)).map((key) => [key, raw[key]]),
    ),
  );
  return Object.freeze({
    specVersion: parsed.specVersion,
    expectedVaultId: parsed.expectedVaultId,
    companyId: parsed.companyId,
    expectedCompanyRowVersion: parsed.expectedCompanyRowVersion,
    includeArchivedCompany: parsed.includeArchivedCompany,
    includeArchivedJobs: parsed.includeArchivedJobs,
  });
};
const sameScope = (a: CompanyInteractionsScopeV1, b: CompanyInteractionsScopeV1) =>
  scopeKeys.every((key) => a[key] === b[key]);
export const parseCompanyInteractionReferenceV1 = (
  value: unknown,
): CompanyInteractionReferenceV1 => {
  const raw = record(value, [...scopeKeys, ...referenceKeys]);
  return Object.freeze({
    ...scope(raw),
    id: entityId("interaction", text(raw["id"], 36)),
    occurredAt: instant(text(raw["occurredAt"], 24)),
    rowVersion: integer(raw["rowVersion"]),
    jobId: entityId("job", text(raw["jobId"], 36)),
    jobRowVersion: integer(raw["jobRowVersion"]),
    contactId: raw["contactId"] === null ? null : entityId("contact", text(raw["contactId"], 36)),
  });
};
export const parseCompanyInteractionsRequestV1 = (
  value: unknown,
): ListCompanyInteractionsRequestV1 => {
  const raw = record(value, [...scopeKeys, "limit", "after"], scopeKeys.slice(0, 4));
  const owner = scope(raw, true);
  const after =
    raw["after"] === undefined || raw["after"] === null
      ? null
      : parseCompanyInteractionReferenceV1(raw["after"]);
  if (after !== null && !sameScope(after, owner)) throw new TypeError();
  return Object.freeze({
    ...owner,
    limit: raw["limit"] === undefined ? 10 : integer(raw["limit"], 1, 25),
    after,
  });
};
export const parseCompanyInteractionV1 = (
  value: unknown,
  owner: CompanyInteractionsScopeV1,
): CompanyInteractionV1 => {
  const raw = record(value, [
    "id",
    "contactId",
    "currentJob",
    "type",
    "direction",
    "occurredAt",
    "createdAt",
    "rowVersion",
    "summaryPreview",
    "summaryByteLength",
    "summaryTruncated",
  ]);
  const job = record(raw["currentJob"], ["id", "companyId", "title", "archivedAt", "rowVersion"]);
  const title = text(job["title"], 1024),
    type = text(raw["type"], 128);
  const archivedAt = job["archivedAt"] === null ? null : instant(text(job["archivedAt"], 24));
  const occurredAt = instant(text(raw["occurredAt"], 24)),
    createdAt = instant(text(raw["createdAt"], 24));
  const preview = text(raw["summaryPreview"], CONTACT_HISTORY_PREVIEW_BYTES);
  const bytes = new TextEncoder().encode(preview).byteLength;
  const byteLength = integer(raw["summaryByteLength"], 0, CONTACT_HISTORY_MAX_SUMMARY_BYTES);
  const truncated = bool(raw["summaryTruncated"]),
    direction = raw["direction"];
  if (
    job["companyId"] !== owner.companyId ||
    title.trim().length === 0 ||
    (!owner.includeArchivedJobs && archivedAt !== null) ||
    occurredAt > createdAt ||
    !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u.test(type) ||
    bytes > CONTACT_HISTORY_PREVIEW_BYTES ||
    bytes > byteLength ||
    truncated !== bytes < byteLength ||
    (byteLength <= CONTACT_HISTORY_PREVIEW_BYTES && truncated) ||
    (truncated && bytes < CONTACT_HISTORY_PREVIEW_BYTES - 3)
  )
    throw new TypeError();
  if (
    direction !== "inbound" &&
    direction !== "outbound" &&
    direction !== "mutual" &&
    direction !== "unknown"
  )
    throw new TypeError();
  return Object.freeze({
    id: entityId("interaction", text(raw["id"], 36)),
    contactId: raw["contactId"] === null ? null : entityId("contact", text(raw["contactId"], 36)),
    currentJob: Object.freeze({
      id: entityId("job", text(job["id"], 36)),
      companyId: owner.companyId,
      title,
      archivedAt,
      rowVersion: integer(job["rowVersion"]),
    }),
    type,
    direction,
    occurredAt,
    createdAt,
    rowVersion: integer(raw["rowVersion"]),
    summaryPreview: preview,
    summaryByteLength: byteLength,
    summaryTruncated: truncated,
  });
};
export const companyInteractionReferenceV1 = (
  owner: CompanyInteractionsScopeV1,
  item: CompanyInteractionV1,
): CompanyInteractionReferenceV1 =>
  parseCompanyInteractionReferenceV1({
    ...scope(Object.fromEntries(scopeKeys.map((key) => [key, owner[key]]))),
    id: item.id,
    occurredAt: item.occurredAt,
    rowVersion: item.rowVersion,
    jobId: item.currentJob.id,
    jobRowVersion: item.currentJob.rowVersion,
    contactId: item.contactId,
  });
export const parseCompanyInteractionsPageV1 = (
  value: unknown,
  input: ListCompanyInteractionsRequestV1,
): CompanyInteractionsPageV1 => {
  const raw = record(value, [...scopeKeys, "items", "hasMore", "nextCursor"]),
    owner = scope(raw);
  if (!sameScope(owner, input) || !Array.isArray(raw["items"]) || raw["items"].length > input.limit)
    throw new TypeError();
  const items = raw["items"].map((item: unknown) => parseCompanyInteractionV1(item, owner));
  const seen = new Set<string>(),
    jobs = new Map<string, CompanyInteractionV1["currentJob"]>();
  let previous: { readonly occurredAt: Instant; readonly id: string } | null = input.after;
  for (const item of items) {
    const priorJob = jobs.get(item.currentJob.id);
    if (
      seen.has(item.id) ||
      (previous !== null && compareContactInteractions(previous, item) >= 0) ||
      (priorJob !== undefined && JSON.stringify(priorJob) !== JSON.stringify(item.currentJob))
    )
      throw new TypeError();
    seen.add(item.id);
    jobs.set(item.currentJob.id, item.currentJob);
    previous = item;
  }
  const hasMore = bool(raw["hasMore"]),
    nextCursor =
      raw["nextCursor"] === null ? null : parseCompanyInteractionReferenceV1(raw["nextCursor"]);
  if (hasMore) {
    const last = items.at(-1);
    if (
      items.length !== input.limit ||
      last === undefined ||
      nextCursor === null ||
      JSON.stringify(nextCursor) !== JSON.stringify(companyInteractionReferenceV1(owner, last))
    )
      throw new TypeError();
  } else if (nextCursor !== null) throw new TypeError();
  return Object.freeze({ ...owner, items: Object.freeze(items), hasMore, nextCursor });
};
export const parseCompanyInteractionSummaryRequestV1 = (
  value: unknown,
): ReadCompanyInteractionSummaryRequestV1 => {
  const raw = record(
    value,
    ["specVersion", "reference", "summaryByteLength", "byteOffset", "limitBytes"],
    ["specVersion", "reference", "summaryByteLength"],
  );
  if (raw["specVersion"] !== 1) throw new TypeError();
  const summaryByteLength = integer(raw["summaryByteLength"], 0, CONTACT_HISTORY_MAX_SUMMARY_BYTES);
  return Object.freeze({
    specVersion: 1,
    reference: parseCompanyInteractionReferenceV1(raw["reference"]),
    summaryByteLength,
    byteOffset:
      raw["byteOffset"] === undefined ? 0 : integer(raw["byteOffset"], 0, summaryByteLength),
    limitBytes: raw["limitBytes"] === undefined ? 16_384 : integer(raw["limitBytes"], 4, 65_536),
  });
};
export const parseCompanyInteractionSummaryTextPartV1 = (
  value: unknown,
  input: ReadCompanyInteractionSummaryRequestV1,
): CompanyInteractionSummaryPartV1 => {
  const raw = record(value, [
    "specVersion",
    "reference",
    "summaryByteLength",
    "byteOffset",
    "text",
    "bytesRead",
    "hasMore",
    "nextByteOffset",
  ]);
  const reference = parseCompanyInteractionReferenceV1(raw["reference"]);
  const remaining = input.summaryByteLength - input.byteOffset,
    maximum = Math.min(remaining, input.limitBytes);
  const bytesRead = integer(raw["bytesRead"], Math.max(0, maximum - 3), maximum),
    next = input.byteOffset + bytesRead;
  const literal = text(raw["text"], input.limitBytes),
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
export const parseCompanyInteractionSummaryPartV1 = (
  value: unknown,
  input: ReadCompanyInteractionSummaryRequestV1,
): CompanyInteractionSummaryPartV1 => {
  const raw = record(value, [
    "specVersion",
    "reference",
    "summaryByteLength",
    "byteOffset",
    "bytes",
  ]);
  const reference = parseCompanyInteractionReferenceV1(raw["reference"]);
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
  return parseCompanyInteractionSummaryTextPartV1(
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
  const code = error instanceof CompanyInteractionsError ? error.code : "unavailable";
  return applicationFailure({
    code: code === "stale" ? "conflict" : code === "invalid_state" ? "internal" : "unavailable",
    message:
      "Company-linked history could not be confirmed. Refresh the viewed company and history.",
    retryable: code === "unavailable",
  });
};
export const createCompanyInteractionsQuery = (port: Pick<CompanyInteractionsPortV1, "listPage">) =>
  defineQuery<ListCompanyInteractionsInputV1, CompanyInteractionsPageV1>(
    "ListCompanyInteractionsQuery",
    async (value, context) => {
      let input: ListCompanyInteractionsRequestV1;
      try {
        contextValid(context);
        input = parseCompanyInteractionsRequestV1(value);
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose a valid viewed company and history page.",
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
          message: "The viewed local company is unavailable in this scope.",
          retryable: false,
        });
      try {
        return applicationSuccess(parseCompanyInteractionsPageV1(result, input));
      } catch {
        return applicationFailure({
          code: "internal",
          message: "Stored company-linked history did not pass validation.",
          retryable: false,
        });
      }
    },
  );
export const createCompanyInteractionSummaryQuery = (
  port: Pick<CompanyInteractionsPortV1, "readSummaryPart">,
) =>
  defineQuery<ReadCompanyInteractionSummaryInputV1, CompanyInteractionSummaryPartV1>(
    "ReadCompanyInteractionSummaryQuery",
    async (value, context) => {
      let input: ReadCompanyInteractionSummaryRequestV1;
      try {
        contextValid(context);
        input = parseCompanyInteractionSummaryRequestV1(value);
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose a valid viewed company interaction summary.",
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
          message: "The viewed company interaction summary is unavailable in this scope.",
          retryable: false,
        });
      try {
        return applicationSuccess(parseCompanyInteractionSummaryPartV1(result, input));
      } catch {
        return applicationFailure({
          code: "internal",
          message: "Stored company interaction summary did not pass validation.",
          retryable: false,
        });
      }
    },
  );
