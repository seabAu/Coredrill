import { entityId, instant, webUrl, type EntityId, type Instant } from "@coredrill/domain";
import { CONTACT_PROVENANCE_FIELDS, type ContactProvenanceFieldName } from "./company-contact.js";

type SourceClass = "official_employer_page" | "public_dataset" | "licensed_material";
type RightsBasis = "public" | "licensed";

/** Independent local evidence; never a job source or an acquisition permission. */
export interface ContactSourceSnapshotV1 {
  readonly specVersion: 1;
  readonly id: EntityId<"contact-source-snapshot">;
  readonly vaultId: EntityId<"vault">;
  readonly acquisition: "user_supplied";
  readonly sourceClass: SourceClass;
  readonly sourceUrl: string;
  readonly capturedAt: Instant;
  readonly contentHash: string;
}

/** Exact-value local review, not verification of identity, rights or deliverability. */
export interface ContactFieldUseReviewV1 {
  readonly specVersion: 1;
  readonly id: EntityId<"contact-field-use-review">;
  readonly vaultId: EntityId<"vault">;
  readonly contactId: EntityId<"contact">;
  readonly fieldName: ContactProvenanceFieldName;
  readonly valueHash: string;
  readonly sourceSnapshotId: EntityId<"contact-source-snapshot">;
  readonly sourceSnapshotHash: string;
  readonly pointer: string;
  readonly excerpt: string;
  readonly policyId: EntityId<"contact-field-use-policy">;
  readonly policyRevision: number;
  readonly purpose: "job_search";
  readonly purposeNote: string;
  readonly reviewedAt: Instant;
  readonly reviewDueAt: Instant;
  readonly expiresAt: Instant;
  readonly revokedAt: Instant | null;
}

export interface ContactFieldUseEvidenceV1 {
  readonly specVersion: 1;
  readonly vaultId: EntityId<"vault">;
  readonly contactId: EntityId<"contact">;
  readonly fieldName: ContactProvenanceFieldName;
  readonly currentValueHash: string | null;
  /** Operation-owned UTC observation, not an implicit device clock read. */
  readonly now: Instant;
  readonly source: ContactSourceSnapshotV1;
  readonly review: ContactFieldUseReviewV1;
}

/**
 * Authority port: resolve from separately reviewed local policy, not a caller's
 * evidence/URL/license note. Parsing its output establishes shape, not authority.
 * No production resolver or contact source approval is supplied by this module.
 */
export type ContactFieldUsePolicyResolverV1 = (policyId: string) => unknown;

export interface ContactFieldUsePolicyV1 {
  readonly specVersion: 1;
  readonly id: EntityId<"contact-field-use-policy">;
  readonly vaultId: EntityId<"vault">;
  readonly revision: number;
  readonly status: "enabled" | "disabled";
  readonly sourceSnapshotId: EntityId<"contact-source-snapshot">;
  readonly sourceSnapshotHash: string;
  readonly sourceUrl: string;
  readonly sourceClass: SourceClass;
  readonly fieldName: ContactProvenanceFieldName;
  readonly rightsBasis: RightsBasis;
  readonly purpose: "job_search";
  readonly usage: "display_and_manual_use";
  readonly reviewedAt: Instant;
  readonly reviewDueAt: Instant;
}

type DenialReason =
  | "invalid_evidence"
  | "scope_mismatch"
  | "value_changed_or_missing"
  | "review_not_current"
  | "revoked"
  | "policy_unavailable"
  | "policy_not_current_or_applicable";

export type ContactFieldUseAssessmentV1 = Readonly<
  {
    specVersion: 1;
    reviewId: EntityId<"contact-field-use-review"> | null;
    policyId: EntityId<"contact-field-use-policy"> | null;
  } & (
    | {
        eligible: true;
        reason: "reviewed_basis_current";
        rightsBasis: RightsBasis;
        validUntil: Instant;
      }
    | { eligible: false; reason: DenialReason; rightsBasis: null; validUntil: null }
  )
>;

const invalid = (): never => {
  throw new TypeError("Invalid contact field-use evidence.");
};
const record = (raw: unknown, names: readonly string[]) => {
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return invalid();
  if (Object.keys(raw).length !== names.length || names.some((key) => !Object.hasOwn(raw, key)))
    return invalid();
  return raw as Record<string, unknown>;
};
const literal = <T extends string | number>(raw: unknown, expected: T): T =>
  raw === expected ? expected : invalid();
