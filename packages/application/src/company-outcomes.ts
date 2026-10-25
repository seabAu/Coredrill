import {
  entityId,
  instant,
  isStatusCategory,
  type EntityId,
  type Instant,
  type StatusCategory,
} from "@coredrill/domain";
import { parseCompanyJobsRequestV1, type CompanyJobsScopeV1 } from "./company-jobs.js";
import { defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export type CompanyOutcomesScopeV1 = CompanyJobsScopeV1;
/** Current definition, explicitly not a capture-time label/category snapshot. */
export interface CompanyOutcomeStageV1 {
  readonly id: EntityId<"status_definition">;
  readonly name: string;
  readonly category: StatusCategory;
  readonly terminal: boolean;
  readonly archivedAt: Instant | null;
  readonly rowVersion: number;
}
export interface CompanyOutcomeEventV1 {
  readonly id: EntityId<"status-event">;
  readonly occurredAt: Instant;
  readonly createdAt: Instant;
  readonly rowVersion: number;
  readonly currentJob: {
    readonly id: EntityId<"job">;
    readonly companyId: EntityId<"company">;
    readonly title: string;
    readonly archivedAt: Instant | null;
    readonly rowVersion: number;
  };
  readonly application: {
    readonly id: EntityId<"application">;
    readonly archivedAt: Instant | null;
    readonly rowVersion: number;
  } | null;
  readonly fromStatus: CompanyOutcomeStageV1 | null;
  readonly toStatus: CompanyOutcomeStageV1;
  /** Metadata only: presence is never a grant to perform an undo. */
  readonly undo: {
    readonly id: EntityId<"mutation-undo-token">;
    readonly createdAt: Instant;
    readonly consumedAt: Instant | null;
    readonly rowVersion: number;
  } | null;
}
interface VersionReference {
  readonly id: string;
  readonly rowVersion: number;
}
export interface CompanyOutcomeCursorV1 extends CompanyOutcomesScopeV1 {
  readonly id: EntityId<"status-event">;
  readonly occurredAt: Instant;
  readonly rowVersion: number;
  readonly jobId: EntityId<"job">;
  readonly jobRowVersion: number;
  readonly application: VersionReference | null;
  readonly fromStatus: VersionReference | null;
  readonly toStatus: VersionReference;
  readonly undo: (VersionReference & { readonly consumedAt: Instant | null }) | null;
}
export interface ListCompanyOutcomesInputV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: string;
  readonly companyId: string;
  readonly expectedCompanyRowVersion: number;
  readonly includeArchivedCompany?: boolean;
  readonly includeArchivedJobs?: boolean;
  readonly limit?: number;
  readonly after?: CompanyOutcomeCursorV1 | null;
}
export interface ListCompanyOutcomesRequestV1 extends CompanyOutcomesScopeV1 {
  readonly limit: number;
  readonly after: CompanyOutcomeCursorV1 | null;
}
export interface CompanyOutcomesPageV1 extends CompanyOutcomesScopeV1 {
  readonly items: readonly CompanyOutcomeEventV1[];
  readonly hasMore: boolean;
  readonly nextCursor: CompanyOutcomeCursorV1 | null;
}
export interface CompanyOutcomesPortV1 {
  listPage(input: ListCompanyOutcomesRequestV1): Promise<unknown>;
}
export class CompanyOutcomesError extends Error {
  public override readonly name = "CompanyOutcomesError";
  public constructor(public readonly code: "stale" | "invalid_state" | "unavailable") {
    super("Local company stage history could not be read.");
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
const cursorKeys = [
  "id",
  "occurredAt",
  "rowVersion",
  "jobId",
  "jobRowVersion",
  "application",
  "fromStatus",
  "toStatus",
  "undo",
] as const;
const record = (value: unknown, allowed: readonly string[], required = allowed) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError();
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (
    Reflect.ownKeys(value).some((key) => typeof key !== "string" || !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(descriptors, key))
  )
    throw new TypeError();
  const result: Record<string, unknown> = {};
  for (const [key, descriptor] of Object.entries(descriptors)) {
    if (!descriptor.enumerable || !Object.hasOwn(descriptor, "value")) throw new TypeError();
    result[key] = descriptor.value;
  }
  return result;
};
const integer = (value: unknown, maximum = Number.MAX_SAFE_INTEGER) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum)
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
const time = (value: unknown) => instant(text(value, 24));
const nullableTime = (value: unknown) => (value === null ? null : time(value));
const scope = (raw: Record<string, unknown>, defaults = false): CompanyOutcomesScopeV1 => {
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
const sameScope = (a: CompanyOutcomesScopeV1, b: CompanyOutcomesScopeV1) =>
  scopeKeys.every((key) => a[key] === b[key]);
const version = (
  value: unknown,
  kind: "application" | "status_definition" | "mutation-undo-token",
) => {
  const raw = record(value, ["id", "rowVersion"]);
  return Object.freeze({
    id: entityId(kind, text(raw["id"], 36)),
    rowVersion: integer(raw["rowVersion"]),
  });
};
export const parseCompanyOutcomeCursorV1 = (value: unknown): CompanyOutcomeCursorV1 => {
  const raw = record(value, [...scopeKeys, ...cursorKeys]);
  const undo =
    raw["undo"] === null ? null : record(raw["undo"], ["id", "rowVersion", "consumedAt"]);
  return Object.freeze({
    ...scope(raw),
    id: entityId("status-event", text(raw["id"], 36)),
    occurredAt: time(raw["occurredAt"]),
    rowVersion: integer(raw["rowVersion"]),
    jobId: entityId("job", text(raw["jobId"], 36)),
    jobRowVersion: integer(raw["jobRowVersion"]),
    application: raw["application"] === null ? null : version(raw["application"], "application"),
    fromStatus: raw["fromStatus"] === null ? null : version(raw["fromStatus"], "status_definition"),
    toStatus: version(raw["toStatus"], "status_definition"),
    undo:
      undo === null
        ? null
        : Object.freeze({
            id: entityId("mutation-undo-token", text(undo["id"], 36)),
            rowVersion: integer(undo["rowVersion"]),
            consumedAt: nullableTime(undo["consumedAt"]),
          }),
  });
};
export const parseCompanyOutcomesRequestV1 = (value: unknown): ListCompanyOutcomesRequestV1 => {
  const raw = record(
    value,
    [...scopeKeys, "limit", "after"],
    ["specVersion", "expectedVaultId", "companyId", "expectedCompanyRowVersion"],
  );
  const owner = scope(raw, true),
    after =
      raw["after"] === undefined || raw["after"] === null
        ? null
        : parseCompanyOutcomeCursorV1(raw["after"]);
  if (after !== null && !sameScope(owner, after)) throw new TypeError();
  return Object.freeze({
    ...owner,
    limit: raw["limit"] === undefined ? 10 : integer(raw["limit"], 25),
    after,
  });
};
const stage = (value: unknown): CompanyOutcomeStageV1 => {
  const raw = record(value, ["id", "name", "category", "terminal", "archivedAt", "rowVersion"]),
    name = text(raw["name"], 80);
  if (
    name.trim().length === 0 ||
    Array.from(name).some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code <= 0x1f || (code >= 0x7f && code <= 0x9f);
    }) ||
    !isStatusCategory(raw["category"])
  )
    throw new TypeError();
  return Object.freeze({
    id: entityId("status_definition", text(raw["id"], 36)),
    name,
    category: raw["category"],
    terminal: bool(raw["terminal"]),
    archivedAt: nullableTime(raw["archivedAt"]),
    rowVersion: integer(raw["rowVersion"]),
  });
};
export const parseCompanyOutcomeEventV1 = (
  value: unknown,
  owner: CompanyOutcomesScopeV1,
): CompanyOutcomeEventV1 => {
  const raw = record(value, [
    "id",
    "occurredAt",
    "createdAt",
    "rowVersion",
    "currentJob",
    "application",
    "fromStatus",
    "toStatus",
    "undo",
  ]);
  const job = record(raw["currentJob"], ["id", "companyId", "title", "archivedAt", "rowVersion"]);
  const currentJob = Object.freeze({
    id: entityId("job", text(job["id"], 36)),
    companyId: entityId("company", text(job["companyId"], 36)),
    title: text(job["title"], 1024),
    archivedAt: nullableTime(job["archivedAt"]),
    rowVersion: integer(job["rowVersion"]),
  });
  if (
    currentJob.companyId !== owner.companyId ||
    (!owner.includeArchivedJobs && currentJob.archivedAt !== null)
  )
    throw new TypeError();
  const application =
    raw["application"] === null
      ? null
      : record(raw["application"], ["id", "archivedAt", "rowVersion"]);
  const undo =
    raw["undo"] === null
      ? null
      : record(raw["undo"], ["id", "createdAt", "consumedAt", "rowVersion"]);
  const parsedUndo =
    undo === null
      ? null
      : Object.freeze({
          id: entityId("mutation-undo-token", text(undo["id"], 36)),
          createdAt: time(undo["createdAt"]),
          consumedAt: nullableTime(undo["consumedAt"]),
          rowVersion: integer(undo["rowVersion"]),
        });
  if (
    parsedUndo?.consumedAt !== null &&
    parsedUndo?.consumedAt !== undefined &&
    parsedUndo.consumedAt < parsedUndo.createdAt
  )
    throw new TypeError();
  const fromStatus = raw["fromStatus"] === null ? null : stage(raw["fromStatus"]),
    toStatus = stage(raw["toStatus"]);
  if (fromStatus?.id === toStatus.id) throw new TypeError();
  return Object.freeze({
    id: entityId("status-event", text(raw["id"], 36)),
    occurredAt: time(raw["occurredAt"]),
    createdAt: time(raw["createdAt"]),
    rowVersion: integer(raw["rowVersion"]),
    currentJob,
    application:
      application === null
        ? null
        : Object.freeze({
            id: entityId("application", text(application["id"], 36)),
            archivedAt: nullableTime(application["archivedAt"]),
            rowVersion: integer(application["rowVersion"]),
          }),
    fromStatus,
    toStatus,
    undo: parsedUndo,
  });
};
export const companyOutcomeCursorV1 = (
  owner: CompanyOutcomesScopeV1,
  item: CompanyOutcomeEventV1,
): CompanyOutcomeCursorV1 => {
  const ref = (value: { readonly id: string; readonly rowVersion: number } | null) =>
    value === null ? null : { id: value.id, rowVersion: value.rowVersion };
  return parseCompanyOutcomeCursorV1({
    ...scope(record(owner, [...scopeKeys, "limit", "after"], scopeKeys)),
    id: item.id,
    occurredAt: item.occurredAt,
    rowVersion: item.rowVersion,
    jobId: item.currentJob.id,
    jobRowVersion: item.currentJob.rowVersion,
    application: ref(item.application),
    fromStatus: ref(item.fromStatus),
    toStatus: ref(item.toStatus),
    undo: item.undo === null ? null : { ...ref(item.undo), consumedAt: item.undo.consumedAt },
  });
};
export const compareCompanyOutcomeKeysV1 = (
  a: { readonly id: string; readonly occurredAt: Instant },
  b: { readonly id: string; readonly occurredAt: Instant },
) =>
  a.occurredAt === b.occurredAt
    ? a.id < b.id
      ? -1
      : a.id === b.id
        ? 0
        : 1
    : a.occurredAt > b.occurredAt
      ? -1
      : 1;
