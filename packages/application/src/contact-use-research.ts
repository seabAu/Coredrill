import { entityId, instant, webUrl } from "@coredrill/domain";
import { CONTACT_PROVENANCE_FIELDS, type ContactProvenanceFieldName } from "./company-contact.js";
import { contactFieldValues } from "./company-contact.js";
import { parseContactWorkspaceV1, type ContactWorkspaceV1 } from "./contact-workspace.js";
import {
  ContactFieldUseStorageError,
  parseContactUseRecordRequestV1,
  type ContactPermissionKindV1,
  type ContactUseRecordRequestV1,
} from "./contact-field-use-operations.js";
import { defineQuery } from "./operation.js";
import { applicationFailure, applicationSuccess } from "./result.js";

type Source = Extract<ContactUseRecordRequestV1, { kind: "source" }>;
type Policy = Extract<ContactUseRecordRequestV1, { kind: "policy" }>;
type Review = Extract<ContactUseRecordRequestV1, { kind: "review" }>;
interface Base<K extends string> {
  readonly specVersion: 1;
  readonly kind: K;
  readonly expectedVaultId: string;
}
export interface ContactResearchCursorV1 {
  readonly vaultId: string;
  readonly kind: "sources" | "policies";
  readonly sourceSnapshotId: string | null;
  readonly sourceHash: string | null;
  readonly fieldName: ContactProvenanceFieldName | null;
  readonly at: string;
  readonly id: string;
}
interface Page {
  readonly pageSize: number;
  readonly cursor: ContactResearchCursorV1 | null;
}
export type ContactUseResearchInputV1 =
  | (Base<"sources"> & Page)
  | (Base<"policies"> &
      Page & {
        readonly sourceSnapshotId: string;
        readonly expectedSourceHash: string;
        readonly fieldName: ContactProvenanceFieldName;
      })
  | (Base<"evidence"> & {
      readonly sourceSnapshotId: string;
      readonly expectedSourceHash: string;
      readonly fieldName: ContactProvenanceFieldName;
      readonly policyId: string | null;
      readonly expectedPolicyRowVersion: 1 | 2 | null;
    })
  | (Base<"review"> & {
      readonly contactId: string;
      readonly expectedContactRowVersion: number;
      readonly fieldName: ContactProvenanceFieldName;
      readonly reviewId: string;
      readonly expectedReviewRowVersion: 1 | 2;
    });
export interface ContactResearchSourceV1 {
  readonly id: string;
  readonly sourceHash: string;
  readonly sourceClass: Source["sourceClass"];
  readonly sourceUrl: string;
  readonly capturedAt: string;
  readonly createdAt: string;
}
export interface ContactResearchPolicyV1 {
  readonly id: string;
  readonly sourceSnapshotId: string;
  readonly sourceHash: string;
  readonly fieldName: ContactProvenanceFieldName;
  readonly permissionKind: ContactPermissionKindV1;
  readonly reviewedAt: string;
  readonly reviewDueAt: string;
  readonly disabledAt: string | null;
  readonly rowVersion: 1 | 2;
}
export interface ContactResearchEvidenceV1 {
  readonly specVersion: 1;
  readonly kind: "evidence";
  readonly vaultId: string;
  readonly fieldName: ContactProvenanceFieldName;
  readonly source: Source;
  readonly policy: Policy | null;
  readonly terms: Source | null;
  readonly policyDisabledAt: string | null;
  readonly policyRowVersion: 1 | 2 | null;
}
export type ContactUseResearchViewV1 =
  | {
      readonly specVersion: 1;
      readonly kind: "sources";
      readonly vaultId: string;
      readonly items: readonly ContactResearchSourceV1[];
      readonly nextCursor: ContactResearchCursorV1 | null;
    }
  | {
      readonly specVersion: 1;
      readonly kind: "policies";
      readonly vaultId: string;
      readonly items: readonly ContactResearchPolicyV1[];
      readonly nextCursor: ContactResearchCursorV1 | null;
    }
  | ContactResearchEvidenceV1
  | {
      readonly specVersion: 1;
      readonly kind: "review";
      readonly vaultId: string;
      readonly contactId: string;
      readonly contactRowVersion: number;
      readonly fieldName: ContactProvenanceFieldName;
      readonly fieldRevision: number;
      readonly review: Review;
      readonly revokedAt: string | null;
      readonly rowVersion: 1 | 2;
      readonly evidence: ContactResearchEvidenceV1;
    };
