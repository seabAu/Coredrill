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

export interface CompanyDirectorySummaryV1 {
  readonly id: EntityId<"company">;
  readonly canonicalName: string;
  readonly websiteUrl: WebUrl | null;
  readonly domain: string | null;
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}
export interface CompanyDirectoryCursorV1 {
  readonly specVersion: 1;
  readonly vaultId: EntityId<"vault">;
  readonly includeArchived: boolean;
  readonly createdAt: Instant;
  readonly id: EntityId<"company">;
  readonly rowVersion: number;
}
export interface CompanyDirectoryPageV1 {
  readonly specVersion: 1;
  readonly vaultId: EntityId<"vault">;
  readonly includeArchived: boolean;
  readonly items: readonly CompanyDirectorySummaryV1[];
  readonly hasMore: boolean;
  readonly nextCursor: CompanyDirectoryCursorV1 | null;
}
export interface ListCompanyDirectoryInputV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: string;
  readonly includeArchived?: boolean;
  readonly limit?: number;
  readonly after?: CompanyDirectoryCursorV1 | null;
}
export interface ListCompanyDirectoryPortInputV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: EntityId<"vault">;
  readonly includeArchived: boolean;
  readonly limit: number;
  readonly after: CompanyDirectoryCursorV1 | null;
}
/** A minimized local read boundary. It must not select private notes or contact details. */
export interface CompanyDirectoryPort {
  listPage(input: ListCompanyDirectoryPortInputV1): Promise<unknown>;
}
export class CompanyDirectoryError extends Error {
  public override readonly name = "CompanyDirectoryError";
  public constructor(public readonly code: "cursor_invalidated" | "invalid_state" | "unavailable") {
    super("The local company directory could not be read.");
    if (!["cursor_invalidated", "invalid_state", "unavailable"].includes(code))
      throw new TypeError("Unknown company-directory error code.");
  }
}

const record = (
  value: unknown,
  allowed: readonly string[],
  required = allowed,
): Record<string, unknown> => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError();
  if (
    Object.keys(value).some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    throw new TypeError();
  return value as Record<string, unknown>;
};
const text = (value: unknown, maximum = 128): string => {
  if (typeof value !== "string" || value.length > maximum) throw new TypeError();
  return value;
};
const bool = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new TypeError();
  return value;
};
const version = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new TypeError();
  return value;
};
const specVersion = (value: unknown): 1 => {
  if (value !== 1) throw new TypeError();
  return 1;
};
const cursor = (value: unknown): CompanyDirectoryCursorV1 => {
  const raw = record(value, [
    "specVersion",
    "vaultId",
    "includeArchived",
    "createdAt",
    "id",
    "rowVersion",
  ]);
  return Object.freeze({
    specVersion: specVersion(raw["specVersion"]),
    vaultId: entityId("vault", text(raw["vaultId"], 36)),
    includeArchived: bool(raw["includeArchived"]),
    createdAt: instant(text(raw["createdAt"])),
    id: entityId("company", text(raw["id"], 36)),
    rowVersion: version(raw["rowVersion"]),
  });
};

/** Shared by application and concrete ports; copies before any asynchronous work. */
export const parseCompanyDirectoryRequestV1 = (value: unknown): ListCompanyDirectoryPortInputV1 => {
  const raw = record(
    value,
    ["specVersion", "expectedVaultId", "includeArchived", "limit", "after"],
    ["specVersion", "expectedVaultId"],
  );
  const expectedVaultId = entityId("vault", text(raw["expectedVaultId"], 36));
  const includeArchived =
    raw["includeArchived"] === undefined ? false : bool(raw["includeArchived"]);
  const limit = raw["limit"] === undefined ? 25 : raw["limit"];
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new TypeError();
  const after = raw["after"] === undefined || raw["after"] === null ? null : cursor(raw["after"]);
  if (
    after !== null &&
    (after.vaultId !== expectedVaultId || after.includeArchived !== includeArchived)
  )
    throw new TypeError();
  return Object.freeze({
    specVersion: specVersion(raw["specVersion"]),
    expectedVaultId,
    includeArchived,
    limit,
    after,
  });
};

/** Live pages use a stable keyset, not an invented global company revision or time snapshot. */
export const compareCompanyDirectoryEntries = (
  left: { readonly createdAt: Instant; readonly id: string },
  right: { readonly createdAt: Instant; readonly id: string },
): number =>
  left.createdAt === right.createdAt
    ? left.id < right.id
      ? -1
      : left.id > right.id
        ? 1
        : 0
    : left.createdAt > right.createdAt
      ? -1
      : 1;

