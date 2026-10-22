import { entityId, instant, type EntityId, type Instant } from "@coredrill/domain";
import { defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export const CONTACT_HISTORY_PREVIEW_BYTES = 1_024;
export const CONTACT_HISTORY_MAX_SUMMARY_BYTES = 800_000;

/** Joined job facts are current stored metadata, not capture-time employer evidence. */
export interface ContactHistoryJobV1 {
  readonly id: EntityId<"job">;
  readonly title: string;
  readonly archivedAt: Instant | null;
  readonly rowVersion: number;
}
export interface ContactInteractionSummaryV1 {
  readonly id: EntityId<"interaction">;
  readonly contactId: EntityId<"contact">;
  readonly currentJob: ContactHistoryJobV1;
  readonly type: string;
  readonly direction: "inbound" | "outbound" | "mutual" | "unknown";
  readonly occurredAt: Instant;
  readonly createdAt: Instant;
  readonly rowVersion: number;
  readonly summaryPreview: string;
  readonly summaryByteLength: number;
  readonly summaryTruncated: boolean;
}
export interface ContactInteractionCursorV1 {
  readonly specVersion: 1;
  readonly vaultId: EntityId<"vault">;
  readonly contactId: EntityId<"contact">;
  readonly includeArchived: boolean;
  readonly contactRowVersion: number;
  readonly occurredAt: Instant;
  readonly id: EntityId<"interaction">;
  readonly rowVersion: number;
  readonly jobId: EntityId<"job">;
  readonly jobRowVersion: number;
}
export interface ContactInteractionPageV1 {
  readonly specVersion: 1;
  readonly vaultId: EntityId<"vault">;
  readonly contactId: EntityId<"contact">;
  readonly contactRowVersion: number;
  readonly includeArchived: boolean;
  readonly items: readonly ContactInteractionSummaryV1[];
  readonly hasMore: boolean;
  readonly nextCursor: ContactInteractionCursorV1 | null;
}
export interface ListContactInteractionsInputV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: string;
  readonly contactId: string;
  /** Includes archived selected contacts and archived linked jobs only when explicit. */
  readonly includeArchived?: boolean;
  readonly limit?: number;
  readonly after?: ContactInteractionCursorV1 | null;
}
export interface ListContactInteractionsPortInputV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: EntityId<"vault">;
  readonly contactId: EntityId<"contact">;
  readonly includeArchived: boolean;
  readonly limit: number;
  readonly after: ContactInteractionCursorV1 | null;
}
export interface ContactInteractionHistoryPortV1 {
  listPage(input: ListContactInteractionsPortInputV1): Promise<unknown>;
}
export class ContactInteractionHistoryError extends Error {
  public override readonly name = "ContactInteractionHistoryError";
  public constructor(public readonly code: "cursor_invalidated" | "invalid_state" | "unavailable") {
    super("Local contact history could not be read.");
    if (!["cursor_invalidated", "invalid_state", "unavailable"].includes(code))
      throw new TypeError("Unknown contact-history error code.");
  }
}

const object = (value: unknown, keys: readonly string[], required = keys) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError();
  if (
    Object.keys(value).some((key) => !keys.includes(key)) ||
    required.some((key) => !Object.hasOwn(value, key))
  )
    throw new TypeError();
  return value as Record<string, unknown>;
};
const text = (value: unknown, maximum: number): string => {
  if (typeof value !== "string" || value.length > maximum) throw new TypeError();
  return value;
};
const integer = (value: unknown, minimum = 1, maximum = Number.MAX_SAFE_INTEGER): number => {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < minimum ||
    value > maximum
  )
    throw new TypeError();
  return value;
};
const bool = (value: unknown): boolean => {
  if (typeof value !== "boolean") throw new TypeError();
  return value;
};
const spec = (value: unknown): 1 => {
  if (value !== 1) throw new TypeError();
  return 1;
};
const id = <Kind extends string>(kind: Kind, value: unknown): EntityId<Kind> =>
  entityId(kind, text(value, 36));
