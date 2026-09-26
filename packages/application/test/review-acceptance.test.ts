import { describe, expect, it } from "vitest";

import type { ExtractionMethod, FieldCandidateV1, JsonValue } from "@coredrill/contracts";

import {
  REVIEW_HIGH_CONFIDENCE_THRESHOLD_V1,
  ReviewAcceptanceError,
  planHighConfidenceFieldAcceptanceV1,
  reconcileFieldCandidatesV1,
  type FieldCandidateResolutionV1,
} from "../src/index.js";

const SOURCE_ID = "019539af-7c14-7dd4-8b54-395d8f3fe4c5";

function uuid(index: number): string {
  return `019b0000-0000-7000-8000-${index.toString(16).padStart(12, "0")}`;
}

function candidate(input: {
  readonly id: number;
  readonly fieldName: string;
  readonly value: JsonValue;
  readonly confidence: number;
  readonly method?: ExtractionMethod;
  readonly confirmed?: boolean;
}): FieldCandidateV1 {
  return {
    specVersion: 1,
    id: uuid(input.id),
    fieldName: input.fieldName,
    value: input.value,
    provenance: {
      specVersion: 1,
      source: {
        sourceType: "capture",
        sourceId: SOURCE_ID,
        pointer: `/fields/${input.fieldName}`,
      },
      method: input.method ?? "api",
      extractor: { name: "review-acceptance-test", version: "1.0.0" },
      capturedAt: "2026-09-26T18:00:00.000Z",
      confidence: input.confidence,
    },
    ...(input.confirmed === true
      ? {
          userConfirmation: {
            specVersion: 1 as const,
            id: uuid(input.id + 10_000),
            actor: "user" as const,
            confirmedAt: "2026-09-26T18:01:00.000Z",
            confirmedValueHash: "a".repeat(64),
          },
        }
      : {}),
  };
}

function resolutions(input: {
  readonly existing?: readonly FieldCandidateV1[];
  readonly incoming?: readonly FieldCandidateV1[];
}): readonly FieldCandidateResolutionV1[] {
  let conflictId = 20_000;
  return reconcileFieldCandidatesV1({
    existingCandidates: input.existing ?? [],
    incomingCandidates: input.incoming ?? [],
    createConflictId: () => uuid(conflictId++),
  }).fields;
}

function plan(fields: readonly FieldCandidateResolutionV1[]) {
  return planHighConfidenceFieldAcceptanceV1({ specVersion: 1, fields });
}

