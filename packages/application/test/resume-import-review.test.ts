import {
  analyzeResumeImportReviewQueue,
  applicationSuccess,
  createResumeImportReviewOperations,
  type CareerProfileEntryDto,
  type ResumeImportQueueItemDto,
  type ResumeImportResolutionPortInput,
} from "../src/index.js";
import { entityId, instant } from "@coredrill/domain";
import { describe, expect, it, vi } from "vitest";

const IMPORT_ID = "0199a220-0000-7000-8000-000000000001" as ResumeImportQueueItemDto["id"];

const proposal = (
  id: string,
  target: "employment" | "skill",
  fieldName: string,
  proposedValue: string,
  groupKey: string,
): ResumeImportQueueItemDto["proposals"][number] =>
  Object.freeze({
    confidence: 0.8,
    evidenceStatus: "proposal",
    fieldName,
    groupKey,
    id: id as ResumeImportQueueItemDto["proposals"][number]["id"],
    importRunId: IMPORT_ID,
    proposedValue,
    reviewState: "pending",
    sourceExcerpt: `${fieldName}: ${proposedValue}`,
    sourcePointer: `/lines/${id.at(-1)}`,
    target,
  });

const imported: ResumeImportQueueItemDto = Object.freeze({
  completedAt: "2026-09-27T16:00:00.000Z" as ResumeImportQueueItemDto["completedAt"],
  id: IMPORT_ID,
  proposalCount: 4,
  proposals: Object.freeze([
    proposal(
      "0199a220-0000-7000-8000-000000000011",
      "employment",
      "organization",
      "Coredrill Labs",
      "job-1",
    ),
    proposal(
      "0199a220-0000-7000-8000-000000000012",
      "employment",
      "role",
      "Product Engineer",
      "job-1",
    ),
    proposal(
      "0199a220-0000-7000-8000-000000000013",
      "employment",
      "dateRange",
      "2024–2026",
      "job-1",
    ),
    proposal("0199a220-0000-7000-8000-000000000014", "skill", "canonicalName", "TS", "skill-1"),
  ]),
  source: Object.freeze({
    byteLength: 1_024,
    fileName: "resume.md",
    format: "text",
    mediaType: "text/markdown",
    pageCount: null,
    sha256: "a".repeat(64),
  }),
  status: "completed",
  warnings: Object.freeze([]),
});

const entry = (
  id: string,
  kind: "employment" | "skill",
  primaryLabel: string,
  secondaryLabel: string | null,
  startDate: string | null = null,
  endDate: string | null = null,
): CareerProfileEntryDto =>
  Object.freeze({
    createdAt: "2026-09-27T15:00:00.000Z" as CareerProfileEntryDto["createdAt"],
    current: false,
    endDate: endDate as CareerProfileEntryDto["endDate"],
    id: id as CareerProfileEntryDto["id"],
    kind,
    primaryLabel,
    rowVersion: 1,
    secondaryLabel,
    startDate: startDate as CareerProfileEntryDto["startDate"],
    verificationState: "user_confirmed",
  });