const summary = (value: unknown, includeArchived: boolean): CompanyDirectorySummaryV1 => {
  const raw = record(value, [
    "id",
    "canonicalName",
    "websiteUrl",
    "domain",
    "archivedAt",
    "createdAt",
    "updatedAt",
    "rowVersion",
  ]);
  const canonicalName = text(raw["canonicalName"], 512);
  if (
    canonicalName.trim().length === 0 ||
    Array.from(canonicalName).some((character) => {
      const point = character.codePointAt(0) ?? 0;
      return point <= 31 || point === 127;
    })
  )
    throw new TypeError();
  const domain = raw["domain"] === null ? null : text(raw["domain"], 253).toLowerCase();
  if (
    domain?.split(".").some((label) => !/^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/u.test(label)) ===
    true
  )
    throw new TypeError();
  const copied = Object.freeze({
    id: entityId("company", text(raw["id"], 36)),
    canonicalName,
    websiteUrl: raw["websiteUrl"] === null ? null : webUrl(text(raw["websiteUrl"], 8192)),
    domain,
    archivedAt: raw["archivedAt"] === null ? null : instant(text(raw["archivedAt"])),
    createdAt: instant(text(raw["createdAt"])),
    updatedAt: instant(text(raw["updatedAt"])),
    rowVersion: version(raw["rowVersion"]),
  });
  if (
    (!includeArchived && copied.archivedAt !== null) ||
    copied.createdAt > copied.updatedAt ||
    (copied.archivedAt !== null &&
      (copied.archivedAt < copied.createdAt || copied.archivedAt > copied.updatedAt))
  )
    throw new TypeError();
  return copied;
};
const page = (value: unknown, input: ListCompanyDirectoryPortInputV1): CompanyDirectoryPageV1 => {
  const raw = record(value, [
    "specVersion",
    "vaultId",
    "includeArchived",
    "items",
    "hasMore",
    "nextCursor",
  ]);
  specVersion(raw["specVersion"]);
  if (
    raw["vaultId"] !== input.expectedVaultId ||
    raw["includeArchived"] !== input.includeArchived ||
    !Array.isArray(raw["items"]) ||
    raw["items"].length > input.limit
  )
    throw new TypeError();
  const items = raw["items"].map((item: unknown) => summary(item, input.includeArchived));
  let previous: { readonly createdAt: Instant; readonly id: string } | null = input.after;
  const seen = new Set<string>();
  for (const item of items) {
    if (
      seen.has(item.id) ||
      (previous !== null && compareCompanyDirectoryEntries(previous, item) >= 0)
    )
      throw new TypeError();
    seen.add(item.id);
    previous = item;
  }
  const hasMore = bool(raw["hasMore"]);
  const nextCursor = raw["nextCursor"] === null ? null : cursor(raw["nextCursor"]);
  const last = items.at(-1);
  if (hasMore) {
    if (
      items.length !== input.limit ||
      last === undefined ||
      nextCursor?.vaultId !== input.expectedVaultId ||
      nextCursor.includeArchived !== input.includeArchived ||
      nextCursor.rowVersion !== last.rowVersion ||
      compareCompanyDirectoryEntries(last, nextCursor) !== 0
    )
      throw new TypeError();
  } else if (nextCursor !== null) throw new TypeError();
  return Object.freeze({
    specVersion: 1,
    vaultId: input.expectedVaultId,
    includeArchived: input.includeArchived,
    items: Object.freeze(items),
    hasMore,
    nextCursor,
  });
};

export const createCompanyDirectoryQuery = (port: CompanyDirectoryPort) =>
  defineQuery<ListCompanyDirectoryInputV1, CompanyDirectoryPageV1>(
    "ListCompanyDirectoryQuery",
    async (untrusted, context) => {
      let input: ListCompanyDirectoryPortInputV1;
      try {
        entityId("application-operation", context.operationId);
        instant(context.initiatedAt);
        input = parseCompanyDirectoryRequestV1(untrusted);
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose a valid local company-directory page.",
          retryable: false,
        });
      }
      let result: unknown;
      try {
        result = await port.listPage(input);
      } catch (error) {
        const code =
          error instanceof CompanyDirectoryError && error.code === "cursor_invalidated"
            ? "conflict"
            : error instanceof CompanyDirectoryError && error.code === "invalid_state"
              ? "internal"
              : "unavailable";
        return applicationFailure({
          code,
          message: "Local companies could not be read. Refresh and review the current directory.",
          retryable: code !== "internal",
        });
      }
      if (result === undefined)
        return applicationFailure({
          code: "not_found",
          message: "The viewed local vault is not available for this directory.",
          retryable: false,
        });
      try {
        return applicationSuccess(page(result, input));
      } catch {
        return applicationFailure({
          code: "internal",
          message: "Stored company summaries did not pass validation.",
          retryable: false,
        });
      }
    },
  );
