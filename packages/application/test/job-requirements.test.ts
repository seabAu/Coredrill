import { confidence, entityId, instant } from "@coredrill/domain";
import { describe, expect, it, vi } from "vitest";

import {
  createJobRequirementOperations,
  type JobRequirementDto,
  type JobRequirementPort,
} from "../src/index.js";

const IDS = Object.freeze({
  requirement: "0199a700-0000-7000-8000-000000000001",
  job: "0199a700-0000-7000-8000-000000000002",
  provenance: "0199a700-0000-7000-8000-000000000003",
});
const NOW = instant("2026-09-27T20:00:00.000Z");
const context = Object.freeze({
  operationId: entityId("application-operation", "0199a700-0000-7000-8000-000000000090"),
  initiatedAt: NOW,
});

const requirement = (overrides: Partial<JobRequirementDto> = {}): JobRequirementDto =>
  Object.freeze({
    id: entityId("job-requirement", IDS.requirement),
    jobId: entityId("job", IDS.job),
    category: "required",
    sourceCategory: "required",
    normalizedText: "Lead cross-functional delivery",
    rawText: "You will lead cross-functional delivery.",
    provenanceId: entityId("provenance", IDS.provenance),
    sourcePointer: "/description/requirements/0",
    sourceExcerpt: "You will lead cross-functional delivery.",
    extractionMethod: "jsonld",
    confidence: confidence(0.91),
    userConfirmed: false,
    sortOrder: 0,
    createdAt: NOW,
    updatedAt: NOW,
    rowVersion: 1,
    ...overrides,
  });

const setup = () => {
  const port: JobRequirementPort = {
    recordRequirement: vi.fn(async (input) =>
      requirement({
        id: input.id,
        jobId: input.jobId,
        category: input.category,
        sourceCategory: input.category,
        normalizedText: input.normalizedText,
        rawText: input.rawText,
        provenanceId: input.provenanceId,
        sortOrder: input.sortOrder,
        createdAt: input.createdAt,
        updatedAt: input.createdAt,
      }),
    ),
    correctRequirement: vi.fn(async (input) =>
      requirement({
        category: input.category,
        userConfirmed: true,
        updatedAt: input.updatedAt,
        rowVersion: input.expectedRowVersion + 1,
      }),
    ),
    listRequirements: vi.fn(async () => Object.freeze([requirement()])),
  };
  return {
    port,
    operations: createJobRequirementOperations({
      requirements: port,
      createId: () => IDS.requirement,
    }),
  };
};

describe("Job requirement application boundary", () => {
  it("records bounded requirement text against explicit provenance", async () => {
    const { operations, port } = setup();
    const result = await operations.recordRequirementCommand.execute(
      {
        jobId: IDS.job,
        category: "required",
        normalizedText: "  Lead cross-functional delivery  ",
        rawText: " You will lead cross-functional delivery. ",
        provenanceId: IDS.provenance,
      },
      context,
    );

    expect(result).toMatchObject({ ok: true, value: { confidence: 0.91, userConfirmed: false } });
    expect(port.recordRequirement).toHaveBeenCalledWith(
      expect.objectContaining({
        category: "required",
        normalizedText: "Lead cross-functional delivery",
        rawText: "You will lead cross-functional delivery.",
        provenanceId: IDS.provenance,
      }),
    );
  });

  it("turns a category correction into a durable confirmation without changing source facts", async () => {
    const { operations, port } = setup();
    const result = await operations.correctRequirementCommand.execute(
      { id: IDS.requirement, category: "responsibility", expectedRowVersion: 1 },
      context,
    );

    expect(result).toMatchObject({
      ok: true,
      value: {
        category: "responsibility",
        sourceCategory: "required",
        userConfirmed: true,
        rowVersion: 2,
      },
    });
    expect(port.correctRequirement).toHaveBeenCalledWith(
      expect.objectContaining({ category: "responsibility", expectedRowVersion: 1 }),
    );
  });

  it("rejects unknown categories and stale-shape corrections before persistence", async () => {
    const { operations, port } = setup();
    await expect(
      operations.recordRequirementCommand.execute(
        {
          jobId: IDS.job,
          category: "preferred" as "required",
          normalizedText: "TypeScript",
          rawText: "TypeScript",
          provenanceId: IDS.provenance,
        },
        context,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: "validation" } });
    await expect(
      operations.correctRequirementCommand.execute(
        { id: IDS.requirement, category: "desired", expectedRowVersion: 0 },
        context,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: "validation" } });
    expect(port.recordRequirement).not.toHaveBeenCalled();
    expect(port.correctRequirement).not.toHaveBeenCalled();
  });
});
