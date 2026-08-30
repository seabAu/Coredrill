import fc from "fast-check";
import { describe, expect, it } from "vitest";

import {
  EXTRACTION_METHODS,
  fieldConflictV1Schema,
  type ExtractionMethod,
  type FieldCandidateV1,
  type JsonValue,
} from "@coredrill/contracts";

import {
  FieldCandidateReconciliationError,
  reconcileFieldCandidatesV1,
  type FieldCandidateReconciliationErrorCode,
} from "../src/index.js";

const SOURCE_ID = "019539af-7c14-7dd4-8b54-395d8f3fe4c5";

function uuid(index: number): string {
  return `019a0000-0000-7000-8000-${index.toString(16).padStart(12, "0")}`;
}

function candidate(input: {
  readonly id: string;
  readonly value: JsonValue;
  readonly method: ExtractionMethod;
  readonly confidence?: number;
  readonly fieldName?: string;
  readonly confirmed?: boolean;
  readonly capturedAt?: string;
}): FieldCandidateV1 {
  return {
    specVersion: 1,
    id: input.id,
    fieldName: input.fieldName ?? "title",
    value: input.value,
    provenance: {
      specVersion: 1,
      source: {
        sourceType: "capture",
        sourceId: SOURCE_ID,
        pointer: `/fields/${input.fieldName ?? "title"}`,
      },
      method: input.method,
      extractor: { name: "candidate-test", version: "1.0.0" },
      capturedAt: input.capturedAt ?? "2026-08-30T15:00:00.000Z",
      confidence: input.confidence ?? 0.5,
    },
    ...(input.confirmed === true
      ? {
          userConfirmation: {
            specVersion: 1 as const,
            id: uuid(9_000),
            actor: "user" as const,
            confirmedAt: "2026-08-30T15:01:00.000Z",
            confirmedValueHash: "a".repeat(64),
          },
        }
      : {}),
  };
}

function expectErrorCode(
  operation: () => unknown,
  code: FieldCandidateReconciliationErrorCode,
): void {
  try {
    operation();
  } catch (error) {
    expect(error).toBeInstanceOf(FieldCandidateReconciliationError);
    expect((error as FieldCandidateReconciliationError).code).toBe(code);
    return;
  }
  throw new Error(`Expected reconciliation error ${code}.`);
}