const text = (raw: unknown, bytes: number): string => {
  if (typeof raw !== "string" || raw.length > bytes || raw.trim().length === 0) return invalid();
  const encoded = new TextEncoder().encode(raw);
  if (
    encoded.length > bytes ||
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(encoded) !== raw
  )
    return invalid();
  return raw;
};
const id = <K extends string>(kind: K, raw: unknown) => entityId(kind, text(raw, 36));
const time = (raw: unknown) => instant(text(raw, 24));
const hash = (raw: unknown): string =>
  typeof raw === "string" && /^[a-f0-9]{64}$/u.test(raw) ? raw : invalid();
const revision = (raw: unknown): number =>
  typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0 ? raw : invalid();
const field = (raw: unknown): ContactProvenanceFieldName =>
  CONTACT_PROVENANCE_FIELDS.find((value) => value === raw) ?? invalid();
const sourceClass = (raw: unknown): SourceClass =>
  raw === "official_employer_page" || raw === "public_dataset" || raw === "licensed_material"
    ? raw
    : invalid();
const url = (raw: unknown): string => {
  const value = text(raw, 8192);
  webUrl(value);
  return value;
};

const source = (raw: unknown): ContactSourceSnapshotV1 => {
  const v = record(raw, [
    "specVersion",
    "id",
    "vaultId",
    "acquisition",
    "sourceClass",
    "sourceUrl",
    "capturedAt",
    "contentHash",
  ]);
  return Object.freeze({
    specVersion: literal(v["specVersion"], 1),
    id: id("contact-source-snapshot", v["id"]),
    vaultId: id("vault", v["vaultId"]),
    acquisition: literal(v["acquisition"], "user_supplied"),
    sourceClass: sourceClass(v["sourceClass"]),
    sourceUrl: url(v["sourceUrl"]),
    capturedAt: time(v["capturedAt"]),
    contentHash: hash(v["contentHash"]),
  });
};
const review = (raw: unknown): ContactFieldUseReviewV1 => {
  const v = record(raw, [
    "specVersion",
    "id",
    "vaultId",
    "contactId",
    "fieldName",
    "valueHash",
    "sourceSnapshotId",
    "sourceSnapshotHash",
    "pointer",
    "excerpt",
    "policyId",
    "policyRevision",
    "purpose",
    "purposeNote",
    "reviewedAt",
    "reviewDueAt",
    "expiresAt",
    "revokedAt",
  ]);
  const result = Object.freeze({
    specVersion: literal(v["specVersion"], 1),
    id: id("contact-field-use-review", v["id"]),
    vaultId: id("vault", v["vaultId"]),
    contactId: id("contact", v["contactId"]),
    fieldName: field(v["fieldName"]),
    valueHash: hash(v["valueHash"]),
    sourceSnapshotId: id("contact-source-snapshot", v["sourceSnapshotId"]),
    sourceSnapshotHash: hash(v["sourceSnapshotHash"]),
    pointer: text(v["pointer"], 8192),
    excerpt: text(v["excerpt"], 16384),
    policyId: id("contact-field-use-policy", v["policyId"]),
    policyRevision: revision(v["policyRevision"]),
    purpose: literal(v["purpose"], "job_search"),
    purposeNote: text(v["purposeNote"], 2000),
    reviewedAt: time(v["reviewedAt"]),
    reviewDueAt: time(v["reviewDueAt"]),
    expiresAt: time(v["expiresAt"]),
    revokedAt: v["revokedAt"] === null ? null : time(v["revokedAt"]),
  });
  if (
    result.reviewDueAt <= result.reviewedAt ||
    result.expiresAt <= result.reviewedAt ||
    (result.revokedAt !== null && result.revokedAt < result.reviewedAt)
  )
    return invalid();
  return result;
};

/** Strict shape validation only; source bytes/hash and policy authority remain separate checks. */
export const parseContactFieldUseEvidenceV1 = (raw: unknown): ContactFieldUseEvidenceV1 => {
  try {
    const v = record(raw, [
      "specVersion",
      "vaultId",
      "contactId",
      "fieldName",
      "currentValueHash",
      "now",
      "source",
      "review",
    ]);
    return Object.freeze({
      specVersion: literal(v["specVersion"], 1),
      vaultId: id("vault", v["vaultId"]),
      contactId: id("contact", v["contactId"]),
      fieldName: field(v["fieldName"]),
      currentValueHash: v["currentValueHash"] === null ? null : hash(v["currentValueHash"]),
      now: time(v["now"]),
      source: source(v["source"]),
      review: review(v["review"]),
    });
  } catch {
    return invalid();
  }
};

