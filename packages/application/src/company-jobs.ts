import {
  entityId,
  instant,
  isStatusCategory,
  type EntityId,
  type Instant,
  type StatusCategory,
} from "@coredrill/domain";
import { defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export interface CompanyJobsScopeV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: EntityId<"vault">;
  readonly companyId: EntityId<"company">;
  readonly expectedCompanyRowVersion: number;
  readonly includeArchivedCompany: boolean;
  readonly includeArchivedJobs: boolean;
}
export interface CompanyJobSummaryV1 {
  readonly id: EntityId<"job">;
  readonly companyId: EntityId<"company">;
  readonly title: string;
  readonly status: {
    readonly id: EntityId<"status_definition">;
    readonly name: string;
    readonly category: StatusCategory;
    readonly terminal: boolean;
    readonly rowVersion: number;
  } | null;
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}
export interface CompanyJobsCursorV1 extends CompanyJobsScopeV1 {
  readonly jobId: EntityId<"job">;
  readonly jobUpdatedAt: Instant;
  readonly jobRowVersion: number;
}
export interface ListCompanyJobsInputV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: string;
  readonly companyId: string;
  readonly expectedCompanyRowVersion: number;
  readonly includeArchivedCompany?: boolean;
  readonly includeArchivedJobs?: boolean;
  readonly limit?: number;
  readonly after?: CompanyJobsCursorV1 | null;
}
export interface ListCompanyJobsRequestV1 extends CompanyJobsScopeV1 {
  readonly limit: number;
  readonly after: CompanyJobsCursorV1 | null;
}
export interface CompanyJobsPageV1 extends CompanyJobsScopeV1 {
  readonly items: readonly CompanyJobSummaryV1[];
  readonly hasMore: boolean;
  readonly nextCursor: CompanyJobsCursorV1 | null;
}
export interface CompanyJobsPortV1 {
  listPage(input: ListCompanyJobsRequestV1): Promise<unknown>;
}
export class CompanyJobsError extends Error {
  public override readonly name = "CompanyJobsError";
  public constructor(public readonly code: "stale" | "invalid_state" | "unavailable") {
    super("Local company-linked jobs could not be read.");
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
const anchorKeys = ["jobId", "jobUpdatedAt", "jobRowVersion"] as const;
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
const integer = (value: unknown, maximum = Number.MAX_SAFE_INTEGER): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new TypeError();
  return value;
};
const bool = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new TypeError();
  return value;
};
const text = (value: unknown, maximum: number): string => {
  if (typeof value !== "string" || value.length > maximum || /[\uD800-\uDFFF]/u.test(value))
    throw new TypeError();
  return value;
};
const scope = (value: Record<string, unknown>): CompanyJobsScopeV1 => {
  if (value["specVersion"] !== 1) throw new TypeError();
  return Object.freeze({
    specVersion: 1,
    expectedVaultId: entityId("vault", text(value["expectedVaultId"], 36)),
    companyId: entityId("company", text(value["companyId"], 36)),
    expectedCompanyRowVersion: integer(value["expectedCompanyRowVersion"]),
    includeArchivedCompany: bool(value["includeArchivedCompany"]),
    includeArchivedJobs: bool(value["includeArchivedJobs"]),
  });
};
const sameScope = (a: CompanyJobsScopeV1, b: CompanyJobsScopeV1) =>
  scopeKeys.every((key) => a[key] === b[key]);
const cursor = (value: unknown): CompanyJobsCursorV1 => {
  const raw = record(value, [...scopeKeys, ...anchorKeys]);
  return Object.freeze({
    ...scope(raw),
    jobId: entityId("job", text(raw["jobId"], 36)),
    jobUpdatedAt: instant(text(raw["jobUpdatedAt"], 24)),
    jobRowVersion: integer(raw["jobRowVersion"]),
  });
};

