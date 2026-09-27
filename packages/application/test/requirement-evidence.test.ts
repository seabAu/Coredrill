import { entityId, instant } from "@coredrill/domain";
import { describe, expect, it, vi } from "vitest";

import {
  classifyApplicationQuestion,
  createRequirementEvidenceOperations,
  deriveRequirementCoverageDecision,
  requirementCoverageSelectionBasis,
  type RequirementEvidencePort,
  type RequirementEvidenceRetrievalDto,
  type SelectedRequirementEvidenceDto,
} from "../src/index.js";

const IDS = Object.freeze({
  operation: "0199a720-0000-7000-8000-000000000001",
  requirement: "0199a720-0000-7000-8000-000000000002",
  evidence: "0199a720-0000-7000-8000-000000000003",
});
const NOW = instant("2026-09-27T22:00:00.000Z");
const context = Object.freeze({
  operationId: entityId("application-operation", IDS.operation),
  initiatedAt: NOW,
});

const selected = (
  overrides: Partial<SelectedRequirementEvidenceDto> = {},
): SelectedRequirementEvidenceDto =>
  Object.freeze({
    requirementId: entityId("job-requirement", IDS.requirement),
    evidenceKind: "skill",
    evidenceId: entityId("skill", IDS.evidence),
    evidenceUpdatedAt: NOW,
    label: "TypeScript",
    summary: "TypeScript · language · TS",
    verificationState: "user_confirmed",
    privacyTags: Object.freeze([]),
    matchedTerms: Object.freeze(["typescript"]),
    reasons: Object.freeze(["exact-skill"] as const),
    selectedAt: NOW,
    ...overrides,
  });

const automaticUnknown = deriveRequirementCoverageDecision({
  category: "required",
  requirementText: "TypeScript experience",
  requirementRowVersion: 1,
  selectedEvidence: Object.freeze([]),
  storedDecision: null,
});

const retrieval = (): RequirementEvidenceRetrievalDto =>
  Object.freeze({
    answerPolicy: classifyApplicationQuestion("TypeScript experience"),
    requirementId: entityId("job-requirement", IDS.requirement),
    queryTerms: Object.freeze(["typescript"]),
    capability: Object.freeze({ mode: "fts5", fallbackReason: null }),
    coverage: automaticUnknown,
    candidates: Object.freeze([
      Object.freeze({
        ...selected(),
        matchedTerms: Object.freeze(["typescript"]),
        reasons: Object.freeze(["exact-skill", "lexical"] as const),
        score: 412,
      }),
    ]),
    selectedEvidence: Object.freeze([]),
  });

const setup = () => {
  const port: RequirementEvidencePort = {
    retrieve: vi.fn(async () => retrieval()),
    select: vi.fn(async () => selected()),
    remove: vi.fn(async () => true),
    setCoverageDecision: vi.fn(async ({ state }) =>
      deriveRequirementCoverageDecision({
        category: "required",
        requirementText: "TypeScript experience",
        requirementRowVersion: 1,
        selectedEvidence: Object.freeze([selected()]),
        storedDecision: {
          decidedAt: NOW,
          requirementRowVersion: 1,
          rowVersion: 1,
          selectionBasis: requirementCoverageSelectionBasis([selected()]),
          state,
        },
      }),
    ),
    resetCoverageDecision: vi.fn(async () =>
      deriveRequirementCoverageDecision({
        category: "required",
        requirementText: "TypeScript experience",
        requirementRowVersion: 1,
        selectedEvidence: Object.freeze([selected()]),
        storedDecision: null,
      }),
    ),
  };
  return { port, operations: createRequirementEvidenceOperations({ evidence: port }) };
};