describe("field-candidate reconciliation", () => {
  it("retains every candidate and applies the documented method ladder as a suggestion", () => {
    const candidates = EXTRACTION_METHODS.map((method, index) =>
      candidate({
        id: uuid(index + 1),
        value: `${method} title`,
        method,
        confidence: method === "user" ? 0.01 : 1,
      }),
    );

    const result = reconcileFieldCandidatesV1({
      existingCandidates: [],
      incomingCandidates: candidates,
      createConflictId: () => uuid(8_000),
    });

    expect(result.retainedCandidates.map(({ id }) => id)).toEqual(
      candidates.map(({ id }) => id).sort(),
    );
    expect(result.fields).toHaveLength(1);
    expect(result.fields[0]).toMatchObject({
      selectedCandidateId: candidates.find(({ provenance }) => provenance.method === "user")?.id,
      selectionReason: "policy_suggestion",
      requiresUserReview: true,
    });
    expect(result.conflicts).toHaveLength(1);
    expect(fieldConflictV1Schema.parse(result.conflicts[0])).toEqual(result.conflicts[0]);
    expect(result.conflicts[0]?.candidateIds).toEqual(candidates.map(({ id }) => id).sort());
  });

  it("ranks every method tier before confidence and breaks equal-tier ties deterministically", () => {
    const tierPairs: readonly (readonly [ExtractionMethod, ExtractionMethod])[] = [
      ["user", "api"],
      ["api", "selector"],
      ["jsonld", "selector"],
      ["selector", "readability"],
      ["readability", "heuristic"],
      ["heuristic", "llm"],
    ];
    for (const [preferred, lower] of tierPairs) {
      const preferredCandidate = candidate({
        id: uuid(20),
        value: preferred,
        method: preferred,
        confidence: 0,
      });
      const result = reconcileFieldCandidatesV1({
        existingCandidates: [],
        incomingCandidates: [
          candidate({ id: uuid(21), value: lower, method: lower, confidence: 1 }),
          preferredCandidate,
        ],
        createConflictId: () => uuid(8_010),
      });
      expect(result.fields[0]?.selectedCandidateId).toBe(preferredCandidate.id);
    }

    const equalTier = reconcileFieldCandidatesV1({
      existingCandidates: [],
      incomingCandidates: [
        candidate({ id: uuid(30), value: "API", method: "api", confidence: 0.4 }),
        candidate({ id: uuid(31), value: "JSON-LD", method: "jsonld", confidence: 0.8 }),
      ],
      createConflictId: () => uuid(8_011),
    });
    expect(equalTier.fields[0]?.selectedCandidateId).toBe(uuid(31));

    const timeTie = reconcileFieldCandidatesV1({
      existingCandidates: [],
      incomingCandidates: [
        candidate({
          id: uuid(40),
          value: "Older",
          method: "selector",
          capturedAt: "2026-08-30T14:00:00.000Z",
        }),
        candidate({
          id: uuid(41),
          value: "Newer",
          method: "selector",
          capturedAt: "2026-08-30T15:00:00.000Z",
        }),
      ],
      createConflictId: () => uuid(8_012),
    });
    expect(timeTie.fields[0]?.selectedCandidateId).toBe(uuid(41));
  });

  it("keeps a trusted existing confirmation selected while retaining stronger incoming suggestions", () => {
    const confirmed = candidate({
      id: uuid(100),
      value: "Confirmed platform engineer",
      method: "llm",
      confidence: 0.1,
      confirmed: true,
    });
    const incoming = [
      candidate({
        id: uuid(101),
        value: "Incoming user title",
        method: "user",
        confidence: 1,
      }),
      candidate({
        id: uuid(102),
        value: "Official API title",
        method: "api",
        confidence: 1,
      }),
    ];

    const result = reconcileFieldCandidatesV1({
      existingCandidates: [confirmed],
      incomingCandidates: incoming,
      createConflictId: () => uuid(8_001),
    });

    expect(result.retainedCandidates).toHaveLength(3);
    expect(result.fields[0]).toMatchObject({
      selectedCandidateId: confirmed.id,
      selectionReason: "user_confirmed",
      requiresUserReview: true,
    });
    expect(result.fields[0]?.candidates.find(({ id }) => id === confirmed.id)).toMatchObject({
      provenance: { method: "llm" },
      userConfirmation: { actor: "user" },
    });
    expect(result.conflicts[0]?.candidateIds).toEqual([
      confirmed.id,
      ...incoming.map(({ id }) => id),
    ]);
  });

  it("compares normalized JSON semantically instead of treating object key order as conflict", () => {
    const result = reconcileFieldCandidatesV1({
      existingCandidates: [],
      incomingCandidates: [
        candidate({ id: uuid(200), value: { a: 1, b: [true, null] }, method: "jsonld" }),
        candidate({ id: uuid(201), value: { b: [true, null], a: 1 }, method: "api" }),
      ],
      createConflictId: () => uuid(8_002),
    });

    expect(result.retainedCandidates).toHaveLength(2);
    expect(result.fields[0]).toMatchObject({
      selectedCandidateId: uuid(200),
      selectionReason: "policy_suggestion",
      conflict: null,
      requiresUserReview: true,
    });
    expect(result.conflicts).toEqual([]);
  });

  it("rejects forged incoming confirmation, ambiguous confirmation, ID reuse, and oversized conflicts", () => {
    const confirmed = candidate({
      id: uuid(300),
      value: "Confirmed",
      method: "selector",
      confirmed: true,
    });
    expectErrorCode(
      () =>
        reconcileFieldCandidatesV1({
          existingCandidates: [],
          incomingCandidates: [confirmed],
          createConflictId: () => uuid(8_003),
        }),
      "incoming_confirmation_forbidden",
    );
    expectErrorCode(
      () =>
        reconcileFieldCandidatesV1({
          existingCandidates: [
            confirmed,
            candidate({
              id: uuid(301),
              value: "Also confirmed",
              method: "user",
              confirmed: true,
            }),
          ],
          incomingCandidates: [],
          createConflictId: () => uuid(8_004),
        }),
      "multiple_confirmed_candidates",
    );
    expectErrorCode(
      () =>
        reconcileFieldCandidatesV1({
          existingCandidates: [confirmed],
          incomingCandidates: [
            { ...candidate({ ...confirmed, method: "api" }), userConfirmation: undefined },
          ],
          createConflictId: () => uuid(8_005),
        }),
      "duplicate_candidate_id",
    );
    expectErrorCode(
      () =>
        reconcileFieldCandidatesV1({
          existingCandidates: [],
          incomingCandidates: Array.from({ length: 33 }, (_, index) =>
            candidate({ id: uuid(400 + index), value: `value-${index}`, method: "selector" }),
          ),
          createConflictId: () => uuid(8_006),
        }),
      "conflict_candidate_limit_exceeded",
    );
    expectErrorCode(
      () =>
        reconcileFieldCandidatesV1({
          existingCandidates: [],
          incomingCandidates: [
            candidate({ id: uuid(500), value: "A", method: "api", fieldName: "title" }),
            candidate({ id: uuid(501), value: "B", method: "api", fieldName: "title" }),
            candidate({ id: uuid(502), value: "A", method: "api", fieldName: "company" }),
            candidate({ id: uuid(503), value: "B", method: "api", fieldName: "company" }),
          ],
          createConflictId: () => uuid(8_007),
        }),
      "conflict_invalid",
    );
    const collidingConflictCandidates = [
      candidate({ id: uuid(600), value: "A", method: "api" }),
      candidate({ id: uuid(601), value: "B", method: "api" }),
    ];
    expectErrorCode(
      () =>
        reconcileFieldCandidatesV1({
          existingCandidates: [],
          incomingCandidates: collidingConflictCandidates,
          createConflictId: () => collidingConflictCandidates[0]?.id ?? "",
        }),
      "conflict_invalid",
    );
  });

  it("fails closed on malformed candidates, total limits, and invalid conflict factories", () => {
    expectErrorCode(
      () =>
        reconcileFieldCandidatesV1({
          existingCandidates: [],
          incomingCandidates: [{ invalid: true } as unknown as FieldCandidateV1],
          createConflictId: () => uuid(8_020),
        }),
      "candidate_invalid",
    );
    expectErrorCode(
      () =>
        reconcileFieldCandidatesV1({
          existingCandidates: [],
          incomingCandidates: Array.from({ length: 513 }, (_, index) =>
            candidate({ id: uuid(4_000 + index), value: "same", method: "api" }),
          ),
          createConflictId: () => uuid(8_021),
        }),
      "candidate_limit_exceeded",
    );
    const conflictCandidates = [
      candidate({ id: uuid(4_600), value: "A", method: "api" }),
      candidate({ id: uuid(4_601), value: "B", method: "api" }),
    ];
    expectErrorCode(
      () =>
        reconcileFieldCandidatesV1({
          existingCandidates: [],
          incomingCandidates: conflictCandidates,
          createConflictId: () => "not-a-uuid",
        }),
      "conflict_invalid",
    );
    expectErrorCode(
      () =>
        reconcileFieldCandidatesV1({
          existingCandidates: [],
          incomingCandidates: conflictCandidates,
          createConflictId: () => {
            throw new Error("synthetic factory failure");
          },
        }),
      "conflict_invalid",
    );
  });

  it("is permutation-stable and lossless for bounded unconfirmed candidate sets", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            method: fc.constantFrom(...EXTRACTION_METHODS),
            confidence: fc.integer({ min: 0, max: 100 }),
            value: fc.string({ maxLength: 40 }),
          }),
          { minLength: 1, maxLength: 20 },
        ),
        (definitions) => {
          const candidates = definitions.map((definition, index) =>
            candidate({
              id: uuid(1_000 + index),
              value: definition.value,
              method: definition.method,
              confidence: definition.confidence / 100,
              capturedAt: `2026-08-30T15:00:${index.toString().padStart(2, "0")}.000Z`,
            }),
          );
          const reconcile = (incomingCandidates: readonly FieldCandidateV1[]) =>
            reconcileFieldCandidatesV1({
              existingCandidates: [],
              incomingCandidates,
              createConflictId: () => uuid(8_100),
            });
          const forward = reconcile(candidates);
          const reverse = reconcile([...candidates].reverse());

          expect(reverse).toEqual(forward);
          expect(new Set(forward.retainedCandidates.map(({ id }) => id))).toEqual(
            new Set(candidates.map(({ id }) => id)),
          );
          const distinctValues = new Set(candidates.map(({ value }) => JSON.stringify(value))).size;
          expect(forward.conflicts.length).toBe(distinctValues > 1 ? 1 : 0);
          if (forward.conflicts[0] !== undefined) {
            expect(new Set(forward.conflicts[0].candidateIds)).toEqual(
              new Set(candidates.map(({ id }) => id)),
            );
          }
        },
      ),
    );
  });

  it("never displaces a trusted confirmation across arbitrary incoming order and confidence", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            method: fc.constantFrom(...EXTRACTION_METHODS),
            confidence: fc.integer({ min: 0, max: 100 }),
            value: fc.string({ maxLength: 40 }),
          }),
          { maxLength: 20 },
        ),
        (definitions) => {
          const confirmed = candidate({
            id: uuid(2_000),
            value: "durable confirmed value",
            method: "llm",
            confidence: 0,
            confirmed: true,
          });
          const incoming = definitions.map((definition, index) =>
            candidate({
              id: uuid(2_001 + index),
              value: definition.value,
              method: definition.method,
              confidence: definition.confidence / 100,
            }),
          );
          const result = reconcileFieldCandidatesV1({
            existingCandidates: [confirmed],
            incomingCandidates: incoming,
            createConflictId: () => uuid(8_200),
          });

          expect(result.fields[0]?.selectedCandidateId).toBe(confirmed.id);
          expect(result.fields[0]?.selectionReason).toBe("user_confirmed");
          expect(new Set(result.retainedCandidates.map(({ id }) => id))).toEqual(
            new Set([confirmed.id, ...incoming.map(({ id }) => id)]),
          );
        },
      ),
    );
  });

  it("emits the retained CAP-005 proof record", () => {
    const confirmed = candidate({
      id: uuid(3_000),
      value: "Confirmed value",
      method: "llm",
      confidence: 0,
      confirmed: true,
    });
    const incoming = candidate({
      id: uuid(3_001),
      value: "Incoming value",
      method: "user",
      confidence: 1,
    });
    const result = reconcileFieldCandidatesV1({
      existingCandidates: [confirmed],
      incomingCandidates: [incoming],
      createConflictId: () => uuid(8_300),
    });
    let incomingConfirmationRejected = false;
    try {
      reconcileFieldCandidatesV1({
        existingCandidates: [],
        incomingCandidates: [{ ...incoming, userConfirmation: confirmed.userConfirmation }],
        createConflictId: () => uuid(8_301),
      });
    } catch (error) {
      incomingConfirmationRejected =
        error instanceof FieldCandidateReconciliationError &&
        error.code === "incoming_confirmation_forbidden";
    }

    const proof = {
      retainedCandidates: result.retainedCandidates.length,
      confirmedSelectionPreserved: result.fields[0]?.selectedCandidateId === confirmed.id,
      incomingConfirmationRejected,
      unresolvedConflictRetained: result.conflicts[0]?.status === "unresolved",
      policySelectionIsSuggestion:
        reconcileFieldCandidatesV1({
          existingCandidates: [],
          incomingCandidates: [incoming],
          createConflictId: () => uuid(8_302),
        }).fields[0]?.selectionReason === "policy_suggestion",
    };
    expect(proof).toEqual({
      retainedCandidates: 2,
      confirmedSelectionPreserved: true,
      incomingConfirmationRejected: true,
      unresolvedConflictRetained: true,
      policySelectionIsSuggestion: true,
    });
    const runtimeProcess = (
      globalThis as typeof globalThis & {
        readonly process?: { readonly stdout?: { write(value: string): unknown } };
      }
    ).process;
    runtimeProcess?.stdout?.write(`CAP005_PROOF ${JSON.stringify(proof)}\n`);
  });
});
