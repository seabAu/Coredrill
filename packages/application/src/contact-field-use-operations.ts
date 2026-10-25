import { entityId, instant, webUrl } from "@coredrill/domain";
import { CONTACT_PROVENANCE_FIELDS, type ContactProvenanceFieldName } from "./company-contact.js";
import type { ContactFieldUseAssessmentV1, ContactSourceSnapshotV1 } from "./contact-field-use.js";
import { defineCommand, defineQuery, type ApplicationOperationContext } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

export const CONTACT_SOURCE_USE_ACKNOWLEDGEMENT = "I reviewed this source's permitted field use.";
export const CONTACT_FIELD_USE_ACKNOWLEDGEMENT = "I reviewed this exact contact field and purpose.";
export type ContactPermissionKindV1 =
  "explicit_public_job_search_contact" | "compatible_public_reuse" | "documented_license_grant";
interface Base<K extends string> {
  readonly specVersion: 1;
  readonly kind: K;
  readonly expectedVaultId: string;
}
export interface StoreContactSourceInputV1 extends Base<"source"> {
  readonly sourceSnapshotId: string;
  readonly sourceClass: ContactSourceSnapshotV1["sourceClass"];
  readonly sourceUrl: string;
  readonly capturedAt: string;
  readonly literalText: string;
}
export interface RecordContactSourceUseInputV1 extends Base<"policy"> {
  readonly policyId: string;
  readonly sourceSnapshotId: string;
  readonly expectedSourceHash: string;
  readonly fieldName: ContactProvenanceFieldName;
  readonly termsSnapshotId: string;
  readonly expectedTermsHash: string;
  readonly termsStartByte: number;
  readonly termsEndByte: number;
  readonly termsExcerpt: string;
  readonly permissionKind: ContactPermissionKindV1;
  readonly purpose: "job_search";
  readonly reviewDueAt: string;
  readonly acknowledgement: typeof CONTACT_SOURCE_USE_ACKNOWLEDGEMENT;
}
export interface RecordContactFieldUseInputV1 extends Base<"review"> {
  readonly reviewId: string;
  readonly contactId: string;
  readonly expectedContactRowVersion: number;
  readonly expectedLatestReviewId: string | null;
  readonly fieldName: ContactProvenanceFieldName;
  readonly expectedValueHash: string;
  readonly sourceSnapshotId: string;
  readonly expectedSourceHash: string;
  readonly sourceStartByte: number;
  readonly sourceEndByte: number;
  readonly sourceExcerpt: string;
  readonly policyId: string;
  readonly policyRevision: 1;
  readonly purpose: "job_search";
  readonly purposeNote: string;
  readonly reviewDueAt: string;
  readonly expiresAt: string;
  readonly acknowledgement: typeof CONTACT_FIELD_USE_ACKNOWLEDGEMENT;
}
export type ContactUseRecordInputV1 =
  StoreContactSourceInputV1 | RecordContactSourceUseInputV1 | RecordContactFieldUseInputV1;
interface RecordedContext {
  readonly operationId: string;
  readonly recordedAt: string;
}
export type ContactUseRecordRequestV1 = RecordedContext &
  (
    | (StoreContactSourceInputV1 & { readonly sourceHash: string })
    | RecordContactSourceUseInputV1
    | RecordContactFieldUseInputV1
  );
export interface ContactUseRecordReceiptV1 {
  readonly specVersion: 1;
  readonly kind: ContactUseRecordInputV1["kind"];
  readonly vaultId: string;
  readonly recordId: string;
  readonly operationId: string;
  readonly recordedAt: string;
  readonly sourceSnapshotId: string;
  readonly sourceHash: string;
  readonly valueHash: string | null;
  readonly policyId: string | null;
  readonly rowVersion: 1;
  readonly fieldRevision: number | null;
}
export type ContactUseControlInputV1 =
  | (Base<"disable_policy"> & {
      readonly recordId: string;
      readonly expectedRowVersion: 1;
      readonly sourceSnapshotId: string;
      readonly expectedSourceHash: string;
    })
  | (Base<"revoke_review"> & {
      readonly recordId: string;
      readonly expectedRowVersion: 1;
      readonly contactId: string;
      readonly expectedContactRowVersion: number;
      readonly fieldName: ContactProvenanceFieldName;
    });
