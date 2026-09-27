import { entityId, instant } from "@coredrill/domain";
import { describe, expect, it, vi } from "vitest";

import {
  createRequirementEvidenceOperations,
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

const selected = (): SelectedRequirementEvidenceDto =>
  Object.freeze({
    requirementId: entityId("job-requirement", IDS.requirement),
    evidenceKind: "skill",
    evidenceId: entityId("skill", IDS.evidence),
    label: "TypeScript",
    summary: "TypeScript · language · TS",
    verificationState: "user_confirmed",
    privacyTags: Object.freeze([]),
    selectedAt: NOW,
  });

const retrieval = (): RequirementEvidenceRetrievalDto =>
  Object.freeze({
    requirementId: entityId("job-requirement", IDS.requirement),
    queryTerms: Object.freeze(["typescript"]),
    capability: Object.freeze({ mode: "fts5", fallbackReason: null }),
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
