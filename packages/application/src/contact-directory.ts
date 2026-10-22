import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";
import { defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

/** Identity-only directory projection. Contact methods, notes and origin claims are excluded. */
export interface ContactDirectorySummaryV1 {
  readonly id: EntityId<"contact">;
  readonly name: string;
  readonly role: string | null;
  readonly companyId: EntityId<"company"> | null;
  readonly archivedAt: Instant | null;
  readonly createdAt: Instant;
  readonly updatedAt: Instant;
  readonly rowVersion: number;
}
export interface ContactDirectoryCursorV1 {
  readonly specVersion: 1;
  readonly vaultId: EntityId<"vault">;
  readonly includeArchived: boolean;
  /** null means all companies, not only contacts without a company. */
  readonly companyId: EntityId<"company"> | null;
  readonly createdAt: Instant;
  readonly id: EntityId<"contact">;
  readonly rowVersion: number;
}
export interface ContactDirectoryPageV1 {
  readonly specVersion: 1;
  readonly vaultId: EntityId<"vault">;
  readonly includeArchived: boolean;
  readonly companyId: EntityId<"company"> | null;
  readonly items: readonly ContactDirectorySummaryV1[];
  readonly hasMore: boolean;
  readonly nextCursor: ContactDirectoryCursorV1 | null;
}
export interface ListContactDirectoryInputV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: string;
  readonly includeArchived?: boolean;
  readonly companyId?: string | null;
  readonly limit?: number;
  readonly after?: ContactDirectoryCursorV1 | null;
}
export interface ListContactDirectoryPortInputV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: EntityId<"vault">;
  readonly includeArchived: boolean;
  readonly companyId: EntityId<"company"> | null;
  readonly limit: number;
  readonly after: ContactDirectoryCursorV1 | null;
}
export interface ContactDirectoryPort {
  listPage(input: ListContactDirectoryPortInputV1): Promise<unknown>;
}
export class ContactDirectoryError extends Error {
  public override readonly name = "ContactDirectoryError";
  public constructor(public readonly code: "cursor_invalidated" | "invalid_state" | "unavailable") {
    super("The local contact directory could not be read.");
    if (!["cursor_invalidated", "invalid_state", "unavailable"].includes(code))
      throw new TypeError("Unknown contact-directory error code.");
  }
}

const record = (value: unknown, allowed: readonly string[], required = allowed) => {
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
const identityText = (value: unknown): string => {
  const parsed = text(value, 512);
  if (
    parsed.trim().length === 0 ||
    Array.from(parsed).some((character) => {
      const point = character.codePointAt(0) ?? 0;
      return point <= 31 || point === 127;
    })
  )
    throw new TypeError();
  return parsed;
};
const bool = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new TypeError();
  return value;
};
const version = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1) throw new TypeError();
  return value;
};
const spec = (value: unknown): 1 => {
  if (value !== 1) throw new TypeError();
  return 1;
};
const nullableCompany = (value: unknown): EntityId<"company"> | null =>
  value === null ? null : entityId("company", text(value, 36));
const cursor = (value: unknown): ContactDirectoryCursorV1 => {
  const raw = record(value, [
    "specVersion",
    "vaultId",
    "includeArchived",
    "companyId",
    "createdAt",
    "id",
    "rowVersion",
  ]);
  return Object.freeze({
    specVersion: spec(raw["specVersion"]),
    vaultId: entityId("vault", text(raw["vaultId"], 36)),
    includeArchived: bool(raw["includeArchived"]),
    companyId: nullableCompany(raw["companyId"]),
    createdAt: instant(text(raw["createdAt"])),
    id: entityId("contact", text(raw["id"], 36)),
    rowVersion: version(raw["rowVersion"]),
  });
};

/** Parse and freeze the whole scope before any asynchronous adapter work. */
export const parseContactDirectoryRequestV1 = (value: unknown): ListContactDirectoryPortInputV1 => {
  const raw = record(
    value,
    ["specVersion", "expectedVaultId", "includeArchived", "companyId", "limit", "after"],
    ["specVersion", "expectedVaultId"],
  );
  const expectedVaultId = entityId("vault", text(raw["expectedVaultId"], 36));
  const includeArchived =
    raw["includeArchived"] === undefined ? false : bool(raw["includeArchived"]);
  const companyId = raw["companyId"] === undefined ? null : nullableCompany(raw["companyId"]);
  const limit = raw["limit"] === undefined ? 25 : raw["limit"];
  if (typeof limit !== "number" || !Number.isSafeInteger(limit) || limit < 1 || limit > 100)
    throw new TypeError();
  const after = raw["after"] === undefined || raw["after"] === null ? null : cursor(raw["after"]);
  if (
    after !== null &&
    (after.vaultId !== expectedVaultId ||
      after.includeArchived !== includeArchived ||
      after.companyId !== companyId)
  )
    throw new TypeError();
  return Object.freeze({
    specVersion: spec(raw["specVersion"]),
    expectedVaultId,
    includeArchived,
    companyId,
    limit,
    after,
  });
};