export type ContactUseControlRequestV1 = ContactUseControlInputV1 & RecordedContext;
export interface ContactUseControlReceiptV1 {
  readonly specVersion: 1;
  readonly kind: ContactUseControlInputV1["kind"];
  readonly vaultId: string;
  readonly recordId: string;
  readonly recordedAt: string;
  readonly rowVersion: 2;
}
export interface ReadContactFieldUseInputV1 {
  readonly specVersion: 1;
  readonly expectedVaultId: string;
  readonly contactId: string;
  readonly expectedContactRowVersion: number;
  readonly fieldName: ContactProvenanceFieldName;
  readonly includeArchived?: boolean;
}
export interface ReadContactFieldUseRequestV1 extends ReadContactFieldUseInputV1 {
  readonly includeArchived: boolean;
  readonly observedAt: string;
}
export interface ContactUseReviewSummaryV1 {
  readonly id: string;
  readonly operationId: string;
  readonly fieldRevision: number;
  readonly rowVersion: 1 | 2;
  readonly policyId: string;
  readonly policyRevision: 1;
  readonly reviewedAt: string;
  readonly reviewDueAt: string;
  readonly expiresAt: string;
  readonly revokedAt: string | null;
}
export interface ContactUsePolicySummaryV1 {
  readonly id: string;
  readonly rowVersion: 1 | 2;
  readonly status: "enabled" | "disabled";
  readonly rightsBasis: "public" | "licensed";
  readonly reviewedAt: string;
  readonly reviewDueAt: string;
  readonly disabledAt: string | null;
}
/** No contact values, source bodies, permission text, purpose notes or excerpts. */
export interface ContactFieldUseStateV1 {
  readonly specVersion: 1;
  readonly vaultId: string;
  readonly contactId: string;
  readonly contactRowVersion: number;
  readonly contactArchivedAt: string | null;
  readonly fieldName: ContactProvenanceFieldName;
  readonly includeArchived: boolean;
  readonly latestReview: ContactUseReviewSummaryV1 | null;
  readonly policy: ContactUsePolicySummaryV1 | null;
  readonly assessment: ContactFieldUseAssessmentV1 | null;
}
/** Observation only. originalOperationId is query correlation, not control-operation attribution. */
export interface ContactUseInspectionV1 {
  readonly specVersion: 1;
  readonly kind: ContactUseRecordInputV1["kind"] | ContactUseControlInputV1["kind"];
  readonly vaultId: string;
  readonly recordId: string;
  readonly originalOperationId: string;
  readonly state: "absent" | "matching" | "changed" | "original_present";
  readonly rowVersion: 1 | 2 | null;
  readonly lifecycle: "retained" | "enabled" | "disabled" | "not_revoked" | "revoked" | null;
}
export interface ContactFieldUsePortV1 {
  record(input: ContactUseRecordRequestV1): Promise<unknown>;
  control(input: ContactUseControlRequestV1): Promise<unknown>;
  readField(input: ReadContactFieldUseRequestV1): Promise<unknown>;
  inspect(input: ContactUseRecordRequestV1 | ContactUseControlRequestV1): Promise<unknown>;
}
export class ContactFieldUseStorageError extends Error {
  constructor(public readonly code: "stale" | "not_found" | "invalid_state" | "unavailable") {
    super("Local contact field-use storage reported a safe failure.");
    if (!["stale", "not_found", "invalid_state", "unavailable"].includes(code))
      throw new TypeError();
    this.name = "ContactFieldUseStorageError";
  }
}
const invalid = (): never => {
  throw new TypeError("Invalid local contact field-use operation.");
};
const shape = (
  input: unknown,
  allowed: readonly string[],
  required = allowed,
): Record<string, unknown> => {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    Object.getOwnPropertySymbols(input).length !== 0
  )
    return invalid();
  if (
    Object.keys(input).some((key) => !allowed.includes(key)) ||
    required.some((key) => !Object.hasOwn(input, key))
  )
    return invalid();
  return Object.fromEntries(
    allowed
      .filter((key) => Object.hasOwn(input, key))
      .map((key) => [key, (input as Record<string, unknown>)[key]]),
  );
};
const literal = <T extends number | string | null>(v: unknown, wanted: T): T =>
  v === wanted ? wanted : invalid();