describe("resume import review", () => {
  it("exposes duplicate roles, ambiguous dates, overlapping dates, and skill aliases with source excerpts", () => {
    const groups = analyzeResumeImportReviewQueue(
      [imported],
      [
        entry(
          "0199a220-0000-7000-8000-000000000021",
          "employment",
          "Product Engineer",
          "Coredrill Labs",
          "2024-03-01",
          "2026-01-01",
        ),
        entry("0199a220-0000-7000-8000-000000000022", "skill", "TypeScript", null),
      ],
    );

    expect(groups).toHaveLength(2);
    expect(groups[0]).toMatchObject({ actionable: true, groupKey: "job-1", target: "employment" });
    expect(groups[0]?.conflicts.map(({ kind }) => kind)).toEqual([
      "ambiguous_date",
      "duplicate_role",
    ]);
    expect(groups[0]?.sourceExcerpts).toEqual([
      "organization: Coredrill Labs",
      "role: Product Engineer",
      "dateRange: 2024–2026",
    ]);
    expect(groups[1]?.conflicts).toEqual([
      expect.objectContaining({ kind: "ambiguous_skill", candidateLabel: "TypeScript" }),
    ]);
  });

  it("requires an explicit date decision and sends normalized immutable resolution input", async () => {
    const resolve = vi.fn(async (input: ResumeImportResolutionPortInput) =>
      Object.freeze({
        decision: input.decision,
        groupKey: input.groupKey,
        id: input.resolutionId,
        importRunId: input.importRunId,
        resolvedAt: input.resolvedAt,
        target: input.target,
        targetId: input.newTargetId,
      }),
    );
    const ids = ["0199a220-0000-7000-8000-000000000031", "0199a220-0000-7000-8000-000000000032"];
    const operations = createResumeImportReviewOperations({
      createId: () => ids.shift() ?? "0199a220-0000-7000-8000-000000000099",
      review: { resolve },
    });
    const context = {
      initiatedAt: instant("2026-09-27T17:00:00.000Z"),
      operationId: entityId("application-operation", "0199a220-0000-7000-8000-000000000040"),
    };

    await expect(
      operations.resolveCommand.execute(
        {
          decision: "accepted_new",
          groupKey: "job-1",
          importRunId: IMPORT_ID,
          target: "employment",
        } as never,
        context,
      ),
    ).resolves.toMatchObject({ ok: false, error: { code: "validation" } });
    expect(resolve).not.toHaveBeenCalled();

    await expect(
      operations.resolveCommand.execute(
        {
          dateDecision: "explicit",
          decision: "accepted_new",
          endDate: "2026-06-30",
          groupKey: "job-1",
          importRunId: IMPORT_ID,
          startDate: "2024-01-01",
          target: "employment",
        },
        context,
      ),
    ).resolves.toEqual(
      applicationSuccess(
        expect.objectContaining({
          decision: "accepted_new",
          groupKey: "job-1",
          target: "employment",
        }),
      ),
    );
    expect(resolve).toHaveBeenCalledWith(
      expect.objectContaining({
        decision: "accepted_new",
        startDate: "2024-01-01",
        endDate: "2026-06-30",
        newTargetId: "0199a220-0000-7000-8000-000000000031",
        resolutionId: "0199a220-0000-7000-8000-000000000032",
      }),
    );
  });

  it("supports explicit reject and merge decisions without replacement values", async () => {
    const inputs: ResumeImportResolutionPortInput[] = [];
    const operations = createResumeImportReviewOperations({
      createId: () => "0199a220-0000-7000-8000-000000000050",
      review: {
        resolve: async (input) => {
          inputs.push(input);
          return {
            decision: input.decision,
            groupKey: input.groupKey,
            id: input.resolutionId,
            importRunId: input.importRunId,
            resolvedAt: input.resolvedAt,
            target: input.target,
            targetId: input.targetId,
          };
        },
      },
    });
    const context = {
      initiatedAt: instant("2026-09-27T17:00:00.000Z"),
      operationId: entityId("application-operation", "0199a220-0000-7000-8000-000000000051"),
    };
    await operations.resolveCommand.execute(
      { decision: "rejected", groupKey: "job-1", importRunId: IMPORT_ID },
      context,
    );
    await operations.resolveCommand.execute(
      {
        decision: "merged_existing",
        groupKey: "skill-1",
        importRunId: IMPORT_ID,
        target: "skill",
        targetId: "0199a220-0000-7000-8000-000000000022",
      },
      context,
    );

    expect(inputs).toEqual([
      expect.objectContaining({ decision: "rejected", target: null, targetId: null }),
      expect.objectContaining({
        decision: "merged_existing",
        target: "skill",
        targetId: "0199a220-0000-7000-8000-000000000022",
      }),
    ]);
  });
});