/** Copies original scope before a selected database can be opened. */
export const parseCompanyJobsRequestV1 = (value: unknown): ListCompanyJobsRequestV1 => {
  const raw = record(value, [...scopeKeys, "limit", "after"], scopeKeys.slice(0, 4));
  const copied = scope({
    ...raw,
    includeArchivedCompany:
      raw["includeArchivedCompany"] === undefined ? false : raw["includeArchivedCompany"],
    includeArchivedJobs:
      raw["includeArchivedJobs"] === undefined ? false : raw["includeArchivedJobs"],
  });
  const after = raw["after"] === undefined || raw["after"] === null ? null : cursor(raw["after"]);
  if (after !== null && !sameScope(after, copied)) throw new TypeError();
  return Object.freeze({
    ...copied,
    limit: integer(raw["limit"] === undefined ? 10 : raw["limit"], 25),
    after,
  });
};
export const compareCompanyJobKeysV1 = (
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

/** Literal current status, not normalized text or an inferred application outcome. */
const status = (value: unknown): CompanyJobSummaryV1["status"] => {
  if (value === null) return null;
  const raw = record(value, ["id", "name", "category", "terminal", "rowVersion"]);
  const name = text(raw["name"], 80);
  if (name.trim().length === 0 || !isStatusCategory(raw["category"])) throw new TypeError();
  return Object.freeze({
    id: entityId("status_definition", text(raw["id"], 36)),
    name,
    category: raw["category"],
    terminal: bool(raw["terminal"]),
    rowVersion: integer(raw["rowVersion"]),
  });
};
export const parseCompanyJobSummaryV1 = (
  value: unknown,
  request: CompanyJobsScopeV1,
): CompanyJobSummaryV1 => {
  const raw = record(value, [
    "id",
    "companyId",
    "title",
    "status",
    "archivedAt",
    "createdAt",
    "updatedAt",
    "rowVersion",
  ]);
  const title = text(raw["title"], 1024);
  if (title.trim().length === 0 || raw["companyId"] !== request.companyId) throw new TypeError();
  const copied = Object.freeze({
    id: entityId("job", text(raw["id"], 36)),
    companyId: request.companyId,
    title,
    status: status(raw["status"]),
    archivedAt: raw["archivedAt"] === null ? null : instant(text(raw["archivedAt"], 24)),
    createdAt: instant(text(raw["createdAt"], 24)),
    updatedAt: instant(text(raw["updatedAt"], 24)),
    rowVersion: integer(raw["rowVersion"]),
  });
  if (
    (!request.includeArchivedJobs && copied.archivedAt !== null) ||
    copied.createdAt > copied.updatedAt ||
    (copied.archivedAt !== null &&
      (copied.archivedAt < copied.createdAt || copied.archivedAt > copied.updatedAt))
  )
    throw new TypeError();
  return copied;
};
export const companyJobsCursorV1 = (
  request: CompanyJobsScopeV1,
  last: CompanyJobSummaryV1,
): CompanyJobsCursorV1 =>
  Object.freeze({
    ...scope(Object.fromEntries(scopeKeys.map((key) => [key, request[key]]))),
    jobId: last.id,
    jobUpdatedAt: last.updatedAt,
    jobRowVersion: last.rowVersion,
  });
export const parseCompanyJobsPageV1 = (
  value: unknown,
  request: ListCompanyJobsRequestV1,
): CompanyJobsPageV1 => {
  const raw = record(value, [...scopeKeys, "items", "hasMore", "nextCursor"]);
  const actual = scope(raw);
  if (
    !sameScope(actual, request) ||
    !Array.isArray(raw["items"]) ||
    raw["items"].length > request.limit
  )
    throw new TypeError();
  const items = raw["items"].map((item: unknown) => parseCompanyJobSummaryV1(item, request));
  let previous =
    request.after === null
      ? null
      : { updatedAt: request.after.jobUpdatedAt, id: request.after.jobId };
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id) || (previous !== null && compareCompanyJobKeysV1(previous, item) >= 0))
      throw new TypeError();
    previous = item;
    seen.add(item.id);
  }
  const hasMore = bool(raw["hasMore"]);
  const nextCursor = raw["nextCursor"] === null ? null : cursor(raw["nextCursor"]);
  if (hasMore) {
    const last = items.at(-1);
    if (items.length !== request.limit || last === undefined || nextCursor === null)
      throw new TypeError();
    const expected = companyJobsCursorV1(actual, last);
    if (![...scopeKeys, ...anchorKeys].every((key) => nextCursor[key] === expected[key]))
      throw new TypeError();
  } else if (nextCursor !== null) throw new TypeError();
  return Object.freeze({ ...actual, items: Object.freeze(items), hasMore, nextCursor });
};
export const createCompanyJobsQuery = (port: CompanyJobsPortV1) =>
  defineQuery<ListCompanyJobsInputV1, CompanyJobsPageV1>(
    "ListCompanyJobsQuery",
    async (value, context) => {
      let request: ListCompanyJobsRequestV1;
      try {
        entityId("application-operation", context.operationId);
        instant(context.initiatedAt);
        request = parseCompanyJobsRequestV1(value);
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose a valid viewed company and saved-job page.",
          retryable: false,
        });
      }
      let result: unknown;
      try {
        result = await port.listPage(request);
      } catch (error) {
        const code = error instanceof CompanyJobsError ? error.code : "unavailable";
        return applicationFailure({
          code:
            code === "stale" ? "conflict" : code === "invalid_state" ? "internal" : "unavailable",
          message:
            "Company-linked jobs could not be confirmed. Refresh the viewed company before continuing.",
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
        return applicationSuccess(parseCompanyJobsPageV1(result, request));
      } catch {
        return applicationFailure({
          code: "internal",
          message: "Stored company-linked jobs did not pass validation.",
          retryable: false,
        });
      }
    },
  );