describe("Requirement evidence application boundary", () => {
  it("keeps retrieval read-only and bounded", async () => {
    const { port, operations } = setup();
    const result = await operations.retrieveCandidatesQuery.execute(
      { requirementId: IDS.requirement, limit: 12 },
      context,
    );

    expect(result).toMatchObject({ ok: true, value: { queryTerms: ["typescript"] } });
    expect(port.retrieve).toHaveBeenCalledOnce();
    expect(port.select).not.toHaveBeenCalled();
    expect(port.remove).not.toHaveBeenCalled();
  });

  it("changes selection only through explicit select and remove commands", async () => {
    const { port, operations } = setup();
    const input = {
      requirementId: IDS.requirement,
      evidenceKind: "skill" as const,
      evidenceId: IDS.evidence,
    };

    await expect(operations.selectEvidenceCommand.execute(input, context)).resolves.toMatchObject({
      ok: true,
      value: { label: "TypeScript", selectedAt: NOW },
    });
    expect(port.select).toHaveBeenCalledWith(
      expect.objectContaining({ ...input, selectedAt: NOW }),
    );

    await expect(operations.removeEvidenceCommand.execute(input, context)).resolves.toEqual({
      ok: true,
      value: true,
    });
    expect(port.remove).toHaveBeenCalledWith(expect.objectContaining(input));
  });

  it("changes user-reviewed coverage only through explicit versioned commands", async () => {
    const { port, operations } = setup();
    await expect(
      operations.setCoverageDecisionCommand.execute(
        {
          expectedRowVersion: null,
          requirementId: IDS.requirement,
          state: "gap",
        },
        context,
      ),
    ).resolves.toMatchObject({
      ok: true,
      value: { source: "user-confirmed", state: "gap", stale: false },
    });
    expect(port.setCoverageDecision).toHaveBeenCalledWith(
      expect.objectContaining({ decidedAt: NOW, expectedRowVersion: null, state: "gap" }),
    );

    await expect(
      operations.resetCoverageDecisionCommand.execute(
        { expectedRowVersion: 1, requirementId: IDS.requirement },
        context,
      ),
    ).resolves.toMatchObject({
      ok: true,
      value: { source: "deterministic-rule", state: "strength" },
    });
  });

  it("rejects malformed kinds and unbounded retrieval before the port", async () => {
    const { port, operations } = setup();
    await expect(
      operations.retrieveCandidatesQuery.execute(
        { requirementId: IDS.requirement, limit: 51 },
        context,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: "validation" } });
    await expect(
      operations.selectEvidenceCommand.execute(
        {
          requirementId: IDS.requirement,
          evidenceKind: "resume" as "skill",
          evidenceId: IDS.evidence,
        },
        context,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: "validation" } });
    expect(port.retrieve).not.toHaveBeenCalled();
    expect(port.select).not.toHaveBeenCalled();
  });
});

describe("Requirement coverage rules", () => {
  it("keeps context Not Applicable and absent evidence Unknown rather than inferring a Gap", () => {
    expect(
      deriveRequirementCoverageDecision({
        category: "context",
        requirementText: "Healthcare industry context",
        requirementRowVersion: 1,
        selectedEvidence: Object.freeze([]),
        storedDecision: null,
      }),
    ).toMatchObject({ source: "deterministic-rule", state: "not_applicable" });
    expect(automaticUnknown).toMatchObject({ source: "deterministic-rule", state: "unknown" });
    expect(automaticUnknown.explanation).toContain("Unknown—not a Gap");
  });

  it("derives Strength only from reliable structured evidence and otherwise stays Partial", () => {
    expect(
      deriveRequirementCoverageDecision({
        category: "required",
        requirementText: "TypeScript experience",
        requirementRowVersion: 1,
        selectedEvidence: Object.freeze([selected()]),
        storedDecision: null,
      }),
    ).toMatchObject({ state: "strength", source: "deterministic-rule" });
    expect(
      deriveRequirementCoverageDecision({
        category: "required",
        requirementText: "TypeScript experience",
        requirementRowVersion: 1,
        selectedEvidence: Object.freeze([
          selected({ reasons: Object.freeze(["lexical"]), verificationState: "imported" }),
        ]),
        storedDecision: null,
      }),
    ).toMatchObject({ state: "partial", source: "deterministic-rule" });
  });

  it.each(["strength", "partial", "gap", "unknown", "not_applicable"] as const)(
    "preserves the explicit %s decision with an explanation",
    (state) => {
      const evidence = state === "strength" || state === "partial" ? [selected()] : [];
      const decision = deriveRequirementCoverageDecision({
        category: "required",
        requirementText: "TypeScript experience",
        requirementRowVersion: 3,
        selectedEvidence: Object.freeze(evidence),
        storedDecision: {
          decidedAt: NOW,
          requirementRowVersion: 3,
          rowVersion: 2,
          selectionBasis: requirementCoverageSelectionBasis(evidence),
          state,
        },
      });
      expect(decision).toMatchObject({ state, source: "user-confirmed", stale: false });
      expect(decision.explanation.length).toBeGreaterThan(30);
    },
  );

  it("marks a user decision stale instead of silently replacing it", () => {
    const decision = deriveRequirementCoverageDecision({
      category: "required",
      requirementText: "TypeScript experience",
      requirementRowVersion: 2,
      selectedEvidence: Object.freeze([selected()]),
      storedDecision: {
        decidedAt: NOW,
        requirementRowVersion: 1,
        rowVersion: 4,
        selectionBasis: "",
        state: "gap",
      },
    });
    expect(decision).toMatchObject({ state: "gap", source: "user-confirmed", stale: true });
    expect(decision.explanation).toContain("has not overwritten");
  });

  it("keeps sensitive eligibility coverage Unknown despite unrelated selected evidence", () => {
    const decision = deriveRequirementCoverageDecision({
      category: "required",
      requirementText: "Are you legally authorized to work in the United States?",
      requirementRowVersion: 1,
      selectedEvidence: Object.freeze([selected()]),
      storedDecision: null,
    });

    expect(decision).toMatchObject({
      source: "deterministic-rule",
      state: "unknown",
    });
    expect(decision.explanation).toContain("direct private answer");
    expect(decision.explanation).toContain("will not infer");
  });
});