const text = (v: unknown, bytes: number, allowBlank = false): string => {
  if (
    typeof v !== "string" ||
    v.length === 0 ||
    v.length > bytes ||
    (!allowBlank && v.trim().length === 0)
  )
    return invalid();
  const encoded = new TextEncoder().encode(v);
  if (
    encoded.length > bytes ||
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(encoded) !== v
  )
    return invalid();
  return v;
};
const id = (v: unknown) => entityId("contact-use-record", text(v, 36));
const time = (v: unknown) => instant(text(v, 24));
const hash = (v: unknown): string =>
  typeof v === "string" && /^[a-f0-9]{64}$/u.test(v) ? v : invalid();
const integer = (v: unknown, minimum = 1, maximum = Number.MAX_SAFE_INTEGER): number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= minimum && v <= maximum ? v : invalid();
const field = (v: unknown) => CONTACT_PROVENANCE_FIELDS.find((value) => value === v) ?? invalid();
const permission = (v: unknown): ContactPermissionKindV1 =>
  v === "explicit_public_job_search_contact" ||
  v === "compatible_public_reuse" ||
  v === "documented_license_grant"
    ? v
    : invalid();
const baseKeys = ["specVersion", "kind", "expectedVaultId"];
const sourceKeys = [
  ...baseKeys,
  "sourceSnapshotId",
  "sourceClass",
  "sourceUrl",
  "capturedAt",
  "literalText",
];
const policyKeys = [
  ...baseKeys,
  "policyId",
  "sourceSnapshotId",
  "expectedSourceHash",
  "fieldName",
  "termsSnapshotId",
  "expectedTermsHash",
  "termsStartByte",
  "termsEndByte",
  "termsExcerpt",
  "permissionKind",
  "purpose",
  "reviewDueAt",
  "acknowledgement",
];
const reviewKeys = [
  ...baseKeys,
  "reviewId",
  "contactId",
  "expectedContactRowVersion",
  "expectedLatestReviewId",
  "fieldName",
  "expectedValueHash",
  "sourceSnapshotId",
  "expectedSourceHash",
  "sourceStartByte",
  "sourceEndByte",
  "sourceExcerpt",
  "policyId",
  "policyRevision",
  "purpose",
  "purposeNote",
  "reviewDueAt",
  "expiresAt",
  "acknowledgement",
];
const recordKeys = (v: unknown) =>
  v === "source"
    ? sourceKeys
    : v === "policy"
      ? policyKeys
      : v === "review"
        ? reviewKeys
        : invalid();
