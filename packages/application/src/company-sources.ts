import {
  entityId,
  instant,
  webUrl,
  type EntityId,
  type Instant,
  type WebUrl,
} from "@coredrill/domain";
import { parseCompanyJobsRequestV1, type CompanyJobsScopeV1 } from "./company-jobs.js";
import { defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export type CompanySourcesScopeV1 = CompanyJobsScopeV1;
export interface StoredSourceUrlV1 {
  /** Exact stored text; validation never rewrites its literal representation. */
  readonly text: string;
  /** Validated normalized destination, used only after deliberate navigation. */
  readonly href: WebUrl;
}
export interface CompanySourceV1 {
  readonly id: EntityId<"job-source">;
  readonly currentJob: {
    readonly id: EntityId<"job">;
    readonly companyId: EntityId<"company">;
    readonly title: string;
    readonly archivedAt: Instant | null;
    readonly rowVersion: number;
  };
  readonly connectorId: string | null;
  readonly externalId: string | null;
  readonly canonicalUrl: StoredSourceUrlV1 | null;
  readonly applyUrl: StoredSourceUrlV1 | null;
  readonly firstSeenAt: Instant;
  readonly lastSeenAt: Instant;
  readonly contentHash: string | null;
  readonly primary: boolean;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
  /** Most recent by captured time/ID at this read, not verified employer evidence. */
  readonly latestSnapshot: {
    readonly id: EntityId<"source-snapshot">;
    readonly jobSourceId: EntityId<"job-source">;
    readonly capturedAt: Instant;
    readonly createdAt: Instant;
    readonly extractorId: string;
    readonly extractorVersion: string;
    readonly contentHash: string;
    readonly retentionClass: string;
    readonly rowVersion: number;
  } | null;
}
export interface CompanySourcesCursorV1 extends CompanySourcesScopeV1 {
  readonly sourceId: EntityId<"job-source">;
  readonly sourceUpdatedAt: Instant;
  readonly sourceRowVersion: number;
  readonly jobId: EntityId<"job">;
  readonly jobRowVersion: number;
}
export interface ListCompanySourcesInputV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: string;
  readonly companyId: string;
  readonly expectedCompanyRowVersion: number;
  readonly includeArchivedCompany?: boolean;
  readonly includeArchivedJobs?: boolean;
  readonly limit?: number;
  readonly after?: CompanySourcesCursorV1 | null;
}
export interface ListCompanySourcesRequestV1 extends CompanySourcesScopeV1 {
  readonly limit: number;
  readonly after: CompanySourcesCursorV1 | null;
}
export interface CompanySourcesPageV1 extends CompanySourcesScopeV1 {
  readonly items: readonly CompanySourceV1[];
  readonly hasMore: boolean;
  readonly nextCursor: CompanySourcesCursorV1 | null;
}
export interface CompanySourcesPortV1 {
  listPage(input: ListCompanySourcesRequestV1): Promise<unknown>;
}
export class CompanySourcesError extends Error {
  public override readonly name = "CompanySourcesError";
  public constructor(public readonly code: "stale" | "invalid_state" | "unavailable") {
    super("Local company-linked listing sources could not be read.");
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
const anchorKeys = [
  "sourceId",
  "sourceUpdatedAt",
  "sourceRowVersion",
  "jobId",
  "jobRowVersion",
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
const text = (value: unknown, maximum: number): string => {
  if (typeof value !== "string" || value.length > maximum || /[\uD800-\uDFFF]/u.test(value))
    throw new TypeError();
  return value;
};
const integer = (value: unknown, maximum = Number.MAX_SAFE_INTEGER): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new TypeError();
  return value;
};
const bool = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new TypeError();
  return value;
};
const hash = (value: unknown): string => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new TypeError();
  return value;
};
const scope = (raw: Record<string, unknown>, defaults = false): CompanySourcesScopeV1 => {
  if (!defaults) {
    bool(raw["includeArchivedCompany"]);
    bool(raw["includeArchivedJobs"]);
  }
  const input = parseCompanyJobsRequestV1(
    Object.fromEntries(
      scopeKeys.filter((key) => Object.hasOwn(raw, key)).map((key) => [key, raw[key]]),
    ),
  );
  return Object.freeze({
    specVersion: 1,
    expectedVaultId: input.expectedVaultId,
    companyId: input.companyId,
    expectedCompanyRowVersion: input.expectedCompanyRowVersion,
    includeArchivedCompany: input.includeArchivedCompany,
    includeArchivedJobs: input.includeArchivedJobs,
  });
};
const sameScope = (a: CompanySourcesScopeV1, b: CompanySourcesScopeV1) =>
  scopeKeys.every((key) => a[key] === b[key]);