const at = (value: unknown): Instant => instant(text(value, 24));
export const parseContactInteractionCursorV1 = (value: unknown): ContactInteractionCursorV1 => {
  const raw = object(value, [
    "specVersion",
    "vaultId",
    "contactId",
    "includeArchived",
    "contactRowVersion",
    "occurredAt",
    "id",
    "rowVersion",
    "jobId",
    "jobRowVersion",
  ]);
  return Object.freeze({
    specVersion: spec(raw["specVersion"]),
    vaultId: id("vault", raw["vaultId"]),
    contactId: id("contact", raw["contactId"]),
    includeArchived: bool(raw["includeArchived"]),
    contactRowVersion: integer(raw["contactRowVersion"]),
    occurredAt: at(raw["occurredAt"]),
    id: id("interaction", raw["id"]),
    rowVersion: integer(raw["rowVersion"]),
    jobId: id("job", raw["jobId"]),
    jobRowVersion: integer(raw["jobRowVersion"]),
  });
};

/** Live occurrence-descending/UUID-ascending order, without a wall-clock ceiling. */
export const compareContactInteractions = (
  left: { readonly occurredAt: Instant; readonly id: string },
  right: { readonly occurredAt: Instant; readonly id: string },
): number =>
  left.occurredAt === right.occurredAt
    ? left.id < right.id
      ? -1
      : left.id > right.id
        ? 1
        : 0
    : left.occurredAt > right.occurredAt
      ? -1
      : 1;

export const parseContactInteractionsRequestV1 = (
  value: unknown,
): ListContactInteractionsPortInputV1 => {
  const raw = object(
    value,
    ["specVersion", "expectedVaultId", "contactId", "includeArchived", "limit", "after"],
    ["specVersion", "expectedVaultId", "contactId"],
  );
  const expectedVaultId = id("vault", raw["expectedVaultId"]);
  const contactId = id("contact", raw["contactId"]);
  const includeArchived =
    raw["includeArchived"] === undefined ? false : bool(raw["includeArchived"]);
  const after =
    raw["after"] === undefined || raw["after"] === null
      ? null
      : parseContactInteractionCursorV1(raw["after"]);
  if (
    after !== null &&
    (after.vaultId !== expectedVaultId ||
      after.contactId !== contactId ||
      after.includeArchived !== includeArchived)
  )
    throw new TypeError();
  return Object.freeze({
    specVersion: spec(raw["specVersion"]),
    expectedVaultId,
    contactId,
    includeArchived,
    limit: raw["limit"] === undefined ? 25 : integer(raw["limit"], 1, 100),
    after,
  });
};

