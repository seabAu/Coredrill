import { entityId, instant, webUrl, type EntityId, type Instant } from "@coredrill/domain";
import { CONTACT_PROVENANCE_FIELDS, type ContactProvenanceFieldName } from "./company-contact.js";
import { defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

interface EvidenceAnchorV1 {
  readonly id: EntityId<"contact-point-provenance">;
  readonly createdAt: Instant;
  readonly rowVersion: number;
  readonly provenanceId: EntityId<"provenance">;
  readonly provenanceRowVersion: number;
  readonly snapshotId: EntityId<"source-snapshot">;
  readonly snapshotRowVersion: number;
  readonly jobSourceId: EntityId<"job-source">;
  readonly sourceRowVersion: number;
  readonly jobId: EntityId<"job">;
}
export interface ContactFieldEvidenceCursorV1 extends EvidenceAnchorV1 {
  readonly specVersion: 1;
  readonly vaultId: EntityId<"vault">;
  readonly contactId: EntityId<"contact">;
  readonly contactRowVersion: number;
  readonly includeArchived: boolean;
  readonly fieldName: ContactProvenanceFieldName;
}
/** Historical source evidence, not authorization to display/use a contact method. */
export interface ContactFieldEvidenceItemV1 extends EvidenceAnchorV1 {
  readonly contactId: EntityId<"contact">;
  readonly fieldName: ContactProvenanceFieldName;
  readonly valueHash: string;
  readonly matchesCurrentValue: boolean;
  readonly method: "api" | "jsonld" | "selector" | "readability" | "heuristic" | "llm" | "user";
  readonly pointer: string;
  readonly excerpt: string | null;
  readonly confidence: number;
  readonly capturedAt: Instant;
  readonly licenseNote: string | null;
  readonly extractorId: string;
  readonly extractorVersion: string;
  readonly snapshotHash: string;
  /** Current job-source metadata, not a reconstructed capture-time URL/policy. */
  readonly sourceUrl: string | null;
  readonly connectorId: string | null;
}
export interface ListContactFieldEvidenceInputV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: string;
  readonly contactId: string;
  readonly expectedContactRowVersion: number;
  readonly fieldName: ContactProvenanceFieldName;
  readonly includeArchived?: boolean;
  readonly limit?: number;
  readonly after?: ContactFieldEvidenceCursorV1 | null;
}
export interface ContactFieldEvidenceRequestV1 extends ListContactFieldEvidenceInputV1 {
  readonly expectedVaultId: EntityId<"vault">;
  readonly contactId: EntityId<"contact">;
  readonly includeArchived: boolean;
  readonly limit: number;
  readonly after: ContactFieldEvidenceCursorV1 | null;
}
export interface ContactFieldEvidencePageV1 {
  readonly specVersion: 1;
  readonly vaultId: EntityId<"vault">;
  readonly contactId: EntityId<"contact">;
  readonly contactRowVersion: number;
  readonly fieldName: ContactProvenanceFieldName;
  readonly includeArchived: boolean;
  readonly currentValueHash: string | null;
  /** This projection does not evaluate public/licensed rights; manual receipts remain separate. */
  readonly publicOrLicensedEligibility: "not_established";
  readonly items: readonly ContactFieldEvidenceItemV1[];
  readonly hasMore: boolean;
  readonly nextCursor: ContactFieldEvidenceCursorV1 | null;
}
export interface ContactFieldEvidencePortV1 {
  listPage(input: ContactFieldEvidenceRequestV1): Promise<unknown>;
}
export class ContactFieldEvidenceError extends Error {
  public constructor(public readonly code: "stale" | "invalid_state" | "unavailable") {
    super("Local contact evidence could not be read.");
    if (!["stale", "invalid_state", "unavailable"].includes(code)) throw new TypeError();
    this.name = "ContactFieldEvidenceError";
  }
}
const keys = (value: unknown, allowed: readonly string[], required = allowed) => {
  if (typeof value !== "object" || value === null || Array.isArray(value)) throw new TypeError();
  if (
    Object.keys(value).some((k) => !allowed.includes(k)) ||
    required.some((k) => !Object.hasOwn(value, k))
  )
    throw new TypeError();
  return value as Record<string, unknown>;
};
const integer = (value: unknown, maximum = Number.MAX_SAFE_INTEGER) => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 1 || value > maximum)
    throw new TypeError();
  return value;
};
const text = (value: unknown, bytes: number) => {
  if (typeof value !== "string" || value.length > bytes) throw new TypeError();
  const encoded = new TextEncoder().encode(value);
  if (
    encoded.length > bytes ||
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(encoded) !== value
  )
    throw new TypeError();
  return value;
};
const nonempty = (value: unknown, bytes: number) => {
  const parsed = text(value, bytes);
  if (parsed.trim().length === 0) throw new TypeError();
  return parsed;
};
const hash = (value: unknown): string => {
  if (typeof value !== "string" || !/^[a-f0-9]{64}$/u.test(value)) throw new TypeError();
  return value;
};
const bool = (value: unknown) => {
  if (typeof value !== "boolean") throw new TypeError();
  return value;
};
const spec = (value: unknown): 1 => {
  if (value !== 1) throw new TypeError();
  return 1;
};
const field = (value: unknown): ContactProvenanceFieldName => {
  const parsed = CONTACT_PROVENANCE_FIELDS.find((f) => f === value);
  if (parsed === undefined) throw new TypeError();
  return parsed;
};
const id = <Kind extends string>(kind: Kind, value: unknown) => entityId(kind, text(value, 36));
const at = (value: unknown) => instant(text(value, 24));
const anchorKeys = [
  "id",
  "createdAt",
  "rowVersion",
  "provenanceId",
  "provenanceRowVersion",
  "snapshotId",
  "snapshotRowVersion",
  "jobSourceId",
  "sourceRowVersion",
  "jobId",
];
const scopeKeys = [
  "specVersion",
  "vaultId",
  "contactId",
  "contactRowVersion",
  "includeArchived",
  "fieldName",
];
const anchor = (raw: Record<string, unknown>): EvidenceAnchorV1 => ({
  id: id("contact-point-provenance", raw["id"]),
  createdAt: at(raw["createdAt"]),
  rowVersion: integer(raw["rowVersion"]),
  provenanceId: id("provenance", raw["provenanceId"]),
  provenanceRowVersion: integer(raw["provenanceRowVersion"]),
  snapshotId: id("source-snapshot", raw["snapshotId"]),
  snapshotRowVersion: integer(raw["snapshotRowVersion"]),
  jobSourceId: id("job-source", raw["jobSourceId"]),
  sourceRowVersion: integer(raw["sourceRowVersion"]),
  jobId: id("job", raw["jobId"]),
});
export const parseContactFieldEvidenceCursorV1 = (value: unknown): ContactFieldEvidenceCursorV1 => {
  const raw = keys(value, [...scopeKeys, ...anchorKeys]);
  return Object.freeze({
    ...anchor(raw),
    specVersion: spec(raw["specVersion"]),
    vaultId: id("vault", raw["vaultId"]),
    contactId: id("contact", raw["contactId"]),
    contactRowVersion: integer(raw["contactRowVersion"]),
    includeArchived: bool(raw["includeArchived"]),
    fieldName: field(raw["fieldName"]),
  });
};
export const parseContactFieldEvidenceRequestV1 = (
  value: unknown,
): ContactFieldEvidenceRequestV1 => {
  const raw = keys(
    value,
    [
      "specVersion",
      "expectedVaultId",
      "contactId",
      "expectedContactRowVersion",
      "fieldName",
      "includeArchived",
      "limit",
      "after",
    ],
    ["specVersion", "expectedVaultId", "contactId", "expectedContactRowVersion", "fieldName"],
  );
  const parsed = {
    specVersion: spec(raw["specVersion"]),
    expectedVaultId: id("vault", raw["expectedVaultId"]),
    contactId: id("contact", raw["contactId"]),
    expectedContactRowVersion: integer(raw["expectedContactRowVersion"]),
    fieldName: field(raw["fieldName"]),
    includeArchived: raw["includeArchived"] === undefined ? false : bool(raw["includeArchived"]),
    limit: raw["limit"] === undefined ? 20 : integer(raw["limit"], 25),
    after:
      raw["after"] === undefined || raw["after"] === null
        ? null
        : parseContactFieldEvidenceCursorV1(raw["after"]),
  };
  const after = parsed.after;
  if (
    after !== null &&
    (after.vaultId !== parsed.expectedVaultId ||
      after.contactId !== parsed.contactId ||
      after.contactRowVersion !== parsed.expectedContactRowVersion ||
      after.fieldName !== parsed.fieldName ||
      after.includeArchived !== parsed.includeArchived)
  )
    throw new TypeError();
  return Object.freeze(parsed);
};
/** Live creation-descending/UUID-ascending pages, never a total or immutable snapshot. */
export const compareContactFieldEvidence = (
  a: Pick<EvidenceAnchorV1, "id" | "createdAt">,
  b: Pick<EvidenceAnchorV1, "id" | "createdAt">,
) =>
  a.createdAt === b.createdAt
    ? a.id < b.id
      ? -1
      : a.id > b.id
        ? 1
        : 0
    : a.createdAt > b.createdAt
      ? -1
      : 1;