export const parseCompanySourcesCursorV1 = (value: unknown): CompanySourcesCursorV1 => {
  const raw = record(value, [...scopeKeys, ...anchorKeys]);
  return Object.freeze({
    ...scope(raw),
    sourceId: entityId("job-source", text(raw["sourceId"], 36)),
    sourceUpdatedAt: instant(text(raw["sourceUpdatedAt"], 24)),
    sourceRowVersion: integer(raw["sourceRowVersion"]),
    jobId: entityId("job", text(raw["jobId"], 36)),
    jobRowVersion: integer(raw["jobRowVersion"]),
  });
};
export const parseCompanySourcesRequestV1 = (value: unknown): ListCompanySourcesRequestV1 => {
  const raw = record(value, [...scopeKeys, "limit", "after"], scopeKeys.slice(0, 4)),
    owner = scope(raw, true);
  const after =
    raw["after"] === undefined || raw["after"] === null
      ? null
      : parseCompanySourcesCursorV1(raw["after"]);
  if (after !== null && !sameScope(after, owner)) throw new TypeError();
  return Object.freeze({
    ...owner,
    limit: raw["limit"] === undefined ? 10 : integer(raw["limit"], 25),
    after,
  });
};
export const storedSourceUrlV1 = (value: unknown): StoredSourceUrlV1 | null => {
  if (value === null) return null;
  const literal = text(value, 8192);
  return Object.freeze({ text: literal, href: webUrl(literal) });
};
const url = (value: unknown): StoredSourceUrlV1 | null => {
  if (value === null) return null;
  const raw = record(value, ["text", "href"]),
    result = storedSourceUrlV1(raw["text"]);
  if (result === null || raw["href"] !== result.href) throw new TypeError();
  return result;
};
const snapshot = (
  value: unknown,
  sourceId: EntityId<"job-source">,
): CompanySourceV1["latestSnapshot"] => {
  if (value === null) return null;
  const raw = record(value, [
    "id",
    "jobSourceId",
    "capturedAt",
    "createdAt",
    "extractorId",
    "extractorVersion",
    "contentHash",
    "retentionClass",
    "rowVersion",
  ]);
  const extractorId = text(raw["extractorId"], 128),
    extractorVersion = text(raw["extractorVersion"], 64),
    retentionClass = text(raw["retentionClass"], 64);
  if (
    raw["jobSourceId"] !== sourceId ||
    extractorId.length === 0 ||
    extractorVersion.length === 0 ||
    retentionClass.length === 0
  )
    throw new TypeError();
  return Object.freeze({
    id: entityId("source-snapshot", text(raw["id"], 36)),
    jobSourceId: sourceId,
    capturedAt: instant(text(raw["capturedAt"], 24)),
    createdAt: instant(text(raw["createdAt"], 24)),
    extractorId,
    extractorVersion,
    contentHash: hash(raw["contentHash"]),
    retentionClass,
    rowVersion: integer(raw["rowVersion"]),
  });
};
export const parseCompanySourceV1 = (
  value: unknown,
  owner: CompanySourcesScopeV1,
): CompanySourceV1 => {
  const raw = record(value, [
    "id",
    "currentJob",
    "connectorId",
    "externalId",
    "canonicalUrl",
    "applyUrl",
    "firstSeenAt",
    "lastSeenAt",
    "contentHash",
    "primary",
    "createdAt",
    "updatedAt",
    "rowVersion",
    "latestSnapshot",
  ]);
  const currentJob = record(raw["currentJob"], [
    "id",
    "companyId",
    "title",
    "archivedAt",
    "rowVersion",
  ]);
  const title = text(currentJob["title"], 1024),
    id = entityId("job-source", text(raw["id"], 36));
  const archivedAt =
    currentJob["archivedAt"] === null ? null : instant(text(currentJob["archivedAt"], 24));
  const firstSeenAt = instant(text(raw["firstSeenAt"], 24)),
    lastSeenAt = instant(text(raw["lastSeenAt"], 24));
  const createdAt = instant(text(raw["createdAt"], 24)),
    updatedAt = instant(text(raw["updatedAt"], 24));
  if (
    title.trim().length === 0 ||
    currentJob["companyId"] !== owner.companyId ||
    (!owner.includeArchivedJobs && archivedAt !== null) ||
    firstSeenAt > lastSeenAt ||
    createdAt > updatedAt
  )
    throw new TypeError();
  return Object.freeze({
    id,
    currentJob: Object.freeze({
      id: entityId("job", text(currentJob["id"], 36)),
      companyId: owner.companyId,
      title,
      archivedAt,
      rowVersion: integer(currentJob["rowVersion"]),
    }),
    connectorId: raw["connectorId"] === null ? null : text(raw["connectorId"], 128),
    externalId: raw["externalId"] === null ? null : text(raw["externalId"], 1024),
    canonicalUrl: url(raw["canonicalUrl"]),
    applyUrl: url(raw["applyUrl"]),
    firstSeenAt,
    lastSeenAt,
    contentHash: raw["contentHash"] === null ? null : hash(raw["contentHash"]),
    primary: bool(raw["primary"]),
    createdAt,
    updatedAt,
    rowVersion: integer(raw["rowVersion"]),
    latestSnapshot: snapshot(raw["latestSnapshot"], id),
  });
};
export const compareCompanySourceKeysV1 = (
  left: { readonly updatedAt: Instant; readonly id: string },
  right: { readonly updatedAt: Instant; readonly id: string },
) =>
  left.updatedAt === right.updatedAt
    ? left.id < right.id
      ? -1
      : left.id > right.id
        ? 1
        : 0
    : left.updatedAt > right.updatedAt
      ? -1
      : 1;
