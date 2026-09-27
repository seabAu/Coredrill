import {
  safeParseCaptureEnvelopeV1,
  type CaptureEnvelopeV1,
  type FieldCandidateV1,
  type JsonValue,
} from "@coredrill/contracts";
import { entityId, instant, type EntityId } from "@coredrill/domain";

import {
  reconcileFieldCandidatesV1,
  type FieldCandidateResolutionV1,
} from "./field-candidate-reconciliation.js";
import {
  planHighConfidenceFieldAcceptanceV1,
  type ReviewAcceptanceDecisionV1,
} from "./review-acceptance.js";

export const CAPTURE_REVIEW_PROMOTION_LIMITS = Object.freeze({
  maxAcceptedCandidates: 256,
  maxCandidates: 512,
});

export interface CaptureReviewPreparationV1 {
  readonly specVersion: 1;
  readonly envelopeId: string;
  readonly minimumConfidence: 0.95;
  readonly eligibleCandidateIds: readonly string[];
  readonly decisions: readonly ReviewAcceptanceDecisionV1[];
}

export type CaptureReviewPromotionResolutionV1 =
  { readonly kind: "save_new" } | { readonly kind: "merge_existing"; readonly jobId: string };

export interface CaptureReviewPromotionDependenciesV1 {
  readonly createId: (entity: CaptureReviewPromotionEntityV1) => string;
  readonly hashConfirmedValue: (canonicalJson: string) => Promise<string>;
  readonly initiatedAt: string;
}

export type CaptureReviewPromotionEntityV1 =
  | "company"
  | "field-confirmation"
  | "field-conflict"
  | "job"
  | "job-source"
  | "provenance"
  | "source-snapshot";

export interface MaterializeCaptureReviewPromotionInputV1 {
  readonly specVersion: 1;
  readonly envelope: unknown;
  readonly expectedReviewRowVersion: number;
  readonly acceptedCandidateIds: readonly string[];
  readonly resolution: CaptureReviewPromotionResolutionV1;
}

export interface MaterializedCaptureReviewPromotionV1 {
  readonly envelopeId: EntityId<"capture-envelope">;
  readonly expectedContentHash: string;
  readonly expectedReviewRowVersion: number;
  readonly resolution:
    | {
        readonly kind: "save_new";
        readonly job: {
          readonly id: EntityId<"job">;
          readonly company: {
            readonly id: EntityId<"company">;
            readonly canonicalName: string;
          } | null;
          readonly title: string;
          readonly normalizedTitle: string;
          readonly descriptionText: string;
          readonly employmentType: string | null;
          readonly workplaceType: string | null;
          readonly datePosted: string | null;
          readonly validThrough: string | null;
          readonly createdAt: string;
        };
      }
    | { readonly kind: "merge_existing"; readonly jobId: EntityId<"job"> };
  readonly source: {
    readonly id: EntityId<"job-source">;
    readonly connectorId: string | null;
    readonly externalId: string | null;
    readonly canonicalUrl: string | null;
    readonly applyUrl: string | null;
    readonly firstSeenAt: string;
    readonly lastSeenAt: string;
    readonly contentHash: string;
    readonly createdAt: string;
  };
  readonly snapshot: {
    readonly id: EntityId<"source-snapshot">;
    readonly capturedAt: string;
    readonly extractorId: "coredrill.capture-envelope";
    readonly extractorVersion: "1.0.0";
    readonly rawText: string | null;
    readonly sanitizedHtml: string | null;
    readonly structuredJson: string | null;
    readonly contentHash: string;
    readonly retentionClass: "capture_review";
    readonly createdAt: string;
  };
  readonly candidates: readonly {
    readonly fieldValueId: EntityId<"field-value">;
    readonly provenanceId: EntityId<"provenance">;
    readonly fieldName: string;
    readonly normalizedJson: string;
    readonly rawJson: string | null;
    readonly extractionMethod: FieldCandidateV1["provenance"]["method"];
    readonly sourcePointer: string;
    readonly sourceExcerpt: string | null;
    readonly confidence: number;
    readonly capturedAt: string;
    readonly userConfirmation: {
      readonly id: EntityId<"field-confirmation">;
      readonly confirmedAt: string;
      readonly confirmedValueHash: string;
    } | null;
  }[];
  readonly resolvedAt: string;
}