export const parseCompanyOutcomesPageV1 = (
  value: unknown,
  input: ListCompanyOutcomesRequestV1,
): CompanyOutcomesPageV1 => {
  const raw = record(value, [...scopeKeys, "items", "hasMore", "nextCursor"]),
    owner = scope(raw);
  if (!sameScope(owner, input) || !Array.isArray(raw["items"]) || raw["items"].length > input.limit)
    throw new TypeError();
  const items = raw["items"].map((item: unknown) => parseCompanyOutcomeEventV1(item, owner));
  let previous: { readonly id: string; readonly occurredAt: Instant } | null = input.after;
  const seen = new Set<string>(),
    undoIds = new Set<string>(),
    facts = new Map<string, string>();
  for (const item of items) {
    if (
      seen.has(item.id) ||
      (previous !== null && compareCompanyOutcomeKeysV1(previous, item) >= 0)
    )
      throw new TypeError();
    seen.add(item.id);
    if (item.undo !== null) {
      if (undoIds.has(item.undo.id)) throw new TypeError();
      undoIds.add(item.undo.id);
    }
    previous = item;
    for (const [kind, fact] of [
      ["job", item.currentJob],
      ["application", item.application],
      ["stage", item.fromStatus],
      ["stage", item.toStatus],
      ["undo", item.undo],
    ] as const) {
      if (fact === null) continue;
      const key = `${kind}:${fact.id}`,
        encoded = JSON.stringify(fact),
        prior = facts.get(key);
      if (prior !== undefined && prior !== encoded) throw new TypeError();
      facts.set(key, encoded);
    }
  }
  const hasMore = bool(raw["hasMore"]),
    nextCursor = raw["nextCursor"] === null ? null : parseCompanyOutcomeCursorV1(raw["nextCursor"]),
    last = items.at(-1);
  if (
    hasMore
      ? items.length !== input.limit ||
        last === undefined ||
        JSON.stringify(nextCursor) !== JSON.stringify(companyOutcomeCursorV1(owner, last))
      : nextCursor !== null
  )
    throw new TypeError();
  return Object.freeze({ ...owner, items: Object.freeze(items), hasMore, nextCursor });
};
export const createCompanyOutcomesQueryV1 = (port: CompanyOutcomesPortV1) =>
  defineQuery<ListCompanyOutcomesInputV1, CompanyOutcomesPageV1>(
    "ListCompanyOutcomesQuery",
    async (untrusted, context) => {
      let input: ListCompanyOutcomesRequestV1;
      try {
        entityId("application-operation", context.operationId);
        instant(context.initiatedAt);
        input = parseCompanyOutcomesRequestV1(untrusted);
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose a valid viewed company and stage-history page.",
          retryable: false,
        });
      }
      try {
        const value = await port.listPage(input);
        if (value === undefined)
          return applicationFailure({
            code: "not_found",
            message: "The viewed company is unavailable.",
            retryable: false,
          });
        try {
          return applicationSuccess(parseCompanyOutcomesPageV1(value, input));
        } catch {
          throw new CompanyOutcomesError("invalid_state");
        }
      } catch (error) {
        const code = error instanceof CompanyOutcomesError ? error.code : "unavailable";
        return applicationFailure({
          code:
            code === "stale" ? "conflict" : code === "invalid_state" ? "internal" : "unavailable",
          message: "Company stage history could not be read safely.",
          retryable: code === "unavailable",
        });
      }
    },
  );
