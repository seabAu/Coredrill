import { describe, expect, it } from "vitest";

import {
  EXTRACTION_METHODS,
  fieldCandidateV1Schema,
  fieldConflictV1Schema,
  fieldProvenanceV1Schema,
  userConfirmationV1Schema,
} from "../src/index.js";
import examples from "./fixtures/field-contracts.examples.json" with { type: "json" };

describe("field candidate and provenance contracts", () => {
  it("retains all extraction methods and source evidence for every example candidate", () => {
    expect(EXTRACTION_METHODS).toEqual([
      "api",
      "jsonld",
      "selector",
      "readability",
      "heuristic",
      "llm",
      "user",
    ]);

    const candidates = examples.candidates.map((candidate) =>
      fieldCandidateV1Schema.parse(candidate),
    );
    expect(candidates).toHaveLength(3);
    for (const candidate of candidates) {
      expect(candidate.provenance.source.pointer.length).toBeGreaterThan(0);
      expect(candidate.provenance.extractor.version).toMatch(/^\d+\.\d+\.\d+/);
      expect(candidate.provenance.capturedAt).toMatch(/Z$/);
      expect(candidate.provenance.confidence).toBeGreaterThanOrEqual(0);
      expect(candidate.provenance.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("round-trips durable explicit user confirmation without relabeling source method", () => {
    const confirmed = fieldCandidateV1Schema.parse(examples.candidates[1]);
    expect(confirmed.provenance.method).toBe("user");
    expect(confirmed.userConfirmation).toMatchObject({ actor: "user", specVersion: 1 });
    expect(
      fieldCandidateV1Schema.parse(JSON.parse(JSON.stringify(confirmed))).userConfirmation,
    ).toEqual(confirmed.userConfirmation);

    const llmCandidate = fieldCandidateV1Schema.parse(examples.candidates[2]);
    expect(llmCandidate.provenance.method).toBe("llm");
    expect(llmCandidate.userConfirmation).toBeUndefined();
  });

  it("rejects incomplete provenance, implicit confirmation, and non-JSON values", () => {
    const candidate = structuredClone(examples.candidates[0]) as unknown as Record<string, unknown>;
    const provenance = candidate["provenance"] as Record<string, unknown>;
    const source = provenance["source"] as Record<string, unknown>;
    delete source["pointer"];
    expect(fieldCandidateV1Schema.safeParse(candidate).success).toBe(false);

    expect(
      userConfirmationV1Schema.safeParse({
        specVersion: 1,
        id: "019539af-7c14-7dd4-8b54-395d8f3fe4c5",
        actor: "system",
        confirmedAt: "2026-08-24T14:05:01.000Z",
        confirmedValueHash: "b".repeat(64),
      }).success,
    ).toBe(false);

    expect(
      fieldCandidateV1Schema.safeParse({ ...examples.candidates[0], value: undefined }).success,
    ).toBe(false);
    expect(
      fieldProvenanceV1Schema.safeParse({
        ...(examples.candidates[0]?.provenance ?? {}),
        confidence: Number.NaN,
      }).success,
    ).toBe(false);
  });
});

describe("field conflict contracts", () => {
  it("retains unresolved candidates and requires explicit user resolution", () => {
    const unresolved = fieldConflictV1Schema.parse(examples.conflicts[0]);
    expect(unresolved.status).toBe("unresolved");
    expect(unresolved.candidateIds).toHaveLength(2);

    const resolved = fieldConflictV1Schema.parse(examples.conflicts[1]);
    expect(resolved.status).toBe("resolved");
    if (resolved.status !== "resolved") throw new Error("Expected a resolved conflict.");
    expect(resolved.resolution.resolvedBy).toBe("user");
    expect(resolved.candidateIds).toContain(resolved.resolution.selectedCandidateId);
  });

  it("rejects duplicate candidates and resolutions that discard the retained set", () => {
    const unresolved = structuredClone(examples.conflicts[0]);
    if (unresolved === undefined) throw new Error("Expected the unresolved fixture.");
    unresolved.candidateIds[1] = unresolved.candidateIds[0] ?? "";
    expect(fieldConflictV1Schema.safeParse(unresolved).success).toBe(false);

    const resolved = structuredClone(examples.conflicts[1]);
    if (
      resolved === undefined ||
      resolved.status !== "resolved" ||
      resolved.resolution === undefined
    ) {
      throw new Error("Expected the resolved fixture.");
    }
    resolved.resolution.selectedCandidateId = "019539af-7c18-7dd4-8b54-395d8f3fe4c9";
    expect(fieldConflictV1Schema.safeParse(resolved).success).toBe(false);
  });
});