export type CaptureReviewPromotionErrorCode =
  | "accepted_candidate_invalid"
  | "envelope_invalid"
  | "identifier_invalid"
  | "input_invalid"
  | "title_required";

const ERROR_MESSAGES = Object.freeze({
  accepted_candidate_invalid: "Capture review selected a candidate that is not safely eligible.",
  envelope_invalid: "Capture review could not verify the stored capture contract.",
  identifier_invalid: "Capture review could not create a valid local identifier.",
  input_invalid: "Capture review rejected invalid action input.",
  title_required: "Saving a new job requires an accepted title.",
} satisfies Readonly<Record<CaptureReviewPromotionErrorCode, string>>);

export class CaptureReviewPromotionError extends Error {
  public constructor(public readonly code: CaptureReviewPromotionErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "CaptureReviewPromotionError";
  }
}

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/u;

function promotionError(code: CaptureReviewPromotionErrorCode): CaptureReviewPromotionError {
  return new CaptureReviewPromotionError(code);
}

function canonicalJson(value: JsonValue): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return Object.is(value, -0) ? "0" : JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(value[key] as JsonValue)}`)
    .join(",")}}`;
}

function parseEnvelope(input: unknown): CaptureEnvelopeV1 {
  const parsed = safeParseCaptureEnvelopeV1(input);
  if (
    !parsed.success ||
    parsed.data.fieldCandidates.length > CAPTURE_REVIEW_PROMOTION_LIMITS.maxCandidates
  ) {
    throw promotionError("envelope_invalid");
  }
  return parsed.data;
}

function generatedId<TEntity extends string>(
  entity: TEntity,
  dependencies: CaptureReviewPromotionDependenciesV1,
): EntityId<TEntity> {
  try {
    return entityId(entity, dependencies.createId(entity as CaptureReviewPromotionEntityV1));
  } catch {
    throw promotionError("identifier_invalid");
  }
}

function resolutions(
  envelope: CaptureEnvelopeV1,
  createConflictId: () => string,
): readonly FieldCandidateResolutionV1[] {
  try {
    return reconcileFieldCandidatesV1({
      existingCandidates: [],
      incomingCandidates: envelope.fieldCandidates,
      createConflictId,
    }).fields;
  } catch {
    throw promotionError("envelope_invalid");
  }
}

export function prepareCaptureReviewPromotionV1(
  envelopeInput: unknown,
  createConflictId: () => string,
): CaptureReviewPreparationV1 {
  const envelope = parseEnvelope(envelopeInput);
  try {
    const plan = planHighConfidenceFieldAcceptanceV1({
      specVersion: 1,
      fields: resolutions(envelope, createConflictId),
    });
    return Object.freeze({
      specVersion: 1 as const,
      envelopeId: envelope.id,
      minimumConfidence: plan.minimumConfidence,
      eligibleCandidateIds: Object.freeze([...plan.acceptedCandidateIds]),
      decisions: Object.freeze([...plan.decisions]),
    });
  } catch (error) {
    if (error instanceof CaptureReviewPromotionError) throw error;
    throw promotionError("envelope_invalid");
  }
}

function selectedCandidates(
  fields: readonly FieldCandidateResolutionV1[],
): ReadonlyMap<string, FieldCandidateV1> {
  const selected = new Map<string, FieldCandidateV1>();
  for (const field of fields) {
    const candidate = field.candidates.find(({ id }) => id === field.selectedCandidateId);
    if (candidate === undefined) throw promotionError("envelope_invalid");
    selected.set(field.fieldName, candidate);
  }
  return selected;
}