export const companySourcesCursorV1 = (
  owner: CompanySourcesScopeV1,
  item: CompanySourceV1,
): CompanySourcesCursorV1 =>
  parseCompanySourcesCursorV1({
    ...scope(Object.fromEntries(scopeKeys.map((key) => [key, owner[key]]))),
    sourceId: item.id,
    sourceUpdatedAt: item.updatedAt,
    sourceRowVersion: item.rowVersion,
    jobId: item.currentJob.id,
    jobRowVersion: item.currentJob.rowVersion,
  });
export const parseCompanySourcesPageV1 = (
  value: unknown,
  request: ListCompanySourcesRequestV1,
): CompanySourcesPageV1 => {
  const raw = record(value, [...scopeKeys, "items", "hasMore", "nextCursor"]),
    owner = scope(raw);
  if (
    !sameScope(owner, request) ||
    !Array.isArray(raw["items"]) ||
    raw["items"].length > request.limit
  )
    throw new TypeError();
  const items = raw["items"].map((item: unknown) => parseCompanySourceV1(item, owner));
  let previous =
    request.after === null
      ? null
      : { id: request.after.sourceId, updatedAt: request.after.sourceUpdatedAt };
  const seen = new Set<string>(),
    jobs = new Map<string, string>(),
    snapshots = new Set<string>();
  for (const item of items) {
    const job = JSON.stringify(item.currentJob),
      prior = jobs.get(item.currentJob.id);
    if (
      seen.has(item.id) ||
      (previous !== null && compareCompanySourceKeysV1(previous, item) >= 0) ||
      (prior !== undefined && prior !== job) ||
      (item.latestSnapshot !== null && snapshots.has(item.latestSnapshot.id))
    )
      throw new TypeError();
    seen.add(item.id);
    jobs.set(item.currentJob.id, job);
    previous = item;
    if (item.latestSnapshot !== null) snapshots.add(item.latestSnapshot.id);
  }
  const hasMore = bool(raw["hasMore"]),
    nextCursor = raw["nextCursor"] === null ? null : parseCompanySourcesCursorV1(raw["nextCursor"]);
  if (hasMore) {
    const last = items.at(-1);
    if (
      items.length !== request.limit ||
      last === undefined ||
      nextCursor === null ||
      JSON.stringify(nextCursor) !== JSON.stringify(companySourcesCursorV1(owner, last))
    )
      throw new TypeError();
  } else if (nextCursor !== null) throw new TypeError();
  return Object.freeze({ ...owner, items: Object.freeze(items), hasMore, nextCursor });
};
export const createCompanySourcesQuery = (port: CompanySourcesPortV1) =>
  defineQuery<ListCompanySourcesInputV1, CompanySourcesPageV1>(
    "ListCompanySourcesQuery",
    async (value, context) => {
      let request: ListCompanySourcesRequestV1;
      try {
        entityId("application-operation", context.operationId);
        instant(context.initiatedAt);
        request = parseCompanySourcesRequestV1(value);
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose a valid viewed company and listing-source page.",
          retryable: false,
        });
      }
      let result: unknown;
      try {
        result = await port.listPage(request);
      } catch (error) {
        const code = error instanceof CompanySourcesError ? error.code : "unavailable";
        return applicationFailure({
          code:
            code === "stale" ? "conflict" : code === "invalid_state" ? "internal" : "unavailable",
          message:
            "Company-linked listing sources could not be confirmed. Refresh the viewed company before continuing.",
          retryable: code === "unavailable",
        });
      }
      if (result === undefined)
        return applicationFailure({
          code: "not_found",
          message: "The viewed local company is unavailable in this scope.",
          retryable: false,
        });
      try {
        return applicationSuccess(parseCompanySourcesPageV1(result, request));
      } catch {
        return applicationFailure({
          code: "internal",
          message: "Stored company-linked listing sources did not pass validation.",
          retryable: false,
        });
      }
    },
  );