const kindOf = (v: unknown) => {
  if (typeof v !== "object" || v === null || !("kind" in v)) return invalid();
  return v.kind;
};
const span = (start: unknown, end: unknown, excerpt: unknown) => {
  const a = integer(start, 0, 4194304),
    b = integer(end, 1, 4194304),
    value = text(excerpt, 16384);
  if (b <= a || b - a !== new TextEncoder().encode(value).length) return invalid();
  return { start: a, end: b, excerpt: value };
};
export const parseContactUseRecordInputV1 = (input: unknown): ContactUseRecordInputV1 => {
  const v = shape(input, recordKeys(kindOf(input)));
  const common = {
    specVersion: literal(v["specVersion"], 1),
    expectedVaultId: id(v["expectedVaultId"]),
    sourceSnapshotId: id(v["sourceSnapshotId"]),
  };
  if (v["kind"] === "source") {
    const sourceClass = v["sourceClass"];
    if (
      sourceClass !== "official_employer_page" &&
      sourceClass !== "public_dataset" &&
      sourceClass !== "licensed_material"
    )
      return invalid();
    const sourceUrl = text(v["sourceUrl"], 8192);
    webUrl(sourceUrl);
    return Object.freeze({
      ...common,
      kind: "source",
      sourceClass,
      sourceUrl,
      capturedAt: time(v["capturedAt"]),
      literalText: text(v["literalText"], 4194304, true),
    });
  }
  if (v["kind"] === "policy") {
    const s = span(v["termsStartByte"], v["termsEndByte"], v["termsExcerpt"]);
    return Object.freeze({
      ...common,
      kind: "policy",
      policyId: id(v["policyId"]),
      expectedSourceHash: hash(v["expectedSourceHash"]),
      fieldName: field(v["fieldName"]),
      termsSnapshotId: id(v["termsSnapshotId"]),
      expectedTermsHash: hash(v["expectedTermsHash"]),
      termsStartByte: s.start,
      termsEndByte: s.end,
      termsExcerpt: s.excerpt,
      permissionKind: permission(v["permissionKind"]),
      purpose: literal(v["purpose"], "job_search"),
      reviewDueAt: time(v["reviewDueAt"]),
      acknowledgement: literal(v["acknowledgement"], CONTACT_SOURCE_USE_ACKNOWLEDGEMENT),
    });
  }
  const s = span(v["sourceStartByte"], v["sourceEndByte"], v["sourceExcerpt"]);
  return Object.freeze({
    ...common,
    kind: "review",
    reviewId: id(v["reviewId"]),
    contactId: id(v["contactId"]),
    expectedContactRowVersion: integer(v["expectedContactRowVersion"]),
    expectedLatestReviewId:
      v["expectedLatestReviewId"] === null ? null : id(v["expectedLatestReviewId"]),
    fieldName: field(v["fieldName"]),
    expectedValueHash: hash(v["expectedValueHash"]),
    expectedSourceHash: hash(v["expectedSourceHash"]),
    sourceStartByte: s.start,
    sourceEndByte: s.end,
    sourceExcerpt: s.excerpt,
    policyId: id(v["policyId"]),
    policyRevision: literal(v["policyRevision"], 1),
    purpose: literal(v["purpose"], "job_search"),
    purposeNote: text(v["purposeNote"], 2000),
    reviewDueAt: time(v["reviewDueAt"]),
    expiresAt: time(v["expiresAt"]),
    acknowledgement: literal(v["acknowledgement"], CONTACT_FIELD_USE_ACKNOWLEDGEMENT),
  });
};
export const parseContactUseRecordRequestV1 = (input: unknown): ContactUseRecordRequestV1 => {
  const names = recordKeys(kindOf(input));
  const v = shape(input, [
    ...names,
    "operationId",
    "recordedAt",
    ...(kindOf(input) === "source" ? ["sourceHash"] : []),
  ]);
  const parsed = parseContactUseRecordInputV1(
    Object.fromEntries(names.map((key) => [key, v[key]])),
  );
  const common = { operationId: id(v["operationId"]), recordedAt: time(v["recordedAt"]) };
  if (parsed.kind === "source") {
    if (parsed.capturedAt > common.recordedAt) return invalid();
    return Object.freeze({ ...parsed, ...common, sourceHash: hash(v["sourceHash"]) });
  }
  if (
    parsed.reviewDueAt <= common.recordedAt ||
    (parsed.kind === "review" && parsed.expiresAt <= common.recordedAt)
  )
    return invalid();
  return Object.freeze({ ...parsed, ...common });
};
const controlKeys = (kind: unknown) =>
  kind === "disable_policy"
    ? [...baseKeys, "recordId", "expectedRowVersion", "sourceSnapshotId", "expectedSourceHash"]
    : kind === "revoke_review"
      ? [
          ...baseKeys,
          "recordId",
          "expectedRowVersion",
          "contactId",
          "expectedContactRowVersion",
          "fieldName",
        ]
      : invalid();
export const parseContactUseControlInputV1 = (input: unknown): ContactUseControlInputV1 => {
  const v = shape(input, controlKeys(kindOf(input)));
  const common = {
    specVersion: literal(v["specVersion"], 1),
    expectedVaultId: id(v["expectedVaultId"]),
    recordId: id(v["recordId"]),
    expectedRowVersion: literal(v["expectedRowVersion"], 1),
  };
  return v["kind"] === "disable_policy"
    ? Object.freeze({
        ...common,
        kind: "disable_policy",
        sourceSnapshotId: id(v["sourceSnapshotId"]),
        expectedSourceHash: hash(v["expectedSourceHash"]),
      })
    : Object.freeze({
        ...common,
        kind: "revoke_review",
        contactId: id(v["contactId"]),
        expectedContactRowVersion: integer(v["expectedContactRowVersion"]),
        fieldName: field(v["fieldName"]),
      });
};
export const parseContactUseControlRequestV1 = (input: unknown): ContactUseControlRequestV1 => {
  const names = controlKeys(kindOf(input)),
    v = shape(input, [...names, "operationId", "recordedAt"]);
  return Object.freeze({
    ...parseContactUseControlInputV1(Object.fromEntries(names.map((key) => [key, v[key]]))),
    operationId: id(v["operationId"]),
    recordedAt: time(v["recordedAt"]),
  });
};
const readKeys = [
  "specVersion",
  "expectedVaultId",
  "contactId",
  "expectedContactRowVersion",
  "fieldName",
  "includeArchived",
];
export const parseReadContactFieldUseRequestV1 = (input: unknown): ReadContactFieldUseRequestV1 => {
  const v = shape(
    input,
    [...readKeys, "observedAt"],
    [...readKeys.filter((key) => key !== "includeArchived"), "observedAt"],
  );
  if (v["includeArchived"] !== undefined && typeof v["includeArchived"] !== "boolean")
    return invalid();
  return Object.freeze({
    specVersion: literal(v["specVersion"], 1),
    expectedVaultId: id(v["expectedVaultId"]),
    contactId: id(v["contactId"]),
    expectedContactRowVersion: integer(v["expectedContactRowVersion"]),
    fieldName: field(v["fieldName"]),
    includeArchived: v["includeArchived"] ?? false,
    observedAt: time(v["observedAt"]),
  });
};
export const contactUseRecordIdV1 = (
  r: ContactUseRecordRequestV1 | ContactUseControlRequestV1,
): string =>
  r.kind === "source"
    ? r.sourceSnapshotId
    : r.kind === "policy"
      ? r.policyId
      : r.kind === "review"
        ? r.reviewId
        : r.recordId;