function acceptedString(
  fieldName: string,
  selected: ReadonlyMap<string, FieldCandidateV1>,
  accepted: ReadonlySet<string>,
): string | null {
  const candidate = selected.get(fieldName);
  if (
    candidate === undefined ||
    !accepted.has(candidate.id) ||
    typeof candidate.value !== "string" ||
    candidate.value.trim().length === 0
  ) {
    return null;
  }
  return candidate.value.trim();
}

function acceptedDate(
  fieldName: string,
  selected: ReadonlyMap<string, FieldCandidateV1>,
  accepted: ReadonlySet<string>,
): string | null {
  const value = acceptedString(fieldName, selected, accepted);
  if (value === null) return null;
  const date = value.slice(0, 10);
  return DATE_PATTERN.test(date) && Number.isFinite(Date.parse(`${date}T00:00:00.000Z`))
    ? date
    : null;
}

function snapshotStructuredJson(envelope: CaptureEnvelopeV1): string | null {
  const structured: Record<string, JsonValue> = {};
  if (envelope.content.jsonLd !== undefined) {
    structured["jsonLd"] = JSON.parse(JSON.stringify(envelope.content.jsonLd)) as JsonValue;
  }
  if (envelope.content.apiPayload !== undefined) {
    structured["apiPayload"] = JSON.parse(JSON.stringify(envelope.content.apiPayload)) as JsonValue;
  }
  return Object.keys(structured).length === 0 ? null : canonicalJson(structured);
}

function connectorId(envelope: CaptureEnvelopeV1): string | null {
  const value = envelope.source.sourceKind?.trim();
  return value === undefined || value.length === 0 || value.length > 128 ? null : value;
}