export interface ContactUseResearchPortV1 {
  readonly read: (input: ContactUseResearchInputV1) => Promise<unknown>;
}

/** A deliberate selection in already-read canonical text; this never establishes permission. */
export const contactResearchTextSpanV1 = (input: unknown, start: number, end: number) => {
  const record = parseContactUseRecordRequestV1(input);
  if (
    record.kind !== "source" ||
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end <= start ||
    end > record.literalText.length
  )
    throw new TypeError("Select a complete literal excerpt.");
  const prefix = record.literalText.slice(0, start),
    excerpt = record.literalText.slice(start, end);
  const encoder = new TextEncoder();
  const prefixBytes = encoder.encode(prefix),
    bytes = encoder.encode(excerpt);
  const decoder = new TextDecoder("utf-8", { fatal: true, ignoreBOM: true });
  if (
    bytes.length > 16384 ||
    decoder.decode(prefixBytes) !== prefix ||
    decoder.decode(bytes) !== excerpt
  )
    throw new TypeError("Select whole characters within the excerpt limit.");
  return Object.freeze({
    sourceSnapshotId: record.sourceSnapshotId,
    sourceHash: record.sourceHash,
    startByte: prefixBytes.length,
    endByte: prefixBytes.length + bytes.length,
    excerpt,
  });
};