export const parseContactUseRecordReceiptV1 = (
  input: unknown,
  r: ContactUseRecordRequestV1,
): ContactUseRecordReceiptV1 => {
  const v = shape(input, [
    "specVersion",
    "kind",
    "vaultId",
    "recordId",
    "operationId",
    "recordedAt",
    "sourceSnapshotId",
    "sourceHash",
    "valueHash",
    "policyId",
    "rowVersion",
    "fieldRevision",
  ]);
  const sourceHash = r.kind === "source" ? r.sourceHash : r.expectedSourceHash;
  if (
    v["specVersion"] !== 1 ||
    v["kind"] !== r.kind ||
    v["vaultId"] !== r.expectedVaultId ||
    v["recordId"] !== contactUseRecordIdV1(r) ||
    v["operationId"] !== r.operationId ||
    v["recordedAt"] !== r.recordedAt ||
    v["sourceSnapshotId"] !== r.sourceSnapshotId ||
    v["sourceHash"] !== sourceHash ||
    v["valueHash"] !== (r.kind === "review" ? r.expectedValueHash : null) ||
    v["policyId"] !== (r.kind === "source" ? null : r.policyId) ||
    v["rowVersion"] !== 1
  )
    return invalid();
  const fieldRevision =
    r.kind === "review" ? integer(v["fieldRevision"]) : literal(v["fieldRevision"], null);
  return Object.freeze({
    specVersion: 1,
    kind: r.kind,
    vaultId: r.expectedVaultId,
    recordId: contactUseRecordIdV1(r),
    operationId: r.operationId,
    recordedAt: r.recordedAt,
    sourceSnapshotId: r.sourceSnapshotId,
    sourceHash,
    valueHash: r.kind === "review" ? r.expectedValueHash : null,
    policyId: r.kind === "source" ? null : r.policyId,
    rowVersion: 1,
    fieldRevision,
  });
};
export const parseContactUseControlReceiptV1 = (
  input: unknown,
  r: ContactUseControlRequestV1,
): ContactUseControlReceiptV1 => {
  const v = shape(input, [
    "specVersion",
    "kind",
    "vaultId",
    "recordId",
    "recordedAt",
    "rowVersion",
  ]);
  if (
    v["specVersion"] !== 1 ||
    v["kind"] !== r.kind ||
    v["vaultId"] !== r.expectedVaultId ||
    v["recordId"] !== r.recordId ||
    v["recordedAt"] !== r.recordedAt ||
    v["rowVersion"] !== 2
  )
    return invalid();
  return Object.freeze({
    specVersion: 1,
    kind: r.kind,
    vaultId: r.expectedVaultId,
    recordId: r.recordId,
    recordedAt: r.recordedAt,
    rowVersion: 2,
  });
};
export const parseContactUseInspectionV1 = (
  input: unknown,
  r: ContactUseRecordRequestV1 | ContactUseControlRequestV1,
): ContactUseInspectionV1 => {
  const v = shape(input, [
    "specVersion",
    "kind",
    "vaultId",
    "recordId",
    "originalOperationId",
    "state",
    "rowVersion",
    "lifecycle",
  ]);
  if (
    v["specVersion"] !== 1 ||
    v["kind"] !== r.kind ||
    v["vaultId"] !== r.expectedVaultId ||
    v["recordId"] !== contactUseRecordIdV1(r) ||
    v["originalOperationId"] !== r.operationId
  )
    return invalid();
  const state = v["state"],
    lifecycle = v["lifecycle"];
  if (
    state !== "absent" &&
    state !== "matching" &&
    state !== "changed" &&
    state !== "original_present"
  )
    return invalid();
  let rowVersion: 1 | 2 | null;
  if (state === "absent") {
    if (v["rowVersion"] !== null || lifecycle !== null) return invalid();
    rowVersion = null;
  } else {
    rowVersion = integer(v["rowVersion"], 1, 2) as 1 | 2;
    if (
      state === "matching" &&
      (r.kind === "disable_policy" || r.kind === "revoke_review") &&
      rowVersion !== 2
    )
      return invalid();
    if (
      r.kind === "source"
        ? lifecycle !== "retained" || rowVersion !== 1
        : r.kind === "policy" || r.kind === "disable_policy"
          ? lifecycle !== (rowVersion === 1 ? "enabled" : "disabled")
          : lifecycle !== (rowVersion === 1 ? "not_revoked" : "revoked")
    )
      return invalid();
    if (
      state === "original_present" &&
      ((r.kind !== "disable_policy" && r.kind !== "revoke_review") || rowVersion !== 1)
    )
      return invalid();
  }
  return Object.freeze({
    specVersion: 1,
    kind: r.kind,
    vaultId: r.expectedVaultId,
    recordId: contactUseRecordIdV1(r),
    originalOperationId: r.operationId,
    state,
    rowVersion,
    lifecycle: lifecycle as ContactUseInspectionV1["lifecycle"],
  });
};
export const parseContactFieldUseStateV1 = (
  input: unknown,
  request: ReadContactFieldUseRequestV1,
): ContactFieldUseStateV1 => {
  const v = shape(input, [
    "specVersion",
    "vaultId",
    "contactId",
    "contactRowVersion",
    "contactArchivedAt",
    "fieldName",
    "includeArchived",
    "latestReview",
    "policy",
    "assessment",
  ]);
  const archived = v["contactArchivedAt"] === null ? null : time(v["contactArchivedAt"]);
  if (
    v["specVersion"] !== 1 ||
    v["vaultId"] !== request.expectedVaultId ||
    v["contactId"] !== request.contactId ||
    v["contactRowVersion"] !== request.expectedContactRowVersion ||
    v["fieldName"] !== request.fieldName ||
    v["includeArchived"] !== request.includeArchived ||
    (archived !== null && !request.includeArchived)
  )
    return invalid();
  let latestReview: ContactUseReviewSummaryV1 | null = null,
    policy: ContactUsePolicySummaryV1 | null = null,
    assessment: ContactFieldUseAssessmentV1 | null = null;
  if (v["latestReview"] === null) {
    if (v["policy"] !== null || v["assessment"] !== null) return invalid();
  } else {
    const r = shape(v["latestReview"], [
      "id",
      "operationId",
      "fieldRevision",
      "rowVersion",
      "policyId",
      "policyRevision",
      "reviewedAt",
      "reviewDueAt",
      "expiresAt",
      "revokedAt",
    ]);
    const rowVersion = integer(r["rowVersion"], 1, 2) as 1 | 2,
      revokedAt = r["revokedAt"] === null ? null : time(r["revokedAt"]);
    latestReview = Object.freeze({
      id: id(r["id"]),
      operationId: id(r["operationId"]),
      fieldRevision: integer(r["fieldRevision"]),
      rowVersion,
      policyId: id(r["policyId"]),
      policyRevision: literal(r["policyRevision"], 1),
      reviewedAt: time(r["reviewedAt"]),
      reviewDueAt: time(r["reviewDueAt"]),
      expiresAt: time(r["expiresAt"]),
      revokedAt,
    });
    if (
      latestReview.reviewDueAt <= latestReview.reviewedAt ||
      latestReview.expiresAt <= latestReview.reviewedAt ||
      (revokedAt === null
        ? rowVersion !== 1
        : rowVersion !== 2 || revokedAt < latestReview.reviewedAt)
    )
      return invalid();
    const p = shape(v["policy"], [
      "id",
      "rowVersion",
      "status",
      "rightsBasis",
      "reviewedAt",
      "reviewDueAt",
      "disabledAt",
    ]);
    const status = p["status"],
      rightsBasis = p["rightsBasis"],
      disabledAt = p["disabledAt"] === null ? null : time(p["disabledAt"]),
      pv = integer(p["rowVersion"], 1, 2) as 1 | 2;
    if (
      (status !== "enabled" && status !== "disabled") ||
      (rightsBasis !== "public" && rightsBasis !== "licensed")
    )
      return invalid();
    policy = Object.freeze({
      id: id(p["id"]),
      rowVersion: pv,
      status,
      rightsBasis,
      reviewedAt: time(p["reviewedAt"]),
      reviewDueAt: time(p["reviewDueAt"]),
      disabledAt,
    });
    if (
      policy.id !== latestReview.policyId ||
      policy.reviewDueAt <= policy.reviewedAt ||
      (status === "enabled"
        ? pv !== 1 || disabledAt !== null
        : pv !== 2 || disabledAt === null || disabledAt < policy.reviewedAt)
    )
      return invalid();
    const a = shape(v["assessment"], [
      "specVersion",
      "eligible",
      "reason",
      "rightsBasis",
      "reviewId",
      "policyId",
      "validUntil",
    ]);
    if (a["specVersion"] !== 1 || a["reviewId"] !== latestReview.id || a["policyId"] !== policy.id)
      return invalid();
    const reviewId = entityId("contact-field-use-review", latestReview.id),
      policyId = entityId("contact-field-use-policy", policy.id);
    if (a["eligible"] === true) {
      const until = [
        latestReview.reviewDueAt,
        latestReview.expiresAt,
        policy.reviewDueAt,
      ].sort()[0];
      if (
        a["reason"] !== "reviewed_basis_current" ||
        a["rightsBasis"] !== policy.rightsBasis ||
        a["validUntil"] !== until ||
        until === undefined ||
        request.observedAt >= until ||
        request.observedAt < latestReview.reviewedAt ||
        policy.reviewedAt > latestReview.reviewedAt ||
        revokedAt !== null ||
        status !== "enabled"
      )
        return invalid();
      assessment = Object.freeze({
        specVersion: 1,
        eligible: true,
        reason: "reviewed_basis_current",
        rightsBasis,
        reviewId,
        policyId,
        validUntil: instant(until),
      });
    } else {
      const reason = a["reason"];
      if (
        a["eligible"] !== false ||
        a["rightsBasis"] !== null ||
        a["validUntil"] !== null ||
        (reason !== "invalid_evidence" &&
          reason !== "scope_mismatch" &&
          reason !== "value_changed_or_missing" &&
          reason !== "review_not_current" &&
          reason !== "revoked" &&
          reason !== "policy_unavailable" &&
          reason !== "policy_not_current_or_applicable")
      )
        return invalid();
      assessment = Object.freeze({
        specVersion: 1,
        eligible: false,
        reason,
        rightsBasis: null,
        reviewId,
        policyId,
        validUntil: null,
      });
    }
  }
  return Object.freeze({
    specVersion: 1,
    vaultId: request.expectedVaultId,
    contactId: request.contactId,
    contactRowVersion: request.expectedContactRowVersion,
    contactArchivedAt: archived,
    fieldName: request.fieldName,
    includeArchived: request.includeArchived,
    latestReview,
    policy,
    assessment,
  });
};
const validateContext = (context: ApplicationOperationContext) => {
  const operationId = entityId("application-operation", context.operationId);
  const initiatedAt = instant(context.initiatedAt);
  return Object.freeze({ operationId, initiatedAt });
};
const validation = () =>
  applicationFailure({
    code: "validation",
    message: "Review the selected field, local evidence and original context.",
    retryable: false,
  });