export async function materializeCaptureReviewPromotionV1(
  input: MaterializeCaptureReviewPromotionInputV1,
  dependencies: CaptureReviewPromotionDependenciesV1,
): Promise<MaterializedCaptureReviewPromotionV1> {
  if (
    !Number.isSafeInteger(input.expectedReviewRowVersion) ||
    input.expectedReviewRowVersion < 1 ||
    input.acceptedCandidateIds.length > CAPTURE_REVIEW_PROMOTION_LIMITS.maxAcceptedCandidates ||
    new Set(input.acceptedCandidateIds).size !== input.acceptedCandidateIds.length
  ) {
    throw promotionError("input_invalid");
  }
  const envelope = parseEnvelope(input.envelope);
  let resolvedAt: string;
  try {
    resolvedAt = instant(dependencies.initiatedAt);
  } catch {
    throw promotionError("input_invalid");
  }
  const fields = resolutions(envelope, () => generatedId("field-conflict", dependencies));
  const acceptance = planHighConfidenceFieldAcceptanceV1({ specVersion: 1, fields });
  const eligibleIds = new Set(acceptance.acceptedCandidateIds);
  if (input.acceptedCandidateIds.some((id) => !eligibleIds.has(id))) {
    throw promotionError("accepted_candidate_invalid");
  }
  const acceptedIds = new Set(input.acceptedCandidateIds);
  const selected = selectedCandidates(fields);

  let resolution: MaterializedCaptureReviewPromotionV1["resolution"];
  if (input.resolution.kind === "merge_existing") {
    try {
      resolution = Object.freeze({
        kind: "merge_existing" as const,
        jobId: entityId("job", input.resolution.jobId),
      });
    } catch {
      throw promotionError("input_invalid");
    }
  } else {
    const title = acceptedString("title", selected, acceptedIds);
    if (title === null) throw promotionError("title_required");
    const companyName = acceptedString("company", selected, acceptedIds);
    resolution = Object.freeze({
      kind: "save_new" as const,
      job: Object.freeze({
        id: generatedId("job", dependencies),
        company:
          companyName === null
            ? null
            : Object.freeze({
                id: generatedId("company", dependencies),
                canonicalName: companyName,
              }),
        title,
        normalizedTitle: title.normalize("NFKC").trim().replace(/\s+/gu, " ").toLowerCase(),
        descriptionText: acceptedString("description", selected, acceptedIds) ?? "",
        employmentType: acceptedString("employment_type", selected, acceptedIds),
        workplaceType:
          acceptedString("workplace_type", selected, acceptedIds) ??
          acceptedString("work_mode", selected, acceptedIds),
        datePosted: acceptedDate("posted_at", selected, acceptedIds),
        validThrough: acceptedDate("valid_through", selected, acceptedIds),
        createdAt: resolvedAt,
      }),
    });
  }

  const candidates: MaterializedCaptureReviewPromotionV1["candidates"][number][] = [];
  for (const candidate of envelope.fieldCandidates) {
    const accepted = acceptedIds.has(candidate.id);
    let userConfirmation: MaterializedCaptureReviewPromotionV1["candidates"][number]["userConfirmation"] =
      null;
    if (accepted) {
      let confirmedValueHash: string;
      try {
        confirmedValueHash = await dependencies.hashConfirmedValue(canonicalJson(candidate.value));
      } catch {
        throw promotionError("input_invalid");
      }
      if (!SHA256_PATTERN.test(confirmedValueHash)) throw promotionError("input_invalid");
      userConfirmation = Object.freeze({
        id: generatedId("field-confirmation", dependencies),
        confirmedAt: resolvedAt,
        confirmedValueHash,
      });
    }
    try {
      candidates.push(
        Object.freeze({
          fieldValueId: entityId("field-value", candidate.id),
          provenanceId: generatedId("provenance", dependencies),
          fieldName: candidate.fieldName,
          normalizedJson: canonicalJson(candidate.value),
          rawJson: candidate.rawValue === undefined ? null : canonicalJson(candidate.rawValue),
          extractionMethod: candidate.provenance.method,
          sourcePointer: candidate.provenance.source.pointer,
          sourceExcerpt: candidate.provenance.sourceExcerpt ?? null,
          confidence: candidate.provenance.confidence,
          capturedAt: candidate.provenance.capturedAt,
          userConfirmation,
        }),
      );
    } catch (error) {
      if (error instanceof CaptureReviewPromotionError) throw error;
      throw promotionError("envelope_invalid");
    }
  }

  const applyUrl = acceptedString("apply_url", selected, acceptedIds);
  const externalId = acceptedString("external_id", selected, acceptedIds);
  const canonicalUrl = envelope.source.canonicalUrl ?? envelope.source.url ?? null;
  return Object.freeze({
    envelopeId: entityId("capture-envelope", envelope.id),
    expectedContentHash: envelope.contentHash,
    expectedReviewRowVersion: input.expectedReviewRowVersion,
    resolution,
    source: Object.freeze({
      id: generatedId("job-source", dependencies),
      connectorId: connectorId(envelope),
      externalId,
      canonicalUrl,
      applyUrl,
      firstSeenAt: envelope.capturedAt,
      lastSeenAt: envelope.capturedAt,
      contentHash: envelope.contentHash,
      createdAt: resolvedAt,
    }),
    snapshot: Object.freeze({
      id: generatedId("source-snapshot", dependencies),
      capturedAt: envelope.capturedAt,
      extractorId: "coredrill.capture-envelope" as const,
      extractorVersion: "1.0.0" as const,
      rawText: envelope.content.readableText ?? envelope.content.selectedText ?? null,
      sanitizedHtml: envelope.content.sanitizedHtml ?? null,
      structuredJson: snapshotStructuredJson(envelope),
      contentHash: envelope.contentHash,
      retentionClass: "capture_review" as const,
      createdAt: resolvedAt,
    }),
    candidates: Object.freeze(candidates),
    resolvedAt,
  });
}
