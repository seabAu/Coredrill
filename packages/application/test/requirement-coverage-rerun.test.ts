import { entityId, instant } from "@coredrill/domain";
import { describe, expect, it } from "vitest";

import {
  captureRequirementCoverageSnapshotV1,
  compareRequirementCoverageRunsV1,
  type RequirementEvidenceRetrievalDto,
} from "../src/index.js";

const REQUIREMENT_ID = entityId("job-requirement", "0199a750-0000-7000-8000-000000000001");
const EVIDENCE_ID = entityId("experience", "0199a750-0000-7000-8000-000000000002");
const DOCUMENT_ID = entityId("document", "0199a750-0000-7000-8000-000000000003");
const VERSION_1 = entityId("document-version", "0199a750-0000-7000-8000-000000000004");
const VERSION_2 = entityId("document-version", "0199a750-0000-7000-8000-000000000005");

const retrieval = (
  overrides: {
    readonly contentHash?: string;
    readonly evidenceUpdatedAt?: string;
    readonly latestVersionId?: typeof VERSION_1 | typeof VERSION_2;
    readonly stale?: boolean;
    readonly summary?: string;
    readonly verificationState?: "imported" | "user_confirmed";
    readonly versionNumber?: number;
  } = {},
): RequirementEvidenceRetrievalDto =>
  Object.freeze({
    answerPolicy: Object.freeze({
      allowsGeneratedDraft: true,
      allowsProfileProposal: false,
      handling: "draftable",
      kind: "experience-evidence",
      requiresDirectUserAnswer: false,
      ruleVersion: "application-question-policy-v1",
    }),
    candidates: Object.freeze([]),
    capability: Object.freeze({ fallbackReason: "policy-disabled", mode: "normalized-token" }),
    coverage: Object.freeze({
      decidedAt: instant("2026-09-27T23:30:00.000Z"),
      explanation: "The user-reviewed decision is retained.",
      rowVersion: 4,
      ruleVersion: "requirement-coverage-v2",
      source: "user-confirmed",
      stale: overrides.stale ?? false,
      state: "gap",
    }),
    queryTerms: Object.freeze(["typescript"]),
    requirementId: REQUIREMENT_ID,
    selectedEvidence: Object.freeze([
      Object.freeze({
        evidenceId: EVIDENCE_ID,
        evidenceKind: "employment",
        evidenceUpdatedAt: instant(overrides.evidenceUpdatedAt ?? "2026-09-27T23:00:00.000Z"),
        label: "Platform Engineer at Coredrill Labs",
        matchedTerms: Object.freeze(["typescript"]),
        privacyTags: Object.freeze([]),
        reasons: Object.freeze(["skill-relation"] as const),
        requirementId: REQUIREMENT_ID,
        selectedAt: instant("2026-09-27T23:20:00.000Z"),
        sourceDocument: Object.freeze({
          documentId: DOCUMENT_ID,
          latestVersion: Object.freeze({
            contentHash: overrides.contentHash ?? "a".repeat(64),
            id: overrides.latestVersionId ?? VERSION_1,
            versionNumber: overrides.versionNumber ?? 1,
          }),
        }),
        summary: overrides.summary ?? "Built offline TypeScript delivery.",
        verificationState: overrides.verificationState ?? "user_confirmed",
      }),
    ]),
  });

describe("requirement coverage re-run diff", () => {
  it("shows evidence and source-document edits without replacing a user decision", () => {
    const baseline = captureRequirementCoverageSnapshotV1(retrieval());
    const current = captureRequirementCoverageSnapshotV1(
      retrieval({
        contentHash: "b".repeat(64),
        evidenceUpdatedAt: "2026-09-27T23:40:00.000Z",
        latestVersionId: VERSION_2,
        stale: true,
        summary: "Led offline TypeScript delivery for regulated workflows.",
        verificationState: "imported",
        versionNumber: 2,
      }),
    );
    const diff = compareRequirementCoverageRunsV1(baseline, current);

    expect(diff).toMatchObject({
      changed: true,
      mutationPerformed: false,
      userDecisionPreserved: true,
    });
    expect(diff.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          target: "coverage",
          field: "stale",
          before: "false",
          after: "true",
        }),
        expect.objectContaining({ target: "evidence", field: "summary" }),
        expect.objectContaining({ target: "evidence", field: "verificationState" }),
        expect.objectContaining({ target: "source-document", field: "latestVersionId" }),
        expect.objectContaining({ target: "source-document", field: "contentHash" }),
      ]),
    );
    expect(diff.baseline.selectedEvidence[0]?.sourceDocument?.latestVersion?.id).toBe(VERSION_1);
    expect(diff.current.selectedEvidence[0]?.sourceDocument?.latestVersion?.id).toBe(VERSION_2);
  });

  it("rejects snapshots for different requirements", () => {
    const baseline = captureRequirementCoverageSnapshotV1(retrieval());
    const current = Object.freeze({ ...baseline, requirementId: "different" });
    expect(() => compareRequirementCoverageRunsV1(baseline, current)).toThrow(TypeError);
  });
});