const summary = (
  value: unknown,
  scope: ListContactInteractionsPortInputV1,
): ContactInteractionSummaryV1 => {
  const raw = object(value, [
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
  const job = object(raw["currentJob"], ["id", "title", "archivedAt", "rowVersion"]);
  const title = text(job["title"], 1_024);
  const archivedAt = job["archivedAt"] === null ? null : at(job["archivedAt"]);
  const type = text(raw["type"], 128);
  const direction = raw["direction"];
  const occurredAt = at(raw["occurredAt"]);
  const createdAt = at(raw["createdAt"]);
  const preview = text(raw["summaryPreview"], CONTACT_HISTORY_PREVIEW_BYTES);
  const bytes = new TextEncoder().encode(preview);
  const byteLength = integer(raw["summaryByteLength"], 0, CONTACT_HISTORY_MAX_SUMMARY_BYTES);
  const truncated = bool(raw["summaryTruncated"]);
  if (
    raw["contactId"] !== scope.contactId ||
    title.trim().length === 0 ||
    (!scope.includeArchived && archivedAt !== null) ||
    occurredAt > createdAt ||
    !/^[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u.test(type) ||
    bytes.byteLength > CONTACT_HISTORY_PREVIEW_BYTES ||
    bytes.byteLength > byteLength ||
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes) !== preview ||
    truncated !== bytes.byteLength < byteLength ||
    (byteLength <= CONTACT_HISTORY_PREVIEW_BYTES && truncated) ||
    (truncated && bytes.byteLength < CONTACT_HISTORY_PREVIEW_BYTES - 3)
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
    id: id("interaction", raw["id"]),
    contactId: scope.contactId,
    currentJob: Object.freeze({
      id: id("job", job["id"]),
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

export const parseContactInteractionsPageV1 = (
  value: unknown,
  scope: ListContactInteractionsInputV1,
): ContactInteractionPageV1 => {
  const input = parseContactInteractionsRequestV1(scope);
  const raw = object(value, [
    "specVersion",
    "vaultId",
    "contactId",
    "contactRowVersion",
    "includeArchived",
    "items",
    "hasMore",
    "nextCursor",
  ]);
  spec(raw["specVersion"]);
  const contactRowVersion = integer(raw["contactRowVersion"]);
  if (
    raw["vaultId"] !== input.expectedVaultId ||
    raw["contactId"] !== input.contactId ||
    raw["includeArchived"] !== input.includeArchived ||
    !Array.isArray(raw["items"]) ||
    raw["items"].length > input.limit ||
    (input.after !== null && contactRowVersion !== input.after.contactRowVersion)
  )
    throw new TypeError();
  const items = raw["items"].map((item: unknown) => summary(item, input));
  const seen = new Set<string>();
  const jobs = new Map<string, ContactHistoryJobV1>();
  let previous: { readonly occurredAt: Instant; readonly id: string } | null = input.after;
  for (const item of items) {
    if (seen.has(item.id) || (previous !== null && compareContactInteractions(previous, item) >= 0))
      throw new TypeError();
    const previousJob = jobs.get(item.currentJob.id);
    if (
      previousJob !== undefined &&
      (previousJob.title !== item.currentJob.title ||
        previousJob.archivedAt !== item.currentJob.archivedAt ||
        previousJob.rowVersion !== item.currentJob.rowVersion)
    )
      throw new TypeError();
    jobs.set(item.currentJob.id, item.currentJob);
    seen.add(item.id);
    previous = item;
  }
  const hasMore = bool(raw["hasMore"]);
  const nextCursor =
    raw["nextCursor"] === null ? null : parseContactInteractionCursorV1(raw["nextCursor"]);
  const last = items.at(-1);
  if (hasMore) {
    if (
      items.length !== input.limit ||
      last === undefined ||
      nextCursor?.vaultId !== input.expectedVaultId ||
      nextCursor.contactId !== input.contactId ||
      nextCursor.includeArchived !== input.includeArchived ||
      nextCursor.contactRowVersion !== contactRowVersion ||
      nextCursor.rowVersion !== last.rowVersion ||
      nextCursor.jobId !== last.currentJob.id ||
      nextCursor.jobRowVersion !== last.currentJob.rowVersion ||
      compareContactInteractions(last, nextCursor) !== 0
    )
      throw new TypeError();
  } else if (nextCursor !== null) throw new TypeError();
  return Object.freeze({
    specVersion: 1,
    vaultId: input.expectedVaultId,
    contactId: input.contactId,
    contactRowVersion,
    includeArchived: input.includeArchived,
    items: Object.freeze(items),
    hasMore,
    nextCursor,
  });
};

export const createContactInteractionHistoryQuery = (port: ContactInteractionHistoryPortV1) =>
  defineQuery<ListContactInteractionsInputV1, ContactInteractionPageV1>(
    "ListContactInteractionsQuery",
    async (untrusted, context) => {
      let input: ListContactInteractionsPortInputV1;
      try {
        entityId("application-operation", context.operationId);
        instant(context.initiatedAt);
        input = parseContactInteractionsRequestV1(untrusted);
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose a valid local contact-history page.",
          retryable: false,
        });
      }
      let result: unknown;
      try {
        result = await port.listPage(input);
      } catch (error) {
        const code =
          error instanceof ContactInteractionHistoryError && error.code === "cursor_invalidated"
            ? "conflict"
            : error instanceof ContactInteractionHistoryError && error.code === "invalid_state"
              ? "internal"
              : "unavailable";
        return applicationFailure({
          code,
          message: "Local contact history could not be read. Refresh and try again.",
          retryable: code !== "internal",
        });
      }
      if (result === undefined)
        return applicationFailure({
          code: "not_found",
          message: "The viewed vault or contact is unavailable in this history scope.",
          retryable: false,
        });
      try {
        return applicationSuccess(parseContactInteractionsPageV1(result, input));
      } catch {
        return applicationFailure({
          code: "internal",
          message: "Stored contact history did not pass validation.",
          retryable: false,
        });
      }
    },
  );