/** Local preparation only. Copy the viewed value before awaiting the reviewed hasher. */
export const hashViewedContactFieldV1 = async (
  workspace: ContactWorkspaceV1,
  fieldName: ContactProvenanceFieldName,
  digest: (text: string) => Promise<string>,
) => {
  if (!CONTACT_PROVENANCE_FIELDS.includes(fieldName) || typeof digest !== "function")
    throw new TypeError("Choose a populated contact field.");
  const copied = parseContactWorkspaceV1(workspace, {
    expectedVaultId: workspace.vaultId,
    contactId: workspace.contact.id,
    includeArchived: false,
  });
  const value = contactFieldValues(copied.contact)[fieldName];
  if (value === null) throw new TypeError("Choose a populated contact field.");
  const encoded = new TextEncoder().encode(value);
  if (new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(encoded) !== value)
    throw new TypeError("The contact field is not canonical UTF-8.");
  return hash(await digest(value));
};
const invalid = (): never => {
  throw new TypeError("Invalid local contact research read.");
};
const shape = (value: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (
    typeof value !== "object" ||
    value === null ||
    Array.isArray(value) ||
    Object.getOwnPropertySymbols(value).length !== 0 ||
    Object.getOwnPropertyNames(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    return invalid();
  return Object.fromEntries(keys.map((key) => [key, (value as Record<string, unknown>)[key]]));
};
const id = (v: unknown): string =>
  typeof v === "string" ? entityId("contact-research", v) : invalid();
const time = (v: unknown): string => (typeof v === "string" ? instant(v) : invalid());
const hash = (v: unknown): string =>
  typeof v === "string" && /^[a-f0-9]{64}$/u.test(v) ? v : invalid();
const number = (v: unknown, max = Number.MAX_SAFE_INTEGER): number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 1 && v <= max ? v : invalid();
const field = (v: unknown) => CONTACT_PROVENANCE_FIELDS.find((f) => f === v) ?? invalid();
const version = (v: unknown): 1 | 2 => (v === 1 || v === 2 ? v : invalid());
const lifecycle = (at: unknown, changed: unknown, rv: unknown) => {
  const reviewedAt = time(at),
    rowVersion = version(rv);
  const changedAt = changed === null ? null : time(changed);
  if ((changedAt === null) !== (rowVersion === 1) || (changedAt !== null && changedAt < reviewedAt))
    return invalid();
  return changedAt;
};
const base = (v: Record<string, unknown>) => {
  if (v["specVersion"] !== 1) return invalid();
  return { specVersion: 1 as const, expectedVaultId: id(v["expectedVaultId"]) };
};
const baseKeys = ["specVersion", "kind", "expectedVaultId"];
const sourceScope = ["sourceSnapshotId", "expectedSourceHash", "fieldName"];
export const parseContactUseResearchInputV1 = (input: unknown): ContactUseResearchInputV1 => {
  if (
    typeof input !== "object" ||
    input === null ||
    Array.isArray(input) ||
    !Object.hasOwn(input, "kind") ||
    Object.getOwnPropertySymbols(input).length !== 0
  )
    return invalid();
  const copied = Object.fromEntries(
    Object.getOwnPropertyNames(input).map((key) => [key, (input as Record<string, unknown>)[key]]),
  );
  const kind = copied["kind"];
  if (kind === "sources" || kind === "policies") {
    const v = shape(copied, [
      ...baseKeys,
      "pageSize",
      "cursor",
      ...(kind === "policies" ? sourceScope : []),
    ]);
    const scope =
      kind === "policies"
        ? {
            sourceSnapshotId: id(v["sourceSnapshotId"]),
            expectedSourceHash: hash(v["expectedSourceHash"]),
            fieldName: field(v["fieldName"]),
          }
        : null;
    const common = base(v);
    let cursor: ContactResearchCursorV1 | null = null;
    if (v["cursor"] !== null) {
      const c = shape(v["cursor"], [
        "vaultId",
        "kind",
        "sourceSnapshotId",
        "sourceHash",
        "fieldName",
        "at",
        "id",
      ]);
      if (
        c["vaultId"] !== common.expectedVaultId ||
        c["kind"] !== kind ||
        c["sourceSnapshotId"] !== (scope?.sourceSnapshotId ?? null) ||
        c["sourceHash"] !== (scope?.expectedSourceHash ?? null) ||
        c["fieldName"] !== (scope?.fieldName ?? null)
      )
        return invalid();
      cursor = Object.freeze({
        vaultId: common.expectedVaultId,
        kind,
        sourceSnapshotId: scope?.sourceSnapshotId ?? null,
        sourceHash: scope?.expectedSourceHash ?? null,
        fieldName: scope?.fieldName ?? null,
        at: time(c["at"]),
        id: id(c["id"]),
      });
    }
    const page = { ...common, pageSize: number(v["pageSize"], 20), cursor };
    return scope === null
      ? Object.freeze({ ...page, kind: "sources" })
      : Object.freeze({ ...page, ...scope, kind: "policies" });
  }
  if (kind === "evidence") {
    const v = shape(copied, [...baseKeys, ...sourceScope, "policyId", "expectedPolicyRowVersion"]);
    const policyId = v["policyId"] === null ? null : id(v["policyId"]);
    const rowVersion =
      v["expectedPolicyRowVersion"] === null ? null : version(v["expectedPolicyRowVersion"]);
    if ((policyId === null) !== (rowVersion === null)) return invalid();
    return Object.freeze({
      ...base(v),
      kind,
      sourceSnapshotId: id(v["sourceSnapshotId"]),
      expectedSourceHash: hash(v["expectedSourceHash"]),
      fieldName: field(v["fieldName"]),
      policyId,
      expectedPolicyRowVersion: rowVersion,
    });
  }
  if (kind === "review") {
    const v = shape(copied, [
      ...baseKeys,
      "contactId",
      "expectedContactRowVersion",
      "fieldName",
      "reviewId",
      "expectedReviewRowVersion",
    ]);
    return Object.freeze({
      ...base(v),
      kind,
      contactId: id(v["contactId"]),
      expectedContactRowVersion: number(v["expectedContactRowVersion"]),
      fieldName: field(v["fieldName"]),
      reviewId: id(v["reviewId"]),
      expectedReviewRowVersion: version(v["expectedReviewRowVersion"]),
    });
  }
  return invalid();
};
export const parseContactResearchSourceV1 = (raw: unknown): ContactResearchSourceV1 => {
  const v = shape(raw, ["id", "sourceHash", "sourceClass", "sourceUrl", "capturedAt", "createdAt"]);
  const sourceClass = v["sourceClass"],
    sourceUrl = v["sourceUrl"];
  if (
    (sourceClass !== "official_employer_page" &&
      sourceClass !== "public_dataset" &&
      sourceClass !== "licensed_material") ||
    typeof sourceUrl !== "string" ||
    sourceUrl.length > 8192
  )
    return invalid();
  webUrl(sourceUrl);
  const encodedUrl = new TextEncoder().encode(sourceUrl);
  if (
    encodedUrl.length > 8192 ||
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(encodedUrl) !== sourceUrl
  )
    return invalid();
  const capturedAt = time(v["capturedAt"]),
    createdAt = time(v["createdAt"]);
  if (createdAt < capturedAt) return invalid();
  return Object.freeze({
    id: id(v["id"]),
    sourceHash: hash(v["sourceHash"]),
    sourceClass,
    sourceUrl,
    capturedAt,
    createdAt,
  });
};
export const parseContactResearchPolicyV1 = (raw: unknown): ContactResearchPolicyV1 => {
  const v = shape(raw, [
    "id",
    "sourceSnapshotId",
    "sourceHash",
    "fieldName",
    "permissionKind",
    "reviewedAt",
    "reviewDueAt",
    "disabledAt",
    "rowVersion",
  ]);
  const permissionKind = v["permissionKind"];
  if (
    permissionKind !== "explicit_public_job_search_contact" &&
    permissionKind !== "compatible_public_reuse" &&
    permissionKind !== "documented_license_grant"
  )
    return invalid();
  const reviewedAt = time(v["reviewedAt"]),
    reviewDueAt = time(v["reviewDueAt"]);
  if (reviewDueAt <= reviewedAt) return invalid();
  return Object.freeze({
    id: id(v["id"]),
    sourceSnapshotId: id(v["sourceSnapshotId"]),
    sourceHash: hash(v["sourceHash"]),
    fieldName: field(v["fieldName"]),
    permissionKind,
    reviewedAt,
    reviewDueAt,
    disabledAt: lifecycle(reviewedAt, v["disabledAt"], v["rowVersion"]),
    rowVersion: version(v["rowVersion"]),
  });
};
export const contactResearchCursorV1 = (
  request: Extract<ContactUseResearchInputV1, Page>,
  at: string,
  recordId: string,
): ContactResearchCursorV1 =>
  Object.freeze({
    vaultId: request.expectedVaultId,
    kind: request.kind,
    sourceSnapshotId: request.kind === "policies" ? request.sourceSnapshotId : null,
    sourceHash: request.kind === "policies" ? request.expectedSourceHash : null,
    fieldName: request.kind === "policies" ? request.fieldName : null,
    at: time(at),
    id: id(recordId),
  });
const source = (raw: unknown): Source => {
  const r = parseContactUseRecordRequestV1(raw);
  return r.kind === "source" ? r : invalid();
};
const exactSpan = (body: string, start: number, end: number, excerpt: string) => {
  const bytes = new TextEncoder().encode(body);
  if (end > bytes.length) return invalid();
  if (
    new TextDecoder("utf-8", { fatal: true, ignoreBOM: true }).decode(bytes.slice(start, end)) !==
    excerpt
  )
    return invalid();
};
const parseEvidence = (
  raw: unknown,
  r: Extract<ContactUseResearchInputV1, { kind: "evidence" }>,
): ContactResearchEvidenceV1 => {
  const v = shape(raw, [
    "specVersion",
    "kind",
    "vaultId",
    "fieldName",
    "source",
    "policy",
    "terms",
    "policyDisabledAt",
    "policyRowVersion",
  ]);
  if (
    v["specVersion"] !== 1 ||
    v["kind"] !== "evidence" ||
    v["vaultId"] !== r.expectedVaultId ||
    v["fieldName"] !== r.fieldName
  )
    return invalid();
  const s = source(v["source"]);
  if (
    s.expectedVaultId !== r.expectedVaultId ||
    s.sourceSnapshotId !== r.sourceSnapshotId ||
    s.sourceHash !== r.expectedSourceHash
  )
    return invalid();
  let policy: Policy | null = null,
    terms: Source | null = null,
    disabledAt: string | null = null;
  if (r.policyId === null) {
    if (
      [v["policy"], v["terms"], v["policyDisabledAt"], v["policyRowVersion"]].some(
        (x) => x !== null,
      )
    )
      return invalid();
  } else {
    const p = parseContactUseRecordRequestV1(v["policy"]);
    if (
      p.kind !== "policy" ||
      p.policyId !== r.policyId ||
      p.expectedVaultId !== r.expectedVaultId ||
      p.sourceSnapshotId !== s.sourceSnapshotId ||
      p.expectedSourceHash !== s.sourceHash ||
      p.fieldName !== r.fieldName ||
      v["policyRowVersion"] !== r.expectedPolicyRowVersion
    )
      return invalid();
    terms = source(v["terms"]);
    if (
      terms.expectedVaultId !== r.expectedVaultId ||
      terms.sourceSnapshotId !== p.termsSnapshotId ||
      terms.sourceHash !== p.expectedTermsHash ||
      s.recordedAt > p.recordedAt ||
      terms.recordedAt > p.recordedAt
    )
      return invalid();
    const permission =
      s.sourceClass === "official_employer_page"
        ? "explicit_public_job_search_contact"
        : s.sourceClass === "public_dataset"
          ? "compatible_public_reuse"
          : "documented_license_grant";
    if (p.permissionKind !== permission) return invalid();
    exactSpan(terms.literalText, p.termsStartByte, p.termsEndByte, p.termsExcerpt);
    disabledAt = lifecycle(p.recordedAt, v["policyDisabledAt"], v["policyRowVersion"]);
    policy = p;
  }
  return Object.freeze({
    specVersion: 1,
    kind: "evidence",
    vaultId: r.expectedVaultId,
    fieldName: r.fieldName,
    source: s,
    policy,
    terms,
    policyDisabledAt: disabledAt,
    policyRowVersion: r.expectedPolicyRowVersion,
  });
};
export const parseContactUseResearchViewV1 = (
  raw: unknown,
  request: ContactUseResearchInputV1,
): ContactUseResearchViewV1 => {
  const r = parseContactUseResearchInputV1(request);
  if (r.kind === "evidence") return parseEvidence(raw, r);
  if (r.kind === "review") {
    const v = shape(raw, [
      "specVersion",
      "kind",
      "vaultId",
      "contactId",
      "contactRowVersion",
      "fieldName",
      "fieldRevision",
      "review",
      "revokedAt",
      "rowVersion",
      "evidence",
    ]);
    const review = parseContactUseRecordRequestV1(v["review"]);
    if (
      v["specVersion"] !== 1 ||
      v["kind"] !== r.kind ||
      v["vaultId"] !== r.expectedVaultId ||
      v["contactId"] !== r.contactId ||
      v["contactRowVersion"] !== r.expectedContactRowVersion ||
      v["fieldName"] !== r.fieldName ||
      v["rowVersion"] !== r.expectedReviewRowVersion ||
      review.kind !== "review" ||
      review.expectedVaultId !== r.expectedVaultId ||
      review.contactId !== r.contactId ||
      review.fieldName !== r.fieldName ||
      review.reviewId !== r.reviewId ||
      review.expectedContactRowVersion > r.expectedContactRowVersion
    )
      return invalid();
    const evidenceRaw = shape(v["evidence"], [
      "specVersion",
      "kind",
      "vaultId",
      "fieldName",
      "source",
      "policy",
      "terms",
      "policyDisabledAt",
      "policyRowVersion",
    ]);
    const evidence = parseEvidence(v["evidence"], {
      specVersion: 1,
      kind: "evidence",
      expectedVaultId: r.expectedVaultId,
      sourceSnapshotId: review.sourceSnapshotId,
      expectedSourceHash: review.expectedSourceHash,
      fieldName: r.fieldName,
      policyId: review.policyId,
      expectedPolicyRowVersion: version(evidenceRaw["policyRowVersion"]),
    });
    if (
      evidence.policy === null ||
      evidence.policy.recordedAt > review.recordedAt ||
      evidence.source.recordedAt > review.recordedAt
    )
      return invalid();
    exactSpan(
      evidence.source.literalText,
      review.sourceStartByte,
      review.sourceEndByte,
      review.sourceExcerpt,
    );
    const fieldRevision = number(v["fieldRevision"]);
    if ((review.expectedLatestReviewId === null) !== (fieldRevision === 1)) return invalid();
    return Object.freeze({
      specVersion: 1,
      kind: "review",
      vaultId: r.expectedVaultId,
      contactId: r.contactId,
      contactRowVersion: r.expectedContactRowVersion,
      fieldName: r.fieldName,
      fieldRevision,
      review,
      revokedAt: lifecycle(review.recordedAt, v["revokedAt"], v["rowVersion"]),
      rowVersion: r.expectedReviewRowVersion,
      evidence,
    });
  }
  const v = shape(raw, ["specVersion", "kind", "vaultId", "items", "nextCursor"]);
  if (
    v["specVersion"] !== 1 ||
    v["kind"] !== r.kind ||
    v["vaultId"] !== r.expectedVaultId ||
    !Array.isArray(v["items"]) ||
    v["items"].length > r.pageSize
  )
    return invalid();
  const items = v["items"].map((item: unknown) =>
    r.kind === "sources" ? parseContactResearchSourceV1(item) : parseContactResearchPolicyV1(item),
  );
  let prior = r.cursor;
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) return invalid();
    seen.add(item.id);
    const at = "createdAt" in item ? item.createdAt : item.reviewedAt;
    if (prior !== null && (at > prior.at || (at === prior.at && item.id >= prior.id)))
      return invalid();
    if (
      r.kind === "policies" &&
      (!("fieldName" in item) ||
        item.fieldName !== r.fieldName ||
        item.sourceSnapshotId !== r.sourceSnapshotId ||
        item.sourceHash !== r.expectedSourceHash)
    )
      return invalid();
    prior = contactResearchCursorV1(r, at, item.id);
  }
  let nextCursor: ContactResearchCursorV1 | null = null;
  if (v["nextCursor"] !== null) {
    const parsed = parseContactUseResearchInputV1({ ...r, cursor: v["nextCursor"] });
    if (parsed.kind !== "sources" && parsed.kind !== "policies") return invalid();
    nextCursor = parsed.cursor;
    if (
      items.length !== r.pageSize ||
      prior === null ||
      JSON.stringify(nextCursor) !== JSON.stringify(prior)
    )
      return invalid();
  }
  return Object.freeze({
    specVersion: 1,
    kind: r.kind,
    vaultId: r.expectedVaultId,
    items: Object.freeze(items),
    nextCursor,
  }) as ContactUseResearchViewV1;
};
/** Rehash deliberate bodies independently of the storage adapter. No clock grants eligibility. */
export const createContactUseResearchQuery = (
  port: ContactUseResearchPortV1,
  digest: (text: string) => Promise<string>,
) => {
  if (typeof port.read !== "function" || typeof digest !== "function")
    throw new TypeError("Contact research needs local read capabilities.");
  const read = port.read.bind(port);
  return defineQuery<unknown, ContactUseResearchViewV1>(
    "ReadContactUseResearchQuery",
    async (input, context) => {
      let r: ContactUseResearchInputV1;
      try {
        const c = shape(context, ["operationId", "initiatedAt"]);
        id(c["operationId"]);
        time(c["initiatedAt"]);
        r = parseContactUseResearchInputV1(input);
      } catch {
        return applicationFailure({
          code: "validation",
          message: "Choose the original local research scope.",
          retryable: false,
        });
      }
      try {
        const view = parseContactUseResearchViewV1(await read(r), r);
        const evidence =
          view.kind === "review" ? view.evidence : view.kind === "evidence" ? view : null;
        if (evidence !== null) {
          if (
            hash(await digest(evidence.source.literalText)) !== evidence.source.sourceHash ||
            (evidence.terms !== null &&
              hash(await digest(evidence.terms.literalText)) !== evidence.terms.sourceHash) ||
            (view.kind === "review" &&
              hash(await digest(view.review.sourceExcerpt)) !== view.review.expectedValueHash)
          )
            return invalid();
        }
        return applicationSuccess(view);
      } catch (error) {
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
            "Local research could not be confirmed. Refresh the selected scope without repeating a write.",
          retryable: code === "unavailable" || code === "conflict",
        });
      }
    },
  );
};