describe("high-confidence review acceptance", () => {
  it("accepts known non-conflicting fields at the inclusive 0.95 threshold", () => {
    const company = candidate({
      id: 1,
      fieldName: "company",
      value: "Coredrill Labs",
      confidence: 0.96,
    });
    const title = candidate({
      id: 2,
      fieldName: "title",
      value: "Platform Engineer",
      confidence: REVIEW_HIGH_CONFIDENCE_THRESHOLD_V1,
    });
    const result = plan(resolutions({ incoming: [title, company] }));

    expect(result).toEqual({
      specVersion: 1,
      minimumConfidence: 0.95,
      acceptedCandidateIds: [company.id, title.id],
      preservedCandidateIds: [],
      decisions: [
        {
          fieldName: "company",
          selectedCandidateId: company.id,
          selectedConfidence: 0.96,
          disposition: "accept",
          reasons: ["high_confidence"],
        },
        {
          fieldName: "title",
          selectedCandidateId: title.id,
          selectedConfidence: 0.95,
          disposition: "accept",
          reasons: ["high_confidence"],
        },
      ],
    });
  });

  it("leaves below-threshold, unsupported, and unknown-valued fields for review", () => {
    const result = plan(
      resolutions({
        incoming: [
          candidate({ id: 10, fieldName: "title", value: "Analyst", confidence: 0.949 }),
          candidate({ id: 11, fieldName: "private_note", value: "Never", confidence: 1 }),
          candidate({ id: 12, fieldName: "description", value: null, confidence: 1 }),
          candidate({ id: 13, fieldName: "locations", value: "   ", confidence: 1 }),
        ],
      }),
    );

    expect(result.acceptedCandidateIds).toEqual([]);
    expect(result.decisions).toMatchObject([
      { fieldName: "description", reasons: ["unknown_value"] },
      { fieldName: "locations", reasons: ["unknown_value"] },
      { fieldName: "private_note", reasons: ["unsupported_field"] },
      { fieldName: "title", reasons: ["below_high_confidence_threshold"] },
    ]);
    expect(result.decisions.every(({ disposition }) => disposition === "review_required")).toBe(
      true,
    );
  });

  it("never accepts unresolved conflicts even when every candidate is high-confidence", () => {
    const first = candidate({ id: 20, fieldName: "title", value: "Engineer", confidence: 1 });
    const second = candidate({ id: 21, fieldName: "title", value: "Architect", confidence: 1 });
    const result = plan(resolutions({ incoming: [second, first] }));

    expect(result.acceptedCandidateIds).toEqual([]);
    expect(result.decisions).toEqual([
      {
        fieldName: "title",
        selectedCandidateId: first.id,
        selectedConfidence: 1,
        disposition: "review_required",
        reasons: ["unresolved_conflict"],
      },
    ]);
  });

  it("preserves an existing confirmation and keeps its later conflict in review", () => {
    const confirmedTitle = candidate({
      id: 30,
      fieldName: "title",
      value: "Confirmed title",
      confidence: 0.1,
      confirmed: true,
    });
    const confirmedCompany = candidate({
      id: 31,
      fieldName: "company",
      value: "Confirmed company",
      confidence: 0.1,
      confirmed: true,
    });
    const incomingCompany = candidate({
      id: 32,
      fieldName: "company",
      value: "Different company",
      confidence: 1,
    });
    const result = plan(
      resolutions({ existing: [confirmedTitle, confirmedCompany], incoming: [incomingCompany] }),
    );

    expect(result.acceptedCandidateIds).toEqual([]);
    expect(result.preservedCandidateIds).toEqual([confirmedTitle.id]);
    expect(result.decisions).toEqual([
      {
        fieldName: "company",
        selectedCandidateId: confirmedCompany.id,
        selectedConfidence: 0.1,
        disposition: "review_required",
        reasons: ["unresolved_conflict", "user_confirmation_preserved"],
      },
      {
        fieldName: "title",
        selectedCandidateId: confirmedTitle.id,
        selectedConfidence: 0.1,
        disposition: "preserve",
        reasons: ["already_user_confirmed"],
      },
    ]);
  });

  it("fails closed on forged conflict, selection, review, and object shape metadata", () => {
    const validFields = resolutions({
      incoming: [
        candidate({ id: 40, fieldName: "title", value: "One", confidence: 1 }),
        candidate({ id: 41, fieldName: "title", value: "Two", confidence: 1 }),
      ],
    });
    const valid = validFields[0];
    if (valid === undefined) throw new Error("Expected a synthetic resolution.");

    const invalidInputs = [
      { specVersion: 1, fields: [{ ...valid, conflict: null }] },
      {
        specVersion: 1,
        fields: [
          {
            ...valid,
            conflict: {
              ...valid.conflict,
              status: "resolved",
              resolution: {
                selectedCandidateId: valid.selectedCandidateId,
                resolvedAt: "2026-09-26T18:02:00.000Z",
                resolvedBy: "user",
              },
            },
          },
        ],
      },
      { specVersion: 1, fields: [{ ...valid, selectedCandidateId: uuid(999) }] },
      { specVersion: 1, fields: [{ ...valid, requiresUserReview: false }] },
      { specVersion: 1, fields: [{ ...valid, unexpected: true }] },
      { specVersion: 1, fields: [valid, valid] },
      { specVersion: 2, fields: validFields },
    ];
    for (const invalidInput of invalidInputs) {
      expect(() =>
        planHighConfidenceFieldAcceptanceV1(
          invalidInput as unknown as {
            specVersion: 1;
            fields: readonly FieldCandidateResolutionV1[];
          },
        ),
      ).toThrow(ReviewAcceptanceError);
    }

    const single = resolutions({
      incoming: [candidate({ id: 42, fieldName: "title", value: "Same", confidence: 1 })],
    })[0];
    if (single === undefined) throw new Error("Expected a synthetic single-field resolution.");
    const oversizedCandidates = Array.from({ length: 513 }, (_, index) =>
      candidate({ id: 1_000 + index, fieldName: "title", value: "Same", confidence: 1 }),
    );
    expect(() =>
      planHighConfidenceFieldAcceptanceV1({
        specVersion: 1,
        fields: [{ ...single, candidates: oversizedCandidates }],
      }),
    ).toThrow(ReviewAcceptanceError);
  });

  it("returns deterministic frozen output without mutating the reconciled input", () => {
    const fields = resolutions({
      incoming: [
        candidate({ id: 50, fieldName: "title", value: "Engineer", confidence: 0.95 }),
        candidate({ id: 51, fieldName: "company", value: "Example", confidence: 0.97 }),
      ],
    });
    const before = structuredClone(fields);
    const first = plan(fields);
    const second = plan([...fields].reverse());

    expect(second).toEqual(first);
    expect(fields).toEqual(before);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.acceptedCandidateIds)).toBe(true);
    expect(Object.isFrozen(first.decisions)).toBe(true);
    expect(first.decisions.every(Object.isFrozen)).toBe(true);
    expect(() => {
      (first.acceptedCandidateIds as string[]).push(uuid(999));
    }).toThrow(TypeError);
  });

  it("emits the REV-003 rule proof record", () => {
    const threshold = candidate({
      id: 60,
      fieldName: "title",
      value: "Engineer",
      confidence: 0.95,
    });
    const below = candidate({
      id: 61,
      fieldName: "company",
      value: "Example",
      confidence: 0.949,
    });
    const unsupported = candidate({
      id: 62,
      fieldName: "mystery",
      value: "Unknown field",
      confidence: 1,
    });
    const unknownValue = candidate({
      id: 63,
      fieldName: "description",
      value: null,
      confidence: 1,
    });
    const conflictA = candidate({
      id: 64,
      fieldName: "locations",
      value: "Remote",
      confidence: 1,
    });
    const conflictB = candidate({
      id: 65,
      fieldName: "locations",
      value: "Boston",
      confidence: 1,
    });
    const confirmed = candidate({
      id: 66,
      fieldName: "salary",
      value: "$100,000",
      confidence: 0.1,
      confirmed: true,
    });
    const result = plan(
      resolutions({
        existing: [confirmed],
        incoming: [threshold, below, unsupported, unknownValue, conflictA, conflictB],
      }),
    );
    const reasonSet = new Set(result.decisions.flatMap(({ reasons }) => reasons));
    const proof = {
      minimumConfidence: result.minimumConfidence,
      thresholdInclusive: result.acceptedCandidateIds.includes(threshold.id),
      belowThresholdHeld: reasonSet.has("below_high_confidence_threshold"),
      conflictsHeld: reasonSet.has("unresolved_conflict"),
      unsupportedFieldsHeld: reasonSet.has("unsupported_field"),
      unknownValuesHeld: reasonSet.has("unknown_value"),
      confirmedPreserved: result.preservedCandidateIds.includes(confirmed.id),
      immutablePlan: Object.isFrozen(result) && Object.isFrozen(result.decisions),
      writes: 0,
    };
    expect(proof).toEqual({
      minimumConfidence: 0.95,
      thresholdInclusive: true,
      belowThresholdHeld: true,
      conflictsHeld: true,
      unsupportedFieldsHeld: true,
      unknownValuesHeld: true,
      confirmedPreserved: true,
      immutablePlan: true,
      writes: 0,
    });
    const runtimeProcess = (
      globalThis as typeof globalThis & {
        readonly process?: { readonly stdout?: { write(value: string): unknown } };
      }
    ).process;
    runtimeProcess?.stdout?.write(`REV003_RULE_PROOF ${JSON.stringify(proof)}\n`);
  });
});