export const contactFieldEvidenceCursorV1 = (
  request: ContactFieldEvidenceRequestV1,
  value: EvidenceAnchorV1,
): ContactFieldEvidenceCursorV1 =>
  parseContactFieldEvidenceCursorV1({
    ...anchor(value as unknown as Record<string, unknown>),
    specVersion: 1,
    vaultId: request.expectedVaultId,
    contactId: request.contactId,
    contactRowVersion: request.expectedContactRowVersion,
    fieldName: request.fieldName,
    includeArchived: request.includeArchived,
  });
const parseItem = (
  value: unknown,
  request: ContactFieldEvidenceRequestV1,
  currentHash: string | null,
): ContactFieldEvidenceItemV1 => {
  const raw = keys(value, [
    ...anchorKeys,
    "contactId",
    "fieldName",
    "valueHash",
    "matchesCurrentValue",
    "method",
    "pointer",
    "excerpt",
    "confidence",
    "capturedAt",
    "licenseNote",
    "extractorId",
    "extractorVersion",
    "snapshotHash",
    "sourceUrl",
    "connectorId",
  ]);
  const valueHash = hash(raw["valueHash"]);
  const method = raw["method"];
  if (
    raw["contactId"] !== request.contactId ||
    raw["fieldName"] !== request.fieldName ||
    typeof method !== "string" ||
    !["api", "jsonld", "selector", "readability", "heuristic", "llm", "user"].includes(method) ||
    typeof raw["confidence"] !== "number" ||
    !Number.isFinite(raw["confidence"]) ||
    raw["confidence"] < 0 ||
    raw["confidence"] > 1 ||
    bool(raw["matchesCurrentValue"]) !== (valueHash === currentHash)
  )
    throw new TypeError();
  const sourceUrl = raw["sourceUrl"] === null ? null : text(raw["sourceUrl"], 32768);
  if (sourceUrl !== null) webUrl(sourceUrl);
  return Object.freeze({
    ...anchor(raw),
    contactId: request.contactId,
    fieldName: request.fieldName,
    valueHash,
    matchesCurrentValue: valueHash === currentHash,
    method: method as ContactFieldEvidenceItemV1["method"],
    pointer: nonempty(raw["pointer"], 8192),
    excerpt: raw["excerpt"] === null ? null : text(raw["excerpt"], 16384),
    confidence: raw["confidence"],
    capturedAt: at(raw["capturedAt"]),
    licenseNote: raw["licenseNote"] === null ? null : text(raw["licenseNote"], 4096),
    extractorId: nonempty(raw["extractorId"], 512),
    extractorVersion: nonempty(raw["extractorVersion"], 256),
    snapshotHash: hash(raw["snapshotHash"]),
    sourceUrl,
    connectorId: raw["connectorId"] === null ? null : nonempty(raw["connectorId"], 512),
  });
};
export const parseContactFieldEvidencePageV1 = (
  value: unknown,
  input: ListContactFieldEvidenceInputV1,
): ContactFieldEvidencePageV1 => {
  const request = parseContactFieldEvidenceRequestV1(input);
  const raw = keys(value, [
    ...scopeKeys,
    "currentValueHash",
    "publicOrLicensedEligibility",
    "items",
    "hasMore",
    "nextCursor",
  ]);
  spec(raw["specVersion"]);
  if (
    raw["vaultId"] !== request.expectedVaultId ||
    raw["contactId"] !== request.contactId ||
    raw["contactRowVersion"] !== request.expectedContactRowVersion ||
    raw["fieldName"] !== request.fieldName ||
    raw["includeArchived"] !== request.includeArchived ||
    raw["publicOrLicensedEligibility"] !== "not_established" ||
    !Array.isArray(raw["items"]) ||
    raw["items"].length > request.limit
  )
    throw new TypeError();
  const currentValueHash = raw["currentValueHash"] === null ? null : hash(raw["currentValueHash"]);
  const items = raw["items"].map((v) => parseItem(v, request, currentValueHash));
  let previous: Pick<EvidenceAnchorV1, "id" | "createdAt"> | null = request.after;
  const seen = new Set<string>();
  for (const item of items) {
    if (
      seen.has(item.id) ||
      (previous !== null && compareContactFieldEvidence(previous, item) >= 0)
    )
      throw new TypeError();
    seen.add(item.id);
    previous = item;
  }
  const hasMore = bool(raw["hasMore"]);
  const nextCursor =
    raw["nextCursor"] === null ? null : parseContactFieldEvidenceCursorV1(raw["nextCursor"]);
  const last = items.at(-1);
  if (hasMore) {
    if (last === undefined || items.length !== request.limit || nextCursor === null)
      throw new TypeError();
    const expected = contactFieldEvidenceCursorV1(request, last);
    if (
      Object.keys(expected).some(
        (key) =>
          expected[key as keyof typeof expected] !== nextCursor[key as keyof typeof nextCursor],
      )
    )
      throw new TypeError();
  } else if (nextCursor !== null) throw new TypeError();
  return Object.freeze({
    specVersion: 1,
    vaultId: request.expectedVaultId,
    contactId: request.contactId,
    contactRowVersion: request.expectedContactRowVersion,
    fieldName: request.fieldName,
    includeArchived: request.includeArchived,
    currentValueHash,
    publicOrLicensedEligibility: "not_established",
    items: Object.freeze(items),
    hasMore,
    nextCursor,
  });
};
export const createContactFieldEvidenceQuery = (port: ContactFieldEvidencePortV1) => {
  const rawPort: unknown = port;
  if (
    typeof rawPort !== "object" ||
    rawPort === null ||
    !("listPage" in rawPort) ||
    typeof rawPort.listPage !== "function"
  )
    throw new TypeError("Contact evidence needs a read port.");
  const listPage = port.listPage.bind(port);
  return defineQuery<ListContactFieldEvidenceInputV1, ContactFieldEvidencePageV1>(
    "ListContactFieldEvidenceQuery",
    async (untrusted, context) => {
      let request: ContactFieldEvidenceRequestV1;
      try {
        entityId("application-operation", context.operationId);
        instant(context.initiatedAt);
        request = parseContactFieldEvidenceRequestV1(untrusted);
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose valid viewed contact field evidence.",
          retryable: false,
        });
      }
      let result: unknown;
      try {
        result = await listPage(request);
      } catch (error) {
        const code =
          error instanceof ContactFieldEvidenceError
            ? error.code === "stale"
              ? "conflict"
              : error.code === "invalid_state"
                ? "internal"
                : "unavailable"
            : "unavailable";
        return applicationFailure({
          code,
          message: "Local contact evidence could not be read. Refresh the selected contact.",
          retryable: code !== "internal",
        });
      }
      if (result === undefined)
        return applicationFailure({
          code: "not_found",
          message: "The viewed vault or contact is unavailable in this evidence scope.",
          retryable: false,
        });
      try {
        return applicationSuccess(parseContactFieldEvidencePageV1(result, request));
      } catch {
        return applicationFailure({
          code: "internal",
          message: "Stored contact evidence did not pass validation.",
          retryable: false,
        });
      }
    },
  );
};