export const compareContactDirectoryEntries = (
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

const summary = (
  value: unknown,
  input: ListContactDirectoryPortInputV1,
): ContactDirectorySummaryV1 => {
  const raw = record(value, [
    "id",
    "name",
    "role",
    "companyId",
    "archivedAt",
    "createdAt",
    "updatedAt",
    "rowVersion",
  ]);
  const copied = Object.freeze({
    id: entityId("contact", text(raw["id"], 36)),
    name: identityText(raw["name"]),
    role: raw["role"] === null ? null : identityText(raw["role"]),
    companyId: nullableCompany(raw["companyId"]),
    archivedAt: raw["archivedAt"] === null ? null : instant(text(raw["archivedAt"])),
    createdAt: instant(text(raw["createdAt"])),
    updatedAt: instant(text(raw["updatedAt"])),
    rowVersion: version(raw["rowVersion"]),
  });
  if (
    (!input.includeArchived && copied.archivedAt !== null) ||
    (input.companyId !== null && copied.companyId !== input.companyId) ||
    copied.createdAt > copied.updatedAt ||
    (copied.archivedAt !== null &&
      (copied.archivedAt < copied.createdAt || copied.archivedAt > copied.updatedAt))
  )
    throw new TypeError();
  return copied;
};
/** Reusable strict identity-only result decoder; validation/copying precede UI publication. */
export const parseContactDirectoryPageV1 = (
  value: unknown,
  scope: ListContactDirectoryInputV1,
): ContactDirectoryPageV1 => {
  const input = parseContactDirectoryRequestV1(scope);
  const raw = record(value, [
    "specVersion",
    "vaultId",
    "includeArchived",
    "companyId",
    "items",
    "hasMore",
    "nextCursor",
  ]);
  spec(raw["specVersion"]);
  if (
    raw["vaultId"] !== input.expectedVaultId ||
    raw["includeArchived"] !== input.includeArchived ||
    raw["companyId"] !== input.companyId ||
    !Array.isArray(raw["items"]) ||
    raw["items"].length > input.limit
  )
    throw new TypeError();
  const items = raw["items"].map((item: unknown) => summary(item, input));
  let previous: { readonly createdAt: Instant; readonly id: string } | null = input.after;
  const seen = new Set<string>();
  for (const item of items) {
    if (
      seen.has(item.id) ||
      (previous !== null && compareContactDirectoryEntries(previous, item) >= 0)
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
      nextCursor.companyId !== input.companyId ||
      nextCursor.rowVersion !== last.rowVersion ||
      compareContactDirectoryEntries(last, nextCursor) !== 0
    )
      throw new TypeError();
  } else if (nextCursor !== null) throw new TypeError();
  return Object.freeze({
    specVersion: 1,
    vaultId: input.expectedVaultId,
    includeArchived: input.includeArchived,
    companyId: input.companyId,
    items: Object.freeze(items),
    hasMore,
    nextCursor,
  });
};

export const createContactDirectoryQuery = (port: ContactDirectoryPort) =>
  defineQuery<ListContactDirectoryInputV1, ContactDirectoryPageV1>(
    "ListContactDirectoryQuery",
    async (untrusted, context) => {
      let input: ListContactDirectoryPortInputV1;
      try {
        entityId("application-operation", context.operationId);
        instant(context.initiatedAt);
        input = parseContactDirectoryRequestV1(untrusted);
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose a valid local contact-directory page.",
          retryable: false,
        });
      }
      let result: unknown;
      try {
        result = await port.listPage(input);
      } catch (error) {
        const code =
          error instanceof ContactDirectoryError && error.code === "cursor_invalidated"
            ? "conflict"
            : error instanceof ContactDirectoryError && error.code === "invalid_state"
              ? "internal"
              : "unavailable";
        return applicationFailure({
          code,
          message: "Local contacts could not be read. Refresh and review the current directory.",
          retryable: code !== "internal",
        });
      }
      if (result === undefined)
        return applicationFailure({
          code: "not_found",
          message:
            "The viewed vault or selected local company is not available for this directory.",
          retryable: false,
        });
      try {
        return applicationSuccess(parseContactDirectoryPageV1(result, input));
      } catch {
        return applicationFailure({
          code: "internal",
          message: "Stored contact summaries did not pass validation.",
          retryable: false,
        });
      }
    },
  );