const policy = (raw: unknown): ContactFieldUsePolicyV1 => {
  const v = record(raw, [
    "specVersion",
    "id",
    "vaultId",
    "revision",
    "status",
    "sourceSnapshotId",
    "sourceSnapshotHash",
    "sourceUrl",
    "sourceClass",
    "fieldName",
    "rightsBasis",
    "purpose",
    "usage",
    "reviewedAt",
    "reviewDueAt",
  ]);
  const status = v["status"];
  const rightsBasis = v["rightsBasis"];
  if (
    (status !== "enabled" && status !== "disabled") ||
    (rightsBasis !== "public" && rightsBasis !== "licensed")
  )
    return invalid();
  const result = Object.freeze({
    specVersion: literal(v["specVersion"], 1),
    id: id("contact-field-use-policy", v["id"]),
    vaultId: id("vault", v["vaultId"]),
    revision: revision(v["revision"]),
    status,
    sourceSnapshotId: id("contact-source-snapshot", v["sourceSnapshotId"]),
    sourceSnapshotHash: hash(v["sourceSnapshotHash"]),
    sourceUrl: url(v["sourceUrl"]),
    sourceClass: sourceClass(v["sourceClass"]),
    fieldName: field(v["fieldName"]),
    rightsBasis,
    purpose: literal(v["purpose"], "job_search"),
    usage: literal(v["usage"], "display_and_manual_use"),
    reviewedAt: time(v["reviewedAt"]),
    reviewDueAt: time(v["reviewDueAt"]),
  });
  if (result.reviewDueAt <= result.reviewedAt) return invalid();
  return result;
};

/**
 * Pure basis assessment: no storage, clock, network, deletion or outbound action.
 * Call only over canonical, independently validated retained evidence. This does
 * not verify source content hashes or turn caller-controlled metadata into rights.
 */
export const assessContactFieldUseV1 = (
  raw: unknown,
  resolveReviewedPolicy: ContactFieldUsePolicyResolverV1,
): ContactFieldUseAssessmentV1 => {
  let evidence: ContactFieldUseEvidenceV1;
  const denied = (reason: DenialReason, r?: ContactFieldUseReviewV1): ContactFieldUseAssessmentV1 =>
    Object.freeze({
      specVersion: 1,
      eligible: false,
      reason,
      rightsBasis: null,
      validUntil: null,
      reviewId: r?.id ?? null,
      policyId: r?.policyId ?? null,
    });
  try {
    evidence = parseContactFieldUseEvidenceV1(raw);
  } catch {
    return denied("invalid_evidence");
  }
  const { source: s, review: r, now } = evidence;
  if (
    s.vaultId !== evidence.vaultId ||
    r.vaultId !== evidence.vaultId ||
    r.contactId !== evidence.contactId ||
    r.fieldName !== evidence.fieldName ||
    r.sourceSnapshotId !== s.id ||
    r.sourceSnapshotHash !== s.contentHash
  )
    return denied("scope_mismatch", r);
  if (evidence.currentValueHash === null || r.valueHash !== evidence.currentValueHash)
    return denied("value_changed_or_missing", r);
  if (r.revokedAt !== null) return denied("revoked", r);
  if (
    s.capturedAt > r.reviewedAt ||
    r.reviewedAt > now ||
    now >= r.reviewDueAt ||
    now >= r.expiresAt
  )
    return denied("review_not_current", r);
  let resolved: unknown;
  try {
    resolved = resolveReviewedPolicy(r.policyId);
  } catch {
    return denied("policy_unavailable", r);
  }
  let p: ContactFieldUsePolicyV1;
  try {
    p = policy(resolved);
  } catch {
    return denied("policy_not_current_or_applicable", r);
  }
  if (
    p.id !== r.policyId ||
    p.vaultId !== evidence.vaultId ||
    p.revision !== r.policyRevision ||
    p.status !== "enabled" ||
    p.sourceSnapshotId !== s.id ||
    p.sourceSnapshotHash !== s.contentHash ||
    p.sourceUrl !== s.sourceUrl ||
    p.sourceClass !== s.sourceClass ||
    p.fieldName !== r.fieldName ||
    (p.rightsBasis === "licensed") !== (s.sourceClass === "licensed_material") ||
    p.reviewedAt > r.reviewedAt ||
    now >= p.reviewDueAt
  )
    return denied("policy_not_current_or_applicable", r);
  const validUntil = [r.reviewDueAt, r.expiresAt, p.reviewDueAt].sort()[0];
  if (validUntil === undefined) return denied("invalid_evidence", r);
  return Object.freeze({
    specVersion: 1,
    eligible: true,
    reason: "reviewed_basis_current",
    rightsBasis: p.rightsBasis,
    reviewId: r.id,
    policyId: p.id,
    validUntil,
  });
};