const internal = () =>
  applicationFailure({
    code: "internal",
    message:
      "Stored contact review acknowledgement could not be validated. Inspect the original record.",
    retryable: false,
  });
const failed = (error: unknown) => {
  const code =
    error instanceof ContactFieldUseStorageError
      ? error.code === "stale"
        ? "conflict"
        : error.code === "invalid_state"
          ? "internal"
          : error.code
      : "unavailable";
  return applicationFailure({
    code,
    message:
      "The local contact review operation could not be confirmed. Inspect its original record before retrying.",
    retryable: code === "unavailable" || code === "conflict",
  });
};
const isPort = (value: unknown): value is ContactFieldUsePortV1 =>
  typeof value === "object" &&
  value !== null &&
  ["record", "control", "readField", "inspect"].every(
    (key) => typeof (value as Record<string, unknown>)[key] === "function",
  );
export const createContactFieldUseOperations = (
  port: ContactFieldUsePortV1,
  hashValue: (value: string) => Promise<string>,
) => {
  if (typeof hashValue !== "function" || !isPort(port))
    throw new TypeError("Contact field-use operations require local ports.");
  const recordPort = port.record.bind(port),
    controlPort = port.control.bind(port),
    readPort = port.readField.bind(port),
    inspectPort = port.inspect.bind(port);
  return Object.freeze({
    record: defineCommand<unknown, ContactUseRecordReceiptV1>(
      "RecordContactFieldUseEvidenceCommand",
      async (input, context) => {
        let parsed: ContactUseRecordInputV1;
        let ownedContext: ApplicationOperationContext;
        try {
          ownedContext = validateContext(context);
          parsed = parseContactUseRecordInputV1(input);
          if (
            parsed.kind === "source"
              ? parsed.capturedAt > ownedContext.initiatedAt
              : parsed.reviewDueAt <= ownedContext.initiatedAt ||
                (parsed.kind === "review" && parsed.expiresAt <= ownedContext.initiatedAt)
          )
            return validation();
        } catch {
          return validation();
        }
        let request: ContactUseRecordRequestV1;
        try {
          request = parseContactUseRecordRequestV1({
            ...parsed,
            operationId: ownedContext.operationId,
            recordedAt: ownedContext.initiatedAt,
            ...(parsed.kind === "source"
              ? { sourceHash: hash(await hashValue(parsed.literalText)) }
              : {}),
          });
        } catch (error) {
          return failed(error);
        }
        let result: unknown;
        try {
          result = await recordPort(request);
        } catch (error) {
          return failed(error);
        }
        try {
          return applicationSuccess(parseContactUseRecordReceiptV1(result, request));
        } catch {
          return internal();
        }
      },
    ),
    control: defineCommand<unknown, ContactUseControlReceiptV1>(
      "ControlContactFieldUseCommand",
      async (input, context) => {
        let request: ContactUseControlRequestV1;
        try {
          const ownedContext = validateContext(context);
          request = parseContactUseControlRequestV1({
            ...parseContactUseControlInputV1(input),
            operationId: ownedContext.operationId,
            recordedAt: ownedContext.initiatedAt,
          });
        } catch {
          return validation();
        }
        let result: unknown;
        try {
          result = await controlPort(request);
        } catch (error) {
          return failed(error);
        }
        try {
          return applicationSuccess(parseContactUseControlReceiptV1(result, request));
        } catch {
          return internal();
        }
      },
    ),
    readField: defineQuery<unknown, ContactFieldUseStateV1>(
      "ReadContactFieldUseQuery",
      async (input, context) => {
        let request: ReadContactFieldUseRequestV1;
        try {
          const ownedContext = validateContext(context);
          const v = shape(
            input,
            readKeys,
            readKeys.filter((key) => key !== "includeArchived"),
          );
          request = parseReadContactFieldUseRequestV1({
            ...v,
            observedAt: ownedContext.initiatedAt,
          });
        } catch {
          return validation();
        }
        let result: unknown;
        try {
          result = await readPort(request);
        } catch (error) {
          return failed(error);
        }
        try {
          return applicationSuccess(parseContactFieldUseStateV1(result, request));
        } catch {
          return internal();
        }
      },
    ),
    inspect: defineQuery<unknown, ContactUseInspectionV1>(
      "InspectContactFieldUseOperationQuery",
      async (input, context) => {
        let request: ContactUseRecordRequestV1 | ContactUseControlRequestV1;
        try {
          validateContext(context);
          request =
            kindOf(input) === "disable_policy" || kindOf(input) === "revoke_review"
              ? parseContactUseControlRequestV1(input)
              : parseContactUseRecordRequestV1(input);
        } catch {
          return validation();
        }
        let result: unknown;
        try {
          result = await inspectPort(request);
        } catch (error) {
          return failed(error);
        }
        try {
          return applicationSuccess(parseContactUseInspectionV1(result, request));
        } catch {
          return internal();
        }
      },
    ),
  });
};
